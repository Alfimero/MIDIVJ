/**
 * MIDIVJ local server and Network MIDI relay.
 *
 * - Serves the main UI at http://localhost:9191/
 * - Serves the MIDI sender at http://localhost:9191/sender
 * - Serves the mobile controller at http://localhost:9191/mando
 * - Serves the QR / connection page at http://localhost:9191/control
 * - Saves .vjp files exclusively in ../Sessions
 * - Relays MIDI messages over WebSocket rooms
 *
 * El relay es deliberadamente de red local. No lo expongas a Internet:
 * cualquiera que alcance el puerto puede disparar clips y efectos.
 */

const http = require('http');
const os = require('os');
const path = require('path');
const fsp = require('fs/promises');
const { execFile } = require('child_process');
const { WebSocketServer } = require('ws');
const QRLite = require('./midivj-qr.js');

/* Puerto: si el pedido está ocupado se prueban los siguientes. `PORT` deja de
   ser constante a propósito — todo lo que publica direcciones lee el real. */
let PORT = parseInt(process.argv[2], 10) || 9191;
const PUERTOS_ALTERNOS = 9;
const ABRIR_NAVEGADOR = !process.argv.includes('--sin-navegador');
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SESSIONS_DIR = path.join(PROJECT_ROOT, 'Sessions');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const LAYOUT_FILE = path.join(DATA_DIR, 'mando-layout.json');
const MAX_SESSION_BYTES = 5 * 1024 * 1024;
const MAX_LAYOUT_BYTES = 8 * 1024 * 1024;   // los botones pueden llevar imágenes/GIF
const MAX_MANDOS = 4;                        // dispositivos de control simultáneos
const SLOT_DENY_DELAY_MS = 150;

/** Sala: clientes + quién es la app, quién ocupa cada slot y el último inventario. */
const rooms = new Map();

/* ═══════════════════════════════════════════════════════
   Utilidades HTTP
═══════════════════════════════════════════════════════ */

function isLoopback(address = '') {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store'
  });
  res.end(data);
}

function readJson(req, limit = MAX_SESSION_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error(`El cuerpo supera el límite de ${Math.round(limit / (1024 * 1024))} MB.`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('El contenido no es JSON válido.'));
      }
    });
    req.on('error', reject);
  });
}

/* ═══════════════════════════════════════════════════════
   Sesiones .vjp
═══════════════════════════════════════════════════════ */

function safeSessionName(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const withoutExtension = raw.replace(/\.vjp$/i, '');
  const cleaned = withoutExtension
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 120);
  return `${cleaned || 'untitled'}.vjp`;
}

async function availableSessionPath(filename) {
  const parsed = path.parse(filename);
  for (let suffix = 1; suffix < 10000; suffix++) {
    const candidateName = suffix === 1 ? filename : `${parsed.name} (${suffix})${parsed.ext}`;
    const candidate = path.resolve(SESSIONS_DIR, candidateName);
    if (!candidate.startsWith(`${path.resolve(SESSIONS_DIR)}${path.sep}`)) {
      throw new Error('Nombre de sesión fuera de la carpeta permitida.');
    }
    try {
      await fsp.access(candidate);
    } catch {
      return candidate;
    }
  }
  throw new Error('No se pudo elegir un nombre disponible para la sesión.');
}

async function saveSession(req, res) {
  if (!isLoopback(req.socket.remoteAddress)) {
    sendJson(res, 403, { error: 'El guardado de sesiones sólo está disponible desde este equipo.' });
    return;
  }

  const payload = await readJson(req);
  if (!payload || typeof payload.session !== 'object' || Array.isArray(payload.session)) {
    sendJson(res, 400, { error: 'Falta el objeto de sesión.' });
    return;
  }

  await fsp.mkdir(SESSIONS_DIR, { recursive: true });
  const target = await availableSessionPath(safeSessionName(payload.name || payload.session.name));
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  const content = `${JSON.stringify(payload.session, null, 2)}\n`;

  try {
    await fsp.writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    await fsp.rename(temporary, target);
  } catch (error) {
    await fsp.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }

  const relativePath = path.relative(PROJECT_ROOT, target).replace(/\\/g, '/');
  console.log(`  [sesión] ${relativePath}`);
  sendJson(res, 201, { name: path.basename(target), path: relativePath });
}

async function listSessions(req, res) {
  if (!isLoopback(req.socket.remoteAddress)) {
    sendJson(res, 403, { error: 'La lista de sesiones sólo está disponible desde este equipo.' });
    return;
  }
  await fsp.mkdir(SESSIONS_DIR, { recursive: true });
  const entries = await fsp.readdir(SESSIONS_DIR, { withFileTypes: true });
  const sessions = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.vjp$/i.test(entry.name)) continue;
    const stat = await fsp.stat(path.join(SESSIONS_DIR, entry.name));
    sessions.push({ name: entry.name, size: stat.size, modified: stat.mtimeMs });
  }
  sessions.sort((a, b) => b.modified - a.modified);
  sendJson(res, 200, { directory: 'Sessions', sessions });
}

function sessionFilePath(name) {
  const target = path.resolve(SESSIONS_DIR, safeSessionName(name));
  if (!target.startsWith(`${path.resolve(SESSIONS_DIR)}${path.sep}`)) {
    throw new Error('Nombre de sesión fuera de la carpeta permitida.');
  }
  return target;
}

async function readSession(req, res, name) {
  if (!isLoopback(req.socket.remoteAddress)) {
    sendJson(res, 403, { error: 'Sólo disponible desde este equipo.' });
    return;
  }
  let target;
  try { target = sessionFilePath(name); }
  catch (error) { sendJson(res, 400, { error: error.message }); return; }
  try {
    const body = await fsp.readFile(target, 'utf8');
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: 'No se encontró la sesión.' });
  }
}

/* ═══════════════════════════════════════════════════════
   Layout del mando — persistencia en data/mando-layout.json

   Es la única fuente de verdad de la cuadrícula: la editan la app,
   la página /control o el propio teléfono, y el relay la reparte a
   todos los dispositivos conectados a la misma sala.
═══════════════════════════════════════════════════════ */

let layout = null;          // objeto en memoria (null hasta cargar)
let layoutGuardando = null; // promesa en curso, para no pisar escrituras

function layoutPorDefecto() {
  /* Cada botón nace con su propia nota, correlativa y sin repetir: así se
     puede mapear con MAP desde el primer momento sin configurar nada. */
  let nota = 0;
  const boton = (fila, col) => ({
    id: `b${fila}${col}-${nota}`,
    fila, col, ancho: 1, alto: 1,
    etiqueta: '', color: '#1b1f27', colorTexto: '#e8e8ea',
    forma: 'redondo', borde: '#2a3038', brillo: false,
    imagen: null, ajusteImagen: 'cover', animacion: 'ninguna',
    accion: {
      tipo: 'midi',
      midi: { clase: 'nota', num: Math.min(127, nota++), canal: 1, modo: 'pulso', valor: 127 },
      paginaDestino: null
    },
    submenu: null,
    tocado: false
  });
  const rejilla = (filas, cols) => {
    const out = [];
    for (let f = 0; f < filas; f++) for (let c = 0; c < cols; c++) out.push(boton(f, c));
    return out;
  };
  return {
    version: 1,
    actualizado: Date.now(),
    rejilla: { filas: 4, columnas: 4, separacion: 8, radio: 14, fuente: 13, tema: 'oscuro' },
    paginas: [
      { id: 'p-principal', nombre: 'CLIPS', tipo: 'principal', color: '#00ff88', botones: rejilla(4, 4) },
      { id: 'p-efectos', nombre: 'EFECTOS', tipo: 'efectos', color: '#ff3366', botones: rejilla(4, 4) }
    ],
    red: { ssid: '', pass: '', auth: 'WPA' }
  };
}

function saneaLayout(entrada) {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return null;
  if (!Array.isArray(entrada.paginas) || !entrada.paginas.length) return null;
  const base = layoutPorDefecto();
  const rej = entrada.rejilla && typeof entrada.rejilla === 'object' ? entrada.rejilla : {};
  const limpio = {
    version: 1,
    actualizado: Date.now(),
    rejilla: {
      filas: Math.min(10, Math.max(1, parseInt(rej.filas, 10) || base.rejilla.filas)),
      columnas: Math.min(10, Math.max(1, parseInt(rej.columnas, 10) || base.rejilla.columnas)),
      separacion: Math.min(40, Math.max(0, parseInt(rej.separacion, 10) || 0)),
      radio: Math.min(40, Math.max(0, parseInt(rej.radio, 10) || 0)),
      fuente: Math.min(40, Math.max(8, parseInt(rej.fuente, 10) || base.rejilla.fuente)),
      tema: typeof rej.tema === 'string' ? rej.tema.slice(0, 20) : base.rejilla.tema
    },
    paginas: entrada.paginas.slice(0, 24).map((p, i) => ({
      id: typeof p.id === 'string' && p.id ? p.id.slice(0, 40) : `p${i}`,
      nombre: typeof p.nombre === 'string' ? p.nombre.slice(0, 24) : `GRUPO ${i + 1}`,
      tipo: p.tipo === 'efectos' ? 'efectos' : 'principal',
      color: typeof p.color === 'string' ? p.color.slice(0, 24) : '#00ff88',
      botones: Array.isArray(p.botones) ? p.botones.slice(0, 100).map(saneaBoton).filter(Boolean) : []
    })),
    red: {
      ssid: typeof entrada.red?.ssid === 'string' ? entrada.red.ssid.slice(0, 64) : '',
      pass: typeof entrada.red?.pass === 'string' ? entrada.red.pass.slice(0, 64) : '',
      auth: ['WPA', 'WEP', 'NOPASS'].includes(entrada.red?.auth) ? entrada.red.auth : 'WPA'
    }
  };
  return limpio;
}

function saneaBoton(b) {
  if (!b || typeof b !== 'object') return null;
  const num = (v, min, max, def) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  const texto = (v, largo, def = '') => (typeof v === 'string' ? v.slice(0, largo) : def);
  const imagen = typeof b.imagen === 'string' && b.imagen.startsWith('data:image/') && b.imagen.length < 1500000
    ? b.imagen : null;

  let accion = { tipo: 'nada', midi: null, paginaDestino: null };
  if (b.accion && typeof b.accion === 'object') {
    const t = b.accion.tipo;
    accion.tipo = ['midi', 'ir', 'volver', 'nada'].includes(t) ? t : 'nada';
    accion.paginaDestino = texto(b.accion.paginaDestino, 40, null) || null;
    const m = b.accion.midi;
    if (m && typeof m === 'object') {
      accion.midi = {
        clase: m.clase === 'cc' ? 'cc' : 'nota',
        num: num(m.num, 0, 127, 60),
        canal: num(m.canal, 1, 16, 1),
        modo: ['hold', 'pulso', 'toggle'].includes(m.modo) ? m.modo : 'hold',
        valor: num(m.valor, 1, 127, 127)
      };
    }
  }

  let submenu = null;
  if (b.submenu && typeof b.submenu === 'object' && b.submenu.paginaId) {
    submenu = {
      paginaId: texto(b.submenu.paginaId, 40),
      retorno: ['clip-fin', 'manual', 'tiempo'].includes(b.submenu.retorno) ? b.submenu.retorno : 'clip-fin',
      segundos: num(b.submenu.segundos, 1, 3600, 30)
    };
  }

  return {
    id: texto(b.id, 40) || `b${Math.random().toString(36).slice(2, 8)}`,
    fila: num(b.fila, 0, 9, 0),
    col: num(b.col, 0, 9, 0),
    ancho: num(b.ancho, 1, 10, 1),
    alto: num(b.alto, 1, 10, 1),
    etiqueta: texto(b.etiqueta, 40),
    color: texto(b.color, 24, '#1b1f27'),
    colorTexto: texto(b.colorTexto, 24, '#e8e8ea'),
    forma: ['rect', 'redondo', 'pastilla', 'circulo'].includes(b.forma) ? b.forma : 'redondo',
    borde: texto(b.borde, 24, '#2a3038'),
    brillo: !!b.brillo,
    imagen,
    ajusteImagen: b.ajusteImagen === 'contain' ? 'contain' : 'cover',
    animacion: ['ninguna', 'pulso', 'latido', 'giro', 'parpadeo', 'onda'].includes(b.animacion) ? b.animacion : 'ninguna',
    accion,
    submenu,
    /* true = lo configuró una persona; el mando no le reasigna el mensaje */
    tocado: !!b.tocado
  };
}

async function cargarLayout() {
  try {
    const crudo = await fsp.readFile(LAYOUT_FILE, 'utf8');
    const limpio = saneaLayout(JSON.parse(crudo));
    layout = limpio || layoutPorDefecto();
  } catch {
    layout = layoutPorDefecto();
  }
  return layout;
}

async function guardarLayout() {
  if (layoutGuardando) return layoutGuardando;
  layoutGuardando = (async () => {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    const temporal = `${LAYOUT_FILE}.tmp-${process.pid}`;
    await fsp.writeFile(temporal, `${JSON.stringify(layout, null, 2)}\n`, 'utf8');
    await fsp.rename(temporal, LAYOUT_FILE);
  })().finally(() => { layoutGuardando = null; });
  return layoutGuardando;
}

/* ═══════════════════════════════════════════════════════
   Red — direcciones IPv4 y Wi-Fi (incluye la red creada por la PC)

   Windows comparte Internet por "Punto de acceso móvil" o por
   `netsh wlan start hostednetwork`; en ambos casos el adaptador
   virtual toma 192.168.137.1. Esa dirección va primero en la lista
   porque es la que alcanzan los teléfonos unidos a esa red.
═══════════════════════════════════════════════════════ */

function ejecutar(comando, args) {
  return new Promise(resolve => {
    execFile(comando, args, { windowsHide: true, timeout: 4000, encoding: 'utf8' }, (error, stdout) => {
      resolve(error || !stdout ? '' : stdout.toString());
    });
  });
}

function esHotspot(ip, nombreIface = '') {
  if (ip.startsWith('192.168.137.')) return true;          // ICS / punto de acceso móvil
  return /wi-?fi direct|hosted|punto de acceso|hotspot/i.test(nombreIface);
}

function direcciones() {
  const salida = [];
  for (const [nombre, iface] of Object.entries(os.networkInterfaces())) {
    for (const dir of iface || []) {
      if (dir.family !== 'IPv4' || dir.internal) continue;
      salida.push({
        ip: dir.address,
        interfaz: nombre,
        tipo: esHotspot(dir.address, nombre) ? 'hotspot' : 'lan'
      });
    }
  }
  salida.sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'hotspot' ? -1 : 1));
  return salida;
}

/** Cache corta: las consultas tardan ~250 ms y /control refresca seguido. */
let wifiCache = { ts: 0, info: null };

/**
 * Punto de acceso móvil de Windows 10/11.
 *
 * `netsh wlan show hostednetwork` NO lo ve: el hotspot moderno vive en otra
 * API. Se consulta por WinRT desde PowerShell, que devuelve el SSID, la
 * contraseña y si está encendido — también cuando está apagado, así que la
 * página de control puede mostrar el QR y pedir que lo enciendan.
 *
 * Es una lectura: no cambia ninguna configuración de red.
 */
const PS_HOTSPOT = `
$ErrorActionPreference = 'Stop'
try {
  $null = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType=WindowsRuntime]
  $perfiles = @()
  $internet = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
  if ($null -ne $internet) { $perfiles += $internet }
  $perfiles += [Windows.Networking.Connectivity.NetworkInformation]::GetConnectionProfiles()
  foreach ($p in $perfiles) {
    if ($null -eq $p) { continue }
    try {
      $mgr = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($p)
      $cfg = $mgr.GetCurrentAccessPointConfiguration()
      if ($cfg.Ssid) {
        "ESTADO=$($mgr.TetheringOperationalState)|SSID=$($cfg.Ssid)|PASS=$($cfg.Passphrase)"
        exit 0
      }
    } catch { }
  }
  'SIN HOTSPOT'
} catch { 'SIN HOTSPOT' }
`;

async function detectarHotspotWindows() {
  if (process.platform !== 'win32') return null;
  /* -EncodedCommand evita cualquier problema de comillas entre Node y PowerShell */
  const codificado = Buffer.from(PS_HOTSPOT, 'utf16le').toString('base64');
  const salida = await ejecutar('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', codificado]);
  const m = salida.match(/ESTADO=([^|\r\n]*)\|SSID=([^|\r\n]*)\|PASS=([^\r\n]*)/);
  if (!m) return null;
  return {
    encendido: /^on$/i.test(m[1].trim()),
    ssid: m[2].trim(),
    pass: m[3].trim()
  };
}

function campoNetsh(texto, etiquetas) {
  for (const etiqueta of etiquetas) {
    const re = new RegExp(`^\\s*${etiqueta}\\s*:\\s*(.+?)\\s*$`, 'mi');
    const m = texto.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return '';
}

/**
 * Detecta sola la red que sirve para el QR, en orden de utilidad:
 *   1. Punto de acceso móvil encendido → es LA red del show.
 *   2. `hostednetwork` iniciada → la variante vieja de red creada por la PC.
 *   3. Wi-Fi a la que está conectada la PC → el router del lugar.
 *   4. Punto de acceso configurado pero apagado → se ofrece para encenderlo.
 */
async function detectarWifi() {
  if (process.platform !== 'win32') return { fuente: 'no-disponible', ssid: '', pass: '', auth: 'WPA' };
  if (Date.now() - wifiCache.ts < 8000 && wifiCache.info) return wifiCache.info;

  const guarda = info => { wifiCache = { ts: Date.now(), info }; return info; };
  const conClave = (fuente, ssid, pass, extra) => ({
    fuente, ssid, pass: pass || '', auth: pass ? 'WPA' : 'NOPASS',
    hostedActiva: false, hotspotApagado: false, ...extra
  });

  /* 1) Punto de acceso móvil de Windows 10/11 */
  const hotspot = await detectarHotspotWindows();
  if (hotspot && hotspot.ssid && hotspot.encendido) {
    return guarda(conClave('hotspot', hotspot.ssid, hotspot.pass, { hostedActiva: true }));
  }

  /* 2) Red creada por esta PC con la API vieja (hostednetwork) */
  const hosted = await ejecutar('netsh', ['wlan', 'show', 'hostednetwork']);
  if (hosted) {
    const estado = campoNetsh(hosted, ['Status', 'Estado']);
    const ssid = campoNetsh(hosted, ['SSID name', 'Nombre de SSID', 'SSID']).replace(/^"|"$/g, '');
    if (ssid && /started|iniciad/i.test(estado)) {
      const seguridad = await ejecutar('netsh', ['wlan', 'show', 'hostednetwork', 'setting=security']);
      const clave = campoNetsh(seguridad, ['User security key', 'Clave de seguridad del usuario']);
      return guarda(conClave('hostednetwork', ssid, clave, { hostedActiva: true }));
    }
  }

  /* 3) Red Wi-Fi a la que está conectada la PC (venue, router de casa) */
  const interfaces = await ejecutar('netsh', ['wlan', 'show', 'interfaces']);
  const ssid = interfaces ? campoNetsh(interfaces.replace(/^\s*BSSID.*$/gim, ''), ['SSID']) : '';
  if (ssid) {
    const perfil = await ejecutar('netsh', ['wlan', 'show', 'profile', `name=${ssid}`, 'key=clear']);
    const clave = perfil ? campoNetsh(perfil, ['Key Content', 'Contenido de la clave']) : '';
    return guarda(conClave('wifi', ssid, clave));
  }

  /* 4) Hay punto de acceso configurado pero apagado: lo mostramos igual
        para que el QR ya esté listo y sólo falte encenderlo. */
  if (hotspot && hotspot.ssid) {
    return guarda(conClave('hotspot-apagado', hotspot.ssid, hotspot.pass, { hotspotApagado: true }));
  }

  return guarda(conClave('ninguna', '', ''));
}

function payloadWifi(ssid, pass, auth) {
  if (!ssid) return '';
  const escapa = v => String(v || '').replace(/([\\;,:"])/g, '\\$1');
  const tipo = auth === 'NOPASS' || auth === 'NONE' ? 'nopass' : auth || 'WPA';
  return `WIFI:T:${tipo};S:${escapa(ssid)};${tipo === 'nopass' ? '' : `P:${escapa(pass)};`}H:false;;`;
}

async function infoRed(sala) {
  const wifi = await detectarWifi();
  /* El SSID escrito a mano en /control gana: el punto de acceso móvil de
     Windows 11 no publica su clave por netsh y hay que teclearla una vez. */
  const manual = layout?.red || { ssid: '', pass: '', auth: 'WPA' };
  const efectiva = manual.ssid ? { ...manual, fuente: 'manual' } : wifi;

  const lista = direcciones().map(d => ({
    ...d,
    control: `http://${d.ip}:${PORT}/control`,
    mando: `http://${d.ip}:${PORT}/mando`,
    ws: `ws://${d.ip}:${PORT}`
  }));

  return {
    puerto: PORT,
    sala,
    maxMandos: MAX_MANDOS,
    direcciones: lista,
    wifi: {
      ssid: efectiva.ssid || '',
      pass: efectiva.pass || '',
      auth: efectiva.auth || 'WPA',
      fuente: efectiva.fuente || 'ninguna',
      hostedActiva: !!wifi.hostedActiva,
      hotspotApagado: !!wifi.hotspotApagado,
      qr: payloadWifi(efectiva.ssid, efectiva.pass, efectiva.auth)
    }
  };
}

/* ═══════════════════════════════════════════════════════
   HTTP
═══════════════════════════════════════════════════════ */

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8'
};

async function serveFile(res, filename, contentType) {
  const body = await fsp.readFile(path.join(__dirname, filename));
  res.writeHead(200, {
    'Content-Type': contentType || TIPOS[path.extname(filename)] || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

async function handleHttp(req, res) {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const ruta = requestUrl.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600'
    });
    res.end();
    return;
  }
  if (req.method === 'POST' && ruta === '/api/sessions') {
    await saveSession(req, res);
    return;
  }
  if (req.method === 'GET' && ruta === '/api/sessions') {
    await listSessions(req, res);
    return;
  }
  if (req.method === 'GET' && ruta.startsWith('/api/sessions/')) {
    await readSession(req, res, decodeURIComponent(ruta.slice('/api/sessions/'.length)));
    return;
  }
  if (req.method === 'GET' && (ruta === '/' || ruta === '/index.html')) {
    await serveFile(res, 'Midivj ZYX.html');
    return;
  }
  if (req.method === 'GET' && (ruta === '/sender' || ruta === '/sender.html')) {
    await serveFile(res, 'midivj-sender.html');
    return;
  }
  if (req.method === 'GET' && (ruta === '/mando' || ruta === '/mando.html')) {
    await serveFile(res, 'midivj-mando.html');
    return;
  }
  if (req.method === 'GET' && (ruta === '/control' || ruta === '/control.html')) {
    await serveFile(res, 'midivj-control.html');
    return;
  }
  if (req.method === 'GET' && ruta === '/midivj-qr.js') {
    await serveFile(res, 'midivj-qr.js');
    return;
  }
  if (req.method === 'GET' && ruta === '/midivj-plantillas.js') {
    await serveFile(res, 'midivj-plantillas.js');
    return;
  }
  if (req.method === 'GET' && ruta === '/api/red') {
    sendJson(res, 200, await infoRed(requestUrl.searchParams.get('sala') || 'midivj'));
    return;
  }
  if (req.method === 'GET' && ruta === '/api/mando-layout') {
    sendJson(res, 200, layout || layoutPorDefecto());
    return;
  }
  if (req.method === 'POST' && ruta === '/api/mando-layout') {
    const limpio = saneaLayout(await readJson(req, MAX_LAYOUT_BYTES));
    if (!limpio) { sendJson(res, 400, { error: 'Layout inválido.' }); return; }
    layout = limpio;
    await guardarLayout();
    difundirLayout(null);
    sendJson(res, 200, { ok: true });
    return;
  }
  if (req.method === 'DELETE' && ruta === '/api/mando-layout') {
    /* La app la usa al abrir una sesión que no trae mando propio: deja el
       mando limpio en vez de arrastrar el de la sesión anterior. */
    layout = layoutPorDefecto();
    await guardarLayout();
    difundirLayout(null);
    sendJson(res, 200, layout);
    return;
  }
  if (req.method === 'GET' && ruta === '/qr.svg') {
    const datos = requestUrl.searchParams.get('d') || '';
    const escala = Math.min(16, Math.max(1, parseInt(requestUrl.searchParams.get('s'), 10) || 6));
    const ecl = requestUrl.searchParams.get('e') || 'M';
    try {
      const svg = QRLite.svg(datos, { escala, ecl, margen: 3 });
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(svg);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }
  if (req.method === 'GET' && ruta === '/health') {
    sendJson(res, 200, { ok: true, sessionsDirectory: 'Sessions', mandos: MAX_MANDOS });
    return;
  }
  sendJson(res, 404, { error: 'Ruta no encontrada.' });
}

const server = http.createServer((req, res) => {
  handleHttp(req, res).catch(error => {
    if (!res.headersSent) sendJson(res, 500, { error: error.message || 'Error interno.' });
    else res.end();
  });
});

/* ═══════════════════════════════════════════════════════
   WebSocket — salas, roles y slots

   Protocolo (todo JSON):
     cliente → { type:'join', room, rol:'app'|'mando'|'emisor', slot, disp, nombre }
     cliente → { type:'midi', data:[status,num,vel] }          (se reenvía tal cual)
     cliente → { type:'layout', layout:{...} }                 (se valida y persiste)
     cliente → { type:'pedir-layout' }
     app     → { type:'inventario', clips, efectos, bancos }
     app     → { type:'evento', ev:'clip-inicio'|'clip-fin', ... }
     mando   → { type:'toast', texto }
     relay   → 'joined' | 'presencia' | 'layout' | 'inventario' | 'evento' |
               'slot-ocupado' | 'reemplazado'

   El rol por defecto ('emisor') mantiene el comportamiento original:
   el emisor MIDI y las versiones anteriores de la app siguen funcionando.
═══════════════════════════════════════════════════════ */

function getOrCreate(room) {
  if (!rooms.has(room)) {
    rooms.set(room, { clientes: new Set(), app: null, mandos: new Map(), inventario: null });
  }
  return rooms.get(room);
}

function leaveRoom(ws, room) {
  const sala = rooms.get(room);
  if (!sala) return;
  sala.clientes.delete(ws);
  if (sala.app === ws) sala.app = null;
  for (const [slot, cliente] of sala.mandos) {
    if (cliente === ws) sala.mandos.delete(slot);
  }
  if (!sala.clientes.size) rooms.delete(room);
  else difundirPresencia(room);
}

function enviar(ws, payload) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload));
}

function difundir(room, payload, excepto = null) {
  const sala = rooms.get(room);
  if (!sala) return;
  const texto = JSON.stringify(payload);
  for (const cliente of sala.clientes) {
    if (cliente !== excepto && cliente.readyState === 1) cliente.send(texto);
  }
}

function presencia(room) {
  const sala = rooms.get(room);
  if (!sala) return { type: 'presencia', app: false, mandos: [], clientes: 0 };
  return {
    type: 'presencia',
    app: !!sala.app,
    clientes: sala.clientes.size,
    maxMandos: MAX_MANDOS,
    mandos: [...sala.mandos.entries()].map(([slot, ws]) => ({
      slot,
      nombre: ws._nombre || `Mando ${slot}`,
      disp: ws._disp || ''
    })).sort((a, b) => a.slot - b.slot)
  };
}

function difundirPresencia(room) {
  difundir(room, presencia(room));
}

function difundirLayout(excepto) {
  for (const room of rooms.keys()) {
    difundir(room, { type: 'layout', layout }, excepto);
  }
}

const wss = new WebSocketServer({ server });

/* `ws` reenvía los errores del servidor HTTP a esta instancia. Sin este
   manejador, un puerto ocupado terminaba en un volcado de Node en vez del
   aviso claro: el 'error' sin escuchar tumba el proceso. El puerto en uso ya
   se resuelve en escuchar(), así que aquí sólo se informa lo inesperado. */
wss.on('error', error => {
  if (error.code !== 'EADDRINUSE') console.error('  [ws]', error.message);
});

wss.on('connection', ws => {
  let myRoom = 'midivj';
  ws._rol = 'emisor';
  ws._slot = null;

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    /* ── Alta en la sala ── */
    if (msg.type === 'join') {
      leaveRoom(ws, myRoom);
      myRoom = typeof msg.room === 'string' && msg.room.trim() ? msg.room.trim().slice(0, 40) : 'midivj';
      const sala = getOrCreate(myRoom);
      ws._rol = ['app', 'mando', 'emisor'].includes(msg.rol) ? msg.rol : 'emisor';
      ws._disp = typeof msg.disp === 'string' ? msg.disp.slice(0, 40) : '';
      ws._nombre = typeof msg.nombre === 'string' ? msg.nombre.slice(0, 30) : '';

      if (ws._rol === 'mando') {
        const pedido = parseInt(msg.slot, 10);
        let slot = Number.isFinite(pedido) && pedido >= 1 && pedido <= MAX_MANDOS ? pedido : null;

        /* Reconexión del mismo teléfono: recupera su slot aunque pida otro. */
        for (const [s, cliente] of sala.mandos) {
          if (ws._disp && cliente._disp === ws._disp) { slot = s; cliente.close(); sala.mandos.delete(s); }
        }
        if (!slot) {
          for (let s = 1; s <= MAX_MANDOS && !slot; s++) if (!sala.mandos.has(s)) slot = s;
        }
        const ocupante = slot ? sala.mandos.get(slot) : null;
        if (!slot || (ocupante && ocupante._disp !== ws._disp)) {
          /* Le decimos qué slots están tomados para que el teléfono ofrezca
             sólo los libres en vez de reintentar contra el mismo. */
          enviar(ws, {
            type: 'slot-ocupado',
            slot: slot || 0,
            maxMandos: MAX_MANDOS,
            ocupados: [...sala.mandos.keys()].sort((a, b) => a - b)
          });
          setTimeout(() => ws.close(), SLOT_DENY_DELAY_MS);
          return;
        }
        sala.mandos.set(slot, ws);
        ws._slot = slot;
      }

      if (ws._rol === 'app' && sala.app && sala.app !== ws) {
        /* Dos pestañas de MIDIVJ: manda la última, la anterior deja de reintentar. */
        enviar(sala.app, { type: 'reemplazado' });
        sala.app = null;
      }
      if (ws._rol === 'app') sala.app = ws;

      sala.clientes.add(ws);
      const count = sala.clientes.size;
      console.log(`  [+] sala "${myRoom}" — ${ws._rol}${ws._slot ? ' ' + ws._slot : ''} — ${count} cliente${count > 1 ? 's' : ''}`);

      enviar(ws, { type: 'joined', room: myRoom, clients: count, rol: ws._rol, slot: ws._slot, maxMandos: MAX_MANDOS });
      enviar(ws, { type: 'layout', layout: layout || layoutPorDefecto() });
      if (sala.inventario) enviar(ws, sala.inventario);
      difundirPresencia(myRoom);
      return;
    }

    /* ── MIDI: comportamiento original, sin tocar ── */
    if (msg.type === 'midi' && Array.isArray(msg.data)) {
      const output = JSON.stringify(msg);
      rooms.get(myRoom)?.clientes.forEach(cliente => {
        if (cliente !== ws && cliente.readyState === 1) cliente.send(output);
      });
      return;
    }

    /* ── Layout: se valida, se persiste y se reparte ── */
    if (msg.type === 'layout') {
      const limpio = saneaLayout(msg.layout);
      if (!limpio) return;
      layout = limpio;
      guardarLayout().catch(error => console.error('  [layout] no se pudo guardar:', error.message));
      difundirLayout(ws);
      enviar(ws, { type: 'layout-ok', actualizado: layout.actualizado });
      return;
    }
    if (msg.type === 'pedir-layout') {
      enviar(ws, { type: 'layout', layout: layout || layoutPorDefecto() });
      return;
    }

    /* ── Inventario de la app: clips, efectos y bancos con su MIDI ── */
    if (msg.type === 'inventario') {
      const sala = getOrCreate(myRoom);
      sala.inventario = {
        type: 'inventario',
        clips: Array.isArray(msg.clips) ? msg.clips.slice(0, 400) : [],
        efectos: Array.isArray(msg.efectos) ? msg.efectos.slice(0, 100) : [],
        bancos: Array.isArray(msg.bancos) ? msg.bancos.slice(0, 32) : []
      };
      difundir(myRoom, sala.inventario, ws);
      return;
    }

    /* ── Eventos de la app (fin de clip → volver del submenú) ── */
    if (msg.type === 'evento') {
      difundir(myRoom, { type: 'evento', ev: String(msg.ev || '').slice(0, 30), datos: msg.datos ?? null }, ws);
      return;
    }

    if (msg.type === 'toast') {
      difundir(myRoom, { type: 'toast', texto: String(msg.texto || '').slice(0, 120) }, ws);
    }
  });

  ws.on('close', () => {
    const rol = ws._rol;
    const slot = ws._slot;
    leaveRoom(ws, myRoom);
    const count = rooms.get(myRoom)?.clientes.size ?? 0;
    console.log(`  [-] sala "${myRoom}" — ${rol}${slot ? ' ' + slot : ''} — ${count} cliente${count !== 1 ? 's' : ''}`);
  });
  ws.on('error', () => undefined);
});

/* ═══════════════════════════════════════════════════════
   Arranque
═══════════════════════════════════════════════════════ */

async function printIPs() {
  const info = await infoRed('midivj');
  console.log('\n  Aplicación: http://localhost:' + PORT + '/');
  console.log('  Emisor MIDI: http://localhost:' + PORT + '/sender');
  console.log('  Control remoto (QR): http://localhost:' + PORT + '/control');
  console.log('  Sesiones: ' + SESSIONS_DIR);
  console.log('  Layout del mando: ' + LAYOUT_FILE);
  if (info.direcciones.length) {
    console.log('  Direcciones para teléfonos y otros equipos:');
    info.direcciones.forEach(d => {
      const etiqueta = d.tipo === 'hotspot' ? '  ← red creada por esta PC' : '';
      console.log(`    http://${d.ip}:${PORT}/mando   (${d.interfaz})${etiqueta}`);
    });
  } else {
    console.log('  Sin dirección de red: sólo funciona en esta computadora.');
  }
  if (info.wifi.ssid) {
    const origen = info.wifi.fuente === 'hostednetwork' ? 'red creada por esta PC'
      : info.wifi.fuente === 'manual' ? 'configurada a mano' : 'red conectada';
    console.log(`  Wi-Fi para el QR: "${info.wifi.ssid}" (${origen})`);
  }
  console.log('');
}

/**
 * Levanta el servidor probando puertos consecutivos.
 *
 * Antes, un puerto ocupado (un relay viejo abierto, otra app) obligaba a
 * relanzar a mano con otro número, y entonces la aplicación seguía apuntando
 * al puerto anterior. Ahora el relay elige uno libre y la aplicación se conecta
 * al que la sirvió, así que la cadena no se rompe.
 */
function escuchar(puerto, intentosRestantes) {
  return new Promise((resolve, reject) => {
    const alError = error => {
      server.removeListener('listening', alEscuchar);
      if (error.code === 'EADDRINUSE' && intentosRestantes > 0) {
        console.log(`  Puerto ${puerto} ocupado — probando ${puerto + 1}…`);
        resolve(escuchar(puerto + 1, intentosRestantes - 1));
        return;
      }
      reject(error);
    };
    const alEscuchar = () => {
      server.removeListener('error', alError);
      resolve(puerto);
    };
    server.once('error', alError);
    server.once('listening', alEscuchar);
    server.listen(puerto);
  });
}

function abrirNavegador(url) {
  if (!ABRIR_NAVEGADOR) return;
  const listo = () => undefined;
  if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '', url], { windowsHide: true }, listo);
  else if (process.platform === 'darwin') execFile('open', [url], listo);
  else execFile('xdg-open', [url], listo);
}

cargarLayout()
  .then(() => escuchar(PORT, PUERTOS_ALTERNOS))
  .then(async puerto => {
    PORT = puerto;
    server.on('error', error => console.error('\n  Error:', error.message, '\n'));
    console.log(`\nMIDIVJ — servidor local y relay en puerto ${PORT}`);
    await printIPs().catch(() => undefined);
    abrirNavegador(`http://localhost:${PORT}/`);
    console.log('  Esperando conexiones… (Ctrl+C para detener)\n');
  })
  .catch(error => {
    if (error.code === 'EADDRINUSE') {
      console.error(`\n  No hay puertos libres entre ${PORT} y ${PORT + PUERTOS_ALTERNOS}.`);
      console.error('  Cierra el relay que ya esté abierto y vuelve a intentar.\n');
    } else {
      console.error('\n  Error:', error.message, '\n');
    }
    process.exitCode = 1;
  });
