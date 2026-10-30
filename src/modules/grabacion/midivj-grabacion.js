/* ══════════════════════════════════════════════════════════════════════
   MIDIVJ — Grabación
   ══════════════════════════════════════════════════════════════════════

   Graba la salida (lo mismo que ven HDMI y OBS) con MediaRecorder. Sigue el
   contrato de `src/modules/midivj-module.js`: no conoce `S` ni el lienzo;
   pide la señal a `host.capturas` ('salida') y recibe un MediaStream propio,
   que detiene al terminar sin afectar a HDMI ni a OBS.

   Camino de los datos:

       capturas.obtener('salida').capturar(fps) ──▶ MediaRecorder (trozo de 1 s)
           ──▶ cola en memoria ──▶ PUT /api/grabaciones/<toma>/<archivo>?desde=N
           ──▶ el relay lo agrega al final de Grabaciones/<toma>/<archivo>

   Lo grabado llega a disco segundo a segundo: si la pestaña se cierra a
   media función se pierde, como mucho, el último segundo. Si el relay no
   responde, los trozos esperan en memoria y se reenvían solos (`?desde=`
   hace que un reintento nunca escriba dos veces lo mismo).

   Una toma es una carpeta. Si la salida cambia de resolución mientras se
   graba, el video sigue en un archivo nuevo de la misma toma ("salida
   (2).mp4"): cada archivo queda con un solo tamaño, que es lo que mejor
   abren los editores. `toma.json` dice qué hay en cada archivo y cuándo
   empezó, con un mismo reloj para todos (para alinear cámaras después).

   API pública (window.MIDIVJGrabacion):
       crear(opciones) → grabador
   El grabador expone: init, start (graba), stop (detiene y termina de
   guardar), dispose, getStatus, grabando, cortar (archivo nuevo alrededor
   de un cambio de tamaño), formatos, estimarMbps, listarTomas,
   abrirCarpeta, config.
   ────────────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  const API = '/api/grabaciones';
  const TROZO_MS = 1000;
  const MAX_AVISOS = 6;
  const AVISO_COLA_BYTES = 256 * 1024 * 1024;

  /* En orden de preferencia: MP4 lo abre cualquier editor y reproductor;
     WebM queda para navegadores sin MP4 en MediaRecorder. */
  const FORMATOS = [
    { id: 'mp4', ext: 'mp4', etiqueta: 'MP4 · H.264', mimes: ['video/mp4;codecs=avc1.640033', 'video/mp4;codecs=avc1', 'video/mp4'] },
    { id: 'webm-vp9', ext: 'webm', etiqueta: 'WebM · VP9', mimes: ['video/webm;codecs=vp9'] },
    { id: 'webm-vp8', ext: 'webm', etiqueta: 'WebM · VP8', mimes: ['video/webm;codecs=vp8', 'video/webm'] },
  ];

  /* Bits por píxel y por cuadro. 1080p30: normal ≈ 5, alta ≈ 9, máxima ≈ 19 Mbps. */
  const CALIDADES = {
    normal: { etiqueta: 'Normal', bpp: 0.08 },
    alta:   { etiqueta: 'Alta',   bpp: 0.15 },
    maxima: { etiqueta: 'Máxima', bpp: 0.3 },
  };
  const MIN_BPS = 1e6, MAX_BPS = 80e6;

  function soportado(mime) {
    return !!(global.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(mime));
  }

  /** Los formatos que este navegador puede grabar, con el MIME exacto. */
  function formatos() {
    const lista = [];
    for (const f of FORMATOS) {
      const mime = f.mimes.find(soportado);
      if (mime) lista.push({ id: f.id, ext: f.ext, etiqueta: f.etiqueta, mime });
    }
    return lista;
  }

  function bitsPorSegundo(ancho, alto, fps, calidad) {
    const bpp = (CALIDADES[calidad] || CALIDADES.alta).bpp;
    return Math.round(Math.max(MIN_BPS, Math.min(MAX_BPS, (ancho || 1280) * (alto || 720) * (fps || 30) * bpp)));
  }

  const dormir = ms => new Promise(r => setTimeout(r, ms));
  const mensajeDe = e => (e && e.message) || String(e);

  function crear(opciones) {
    const op = opciones || {};
    const log = op.log || function () {};
    const cambio = () => { if (op.onChange) { try { op.onChange(); } catch (e) {} } };

    const g = {
      /* ── contrato de módulo ── */
      id: 'grabacion',
      nombre: 'GRABACIÓN',
      capacidades: ['grabacion'],
      estado: 'inactivo',

      /* ── estado propio ── */
      host: null,
      config: { formato: 'auto', calidad: 'alta', fps: 30, titulo: '' },
      fase: 'lista',        // 'lista' | 'abriendo' | 'grabando' | 'cerrando'
      toma: null,           // { nombre, carpeta, inicio: Date, t0: ms, fin: Date|null }
      segmentos: [],        // cada archivo de la toma, en orden
      actual: null,         // el segmento que está recibiendo video
      avisos: [],
      ultimoError: '',
    };

    let cap = null, formato = null, tick = 0;
    let sinRelayDesde = 0, ocultaDesde = 0, avisoCola = false;
    let manifiestoEnCurso = Promise.resolve();

    const ahoraMs = () => (g.host && g.host.now ? g.host.now() : performance.now() / 1000) * 1000;
    const msDeToma = () => Math.round(ahoraMs() - g.toma.t0);
    const urlArchivo = (toma, archivo) => API + '/' + encodeURIComponent(toma) + '/' + encodeURIComponent(archivo);

    function aviso(texto) {
      const hora = new Date().toLocaleTimeString();
      g.avisos.push(hora + ' ' + texto);
      if (g.avisos.length > MAX_AVISOS) g.avisos.shift();
      log(texto);
      cambio();
    }

    async function pedir(metodo, url, cuerpo) {
      let r;
      try {
        r = await fetch(url, {
          method: metodo, cache: 'no-store',
          headers: cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
          body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        });
      } catch (e) {
        throw new Error('No hay conexión con el relay: ¿está abierto INICIAR_RELAY?');
      }
      const datos = await r.json().catch(() => ({}));
      if (r.status === 404 && datos.error === 'Ruta no encontrada.') {
        throw new Error('El relay abierto es de una versión anterior: ciérralo y vuelve a abrirlo (INICIAR_RELAY) para poder grabar.');
      }
      if (!r.ok) throw new Error(datos.error || ('El relay respondió ' + r.status));
      return datos;
    }

    /* ══ Envío de trozos ════════════════════════════════════════════ */

    function pendientes() {
      return g.segmentos.reduce((n, s) => n + s.colaBytes, 0);
    }

    async function bombear(seg) {
      if (seg.bombeando || !seg.archivo) return;   // sin archivo todavía: espera a que el relay lo cree
      seg.bombeando = true;
      let espera = 500;
      while (seg.cola.length && !seg.roto) {
        const trozo = seg.cola[0];
        let r = null, datos = {};
        try {
          r = await fetch(urlArchivo(g.toma.nombre, seg.archivo) + '?desde=' + seg.enviados, { method: 'PUT', body: trozo, cache: 'no-store' });
          datos = await r.json().catch(() => ({}));
        } catch (e) { r = null; }
        if (r && r.ok) {
          seg.enviados = typeof datos.tam === 'number' ? datos.tam : seg.enviados + trozo.size;
          seg.cola.shift();
          seg.colaBytes -= trozo.size;
          espera = 500;
          if (sinRelayDesde) {
            aviso('El relay volvió: se reenvió lo pendiente (' + Math.round((Date.now() - sinRelayDesde) / 1000) + ' s sin conexión).');
            sinRelayDesde = 0;
          }
          continue;
        }
        if (r && (r.status === 409 || r.status === 404 || r.status === 400)) {
          /* El archivo ya no coincide con lo enviado (lo movieron, lo
             borraron…): lo que sigue no se puede pegar a él. */
          seg.roto = true;
          seg.colaBytes = 0;
          seg.cola.length = 0;
          aviso(seg.archivo + ' quedó incompleto: ' + (datos.error || ('el relay respondió ' + r.status)));
          if (seg === g.actual) g.cortar(null, 'Se perdió ' + seg.archivo);
          break;
        }
        if (!sinRelayDesde) {
          sinRelayDesde = Date.now();
          aviso('El relay no responde: lo grabado espera en memoria y se reenvía solo.');
        }
        await dormir(espera);
        espera = Math.min(espera * 2, 5000);
      }
      seg.bombeando = false;
      if (!seg.cola.length || seg.roto) seg.esperando.splice(0).forEach(listo => listo());
      cambio();
    }

    function esperarVaciado(seg) {
      if (seg.roto || (!seg.cola.length && !seg.bombeando)) return Promise.resolve();
      return new Promise(r => seg.esperando.push(r));
    }

    /* ══ Segmentos (un archivo cada uno) ════════════════════════════ */

    /* Cada archivo tiene su propio captureStream, pedido después de cualquier
       cambio de tamaño: un stream compartido le entregaba al grabador nuevo
       un cuadro del tamaño anterior y el MP4 quedaba con el tamaño
       equivocado. `archivo` puede llegar después (null): los trozos esperan
       en la cola. */
    function abrirSegmento(archivo) {
      const tam = cap.tamano() || {};
      const bps = bitsPorSegundo(tam.ancho, tam.alto, g.config.fps, g.config.calidad);
      const flujo = cap.capturar(g.config.fps);
      if (!flujo || !flujo.getVideoTracks().length) throw new Error('El navegador no pudo capturar la salida.');
      let rec;
      try {
        /* Un cuadro clave por segundo: el MP4 se escribe por fragmentos que
           empiezan en uno, así que sin esto llegaba a disco cada ~3,4 s. De
           paso, los editores saltan mejor dentro del archivo. */
        rec = new MediaRecorder(flujo, { mimeType: formato.mime, videoBitsPerSecond: bps, videoKeyFrameIntervalDuration: TROZO_MS });
      } catch (e) {
        flujo.getTracks().forEach(t => t.stop());
        throw e;
      }
      const seg = {
        archivo, fuente: cap.id, nombre: cap.nombre, mime: formato.mime,
        ancho: tam.ancho || 0, alto: tam.alto || 0, fps: g.config.fps, kbps: Math.round(bps / 1000),
        desdeMs: msDeToma(), hastaMs: null,
        flujo, rec, enviados: 0, cola: [], colaBytes: 0, bombeando: false, roto: false, esperando: [],
      };
      seg.detenido = new Promise(r => rec.addEventListener('stop', r, { once: true }));
      rec.ondataavailable = e => {
        if (!e.data || !e.data.size || seg.roto) return;
        seg.cola.push(e.data);
        seg.colaBytes += e.data.size;
        bombear(seg);
      };
      rec.onerror = e => {
        const motivo = (e && e.error && e.error.message) || 'error del codificador';
        aviso('MediaRecorder se detuvo en ' + (seg.archivo || 'el archivo nuevo') + ': ' + motivo);
        if (seg === g.actual) g.cortar(null, 'El codificador falló');
      };
      rec.start(TROZO_MS);
      g.segmentos.push(seg);
      g.actual = seg;
      return seg;
    }

    async function cerrarSegmento(seg) {
      if (seg.rec.state !== 'inactive') { try { seg.rec.stop(); } catch (e) {} }
      await seg.detenido;
      seg.flujo.getTracks().forEach(t => t.stop());
      if (seg.hastaMs === null) seg.hastaMs = msDeToma();
      await esperarVaciado(seg);
    }

    /** Cierra el archivo actual, aplica `cambiar()` (p. ej. el tamaño nuevo
        del lienzo) y sigue en un archivo nuevo de la misma toma. El grabador
        viejo se detiene ANTES del cambio y el nuevo arranca justo después:
        ningún archivo recibe cuadros de dos tamaños (el H.264 quedaba
        dañado) y no se pierde ningún cuadro. El archivo se crea mientras
        tanto; lo grabado espera en la cola. */
    g.cortar = function (cambiar, motivo) {
      if (g.fase !== 'grabando') { if (cambiar) cambiar(); return; }
      const viejo = g.actual;
      if (viejo && viejo.rec.state !== 'inactive') { try { viejo.rec.stop(); } catch (e) {} }
      if (cambiar) cambiar();
      let nuevo;
      try { nuevo = abrirSegmento(null); }
      catch (e) {
        aviso('No se pudo seguir grabando (' + mensajeDe(e) + ').');
        g.stop();   // g.actual sigue siendo el viejo: stop() lo termina de guardar
        return;
      }
      if (viejo) cerrarSegmento(viejo).then(escribirManifiesto);
      pedir('POST', API, { toma: g.toma.nombre, nombre: cap.id, ext: formato.ext })
        .then(datos => {
          nuevo.archivo = datos.archivo;
          aviso((motivo || 'Archivo nuevo') + ' → sigue en ' + datos.archivo);
          bombear(nuevo);
          escribirManifiesto();
        })
        .catch(e => {
          nuevo.roto = true;
          nuevo.cola.length = 0;
          nuevo.colaBytes = 0;
          nuevo.esperando.splice(0).forEach(listo => listo());
          aviso('No se pudo abrir otro archivo (' + mensajeDe(e) + '): se detiene la grabación.');
          g.stop();
        });
    };

    /* Respaldo: un cambio de tamaño que no pasó por cortar() se nota aquí,
       ya con algún cuadro del tamaño nuevo en el archivo anterior. */
    function revisar() {
      if (g.fase !== 'grabando') return;
      const tam = cap.tamano() || {};
      const a = g.actual;
      if (a && (tam.ancho !== a.ancho || tam.alto !== a.alto)) g.cortar(null, 'La salida cambió a ' + tam.ancho + '×' + tam.alto);
      if (global.document && document.visibilityState === 'hidden') {
        if (!ocultaDesde) {
          ocultaDesde = Date.now();
          aviso('La pestaña de MIDIVJ quedó oculta: el navegador frena el dibujo y la grabación puede congelarse.');
        }
      } else ocultaDesde = 0;
      const pend = pendientes();
      if (pend > AVISO_COLA_BYTES && !avisoCola) {
        avisoCola = true;
        aviso('Hay ' + Math.round(pend / 1048576) + ' MB esperando al relay en memoria.');
      } else if (pend < AVISO_COLA_BYTES / 2) avisoCola = false;
      cambio();
    }

    /* ══ Manifiesto ═════════════════════════════════════════════════ */

    function manifiesto() {
      return {
        app: 'MIDIVJ',
        version: 1,
        toma: g.toma.nombre,
        inicio: g.toma.inicio.toISOString(),
        fin: g.toma.fin ? g.toma.fin.toISOString() : null,
        nota: 'desdeMs/hastaMs: milisegundos desde el inicio de la toma, con el mismo reloj para todos los archivos.',
        archivos: g.segmentos.filter(s => s.archivo).map(s => ({
          archivo: s.archivo, fuente: s.fuente, nombre: s.nombre, formato: s.mime,
          ancho: s.ancho, alto: s.alto, fps: s.fps, kbps: s.kbps,
          desdeMs: s.desdeMs, hastaMs: s.hastaMs, bytes: s.enviados, completo: !s.roto,
        })),
      };
    }

    /* En fila: el relay recibe las versiones en el orden en que se armaron. */
    function escribirManifiesto() {
      if (!g.toma) return manifiestoEnCurso;
      const datos = manifiesto();
      const url = urlArchivo(g.toma.nombre, 'toma.json');
      manifiestoEnCurso = manifiestoEnCurso
        .then(() => pedir('PUT', url, datos))
        .catch(e => log('no se pudo guardar toma.json: ' + mensajeDe(e)));
      return manifiestoEnCurso;
    }

    /* ══ Ciclo de vida ══════════════════════════════════════════════ */

    g.init = function (host) {
      g.host = host || (global.MIDIVJ && global.MIDIVJ.host) || null;
      return g;
    };

    /** Empieza a grabar la salida en una toma nueva. */
    g.start = async function () {
      if (g.fase !== 'lista') return g;
      const disponibles = formatos();
      formato = disponibles.find(f => f.id === g.config.formato) || disponibles[0] || null;
      cap = g.host && g.host.capturas ? g.host.capturas.obtener('salida') : null;
      g.fase = 'abriendo';
      g.estado = 'iniciando';
      g.ultimoError = '';
      g.avisos = [];
      cambio();
      let seg = null;
      try {
        if (!formato) throw new Error('Este navegador no puede grabar video (MediaRecorder sin MP4 ni WebM).');
        if (!cap) throw new Error('No hay salida registrada para grabar.');
        g.toma = { nombre: null, carpeta: null, inicio: new Date(), t0: ahoraMs(), fin: null };
        g.segmentos = [];
        sinRelayDesde = 0; ocultaDesde = 0; avisoCola = false;
        seg = abrirSegmento(null);   // graba desde ya; el relay crea la carpeta y el archivo mientras tanto
        const nuevo = await pedir('POST', API, { titulo: g.config.titulo, nombre: cap.id, ext: formato.ext });
        g.toma.nombre = nuevo.toma;
        g.toma.carpeta = nuevo.carpeta;
        seg.archivo = nuevo.archivo;
        bombear(seg);
        g.fase = 'grabando';
        g.estado = 'activo';
        tick = setInterval(revisar, 1000);
        escribirManifiesto();
        log('grabando la salida en Grabaciones/' + nuevo.toma + '/' + nuevo.archivo +
            ' (' + seg.ancho + '×' + seg.alto + ' · ' + formato.mime + ' · ' + (seg.kbps / 1000).toFixed(1) + ' Mbps)');
      } catch (e) {
        if (seg) {
          try { seg.rec.stop(); } catch (_) {}
          seg.flujo.getTracks().forEach(t => t.stop());
        }
        g.actual = null;
        g.segmentos = [];
        g.toma = null;
        g.fase = 'lista';
        g.estado = 'error';
        g.ultimoError = mensajeDe(e);
        log('no se pudo grabar: ' + g.ultimoError);
        cambio();
        throw e;
      }
      cambio();
      return g;
    };

    /** Detiene la grabación y espera a que todo lo grabado llegue a disco. */
    g.stop = async function () {
      if (g.fase !== 'grabando') return g;
      g.fase = 'cerrando';
      clearInterval(tick);
      cambio();
      const seg = g.actual;
      if (seg) await cerrarSegmento(seg);
      g.actual = null;
      await Promise.all(g.segmentos.map(esperarVaciado));
      g.toma.fin = new Date();
      await escribirManifiesto();
      const bytes = g.segmentos.reduce((n, s) => n + s.enviados, 0);
      log('grabación guardada: Grabaciones/' + g.toma.nombre + ' (' + g.segmentos.length + ' archivo(s), ' +
          (bytes / 1048576).toFixed(1) + ' MB)');
      g.fase = 'lista';
      g.estado = 'inactivo';
      cambio();
      return g;
    };

    g.dispose = async function () {
      await g.stop();
      g.toma = null;
      g.segmentos = [];
      g.avisos = [];
      cambio();
    };

    g.grabando = () => g.fase === 'grabando' || g.fase === 'cerrando';

    g.getStatus = function () {
      const a = g.actual;
      return {
        estado: g.estado,
        fase: g.fase,
        toma: g.toma ? g.toma.nombre : null,
        carpeta: g.toma ? g.toma.carpeta : null,
        transcurridoMs: g.toma ? ((g.toma.fin ? g.toma.fin.getTime() - g.toma.inicio.getTime() : Date.now() - g.toma.inicio.getTime())) : 0,
        bytes: g.segmentos.reduce((n, s) => n + s.enviados, 0),
        pendientes: pendientes(),
        archivo: a ? (a.archivo || '…') : (g.segmentos.length ? g.segmentos[g.segmentos.length - 1].archivo : null),
        archivos: g.segmentos.filter(s => s.archivo).length,
        ancho: a ? a.ancho : 0,
        alto: a ? a.alto : 0,
        formato: formato ? formato.etiqueta : null,
        kbps: a ? a.kbps : 0,
        sinRelay: !!sinRelayDesde,
        avisos: g.avisos.slice(),
        ultimoError: g.ultimoError,
      };
    };

    g.formatos = formatos;
    g.calidades = () => Object.keys(CALIDADES).map(id => ({ id, etiqueta: CALIDADES[id].etiqueta }));
    g.estimarMbps = function () {
      const salida = g.host && g.host.capturas ? g.host.capturas.obtener('salida') : null;
      const t = salida ? salida.tamano() || {} : {};
      return bitsPorSegundo(t.ancho, t.alto, g.config.fps, g.config.calidad) / 1e6;
    };
    g.listarTomas = () => pedir('GET', API);
    g.abrirCarpeta = toma => pedir('POST', API + '/abrir', toma ? { toma } : {});

    return g;
  }

  global.MIDIVJGrabacion = { crear, formatos };
})(typeof window !== 'undefined' ? window : globalThis);
