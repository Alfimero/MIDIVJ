/**
 * MIDIVJ local server and Network MIDI relay.
 *
 * - Serves the main UI at http://localhost:9191/
 * - Serves the MIDI sender at http://localhost:9191/sender
 * - Saves .vjp files exclusively in ../Sessions
 * - Relays MIDI messages over WebSocket rooms
 */

const http = require('http');
const os = require('os');
const path = require('path');
const fsp = require('fs/promises');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.argv[2], 10) || 9191;
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SESSIONS_DIR = path.join(PROJECT_ROOT, 'Sessions');
const MAX_SESSION_BYTES = 5 * 1024 * 1024;
const rooms = new Map();

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

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_SESSION_BYTES) {
        reject(new Error('La sesión supera el límite de 5 MB.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('El contenido de la sesión no es JSON válido.'));
      }
    });
    req.on('error', reject);
  });
}

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

async function serveFile(res, filename, contentType) {
  const body = await fsp.readFile(path.join(__dirname, filename));
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

async function handleHttp(req, res) {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS' && requestUrl.pathname === '/api/sessions') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600'
    });
    res.end();
    return;
  }
  if (req.method === 'POST' && requestUrl.pathname === '/api/sessions') {
    await saveSession(req, res);
    return;
  }
  if (req.method === 'GET' && (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html')) {
    await serveFile(res, 'Midivj ZYX.html', 'text/html; charset=utf-8');
    return;
  }
  if (req.method === 'GET' && (requestUrl.pathname === '/sender' || requestUrl.pathname === '/sender.html')) {
    await serveFile(res, 'midivj-sender.html', 'text/html; charset=utf-8');
    return;
  }
  if (req.method === 'GET' && requestUrl.pathname === '/health') {
    sendJson(res, 200, { ok: true, sessionsDirectory: 'Sessions' });
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

const wss = new WebSocketServer({ server });

function getOrCreate(room) {
  if (!rooms.has(room)) rooms.set(room, new Set());
  return rooms.get(room);
}

function leaveRoom(ws, room) {
  const clients = rooms.get(room);
  if (!clients) return;
  clients.delete(ws);
  if (clients.size === 0) rooms.delete(room);
}

function printIPs() {
  const ips = [];
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const address of iface || []) {
      if (address.family === 'IPv4' && !address.internal) ips.push(address.address);
    }
  }
  console.log('\n  Aplicación: http://localhost:' + PORT + '/');
  console.log('  Emisor MIDI: http://localhost:' + PORT + '/sender');
  console.log('  Sesiones: ' + SESSIONS_DIR);
  console.log('  Relay para otros equipos:');
  if (ips.length) ips.forEach(ip => console.log(`    ws://${ip}:${PORT}`));
  else console.log(`    ws://localhost:${PORT}`);
  console.log('');
}

wss.on('connection', ws => {
  let myRoom = 'midivj';

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'join') {
      leaveRoom(ws, myRoom);
      myRoom = typeof msg.room === 'string' && msg.room.trim() ? msg.room.trim() : 'midivj';
      getOrCreate(myRoom).add(ws);
      const count = rooms.get(myRoom).size;
      console.log(`  [+] sala "${myRoom}" — ${count} cliente${count > 1 ? 's' : ''}`);
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'joined', room: myRoom, clients: count }));
      return;
    }

    if (msg.type === 'midi' && Array.isArray(msg.data)) {
      const output = JSON.stringify(msg);
      rooms.get(myRoom)?.forEach(client => {
        if (client !== ws && client.readyState === 1) client.send(output);
      });
    }
  });

  ws.on('close', () => {
    leaveRoom(ws, myRoom);
    const count = rooms.get(myRoom)?.size ?? 0;
    console.log(`  [-] sala "${myRoom}" — ${count} cliente${count !== 1 ? 's' : ''}`);
  });
  ws.on('error', () => undefined);
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\n  Puerto ${PORT} en uso. Prueba: node src/midivj-relay.js ${PORT + 1}\n`);
  } else {
    console.error('\n  Error:', error.message, '\n');
  }
  process.exitCode = 1;
});

server.listen(PORT, () => {
  console.log(`\nMIDIVJ — servidor local y relay en puerto ${PORT}`);
  printIPs();
  console.log('  Esperando conexiones… (Ctrl+C para detener)\n');
});
