/* ══════════════════════════════════════════════════════════════════════
   MIDIVJ — Mezcla de audio
   ══════════════════════════════════════════════════════════════════════

   Una mezcladora chica para el sonido de las pistas (el audio de sus videos
   y el micrófono de las cámaras de teléfono) y una ENTRADA elegida del
   equipo (interfaz, micrófono, mezcla de la consola). Sirve para dos cosas:
   escuchar/silenciar cada pista en esta PC y dejar su sonido en lo que se
   graba, para sincronizar al editar.

   No conoce `S` ni las pistas: la app le dice qué elemento <video> o qué
   MediaStream alimenta cada canal (ver «MEZCLA — puente» en Midivj ZYX.html).

   Grafo por canal:

       fuentes ──▶ entrada ─┬─▶ analizador (medidor)
                            ├─▶ monitor  (VOL, 0 si M)  ──▶ master ──▶ parlantes
                            ├─▶ a mezcla (VOL, 0 si no REC) ──▶ mezcla grabada (salida)
                            └─▶ limpio (sin tocar) ──▶ archivo propio de la pista

   Es decir: M (silenciar) sólo afecta a lo que suena en esta PC, nunca a lo
   que se graba; REC decide si el canal entra en la grabación.

   El AudioContext sólo nace con un gesto del usuario (abrir la mezcladora,
   elegir una entrada, grabar con audio). Hasta entonces los videos suenan
   como siempre, por su propio elemento. Un <video> conectado a Web Audio
   deja de sonar por su cuenta y pasa a sonar por este grafo: por eso los
   elementos sólo se conectan con el contexto ya corriendo.

   API pública (window.MIDIVJMezcla): crear(opciones) → mezcla
   ────────────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  const CLAVE = 'midivj-mezcla';
  const VOL_MAX = 1.5;
  const lim = (v, a, b) => Math.max(a, Math.min(b, v));

  function crear(opciones) {
    const op = opciones || {};
    const log = op.log || function () {};
    const cambio = () => { if (op.onChange) { try { op.onChange(); } catch (e) {} } };

    const m = {
      id: 'mezcla',
      nombre: 'MEZCLA',
      capacidades: ['audio-mezcla'],
      estado: 'inactivo',
      host: null,
      ctx: null,
      canales: new Map(),
      master: { vol: 1, mute: false },
      entrada: { deviceId: '', label: '', activa: false, error: '' },
      ultimoError: '',
    };
    let guardado = leerGuardado();
    const elementos = new WeakMap();   // <video> → { nodo, canal }
    let nodoMaster = null, nodoMezcla = null, flujoEntrada = null;

    function leerGuardado() {
      try { return JSON.parse(localStorage.getItem(CLAVE) || 'null') || {}; } catch (e) { return {}; }
    }
    function guardar() {
      const canales = {};
      for (const c of m.canales.values()) canales[c.id] = { vol: c.vol, mute: c.mute, rec: c.rec, muteTocado: c.muteTocado };
      guardado = { canales: { ...(guardado.canales || {}), ...canales }, master: { ...m.master }, entrada: { deviceId: m.entrada.deviceId, label: m.entrada.label } };
      try { localStorage.setItem(CLAVE, JSON.stringify(guardado)); } catch (e) {}
    }

    /* ══ Contexto ═══════════════════════════════════════════════════ */

    m.init = function (host) { m.host = host || (global.MIDIVJ && global.MIDIVJ.host) || null; return m; };
    m.activa = () => !!m.ctx && m.ctx.state === 'running';

    /** Crea (o despierta) el AudioContext. Hay que llamarlo desde un gesto. */
    m.start = async function () {
      if (!m.ctx) {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) { m.estado = 'error'; m.ultimoError = 'Este navegador no tiene Web Audio.'; throw new Error(m.ultimoError); }
        m.ctx = new AC({ latencyHint: 'interactive' });
        nodoMaster = m.ctx.createGain();
        nodoMaster.connect(m.ctx.destination);
        nodoMezcla = m.ctx.createMediaStreamDestination();
        m.ctx.onstatechange = () => { m.estado = m.activa() ? 'activo' : 'inactivo'; cambio(); };
        if (guardado.master) m.master = { vol: lim(+guardado.master.vol || 0, 0, VOL_MAX), mute: !!guardado.master.mute };
        aplicarMaster();
        for (const c of m.canales.values()) armar(c);
      }
      if (m.ctx.state !== 'running') { try { await m.ctx.resume(); } catch (e) {} }
      m.estado = m.activa() ? 'activo' : 'inactivo';
      /* La entrada elegida la última vez vuelve sola (si el permiso sigue dado) */
      if (m.activa() && guardado.entrada && guardado.entrada.deviceId && !m.entrada.activa && !m.entrada._abriendo) {
        m.usarEntrada(guardado.entrada.deviceId, guardado.entrada.label).catch(() => {});
      }
      cambio();
      return m;
    };
    m.stop = async function () {
      if (m.ctx && m.ctx.state === 'running') { try { await m.ctx.suspend(); } catch (e) {} }
      m.estado = 'inactivo';
      return m;
    };
    m.dispose = async function () { await m.stop(); };
    /* Un contexto suspendido (el navegador lo duerme si nació sin gesto) deja
       mudos los videos conectados: cualquier clic lo despierta. */
    const despertar = () => { if (m.ctx && m.ctx.state === 'suspended') m.ctx.resume().catch(() => {}); };
    global.addEventListener('pointerdown', despertar, true);
    global.addEventListener('keydown', despertar, true);

    /* ══ Canales ════════════════════════════════════════════════════ */

    /** El canal `id` (lo crea si falta). `def`: { nombre, mute } de arranque. */
    m.canal = function (id, def) {
      let c = m.canales.get(id);
      if (c) return c;
      const g = (guardado.canales && guardado.canales[id]) || {};
      const d = def || {};
      c = {
        id, nombre: d.nombre || id, detalle: '', tipo: d.tipo || 'pista',
        vol: g.vol !== undefined ? lim(+g.vol || 0, 0, VOL_MAX) : 1,
        mute: g.mute !== undefined ? !!g.mute : !!d.mute,
        rec: g.rec !== undefined ? !!g.rec : true,
        muteTocado: !!g.muteTocado,
        conSenal: false,       // la app dice si ahora hay algo que suene en el canal
        pico: 0,
        _in: null, _an: null, _mon: null, _aMezcla: null, _limpio: null, _flujo: null, _flujoNodo: null, _buf: null,
      };
      m.canales.set(id, c);
      if (m.ctx) armar(c);
      return c;
    };
    function armar(c) {
      if (c._in) return;
      const x = m.ctx;
      c._in = x.createGain();
      c._an = x.createAnalyser(); c._an.fftSize = 512; c._buf = new Float32Array(c._an.fftSize);
      c._mon = x.createGain();
      c._aMezcla = x.createGain();
      c._in.connect(c._an);
      c._in.connect(c._mon); c._mon.connect(nodoMaster);
      c._in.connect(c._aMezcla); c._aMezcla.connect(nodoMezcla);
      aplicar(c);
    }
    function aplicar(c) {
      if (!c._in) return;
      const t = m.ctx.currentTime;
      c._mon.gain.setTargetAtTime(c.mute ? 0 : c.vol, t, 0.015);
      c._aMezcla.gain.setTargetAtTime(c.rec ? c.vol : 0, t, 0.015);
    }
    function aplicarMaster() {
      if (nodoMaster) nodoMaster.gain.setTargetAtTime(m.master.mute ? 0 : m.master.vol, m.ctx.currentTime, 0.015);
    }

    /** Cambia VOL / M / REC de un canal ('master': sólo vol y mute). */
    m.fijar = function (id, cambios) {
      const k = cambios || {};
      if (id === 'master') {
        if (k.vol !== undefined) m.master.vol = lim(+k.vol || 0, 0, VOL_MAX);
        if (k.mute !== undefined) m.master.mute = !!k.mute;
        aplicarMaster();
      } else {
        const c = m.canales.get(id);
        if (!c) return false;
        if (k.vol !== undefined) c.vol = lim(+k.vol || 0, 0, VOL_MAX);
        if (k.mute !== undefined) { c.mute = !!k.mute; c.muteTocado = true; }
        if (k.rec !== undefined) c.rec = !!k.rec;
        aplicar(c);
      }
      guardar();
      cambio();
      return true;
    };

    /** Nombre, detalle y si el canal tiene algo que suene ahora. `muteDeArranque`:
        true para fuentes que no conviene oír en la sala (cámaras: acoplan). */
    m.describir = function (id, datos) {
      const c = m.canales.get(id);
      if (!c) return;
      const d = datos || {};
      let cambia = false;
      for (const k of ['nombre', 'detalle', 'conSenal']) {
        if (d[k] !== undefined && c[k] !== d[k]) { c[k] = d[k]; cambia = true; }
      }
      if (d.muteDeArranque !== undefined && !c.muteTocado && c.mute !== !!d.muteDeArranque) {
        c.mute = !!d.muteDeArranque; aplicar(c); cambia = true;
      }
      if (cambia) cambio();
    };

    /* ══ Fuentes ════════════════════════════════════════════════════ */

    /** Conecta un <video>/<audio> al canal. Desde entonces suena por la mezcla. */
    m.conectarElemento = function (id, el) {
      if (!m.activa() || !el) return false;
      const c = m.canal(id);
      let e = elementos.get(el);
      if (!e) {
        try { e = { nodo: m.ctx.createMediaElementSource(el), canal: null }; }
        catch (err) { log('no se pudo conectar el audio de ' + id + ': ' + (err.message || err)); return false; }
        elementos.set(el, e);
      }
      if (e.canal !== c) {
        try { e.nodo.disconnect(); } catch (err) {}
        e.nodo.connect(c._in);
        e.canal = c;
      }
      return true;
    };

    /** El MediaStream en vivo del canal (cámara, entrada…). null lo quita. */
    m.conectarFlujo = function (id, stream) {
      const c = m.canal(id);
      const pista = stream && stream.getAudioTracks ? stream.getAudioTracks().find(t => t.readyState === 'live') : null;
      const clave = pista ? pista.id : '';
      if ((c._flujo || '') === clave) return !!pista;
      if (c._flujoNodo) { try { c._flujoNodo.disconnect(); } catch (e) {} c._flujoNodo = null; }
      c._flujo = '';
      if (!pista || !m.activa()) return false;
      try {
        c._flujoNodo = m.ctx.createMediaStreamSource(new MediaStream([pista]));
        c._flujoNodo.connect(c._in);
        c._flujo = clave;
      } catch (e) { log('no se pudo conectar el audio en vivo de ' + id + ': ' + (e.message || e)); return false; }
      return true;
    };

    /* ══ Entrada del equipo ═════════════════════════════════════════ */

    m.listarDispositivos = async function (pedirPermiso) {
      if (!navigator.mediaDevices) throw new Error('Este navegador no expone mediaDevices (¿contexto no seguro?).');
      if (pedirPermiso) {
        try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach(t => t.stop()); }
        catch (e) { log('permiso de micrófono denegado o sin entradas: ' + (e.message || e)); }
      }
      return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput').map((d, i) => ({
        deviceId: d.deviceId, label: d.label || ('Entrada ' + (i + 1)),
      }));
    };

    /** Abre la entrada `deviceId` ('' = ninguna) en el canal 'entrada'. */
    m.usarEntrada = async function (deviceId, label) {
      const c = m.canal('entrada', { nombre: 'ENTRADA', tipo: 'entrada', mute: true });
      if (flujoEntrada) { flujoEntrada.getTracks().forEach(t => t.stop()); flujoEntrada = null; }
      m.conectarFlujo('entrada', null);
      m.entrada = { deviceId: deviceId || '', label: label || '', activa: false, error: '' };
      c.conSenal = false; c.detalle = '';
      if (!deviceId) { guardar(); cambio(); return m.entrada; }
      m.entrada._abriendo = true;
      try {
        await m.start();
        /* Sin procesamiento de voz: la cancelación de eco y el AGC arruinan
           la música y meten retardo. */
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false,
        });
        flujoEntrada = stream;
        const pista = stream.getAudioTracks()[0];
        m.entrada.label = (pista && pista.label) || label || 'Entrada';
        m.entrada.activa = m.conectarFlujo('entrada', stream);
        c.conSenal = m.entrada.activa;
        c.detalle = m.entrada.label;
        if (pista) pista.onended = () => { if (flujoEntrada === stream) { m.entrada.activa = false; m.entrada.error = 'la entrada se desconectó'; c.conSenal = false; cambio(); } };
        log('entrada de audio: ' + m.entrada.label);
      } catch (e) {
        m.entrada.error = e.name === 'NotAllowedError' ? 'permiso de micrófono denegado' : (e.message || String(e));
        log('no se pudo abrir la entrada de audio: ' + m.entrada.error);
      }
      delete m.entrada._abriendo;
      guardar();
      cambio();
      return m.entrada;
    };

    /* ══ Medidores ══════════════════════════════════════════════════ */

    /** Pico 0..1 de cada canal ahora (para dibujar los medidores). */
    m.niveles = function () {
      const o = {};
      for (const c of m.canales.values()) {
        let p = 0;
        if (c._an && m.activa()) {
          c._an.getFloatTimeDomainData(c._buf);
          for (let i = 0; i < c._buf.length; i++) { const v = Math.abs(c._buf[i]); if (v > p) p = v; }
        }
        c.pico = p;
        o[c.id] = p;
      }
      return o;
    };

    /* ══ Para grabar ════════════════════════════════════════════════ */

    /** Pista de audio NUEVA con el sonido limpio del canal (quien la pide la
        detiene), o null si el canal no tiene nada que grabar. */
    m.pistaDeCanal = function (id) {
      const c = m.canales.get(id);
      if (!c || !c._in || !c.rec || !c.conSenal || !m.activa()) return null;
      if (!c._limpio) { c._limpio = m.ctx.createMediaStreamDestination(); c._in.connect(c._limpio); }
      const p = c._limpio.stream.getAudioTracks()[0];
      return p ? p.clone() : null;
    };
    /** Pista de audio NUEVA con la mezcla de todos los canales con REC. */
    m.pistaDeMezcla = function () {
      if (!m.activa() || !nodoMezcla) return null;
      if (![...m.canales.values()].some(c => c.rec && c.conSenal)) return null;
      const p = nodoMezcla.stream.getAudioTracks()[0];
      return p ? p.clone() : null;
    };

    m.getStatus = function () {
      return {
        estado: m.estado, contexto: m.ctx ? m.ctx.state : 'sin contexto', error: m.ultimoError,
        master: { ...m.master },
        entrada: { deviceId: m.entrada.deviceId, label: m.entrada.label, activa: m.entrada.activa, error: m.entrada.error },
        canales: [...m.canales.values()].map(c => ({ id: c.id, nombre: c.nombre, detalle: c.detalle, tipo: c.tipo, vol: c.vol, mute: c.mute, rec: c.rec, conSenal: c.conSenal })),
      };
    };
    m.VOL_MAX = VOL_MAX;
    return m;
  }

  global.MIDIVJMezcla = { crear };
})(typeof window !== 'undefined' ? window : globalThis);
