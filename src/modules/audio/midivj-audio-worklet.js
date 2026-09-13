/* ══════════════════════════════════════════════════════════════════════
   MIDIVJ — AudioWorkletProcessor de análisis (un procesador por BUS)
   ══════════════════════════════════════════════════════════════════════

   Esto corre en el hilo de audio del navegador, no en el de la interfaz ni
   en el del render de video. Reglas que este archivo respeta y que hay que
   seguir respetando al tocarlo:

     · Cero `new`, cero literales de objeto/arreglo dentro de process().
       Todo lo que se usa por bloque está reservado en el constructor.
     · Cero logs, cero JSON, cero disco, cero red dentro de process().
     · Un solo postMessage cada `decim` bloques (~60 Hz) con el mismo
       objeto reutilizado, más mensajes sueltos cuando hay un evento.

   El análisis es deliberadamente barato (envolvente de un polo + tres
   bandas por filtros de un polo). No hay FFT todavía: ver la fase 2 de
   docs/audio-module-roadmap.md.

   Salida por bloque de reporte (todo 0..1 salvo lo indicado):
     rms peak env low mid high gate(0|1)
     audioTime  segundos del reloj del AudioContext (currentTime del bloque)
     frame      currentFrame del bloque — muestra exacta, para sincronía
   ────────────────────────────────────────────────────────────────────── */

const BLOQUE = 128;

/* Coeficiente de un filtro de un polo para una frecuencia de corte. */
function coefUnPolo(hz, sr) {
  if (!(hz > 0)) return 1;
  return 1 - Math.exp(-2 * Math.PI * hz / sr);
}

class AnalizadorMidivj extends AudioWorkletProcessor {
  constructor(opciones) {
    super();
    const cfg = (opciones && opciones.processorOptions) || {};
    this.sr = sampleRate;
    this.decim = cfg.decim || 6;          // bloques entre reportes (~60 Hz)
    this.contador = 0;

    /* Estado de filtros y envolventes — todo escalar, nada que asignar. */
    this.lpBajo = 0; this.lpAlto = 0;
    this.env = 0; this.envBajo = 0; this.envMedio = 0; this.envAlto = 0;
    this.picoVentana = 0;

    /* Gate */
    this.gateAbierto = 0;
    this.gateSobreSeg = 0;    // tiempo continuo por encima del umbral
    this.gateBajoSeg = 0;     // tiempo continuo por debajo (hold + release)

    /* Detección de picos y silencio */
    this.envPrevio = 0;
    this.refractarioSeg = 0;
    this.silencioSeg = 0;
    this.enSilencio = 0;

    /* Objeto de reporte reutilizado: se clona al postear, no se reasigna. */
    this.reporte = {
      type: 'frame', rms: 0, peak: 0, env: 0,
      low: 0, mid: 0, high: 0, gate: 0, audioTime: 0, frame: 0
    };
    /* Objeto de evento reutilizado. */
    this.evento = { type: 'event', ev: '', valor: 0, audioTime: 0, frame: 0 };

    this.aplicarConfig(cfg);
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d && d.type === 'config') this.aplicarConfig(d.config || {});
    };
  }

  /* Fuera del camino crítico: sólo se llama desde el hilo principal. */
  aplicarConfig(cfg) {
    const sr = this.sr;
    this.cBajo = coefUnPolo(cfg.lowHz || 200, sr);
    this.cAlto = coefUnPolo(cfg.highHz || 2000, sr);
    this.envAttack = cfg.envAttack !== undefined ? cfg.envAttack : 0.008;
    this.envRelease = cfg.envRelease !== undefined ? cfg.envRelease : 0.18;
    this.umbral = cfg.gateThreshold !== undefined ? cfg.gateThreshold : 0.08;
    this.gateAtaque = cfg.gateAttack !== undefined ? cfg.gateAttack : 0.005;
    this.gateHold = cfg.gateHold !== undefined ? cfg.gateHold : 0.08;
    this.gateRelease = cfg.gateRelease !== undefined ? cfg.gateRelease : 0.12;
    this.picoDelta = cfg.peakDelta !== undefined ? cfg.peakDelta : 0.12;
    this.picoRefract = cfg.peakRefractory !== undefined ? cfg.peakRefractory : 0.12;
    this.umbralSilencio = cfg.silenceThreshold !== undefined ? cfg.silenceThreshold : 0.01;
    this.silencioHold = cfg.silenceHold !== undefined ? cfg.silenceHold : 1.5;
    if (cfg.decim) this.decim = cfg.decim;
  }

  emitirEvento(nombre, valor) {
    const e = this.evento;
    e.ev = nombre; e.valor = valor; e.audioTime = currentTime; e.frame = currentFrame;
    this.port.postMessage(e);
  }

  process(entradas) {
    const entrada = entradas[0];
    if (!entrada || entrada.length === 0) return true;

    const canales = entrada.length;
    const c0 = entrada[0];
    if (!c0) return true;
    const n = c0.length || BLOQUE;
    const escala = canales > 1 ? 1 / canales : 1;

    let suma = 0;
    let pico = this.picoVentana;
    let sumaBajo = 0, sumaMedio = 0, sumaAlto = 0;

    let lpB = this.lpBajo, lpA = this.lpAlto;
    const cB = this.cBajo, cA = this.cAlto;

    for (let i = 0; i < n; i++) {
      let x = c0[i];
      for (let c = 1; c < canales; c++) x += entrada[c][i];
      x *= escala;

      const abs = x < 0 ? -x : x;
      suma += x * x;
      if (abs > pico) pico = abs;

      lpB += cB * (x - lpB);          // por debajo de lowHz
      lpA += cA * (x - lpA);          // por debajo de highHz
      const bajo = lpB;
      const medio = lpA - lpB;
      const alto = x - lpA;

      sumaBajo += bajo * bajo;
      sumaMedio += medio * medio;
      sumaAlto += alto * alto;
    }
    this.lpBajo = lpB; this.lpAlto = lpA;
    this.picoVentana = pico;

    const rms = Math.sqrt(suma / n);
    const rBajo = Math.sqrt(sumaBajo / n);
    const rMedio = Math.sqrt(sumaMedio / n);
    const rAlto = Math.sqrt(sumaAlto / n);

    /* Seguidor de envolvente: sube rápido, baja lento. Se actualiza una vez
       por bloque con el RMS del bloque — equivalente perceptual y mucho más
       barato que hacerlo muestra a muestra. */
    const dt = n / this.sr;
    const kSube = 1 - Math.exp(-dt / Math.max(1e-5, this.envAttack));
    const kBaja = 1 - Math.exp(-dt / Math.max(1e-5, this.envRelease));
    this.env += (rms > this.env ? kSube : kBaja) * (rms - this.env);
    this.envBajo += (rBajo > this.envBajo ? kSube : kBaja) * (rBajo - this.envBajo);
    this.envMedio += (rMedio > this.envMedio ? kSube : kBaja) * (rMedio - this.envMedio);
    this.envAlto += (rAlto > this.envAlto ? kSube : kBaja) * (rAlto - this.envAlto);

    /* ── Gate ── */
    const env = this.env;
    if (env >= this.umbral) {
      this.gateSobreSeg += dt; this.gateBajoSeg = 0;
      if (!this.gateAbierto && this.gateSobreSeg >= this.gateAtaque) {
        this.gateAbierto = 1;
        this.emitirEvento('gate.open', env);
      }
    } else {
      this.gateBajoSeg += dt; this.gateSobreSeg = 0;
      if (this.gateAbierto && this.gateBajoSeg >= this.gateHold + this.gateRelease) {
        this.gateAbierto = 0;
        this.emitirEvento('gate.close', env);
      }
    }

    /* ── Pico / transitorio ── */
    if (this.refractarioSeg > 0) this.refractarioSeg -= dt;
    const salto = env - this.envPrevio;
    if (this.refractarioSeg <= 0 && salto >= this.picoDelta && env >= this.umbral) {
      this.refractarioSeg = this.picoRefract;
      this.emitirEvento('peak.detected', env);
    }
    this.envPrevio = env;

    /* ── Silencio ── */
    if (env < this.umbralSilencio) {
      this.silencioSeg += dt;
      if (!this.enSilencio && this.silencioSeg >= this.silencioHold) {
        this.enSilencio = 1;
        this.emitirEvento('silence.detected', env);
      }
    } else {
      if (this.enSilencio) { this.enSilencio = 0; this.emitirEvento('silence.end', env); }
      this.silencioSeg = 0;
    }

    /* ── Reporte periódico ── */
    if (++this.contador >= this.decim) {
      this.contador = 0;
      const r = this.reporte;
      r.rms = rms;
      r.peak = this.picoVentana;
      r.env = env;
      r.low = this.envBajo; r.mid = this.envMedio; r.high = this.envAlto;
      r.gate = this.gateAbierto;
      r.audioTime = currentTime;
      r.frame = currentFrame;
      this.port.postMessage(r);
      this.picoVentana = 0;   // el pico es "desde el último reporte"
    }
    return true;
  }
}

registerProcessor('midivj-analizador', AnalizadorMidivj);
