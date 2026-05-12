/**
 * WebRTC Signaling Server
 * ========================
 * WebSocket signaling + REST API + Static file serving
 * Designed for LAN-only low-latency streaming
 */

const http = require('http');
const https = require('https');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// ── Configuration ──────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3080', 10);
const ROOM_TOKEN = process.env.ROOM_TOKEN || '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const MAX_VIEWERS = parseInt(process.env.MAX_VIEWERS || '5', 10);
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const RECORD_DIR = process.env.RECORD_DIR || '/data/records';

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLogLevel = LOG_LEVELS[LOG_LEVEL] ?? 1;

// ── SSL Certificates ───────────────────────────────────────────
const CERT_PATH = path.join(__dirname, 'cert.pem');
const KEY_PATH = path.join(__dirname, 'key.pem');
let sslOptions = null;
try {
  sslOptions = {
    cert: fs.readFileSync(CERT_PATH),
    key: fs.readFileSync(KEY_PATH)
  };
  console.log('[info] SSL certificates loaded');
} catch (e) {
  console.log('[warn] SSL certificates not found, falling back to HTTP only');
}

const startTime = Date.now();

// ── Logger ─────────────────────────────────────────────────────
function log(level, msg, data = {}) {
  if (LOG_LEVELS[level] === undefined || LOG_LEVELS[level] < currentLogLevel) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...data
  };
  console.log(JSON.stringify(entry));
}

// ── Room Management ────────────────────────────────────────────
const rooms = new Map(); // roomId -> Map<clientId, { ws, role, joinedAt }>

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map());
    log('info', 'Room created', { roomId });
  }
  return rooms.get(roomId);
}

function removeClientFromRoom(roomId, clientId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.delete(clientId);
  log('info', 'Client left room', { roomId, clientId });

  // Notify remaining peers
  for (const [peerId, peer] of room) {
    safeSend(peer.ws, {
      type: 'peer_left',
      roomId,
      clientId
    });
  }

  // Cleanup empty rooms
  if (room.size === 0) {
    rooms.delete(roomId);
    log('info', 'Room destroyed (empty)', { roomId });
  }
}

function safeSend(ws, data) {
  try {
    if (ws.readyState === 1) { // OPEN
      ws.send(JSON.stringify(data));
    }
  } catch (err) {
    log('error', 'Send failed', { error: err.message });
  }
}

// ── MIME Types ──────────────────────────────────────────────────
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webm': 'video/webm'
};

// ── Request Handler (shared by HTTP & HTTPS) ──────────────────
function handleRequest(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // ── CORS Headers ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // ── REST API ──
  if (pathname.startsWith('/api/v1/')) {
    const query = Object.fromEntries(parsedUrl.searchParams);
    return handleAPI(req, res, pathname, query);
  }

  // ── Static Files ──
  let filePath;
  if (pathname === '/' || pathname === '/publish') {
    filePath = path.join(__dirname, '..', 'public', 'index.html');
  } else if (pathname === '/view') {
    filePath = path.join(__dirname, '..', 'public', 'view.html');
  } else {
    filePath = path.join(__dirname, '..', 'public', pathname);
  }

  // Security: prevent path traversal
  const publicDir = path.resolve(path.join(__dirname, '..', 'public'));
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(publicDir)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Forbidden' }));
  }

  fs.readFile(resolvedPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Not found' }));
    }
    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 
      'Content-Type': contentType,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(data);
  });
}

// ── Create Server(s) ───────────────────────────────────────────
let server;
if (sslOptions) {
  // HTTPS server (main)
  server = https.createServer(sslOptions, handleRequest);

  // HTTP redirect server
  const redirectServer = http.createServer((req, res) => {
    const host = (req.headers.host || '').replace(/:\d+$/, '');
    res.writeHead(301, { Location: `https://${host}:${PORT}${req.url}` });
    res.end();
  });
  redirectServer.listen(HTTP_PORT, '0.0.0.0', () => {
    log('info', `HTTP redirect server on port ${HTTP_PORT}`);
  });
} else {
  // HTTP only fallback
  server = http.createServer(handleRequest);
}

// ── REST API Handler ───────────────────────────────────────────
function handleAPI(req, res, pathname, query) {
  const sendJSON = (code, data) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  // Optional admin auth check
  const checkAdmin = () => {
    if (!ADMIN_TOKEN) return true;
    const token = req.headers['x-admin-token'];
    return token === ADMIN_TOKEN;
  };

  // GET /api/v1/health
  if (req.method === 'GET' && pathname === '/api/v1/health') {
    return sendJSON(200, {
      status: 'ok',
      uptime_sec: Math.floor((Date.now() - startTime) / 1000),
      version: '1.0.0',
      rooms_active: rooms.size,
      timestamp: new Date().toISOString()
    });
  }

  // GET /api/v1/rooms
  if (req.method === 'GET' && pathname === '/api/v1/rooms') {
    const roomList = [];
    for (const [roomId, members] of rooms) {
      let publishers = 0, viewers = 0;
      for (const [, m] of members) {
        if (m.role === 'publisher') publishers++;
        else viewers++;
      }
      roomList.push({ id: roomId, publishers, viewers, total: members.size });
    }
    return sendJSON(200, roomList);
  }

  // GET /api/v1/rooms/:id/stats
  const statsMatch = pathname.match(/^\/api\/v1\/rooms\/([^/]+)\/stats$/);
  if (req.method === 'GET' && statsMatch) {
    const roomId = decodeURIComponent(statsMatch[1]);
    const room = rooms.get(roomId);
    if (!room) return sendJSON(404, { error: 'Room not found' });

    const peers = [];
    for (const [clientId, m] of room) {
      peers.push({
        clientId,
        role: m.role,
        joinedAt: m.joinedAt,
        connected_sec: Math.floor((Date.now() - m.joinedAt) / 1000)
      });
    }
    return sendJSON(200, { roomId, peers, total: room.size });
  }

  // DELETE /api/v1/rooms/:id/peers/:clientId
  const kickMatch = pathname.match(/^\/api\/v1\/rooms\/([^/]+)\/peers\/([^/]+)$/);
  if (req.method === 'DELETE' && kickMatch) {
    if (!checkAdmin()) return sendJSON(403, { error: 'Unauthorized' });
    const roomId = decodeURIComponent(kickMatch[1]);
    const clientId = decodeURIComponent(kickMatch[2]);
    const room = rooms.get(roomId);
    if (!room) return sendJSON(404, { error: 'Room not found' });
    const peer = room.get(clientId);
    if (!peer) return sendJSON(404, { error: 'Peer not found' });

    safeSend(peer.ws, { type: 'kicked', reason: 'Removed by admin' });
    peer.ws.close(1000, 'Kicked by admin');
    removeClientFromRoom(roomId, clientId);
    return sendJSON(200, { status: 'kicked', clientId });
  }

  sendJSON(404, { error: 'Endpoint not found' });
}

// ── WebSocket Signaling Server ─────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const token = parsedUrl.searchParams.get('token') || '';

  // Token authentication (if configured)
  if (ROOM_TOKEN && token !== ROOM_TOKEN) {
    log('warn', 'Auth failed: invalid token', { ip: req.socket.remoteAddress });
    safeSend(ws, { type: 'error', code: 'AUTH_FAILED', message: 'Invalid room token' });
    ws.close(4001, 'Authentication failed');
    return;
  }

  let currentRoomId = null;
  let currentClientId = null;

  log('info', 'WebSocket connected', { ip: req.socket.remoteAddress });

  // Keepalive ping/pong
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      safeSend(ws, { type: 'error', code: 'INVALID_JSON', message: 'Parse error' });
      return;
    }

    log('debug', 'WS message received', { type: msg.type, clientId: msg.clientId || currentClientId });

    switch (msg.type) {
      case 'join':
        handleJoin(ws, msg);
        break;
      case 'offer':
        handleOffer(ws, msg);
        break;
      case 'answer':
        handleAnswer(ws, msg);
        break;
      case 'candidate':
        handleCandidate(ws, msg);
        break;
      case 'leave':
        handleLeave(ws, msg);
        break;
      default:
        safeSend(ws, { type: 'error', code: 'UNKNOWN_TYPE', message: `Unknown message type: ${msg.type}` });
    }
  });

  ws.on('close', (code, reason) => {
    log('info', 'WebSocket disconnected', { clientId: currentClientId, code, reason: reason.toString() });
    if (currentRoomId && currentClientId) {
      removeClientFromRoom(currentRoomId, currentClientId);
    }
  });

  ws.on('error', (err) => {
    log('error', 'WebSocket error', { clientId: currentClientId, error: err.message });
  });

  // ── Message Handlers ──

  function handleJoin(ws, msg) {
    const { roomId, clientId, role } = msg;
    if (!roomId || !clientId || !role) {
      safeSend(ws, { type: 'error', code: 'INVALID_JOIN', message: 'Missing roomId, clientId, or role' });
      return;
    }

    if (role !== 'publisher' && role !== 'viewer') {
      safeSend(ws, { type: 'error', code: 'INVALID_ROLE', message: 'Role must be publisher or viewer' });
      return;
    }

    const room = getOrCreateRoom(roomId);

    // Check viewer limit
    if (role === 'viewer') {
      let viewerCount = 0;
      for (const [, m] of room) {
        if (m.role === 'viewer') viewerCount++;
      }
      if (viewerCount >= MAX_VIEWERS) {
        safeSend(ws, { type: 'error', code: 'ROOM_FULL', message: `Max viewers (${MAX_VIEWERS}) reached` });
        return;
      }
    }

    // Leave previous room if any
    if (currentRoomId && currentClientId) {
      removeClientFromRoom(currentRoomId, currentClientId);
    }

    currentRoomId = roomId;
    currentClientId = clientId;

    room.set(clientId, { ws, role, joinedAt: Date.now() });

    // Build peer list
    const peers = [];
    for (const [peerId, peer] of room) {
      if (peerId !== clientId) {
        peers.push({ clientId: peerId, role: peer.role });
      }
    }

    // Send joined confirmation
    safeSend(ws, {
      type: 'joined',
      roomId,
      clientId,
      peers,
      serverTime: Date.now()
    });

    // Notify existing peers about new member
    for (const [peerId, peer] of room) {
      if (peerId !== clientId) {
        safeSend(peer.ws, {
          type: 'peer_joined',
          roomId,
          clientId,
          role
        });
      }
    }

    log('info', 'Client joined room', { roomId, clientId, role, roomSize: room.size });
  }

  function handleOffer(ws, msg) {
    const { roomId, sdp, senderId, targetId } = msg;
    if (!roomId || !sdp || !senderId) {
      safeSend(ws, { type: 'error', code: 'INVALID_OFFER', message: 'Missing roomId, sdp, or senderId' });
      return;
    }

    const room = rooms.get(roomId);
    if (!room) return;

    if (targetId) {
      // Direct offer to specific peer
      const target = room.get(targetId);
      if (target) {
        safeSend(target.ws, { type: 'offer', roomId, sdp, senderId });
      }
    } else {
      // Broadcast to all viewers
      for (const [peerId, peer] of room) {
        if (peerId !== senderId && peer.role === 'viewer') {
          safeSend(peer.ws, { type: 'offer', roomId, sdp, senderId });
        }
      }
    }
    log('debug', 'Offer forwarded', { roomId, senderId, targetId: targetId || 'broadcast' });
  }

  function handleAnswer(ws, msg) {
    const { roomId, sdp, senderId, targetId } = msg;
    if (!roomId || !sdp || !senderId || !targetId) {
      safeSend(ws, { type: 'error', code: 'INVALID_ANSWER', message: 'Missing fields' });
      return;
    }

    const room = rooms.get(roomId);
    if (!room) return;

    const target = room.get(targetId);
    if (target) {
      safeSend(target.ws, { type: 'answer', roomId, sdp, senderId });
    }
    log('debug', 'Answer forwarded', { roomId, senderId, targetId });
  }

  function handleCandidate(ws, msg) {
    const { roomId, candidate, senderId, targetId } = msg;
    if (!roomId || !candidate || !senderId) {
      return;
    }

    const room = rooms.get(roomId);
    if (!room) return;

    if (targetId) {
      const target = room.get(targetId);
      if (target) {
        safeSend(target.ws, { type: 'candidate', roomId, candidate, senderId });
      }
    } else {
      // Broadcast to all except sender
      for (const [peerId, peer] of room) {
        if (peerId !== senderId) {
          safeSend(peer.ws, { type: 'candidate', roomId, candidate, senderId });
        }
      }
    }
  }

  function handleLeave(ws, msg) {
    const { roomId, clientId } = msg;
    if (roomId && clientId) {
      removeClientFromRoom(roomId, clientId);
      currentRoomId = null;
      currentClientId = null;
    }
  }
});

// ── Keepalive Interval ─────────────────────────────────────────
const keepaliveInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      log('warn', 'Terminating stale WebSocket');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(keepaliveInterval);
});

// ── Start Server ───────────────────────────────────────────────
const proto = sslOptions ? 'https' : 'http';
const wsproto = sslOptions ? 'wss' : 'ws';
server.listen(PORT, '0.0.0.0', () => {
  log('info', '🚀 WebRTC Signaling Server started', {
    port: PORT,
    protocol: proto,
    auth: ROOM_TOKEN ? 'enabled' : 'disabled',
    maxViewers: MAX_VIEWERS,
    logLevel: LOG_LEVEL
  });
  console.log(`\n  🔒 Mode:       ${sslOptions ? 'HTTPS (SSL)' : 'HTTP (no SSL)'}`);
  console.log(`  📡 Signaling:  ${wsproto}://0.0.0.0:${PORT}/ws`);
  console.log(`  📹 Publisher:  ${proto}://0.0.0.0:${PORT}/`);
  console.log(`  👁️  Viewer:     ${proto}://0.0.0.0:${PORT}/view`);
  console.log(`  💊 Health:     ${proto}://0.0.0.0:${PORT}/api/v1/health`);
  console.log(`  📊 Rooms:      ${proto}://0.0.0.0:${PORT}/api/v1/rooms`);
  if (sslOptions) console.log(`  🔄 Redirect:   http://0.0.0.0:${HTTP_PORT} → https`);
  console.log();
});

// ── Graceful Shutdown ──────────────────────────────────────────
function shutdown(signal) {
  log('info', `Received ${signal}, shutting down...`);

  // Notify all connected clients
  wss.clients.forEach((ws) => {
    safeSend(ws, { type: 'server_shutdown', message: 'Server is restarting' });
    ws.close(1001, 'Server shutting down');
  });

  clearInterval(keepaliveInterval);

  server.close(() => {
    log('info', 'Server closed');
    process.exit(0);
  });

  // Force exit after 5s
  setTimeout(() => process.exit(0), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Prevent crashes from unhandled errors
process.on('uncaughtException', (err) => {
  log('error', 'Uncaught exception', { error: err.message, stack: err.stack });
});
process.on('unhandledRejection', (err) => {
  log('error', 'Unhandled rejection', { error: err?.message || String(err) });
});
