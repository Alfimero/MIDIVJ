/* ══════════════════════════════════════════════════════════════════════
   MIDIVJ — AudioEngine
   ══════════════════════════════════════════════════════════════════════

   Primer módulo que sigue el contrato de `src/modules/midivj-module.js`.
   No conoce nada de MIDIVJ: no toca `S`, ni el canvas, ni el relay. Lo
   único que ve del resto de la aplicación es el registro de destinos
   (`host.targets`) y el de acciones (`host.acciones`), que la app llena
   por su cuenta. Si mañana el motor visual cambia por completo, este
   archivo no se entera.

   Grafo por BUS (esto es lo importante de la fase 1):

       AudioSource ──▶ gain(fuente) ──┬──▶ AudioWorkletNode  (análisis, 0 salidas)
                                      │
                                      └──▶ gain(monitor) ──▶ destination
                                                 (0 por defecto)

   Es decir: analizar NO implica escuchar. El monitor arranca apagado y es
   una rama aparte; un bus puede alimentar visuales sin que salga un solo
   dB por los parlantes.

   Hilos: todo el análisis vive en el AudioWorklet (hilo de audio). Aquí,
   en el hilo principal, sólo se reciben ~60 mensajes por segundo y por bus
   con valores ya normalizados; el trabajo por mensaje es aritmética y
   llamadas a `aplicar()` de los destinos. Nada de esto entra al render de
   video ni al revés.

   API pública (window.MIDIVJAudio):
       crear(opciones)  → motor
   El motor expone: init, start, stop, dispose, getStatus, listarDispositivos,
   agregarFuente, quitarFuente, agregarBus, quitarBus, mapeos, eventos,
   serializar, restaurar.
   ────────────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  const RUTA_WORKLET = 'modules/audio/midivj-audio-worklet.js';

  const CURVAS = {
    linear:    v => v,
    log:       v => (v <= 0 ? 0 : Math.log10(1 + 9 * v)),
    exp:       v => v * v,
    inverted:  v => 1 - v,
    threshold: v => (v >= 0.5 ? 1 : 0),
  };

  const SENALES = ['env', 'rms', 'peak', 'low', 'mid', 'high', 'gate'];
  const EVENTOS = ['gate.open', 'gate.close', 'peak.detected', 'silence.detected', 'silence.end'];

  let seq = 1;
  const nuevoId = (p) => p + (seq++) + '-' + Math.random().toString(36).slice(2, 6);

  function analisisPorDefecto() {
    return {
      lowHz: 200, highHz: 2000,
      envAttack: 0.008, envRelease: 0.18,
      gateThreshold: 0.08, gateAttack: 0.005, gateHold: 0.08, gateRelease: 0.12,
      peakDelta: 0.12, peakRefractory: 0.12,
      silenceThreshold: 0.01, silenceHold: 1.5,
      decim: 6,
    };
  }

  function crear(opciones) {
    const op = opciones || {};
    const log = op.log || function () {};

    const motor = {
      /* ── contrato de módulo ── */
      id: 'audio',
      nombre: 'AUDIO',
      capacidades: ['audio-in', 'analisis', 'control', 'eventos'],
      estado: 'inactivo',

      /* ── estado propio ── */
      ctx: null,
      workletListo: false,
      fuentes: new Map(),
      buses: new Map(),
      mapeos: [],
      enlaces: [],           // evento de audio → acción de la app
      host: null,
      ultimoError: '',

      metricas: {
        sampleRate: 0, baseLatency: 0, outputLatency: 0,
        cuadros: 0, saltos: 0, ultimoCuadroMs: 0, msEntreCuadros: 0,
      },
    };

    /* ══ Ciclo de vida ══════════════════════════════════════════════ */

    motor.init = function (host) {
      motor.host = host || (global.MIDIVJ && global.MIDIVJ.host) || null;
      return motor;
    };

    /** Crea el AudioContext y carga el worklet. Requiere gesto del usuario
        (un clic) porque los navegadores no dejan arrancar audio solo. */
    motor.start = async function () {
      if (motor.estado === 'activo') return motor;
      motor.estado = 'iniciando';
      try {
        if (!motor.ctx) {
          const AC = global.AudioContext || global.webkitAudioContext;
          if (!AC) throw new Error('Este navegador no tiene Web Audio.');
          motor.ctx = new AC({ latencyHint: 'interactive' });
        }
        if (motor.ctx.state === 'suspended') await motor.ctx.resume();
        if (!motor.workletListo) {
          await motor.ctx.audioWorklet.addModule(op.rutaWorklet || RUTA_WORKLET);
          motor.workletListo = true;
        }
        motor.metricas.sampleRate = motor.ctx.sampleRate;
        motor.metricas.baseLatency = motor.ctx.baseLatency || 0;
        motor.estado = 'activo';
        log('AudioEngine activo — ' + motor.ctx.sampleRate + ' Hz, latencia base ' +
            ((motor.ctx.baseLatency || 0) * 1000).toFixed(1) + ' ms');
      } catch (e) {
        motor.estado = 'error';
        motor.ultimoError = e.message || String(e);
        log('AudioEngine no arrancó: ' + motor.ultimoError);
        throw e;
      }
      return motor;
    };

    /** Suelta hardware y nodos, conserva la configuración (fuentes, buses,
        mapeos) para poder volver a start() sin reconfigurar nada. */
    motor.stop = async function () {
      for (const bus of motor.buses.values()) desarmarBus(bus);
      for (const f of motor.fuentes.values()) soltarFuente(f);
      if (motor.ctx && motor.ctx.state === 'running') { try { await motor.ctx.suspend(); } catch (e) {} }
      motor.estado = 'inactivo';
      return motor;
    };

    motor.dispose = async function () {
      await motor.stop();
      if (motor.ctx) { try { await motor.ctx.close(); } catch (e) {} }
      motor.ctx = null; motor.workletListo = false;
      motor.fuentes.clear(); motor.buses.clear();
      motor.mapeos.length = 0; motor.enlaces.length = 0;
      motor.estado = 'inactivo';
    };

    motor.getStatus = function () {
      return {
        id: motor.id,
        estado: motor.estado,
        error: motor.ultimoError,
        contexto: motor.ctx ? motor.ctx.state : 'sin contexto',
        sampleRate: motor.ctx ? motor.ctx.sampleRate : 0,
        bufferSize: 128,                       // el bloque del AudioWorklet es fijo
        inputLatency: motor.metricas.baseLatency,
        outputLatency: motor.ctx ? (motor.ctx.outputLatency || 0) : 0,
        cuadros: motor.metricas.cuadros,
        saltos: motor.metricas.saltos,
        msEntreCuadros: +motor.metricas.msEntreCuadros.toFixed(2),
        fuentes: [...motor.fuentes.values()].map(estadoFuente),
        buses: [...motor.buses.values()].map(estadoBus),
        mapeos: motor.mapeos.length,
        enlaces: motor.enlaces.length,
      };
    };

    /* ══ Dispositivos ═══════════════════════════════════════════════ */

    /** Pide permiso una vez (sin él, enumerateDevices devuelve etiquetas
        vacías) y devuelve las entradas de audio del sistema. */
    motor.listarDispositivos = async function (pedirPermiso) {
      if (!navigator.mediaDevices) throw new Error('Este navegador no expone mediaDevices (¿contexto no seguro?).');
      if (pedirPermiso) {
        try {
          const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
          tmp.getTracks().forEach(t => t.stop());
        } catch (e) {
          log('Permiso de micrófono denegado o sin dispositivos: ' + (e.message || e));
        }
      }
      const todos = await navigator.mediaDevices.enumerateDevices();
      return todos.filter(d => d.kind === 'audioinput').map(d => ({
        deviceId: d.deviceId,
        label: d.label || ('Entrada ' + (d.deviceId || '').slice(0, 6)),
        groupId: d.groupId,
      }));
    };

    /* ══ AudioSource ════════════════════════════════════════════════ */

    /** desc = { type:'device'|'stream', deviceId, name, channels, gain }
        'device'  → getUserMedia sobre esa entrada física / micrófono
        'stream'  → un MediaStream ya existente (cámara del teléfono, WebRTC,
                    pestaña compartida…). El motor no sabe de dónde salió:
                    ése es justamente el punto de desacople para el futuro
                    NetworkAudioSource. */
    motor.agregarFuente = async function (desc) {
      if (motor.estado !== 'activo') await motor.start();
      const d = desc || {};
      const fuente = {
        id: d.id || nuevoId('src'),
        name: d.name || 'Entrada',
        type: d.type || 'device',
        deviceId: d.deviceId || '',
        sampleRate: motor.ctx.sampleRate,
        channels: 0,
        enabled: true,
        gain: d.gain !== undefined ? d.gain : 1,
        status: 'abriendo',
        _stream: null, _nodo: null, _gain: null, _splitter: null,
      };
      motor.fuentes.set(fuente.id, fuente);

      try {
        let stream = d.stream || null;
        if (!stream) {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('getUserMedia no disponible (se necesita http://localhost o https).');
          }
          /* Sin procesamiento de voz: para una interfaz de audio o un
             instrumento, la cancelación de eco y el AGC del navegador
             arruinan la señal y meten latencia. */
          const restr = {
            echoCancellation: false, noiseSuppression: false, autoGainControl: false,
          };
          if (d.deviceId) restr.deviceId = { exact: d.deviceId };
          if (d.channels) restr.channelCount = d.channels;
          stream = await navigator.mediaDevices.getUserMedia({ audio: restr, video: false });
        }
        fuente._stream = stream;
        const pista = stream.getAudioTracks()[0];
        const conf = pista ? (pista.getSettings ? pista.getSettings() : {}) : {};
        fuente.channels = conf.channelCount || 1;
        if (conf.sampleRate) fuente.sampleRate = conf.sampleRate;
        if (!d.name && pista && pista.label) fuente.name = pista.label;

        fuente._nodo = motor.ctx.createMediaStreamSource(stream);
        fuente._gain = motor.ctx.createGain();
        fuente._gain.gain.value = fuente.gain;
        fuente._nodo.connect(fuente._gain);
        /* El splitter deja elegir "Input 1" o "Input 2" de una interfaz
           multicanal: el navegador entrega la interfaz como UN dispositivo
           con N canales, no como N dispositivos. */
        if (fuente.channels > 1) {
          fuente._splitter = motor.ctx.createChannelSplitter(fuente.channels);
          fuente._gain.connect(fuente._splitter);
        }
        fuente.status = 'activa';
        log('Fuente abierta: ' + fuente.name + ' — ' + fuente.channels + ' canal(es) @ ' + fuente.sampleRate + ' Hz');
      } catch (e) {
        fuente.status = 'error';
        fuente.error = e.message || String(e);
        log('No se pudo abrir la fuente "' + fuente.name + '": ' + fuente.error);
      }
      notificar();
      return fuente;
    };

    function soltarFuente(f) {
      try { if (f._nodo) f._nodo.disconnect(); } catch (e) {}
      try { if (f._gain) f._gain.disconnect(); } catch (e) {}
      try { if (f._splitter) f._splitter.disconnect(); } catch (e) {}
      if (f._stream) f._stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
      f._nodo = null; f._gain = null; f._splitter = null; f._stream = null;
      f.status = 'detenida';
    }

    motor.quitarFuente = function (id) {
      const f = motor.fuentes.get(id);
      if (!f) return false;
      for (const bus of motor.buses.values()) if (bus.sourceId === id) motor.quitarBus(bus.id);
      soltarFuente(f);
      motor.fuentes.delete(id);
      notificar();
      return true;
    };

    motor.setGananciaFuente = function (id, g) {
      const f = motor.fuentes.get(id);
      if (!f) return false;
      f.gain = Math.max(0, Math.min(4, +g || 0));
      if (f._gain) f._gain.gain.value = f.gain;
      return true;
    };

    function estadoFuente(f) {
      return {
        id: f.id, name: f.name, type: f.type, deviceId: f.deviceId,
        sampleRate: f.sampleRate, channels: f.channels,
        enabled: f.enabled, gain: f.gain, status: f.status, error: f.error || '',
      };
    }

    /* ══ AudioBus ═══════════════════════════════════════════════════ */

    /** desc = { id, name, sourceId, channel:'mix'|0|1|…, analisis:{}, monitor:false } */
    motor.agregarBus = function (desc) {
      const d = desc || {};
      const bus = {
        id: d.id || nuevoId('bus'),
        name: d.name || 'BUS',
        sourceId: d.sourceId || '',
        channel: d.channel === undefined ? 'mix' : d.channel,
        analisis: Object.assign(analisisPorDefecto(), d.analisis || {}),
        monitor: !!d.monitor,
        monitorGain: d.monitorGain !== undefined ? d.monitorGain : 0.8,
        ultimo: { rms: 0, peak: 0, env: 0, low: 0, mid: 0, high: 0, gate: 0, audioTime: 0, frame: 0 },
        _worklet: null, _monitor: null, _origen: null,
      };
      motor.buses.set(bus.id, bus);
      armarBus(bus);
      notificar();
      return bus;
    };

    function nodoOrigenPara(bus) {
      const f = motor.fuentes.get(bus.sourceId);
      if (!f || !f._gain) return null;
      if (bus.channel === 'mix' || !f._splitter) return { nodo: f._gain, salida: 0 };
      const idx = Math.max(0, Math.min((f.channels || 1) - 1, +bus.channel || 0));
      return { nodo: f._splitter, salida: idx };
    }

    function armarBus(bus) {
      if (motor.estado !== 'activo' || !motor.ctx) return;
      desarmarBus(bus);
      const origen = nodoOrigenPara(bus);
      if (!origen) return;
      try {
        bus._worklet = new AudioWorkletNode(motor.ctx, 'midivj-analizador', {
          numberOfInputs: 1,
          numberOfOutputs: 0,          // nodo sumidero: analiza y no devuelve audio
          channelCount: 1,
          channelCountMode: 'explicit',
          channelInterpretation: 'discrete',
          processorOptions: bus.analisis,
        });
        bus._worklet.port.onmessage = (e) => recibirDelWorklet(bus, e.data);
        origen.nodo.connect(bus._worklet, origen.salida);

        /* Rama de monitoreo, siempre separada del análisis. */
        bus._monitor = motor.ctx.createGain();
        bus._monitor.gain.value = bus.monitor ? bus.monitorGain : 0;
        origen.nodo.connect(bus._monitor, origen.salida);
        bus._monitor.connect(motor.ctx.destination);

        bus._origen = origen;
      } catch (e) {
        log('No se pudo armar el bus "' + bus.name + '": ' + (e.message || e));
      }
    }

    function desarmarBus(bus) {
      try { if (bus._worklet) { bus._worklet.port.onmessage = null; bus._worklet.disconnect(); } } catch (e) {}
      try { if (bus._monitor) bus._monitor.disconnect(); } catch (e) {}
      bus._worklet = null; bus._monitor = null; bus._origen = null;
    }

    motor.quitarBus = function (id) {
      const bus = motor.buses.get(id);
      if (!bus) return false;
      desarmarBus(bus);
      motor.buses.delete(id);
      motor.mapeos = motor.mapeos.filter(m => m.busId !== id);
      motor.enlaces = motor.enlaces.filter(x => x.busId !== id);
      notificar();
      return true;
    };

    motor.configurarBus = function (id, cambios) {
      const bus = motor.buses.get(id);
      if (!bus) return false;
      const c = cambios || {};
      let rearmar = false;
      if (c.name !== undefined) bus.name = c.name;
      if (c.sourceId !== undefined && c.sourceId !== bus.sourceId) { bus.sourceId = c.sourceId; rearmar = true; }
      if (c.channel !== undefined && c.channel !== bus.channel) { bus.channel = c.channel; rearmar = true; }
      if (c.monitor !== undefined) {
        bus.monitor = !!c.monitor;
        if (bus._monitor) bus._monitor.gain.value = bus.monitor ? bus.monitorGain : 0;
      }
      if (c.monitorGain !== undefined) {
        bus.monitorGain = Math.max(0, Math.min(2, +c.monitorGain || 0));
        if (bus._monitor && bus.monitor) bus._monitor.gain.value = bus.monitorGain;
      }
      if (c.analisis) {
        Object.assign(bus.analisis, c.analisis);
        /* Reconfigurar en caliente: el worklet recibe el cambio por su port
           y recalcula coeficientes fuera de process(). */
        if (bus._worklet) bus._worklet.port.postMessage({ type: 'config', config: bus.analisis });
      }
      if (rearmar) armarBus(bus);
      notificar();
      return true;
    };

    function estadoBus(b) {
      return {
        id: b.id, name: b.name, sourceId: b.sourceId, channel: b.channel,
        monitor: b.monitor, monitorGain: b.monitorGain,
        activo: !!b._worklet, analisis: Object.assign({}, b.analisis),
      };
    }

    /* ══ Llegada de datos del hilo de audio ═════════════════════════ */

    function recibirDelWorklet(bus, msg) {
      if (!msg) return;
      if (msg.type === 'event') { despacharEvento(bus, msg); return; }

      const u = bus.ultimo;
      u.rms = msg.rms; u.peak = msg.peak; u.env = msg.env;
      u.low = msg.low; u.mid = msg.mid; u.high = msg.high;
      u.gate = msg.gate; u.audioTime = msg.audioTime; u.frame = msg.frame;

      const m = motor.metricas;
      const ahora = global.performance ? performance.now() : Date.now();
      if (m.ultimoCuadroMs) {
        const dt = ahora - m.ultimoCuadroMs;
        m.msEntreCuadros = m.msEntreCuadros * 0.9 + dt * 0.1;
        /* Un hueco de más del triple del período esperado es un dropout del
           lado del hilo de audio o del hilo principal bloqueado. */
        if (dt > Math.max(40, m.msEntreCuadros * 3)) m.saltos++;
      }
      m.ultimoCuadroMs = ahora;
      m.cuadros++;

      aplicarMapeos(bus);
      if (op.onFrame) op.onFrame(bus, u);
    }

    /* ══ Mapeos continuos (audio → parámetro) ═══════════════════════ */

    /** def = { id, busId, senal:'env'|…, targetId, inMin, inMax, curva, enabled } */
    motor.agregarMapeo = function (def) {
      const d = def || {};
      const mapeo = {
        id: d.id || nuevoId('map'),
        busId: d.busId || '',
        senal: SENALES.indexOf(d.senal) >= 0 ? d.senal : 'env',
        targetId: d.targetId || '',
        inMin: d.inMin !== undefined ? d.inMin : 0,
        inMax: d.inMax !== undefined ? d.inMax : 0.6,
        curva: CURVAS[d.curva] ? d.curva : 'linear',
        outMin: d.outMin !== undefined ? d.outMin : 0,
        outMax: d.outMax !== undefined ? d.outMax : 1,
        enabled: d.enabled !== undefined ? !!d.enabled : true,
        _ultimo: -1,
      };
      motor.mapeos.push(mapeo);
      notificar();
      return mapeo;
    };

    motor.configurarMapeo = function (id, cambios) {
      const m = motor.mapeos.find(x => x.id === id);
      if (!m) return false;
      Object.assign(m, cambios || {});
      if (!CURVAS[m.curva]) m.curva = 'linear';
      notificar();
      return true;
    };

    motor.quitarMapeo = function (id) {
      const i = motor.mapeos.findIndex(x => x.id === id);
      if (i < 0) return false;
      motor.mapeos.splice(i, 1);
      notificar();
      return true;
    };

    function aplicarMapeos(bus) {
      const targets = motor.host && motor.host.targets;
      if (!targets) return;
      for (let i = 0; i < motor.mapeos.length; i++) {
        const m = motor.mapeos[i];
        if (!m.enabled || m.busId !== bus.id || !m.targetId) continue;
        const bruto = bus.ultimo[m.senal];
        if (bruto === undefined) continue;
        const span = m.inMax - m.inMin;
        let n = span === 0 ? 0 : (bruto - m.inMin) / span;
        n = n < 0 ? 0 : (n > 1 ? 1 : n);
        n = CURVAS[m.curva](n);
        n = m.outMin + (m.outMax - m.outMin) * n;
        /* Evita reescribir el mismo valor 60 veces por segundo: además de
           ahorrar trabajo, deja mover el slider a mano cuando la señal está
           quieta. */
        if (Math.abs(n - m._ultimo) < 0.002) continue;
        m._ultimo = n;
        targets.aplicarNormalizado(m.targetId, n);
      }
    }

    /* ══ Eventos discretos (audio → acción) ═════════════════════════ */

    /** def = { id, busId, ev:'gate.open'|…, accionId, enabled } */
    motor.agregarEnlace = function (def) {
      const d = def || {};
      const enlace = {
        id: d.id || nuevoId('ev'),
        busId: d.busId || '',
        ev: EVENTOS.indexOf(d.ev) >= 0 ? d.ev : 'gate.open',
        accionId: d.accionId || '',
        enabled: d.enabled !== undefined ? !!d.enabled : true,
      };
      motor.enlaces.push(enlace);
      notificar();
      return enlace;
    };

    motor.configurarEnlace = function (id, cambios) {
      const e = motor.enlaces.find(x => x.id === id);
      if (!e) return false;
      Object.assign(e, cambios || {});
      notificar();
      return true;
    };

    motor.quitarEnlace = function (id) {
      const i = motor.enlaces.findIndex(x => x.id === id);
      if (i < 0) return false;
      motor.enlaces.splice(i, 1);
      notificar();
      return true;
    };

    function despacharEvento(bus, msg) {
      const acciones = motor.host && motor.host.acciones;
      for (let i = 0; i < motor.enlaces.length; i++) {
        const e = motor.enlaces[i];
        if (!e.enabled || e.busId !== bus.id || e.ev !== msg.ev || !e.accionId) continue;
        if (acciones) acciones.ejecutar(e.accionId);
      }
      if (op.onEvent) op.onEvent(bus, msg);
    }

    /* ══ Persistencia ═══════════════════════════════════════════════ */

    /** Lo que se guarda en la sesión .vjp. No se guardan MediaStreams ni
        nodos: al abrir una sesión, las fuentes de dispositivo quedan en
        estado 'pendiente' hasta que el operador pulse RECONECTAR (hace
        falta un gesto del usuario para getUserMedia). */
    motor.serializar = function () {
      return {
        version: 1,
        fuentes: [...motor.fuentes.values()]
          .filter(f => f.type === 'device')
          .map(f => ({ id: f.id, name: f.name, type: f.type, deviceId: f.deviceId, gain: f.gain, channels: f.channels })),
        buses: [...motor.buses.values()].map(b => ({
          id: b.id, name: b.name, sourceId: b.sourceId, channel: b.channel,
          monitor: b.monitor, monitorGain: b.monitorGain, analisis: Object.assign({}, b.analisis),
        })),
        mapeos: motor.mapeos.map(m => ({
          id: m.id, busId: m.busId, senal: m.senal, targetId: m.targetId,
          inMin: m.inMin, inMax: m.inMax, curva: m.curva, outMin: m.outMin, outMax: m.outMax, enabled: m.enabled,
        })),
        enlaces: motor.enlaces.map(e => ({ id: e.id, busId: e.busId, ev: e.ev, accionId: e.accionId, enabled: e.enabled })),
      };
    };

    /** Restaura configuración SIN abrir hardware. Devuelve la lista de
        fuentes que quedaron pendientes de reconexión. */
    motor.restaurar = function (data) {
      if (!data) return [];
      for (const bus of motor.buses.values()) desarmarBus(bus);
      for (const f of motor.fuentes.values()) soltarFuente(f);
      motor.fuentes.clear(); motor.buses.clear();
      motor.mapeos.length = 0; motor.enlaces.length = 0;

      const pendientes = [];
      (data.fuentes || []).forEach(fd => {
        const f = {
          id: fd.id || nuevoId('src'), name: fd.name || 'Entrada', type: fd.type || 'device',
          deviceId: fd.deviceId || '', sampleRate: 0, channels: fd.channels || 0,
          enabled: true, gain: fd.gain !== undefined ? fd.gain : 1, status: 'pendiente',
          _stream: null, _nodo: null, _gain: null, _splitter: null,
        };
        motor.fuentes.set(f.id, f);
        pendientes.push(f);
      });
      (data.buses || []).forEach(bd => {
        const bus = {
          id: bd.id || nuevoId('bus'), name: bd.name || 'BUS', sourceId: bd.sourceId || '',
          channel: bd.channel === undefined ? 'mix' : bd.channel,
          analisis: Object.assign(analisisPorDefecto(), bd.analisis || {}),
          monitor: !!bd.monitor, monitorGain: bd.monitorGain !== undefined ? bd.monitorGain : 0.8,
          ultimo: { rms: 0, peak: 0, env: 0, low: 0, mid: 0, high: 0, gate: 0, audioTime: 0, frame: 0 },
          _worklet: null, _monitor: null, _origen: null,
        };
        motor.buses.set(bus.id, bus);
      });
      (data.mapeos || []).forEach(m => motor.agregarMapeo(m));
      (data.enlaces || []).forEach(e => motor.agregarEnlace(e));
      notificar();
      return pendientes;
    };

    /** Vuelve a abrir el hardware de las fuentes pendientes y rearma los
        buses. Se llama desde un clic del operador. */
    motor.reconectar = async function () {
      if (motor.estado !== 'activo') await motor.start();
      for (const f of [...motor.fuentes.values()]) {
        if (f.status === 'activa') continue;
        const copia = { id: f.id, name: f.name, type: f.type, deviceId: f.deviceId, gain: f.gain, channels: f.channels };
        motor.fuentes.delete(f.id);
        await motor.agregarFuente(copia);
      }
      for (const bus of motor.buses.values()) armarBus(bus);
      notificar();
      return motor.getStatus();
    };

    /** Rearma todo el grafo (útil tras start() con configuración ya cargada). */
    motor.rearmarTodo = function () {
      for (const bus of motor.buses.values()) armarBus(bus);
    };

    motor.senales = SENALES.slice();
    motor.eventosDisponibles = EVENTOS.slice();
    motor.curvas = Object.keys(CURVAS);

    function notificar() { if (op.onChange) { try { op.onChange(motor); } catch (e) {} } }

    return motor;
  }

  global.MIDIVJAudio = { crear, SENALES, EVENTOS, CURVAS: Object.keys(CURVAS) };
})(typeof window !== 'undefined' ? window : globalThis);
