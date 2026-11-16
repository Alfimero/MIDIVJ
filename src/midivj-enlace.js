/* ══════════════════════════════════════════════════════════════════════
   MIDIVJ — Enlace entre equipos
   ══════════════════════════════════════════════════════════════════════

   Deja que varios MIDIVJ de la misma red se reconozcan y que uno reciba
   las señales de control del otro: PC 1 tiene los mandos (un teléfono
   como pedalera) y PC 2 recibe esas mismas notas y CC para mapearlas a
   lo suyo. Así una sola botonera sirve a varias sesiones (una de
   visuales, otra de grabación…).

   Lo hace el relay, no la página: sigue andando aunque la pestaña de
   MIDIVJ esté en segundo plano y se reconecta solo.

   RECONOCERSE — tres caminos, del más cómodo al más seguro:
     1. Aviso: cada relay manda por UDP (broadcast) quién es cada 3 s y
        escucha los de los demás. Inmediato, pero un firewall puede
        bloquearlo.
     2. Búsqueda: a pedido, recorre la red local preguntando por HTTP
        (`/api/enlace/info`) en el puerto del relay. Usa el mismo puerto
        TCP que ya tiene que estar abierto para los teléfonos, así que
        funciona donde funciona el mando.
     3. A mano: la IP (y puerto) del otro equipo.

   ENLAZAR — el relay de PC 2 entra a la sala de PC 1 como un cliente más
   (rol 'enlace') y de todo lo que se reparte ahí toma sólo los mensajes
   `midi`, que entrega a SU app con una marca `remoto`. Sólo escucha: no
   manda nada al otro equipo, y lo que recibe no se vuelve a repartir (no
   hay cadenas ni ecos). Para ir en los dos sentidos, cada equipo enlaza
   al otro. Un relay anterior a esta versión también sirve como origen
   (trata al enlace como un emisor más).

   Estado en data/enlace.json: la identidad de este equipo y los enlaces.
   ────────────────────────────────────────────────────────────────────── */
'use strict';

const dgram = require('dgram');
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const fsp = require('fs/promises');
const { WebSocket } = require('ws');

const PUERTO_AVISO = 9189;          // UDP
const AVISO_MS = 3000;
const VISTO_MS = 12000;             // sin aviso en este tiempo, el equipo deja de listarse (los hallados por búsqueda duran más)
const BUSQUEDA_VIGENTE_MS = 90000;
const SONDEO_MS = 700;
const SONDEOS_A_LA_VEZ = 128;
const MAX_ENLACES = 16;
const PUERTO_BASE = 9191;

const texto = (v, max) => String(v == null ? '' : v).replace(/[\x00-\x1f]/g, ' ').trim().slice(0, max);
const ipv4 = h => /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(h) && h.split('.').every(n => +n <= 255);
const hostValido = h => h === 'localhost' || ipv4(h) || /^[a-zA-Z0-9]([a-zA-Z0-9.-]{0,62})$/.test(h);

/**
 * op = { puerto(): n, dataDir, direcciones(): [{ip, tipo}], salas(): [{sala, app, mandos:[{slot,nombre}]}],
 *        entregar(salaLocal, msg): bool, log(texto), soloLocal: sólo este equipo, sin tocar la red (pruebas) }
 */
function crearEnlace(op) {
  const log = op.log || (() => undefined);
  /* Dos sesiones en el mismo equipo (relay en 9191 y en 9192) son dos
     «equipos» distintos para el enlace: cada puerto tiene su identidad y
     sus enlaces. */
  const archivo = () => path.join(op.dataDir, op.puerto() === PUERTO_BASE ? 'enlace.json' : 'enlace-' + op.puerto() + '.json');
  const yo = { id: crypto.randomBytes(6).toString('hex'), nombre: texto(os.hostname(), 30) || 'MIDIVJ' };
  const vistos = new Map();     // id → { id, nombre, host, puerto, salas, visto, via }
  const enlaces = [];           // ver nuevoEnlace()
  let socket = null, timerAviso = null, avisoActivo = false, buscando = null, ultimaBusqueda = 0;

  /* ══ Persistencia ═══════════════════════════════════════════════ */

  async function cargar() {
    try {
      const d = JSON.parse(await fsp.readFile(archivo(), 'utf8'));
      if (d && typeof d.id === 'string' && /^[0-9a-f]{12}$/.test(d.id)) yo.id = d.id;
      if (d && typeof d.nombre === 'string' && texto(d.nombre, 30)) yo.nombre = texto(d.nombre, 30);
      for (const e of Array.isArray(d && d.enlaces) ? d.enlaces.slice(0, MAX_ENLACES) : []) {
        const n = nuevoEnlace(e);
        if (n) enlaces.push(n);
      }
    } catch (_) { /* primera vez: se crea al guardar */ }
  }
  let guardando = Promise.resolve();
  function guardar() {
    const datos = JSON.stringify({
      id: yo.id, nombre: yo.nombre,
      enlaces: enlaces.map(e => ({ id: e.id, host: e.host, puerto: e.puerto, sala: e.sala, salaLocal: e.salaLocal, nombre: e.nombre, activo: e.activo, equipo: e.equipo })),
    }, null, 2);
    guardando = guardando.then(async () => {
      await fsp.mkdir(op.dataDir, { recursive: true });
      await fsp.writeFile(archivo(), datos);
    }).catch(error => log('no se pudo guardar enlace.json: ' + error.message));
    return guardando;
  }

  /* ══ Quién soy (lo que ven los demás) ═══════════════════════════ */

  function info() {
    return {
      app: 'MIDIVJ', enlace: 1, id: yo.id, nombre: yo.nombre, puerto: op.puerto(),
      salas: op.salas().slice(0, 12).map(s => ({
        sala: texto(s.sala, 40), app: !!s.app,
        mandos: (s.mandos || []).slice(0, 24).map(m => ({ slot: m.slot, nombre: texto(m.nombre, 30) })),
      })),
    };
  }

  function anotar(datos, host, via) {
    if (!datos || datos.app !== 'MIDIVJ' || typeof datos.id !== 'string' || datos.id === yo.id) return null;
    const puerto = parseInt(datos.puerto, 10);
    if (!(puerto > 0 && puerto < 65536)) return null;
    const previo = vistos.get(datos.id);
    const v = {
      id: datos.id.slice(0, 24), nombre: texto(datos.nombre, 30) || host, host, puerto,
      salas: (Array.isArray(datos.salas) ? datos.salas : []).slice(0, 12).map(s => ({
        sala: texto(s && s.sala, 40) || 'midivj', app: !!(s && s.app),
        mandos: (Array.isArray(s && s.mandos) ? s.mandos : []).slice(0, 24).map(m => ({ slot: parseInt(m && m.slot, 10) || 0, nombre: texto(m && m.nombre, 30) })),
      })),
      visto: Date.now(),
      /* 'aviso' gana: es el que se renueva solo */
      via: via === 'aviso' || (previo && previo.via === 'aviso' && Date.now() - previo.visto < VISTO_MS) ? 'aviso' : via,
    };
    vistos.set(v.id, v);
    return v;
  }
  function limpiarVistos() {
    const ahora = Date.now();
    for (const [id, v] of vistos) {
      if (ahora - v.visto > (v.via === 'aviso' ? VISTO_MS : BUSQUEDA_VIGENTE_MS)) vistos.delete(id);
    }
  }

  /* ══ 1. Aviso por UDP ═══════════════════════════════════════════ */

  /* La dirección de broadcast de cada red local de este equipo */
  function difusiones() {
    const lista = new Set(['255.255.255.255']);
    for (const iface of Object.values(os.networkInterfaces())) {
      for (const d of iface || []) {
        if (d.family !== 'IPv4' || d.internal || !ipv4(d.address) || !ipv4(d.netmask || '')) continue;
        const ip = d.address.split('.').map(Number), m = d.netmask.split('.').map(Number);
        lista.add(ip.map((b, i) => (b | (~m[i] & 255))).join('.'));
      }
    }
    return [...lista];
  }
  function avisar() {
    if (!socket || !avisoActivo) return;
    const datos = Buffer.from(JSON.stringify(info()));
    if (datos.length > 1400) return;   // nunca debería: 12 salas con nombres cortos
    for (const destino of op.soloLocal ? [] : difusiones()) socket.send(datos, PUERTO_AVISO, destino, () => undefined);
    /* En este mismo equipo puede haber otro relay (otra sesión): el broadcast no siempre vuelve */
    socket.send(datos, PUERTO_AVISO, '127.0.0.1', () => undefined);
  }
  function iniciarAviso() {
    try {
      socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    } catch (error) { log('sin avisos por UDP: ' + error.message); return; }
    socket.on('error', error => {
      /* Puerto tomado o bloqueado: quedan la búsqueda y la IP a mano */
      if (avisoActivo || error.code !== 'EADDRINUSE') log('avisos por UDP apagados: ' + error.message);
      avisoActivo = false;
      try { socket.close(); } catch (_) {}
      socket = null;
    });
    socket.on('message', (datos, origen) => {
      if (datos.length > 4096) return;
      let msg;
      try { msg = JSON.parse(datos.toString('utf8')); } catch (_) { return; }
      anotar(msg, origen.address === '127.0.0.1' ? 'localhost' : origen.address, 'aviso');
    });
    socket.bind(PUERTO_AVISO, () => {
      try { socket.setBroadcast(true); } catch (_) {}
      avisoActivo = true;
      avisar();
      timerAviso = setInterval(avisar, AVISO_MS);
      timerAviso.unref();
    });
    socket.unref();
  }

  /* ══ 2. Búsqueda por HTTP ═══════════════════════════════════════ */

  function preguntar(host, puerto, espera = SONDEO_MS) {
    return new Promise(resolve => {
      let listo = false;
      const fin = v => { if (!listo) { listo = true; resolve(v); } };
      const req = http.get({ host, port: puerto, path: '/api/enlace/info', timeout: espera, agent: false, headers: { Accept: 'application/json' } }, res => {
        if (res.statusCode !== 200) { res.resume(); fin(null); return; }
        let cuerpo = '';
        res.setEncoding('utf8');
        res.on('data', t => { cuerpo += t; if (cuerpo.length > 16384) { req.destroy(); fin(null); } });
        res.on('end', () => { try { fin(JSON.parse(cuerpo)); } catch (_) { fin(null); } });
      });
      req.on('timeout', () => { req.destroy(); fin(null); });
      req.on('error', () => fin(null));
    });
  }

  /* Los equipos a sondear: todos los de la red /24 de cada dirección local
     (no las de VPN) y, en este mismo equipo, los puertos vecinos (otra
     sesión de MIDIVJ abierta aquí usa el puerto siguiente). */
  function candidatos() {
    const lista = [];
    const propio = op.puerto();
    for (let p = PUERTO_BASE; p <= PUERTO_BASE + 9; p++) if (p !== propio) lista.push(['localhost', p]);
    const puertos = [...new Set([PUERTO_BASE, propio])];
    const redes = new Set();
    /* soloLocal (pruebas): sin recorrer la red */
    for (const d of op.soloLocal ? [] : op.direcciones()) {
      if (d.tipo === 'vpn' || !ipv4(d.ip)) continue;
      const base = d.ip.split('.').slice(0, 3).join('.');
      if (redes.has(base)) continue;
      redes.add(base);
      for (let n = 1; n < 255; n++) {
        const ip = base + '.' + n;
        for (const p of puertos) if (!(ip === d.ip && p === propio)) lista.push([ip, p]);
      }
    }
    return lista;
  }
  function buscar() {
    if (buscando) return buscando;
    const cola = candidatos();
    let hallados = 0;
    const obrero = async () => {
      for (;;) {
        const c = cola.pop();
        if (!c) return;
        const datos = await preguntar(c[0], c[1]);
        if (datos && anotar(datos, c[0], 'busqueda')) hallados++;
      }
    };
    buscando = Promise.all(Array.from({ length: SONDEOS_A_LA_VEZ }, obrero)).then(() => {
      buscando = null;
      ultimaBusqueda = Date.now();
      return hallados;
    });
    return buscando;
  }

  /* ══ Enlaces: recibir las señales de otro equipo ════════════════ */

  function nuevoEnlace(d) {
    const host = texto(d && d.host, 64).toLowerCase();
    const puerto = parseInt(d && d.puerto, 10) || PUERTO_BASE;
    if (!hostValido(host) || !(puerto > 0 && puerto < 65536)) return null;
    return {
      id: typeof (d && d.id) === 'string' && /^[0-9a-f]{8}$/.test(d.id) ? d.id : crypto.randomBytes(4).toString('hex'),
      host, puerto,
      sala: texto(d && d.sala, 40) || 'midivj',            // la sala del OTRO equipo
      salaLocal: texto(d && d.salaLocal, 40) || 'midivj',  // la sala de este equipo que recibe
      nombre: texto(d && d.nombre, 30) || host,
      equipo: typeof (d && d.equipo) === 'string' ? d.equipo.slice(0, 24) : '',   // id del otro relay, si se supo
      activo: !(d && d.activo === false),
      /* en vivo */
      ws: null, estado: 'detenido', error: '', recibidos: 0, ultimo: 0, mandos: [], intento: 0, timer: null,
    };
  }

  function soltar(e) {
    clearTimeout(e.timer); e.timer = null;
    if (e.ws) {
      const ws = e.ws;
      e.ws = null;
      ws.removeAllListeners();
      ws.on('error', () => undefined);
      try { ws.terminate(); } catch (_) {}
    }
  }

  function conectar(e) {
    soltar(e);
    if (!e.activo) { e.estado = 'detenido'; return; }
    e.estado = 'conectando';
    let ws;
    try { ws = new WebSocket('ws://' + (e.host.includes(':') ? '[' + e.host + ']' : e.host) + ':' + e.puerto, { handshakeTimeout: 4000 }); }
    catch (error) { e.error = error.message; reintentar(e); return; }
    e.ws = ws;
    let vivo = true, latido = null;
    ws.on('open', () => {
      if (e.ws !== ws) return;
      e.estado = 'conectado'; e.error = ''; e.intento = 0;
      ws.send(JSON.stringify({ type: 'join', room: e.sala, rol: 'enlace', nombre: yo.nombre, disp: 'enlace-' + yo.id }));
      log('recibiendo de ' + e.nombre + ' (' + e.host + ':' + e.puerto + ', sala "' + e.sala + '") → sala "' + e.salaLocal + '"');
      /* Un equipo que se apaga de golpe no cierra el socket: se nota por el latido */
      latido = setInterval(() => {
        if (!vivo) { try { ws.terminate(); } catch (_) {} return; }
        vivo = false;
        try { ws.ping(); } catch (_) {}
      }, 5000);
      latido.unref();
    });
    ws.on('pong', () => { vivo = true; });
    ws.on('message', bruto => {
      if (e.ws !== ws || bruto.length > 65536) return;
      vivo = true;
      let msg;
      try { msg = JSON.parse(bruto.toString()); } catch (_) { return; }
      if (msg.type === 'midi' && Array.isArray(msg.data) && msg.data.length >= 2 && msg.data.length <= 3 &&
          msg.data.every(b => Number.isInteger(b) && b >= 0 && b <= 255)) {
        e.recibidos++;
        e.ultimo = Date.now();
        const o = msg.origen && typeof msg.origen === 'object' ? msg.origen : null;
        op.entregar(e.salaLocal, {
          type: 'midi', data: msg.data,
          origen: o ? { mando: parseInt(o.mando, 10) || 0, boton: texto(o.boton, 40), etiqueta: texto(o.etiqueta, 40) } : undefined,
          remoto: { enlace: e.id, nombre: e.nombre },
        });
      } else if (msg.type === 'presencia') {
        e.mandos = (Array.isArray(msg.mandos) ? msg.mandos : []).slice(0, 24).map(m => ({ slot: parseInt(m && m.slot, 10) || 0, nombre: texto(m && m.nombre, 30) }));
      }
    });
    const caida = motivo => {
      clearInterval(latido);
      if (e.ws !== ws) return;
      e.ws = null;
      if (e.estado === 'conectado') log('se cortó el enlace con ' + e.nombre + (motivo ? ' (' + motivo + ')' : ''));
      e.mandos = [];
      reintentar(e, motivo);
    };
    ws.on('close', () => caida(''));
    ws.on('error', error => { e.error = error.code === 'ECONNREFUSED' ? 'no hay un relay en esa dirección' : error.code === 'ETIMEDOUT' || /timeout/i.test(error.message) ? 'no responde (¿apagado, otra red o firewall?)' : error.message; caida(e.error); });
  }
  function reintentar(e, motivo) {
    if (!e.activo) { e.estado = 'detenido'; return; }
    e.estado = 'sin conexión';
    if (motivo) e.error = motivo;
    e.intento++;
    clearTimeout(e.timer);
    e.timer = setTimeout(() => conectar(e), Math.min(10000, 800 * Math.pow(1.6, Math.min(e.intento, 6))));
    e.timer.unref();
  }

  /* ══ Estado para la app ═════════════════════════════════════════ */

  function estado() {
    limpiarVistos();
    return {
      yo: { id: yo.id, nombre: yo.nombre, puerto: op.puerto(), direcciones: op.direcciones().filter(d => d.tipo !== 'vpn').map(d => d.ip) },
      avisos: avisoActivo, buscando: !!buscando, ultimaBusqueda,
      vistos: [...vistos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)).map(v => ({
        id: v.id, nombre: v.nombre, host: v.host, puerto: v.puerto, salas: v.salas, via: v.via, haceMs: Date.now() - v.visto,
      })),
      enlaces: enlaces.map(e => ({
        id: e.id, host: e.host, puerto: e.puerto, sala: e.sala, salaLocal: e.salaLocal, nombre: e.nombre, equipo: e.equipo,
        activo: e.activo, estado: e.estado, error: e.estado === 'conectado' ? '' : e.error,
        recibidos: e.recibidos, haceMs: e.ultimo ? Date.now() - e.ultimo : null, mandos: e.mandos,
      })),
    };
  }

  /* ══ HTTP ═══════════════════════════════════════════════════════ */

  /** Atiende /api/enlace…; `h` = { sendJson, readJson, isLoopback } del relay. */
  async function atender(req, res, ruta, h) {
    /* Lo único que ve la red: quién es este equipo */
    if (req.method === 'GET' && ruta === '/api/enlace/info') { h.sendJson(res, 200, info()); return; }
    /* Todo lo demás, sólo desde este equipo (como las sesiones y la grabación) */
    if (!h.isLoopback(req.socket.remoteAddress)) { h.sendJson(res, 403, { error: 'Los enlaces sólo se configuran desde el equipo donde corre el relay.' }); return; }
    if (req.method === 'GET' && ruta === '/api/enlace') { h.sendJson(res, 200, estado()); return; }
    if (req.method !== 'POST') { h.sendJson(res, 404, { error: 'Ruta no encontrada.' }); return; }
    const pedido = (await h.readJson(req, 4096).catch(() => null)) || {};

    if (ruta === '/api/enlace/buscar') {
      await buscar();
      h.sendJson(res, 200, estado());
      return;
    }
    if (ruta === '/api/enlace/nombre') {
      const nombre = texto(pedido.nombre, 30);
      if (!nombre) { h.sendJson(res, 400, { error: 'Escribe un nombre para este equipo.' }); return; }
      yo.nombre = nombre;
      await guardar();
      avisar();
      h.sendJson(res, 200, estado());
      return;
    }
    if (ruta === '/api/enlace/conectar') {
      const nuevo = nuevoEnlace(pedido);
      if (!nuevo) { h.sendJson(res, 400, { error: 'Dirección no válida: escribe la IP del otro equipo (por ejemplo 192.168.1.50).' }); return; }
      /* ¿Quién hay ahí? Un relay de antes no responde esto y aun así sirve de origen */
      const datos = await preguntar(nuevo.host, nuevo.puerto, 2500);
      if (datos && datos.id === yo.id) { h.sendJson(res, 400, { error: 'Esa dirección es este mismo equipo.' }); return; }
      if (datos && datos.app === 'MIDIVJ') {
        nuevo.equipo = String(datos.id || '').slice(0, 24);
        if (!texto(pedido.nombre, 30)) nuevo.nombre = texto(datos.nombre, 30) || nuevo.host;
        anotar(datos, nuevo.host, 'busqueda');
      }
      const igual = enlaces.find(e => e.host === nuevo.host && e.puerto === nuevo.puerto && e.sala === nuevo.sala && e.salaLocal === nuevo.salaLocal);
      if (igual) {
        igual.activo = true; igual.nombre = nuevo.nombre; igual.equipo = nuevo.equipo || igual.equipo;
        conectar(igual);
      } else {
        if (enlaces.length >= MAX_ENLACES) { h.sendJson(res, 400, { error: 'Demasiados enlaces (máximo ' + MAX_ENLACES + '): quita alguno.' }); return; }
        enlaces.push(nuevo);
        conectar(nuevo);
      }
      await guardar();
      h.sendJson(res, 200, { ...estado(), aviso: datos ? '' : 'No se pudo confirmar que ahí haya un MIDIVJ: se seguirá intentando.' });
      return;
    }
    const e = enlaces.find(x => x.id === pedido.id);
    if (ruta === '/api/enlace/activar' && e) {
      e.activo = pedido.activo !== false;
      e.intento = 0;
      conectar(e);
      await guardar();
      h.sendJson(res, 200, estado());
      return;
    }
    if (ruta === '/api/enlace/quitar' && e) {
      e.activo = false;
      soltar(e);
      enlaces.splice(enlaces.indexOf(e), 1);
      await guardar();
      h.sendJson(res, 200, estado());
      return;
    }
    h.sendJson(res, 404, { error: e ? 'Ruta no encontrada.' : 'Ese enlace ya no existe.' });
  }

  async function iniciar(opciones) {
    await cargar();
    if (!(opciones && opciones.sinAvisos)) iniciarAviso();
    for (const e of enlaces) conectar(e);
    return api;
  }
  function detener() {
    clearInterval(timerAviso);
    avisoActivo = false;
    if (socket) { try { socket.close(); } catch (_) {} socket = null; }
    for (const e of enlaces) soltar(e);
  }

  const api = { iniciar, detener, atender, info, estado, buscar, yo };
  return api;
}

module.exports = { crearEnlace, PUERTO_AVISO };
