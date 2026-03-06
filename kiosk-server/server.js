'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT            = process.env.PORT            || 3000;
const PUBLIC_URL      = (process.env.PUBLIC_URL      || '').replace(/\/$/, '');
const OPERATOR_SECRET = process.env.OPERATOR_SECRET  || '';
const STATE_FILE = path.join(__dirname, 'session-state.json');
const CLIENT_DIR = path.join(__dirname, '../kiosk-client');
const FOCUS_DURATION = 25 * 60; // seconds
const BREAK_DURATION = 10 * 60; // seconds

// ---------------------------------------------------------------------------
// Express + Socket.IO setup
// ---------------------------------------------------------------------------
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Use /ws namespace for all real-time events (future-proof for relay)
const ws = io.of('/ws');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
function createInitialState() {
  return {
    version: 1,
    session: {
      date: new Date().toISOString().split('T')[0],
      currentBlock: 1,
      phase: 'idle', // 'idle' | 'focus' | 'break'
    },
    participants: [],
    timer: {
      running: false,
      paused: false,
      type: null, // 'focus' | 'break'
      remaining: 0,
      duration: 0,
    },
  };
}

let state = createInitialState();

// ---------------------------------------------------------------------------
// Persistence — abstracted behind simple load/save interface
// ---------------------------------------------------------------------------
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const saved = JSON.parse(raw);
      state = saved;
      // Always reset timer running state on server start (reboot recovery)
      state.timer.running = false;
      state.session.phase = 'idle';
    }
  } catch (err) {
    console.error('[state] Failed to load state, using fresh state:', err.message);
    state = createInitialState();
  }
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('[state] Failed to save state:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Timer logic — runs on server (single source of truth)
// ---------------------------------------------------------------------------
let timerInterval = null;

function handleTimerEnd() {
  const finishedType = state.timer.type;
  clearInterval(timerInterval);
  timerInterval = null;
  state.timer.running = false;
  state.timer.paused = false;
  state.session.phase = 'idle';
  if (finishedType === 'focus') {
    state.session.currentBlock += 1;
  }
  saveState();
  ws.emit('timer:end', { type: finishedType });
  ws.emit('session:state', state);
}

function startTimer(type) {
  stopTimer(false); // stop without broadcast

  const duration = type === 'focus' ? FOCUS_DURATION : BREAK_DURATION;

  state.timer = { running: true, paused: false, type, remaining: duration, duration };
  state.session.phase = type;
  saveState();

  ws.emit('timer:start', { type, remaining: duration, duration });

  timerInterval = setInterval(() => {
    state.timer.remaining -= 1;
    ws.emit('timer:tick', { remaining: state.timer.remaining, type: state.timer.type });
    if (state.timer.remaining <= 0) handleTimerEnd();
  }, 1000);
}

function pauseTimer() {
  if (!state.timer.running || !timerInterval) return;
  clearInterval(timerInterval);
  timerInterval = null;
  state.timer.running = false;
  state.timer.paused = true;
  saveState();
  ws.emit('timer:paused', { remaining: state.timer.remaining, type: state.timer.type });
}

function resumeTimer() {
  if (!state.timer.paused) return;
  state.timer.running = true;
  state.timer.paused = false;
  saveState();
  ws.emit('timer:resumed', { remaining: state.timer.remaining, type: state.timer.type });
  timerInterval = setInterval(() => {
    state.timer.remaining -= 1;
    ws.emit('timer:tick', { remaining: state.timer.remaining, type: state.timer.type });
    if (state.timer.remaining <= 0) handleTimerEnd();
  }, 1000);
}

function stopTimer(broadcast = true) {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  state.timer.running = false;
  state.timer.paused = false;
  state.session.phase = 'idle';
  saveState();
  if (broadcast) {
    ws.emit('timer:stopped', {});
    ws.emit('session:state', state);
  }
}

// ---------------------------------------------------------------------------
// Network helpers
// ---------------------------------------------------------------------------
function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ---------------------------------------------------------------------------
// HTTP Routes
// ---------------------------------------------------------------------------
app.set('trust proxy', 1); // trust Cloudflare / Caddy reverse proxy
app.use(express.json());
app.use(express.static(CLIENT_DIR));

// Kiosk display UI
app.get('/', (_req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});

// Participant join UI
app.get('/join', (_req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'join.html'));
});

// Current session state (REST fallback)
app.get('/api/state', (_req, res) => {
  res.json(state);
});

// Server info for IP display on kiosk
app.get('/api/info', (_req, res) => {
  const ip   = getLocalIP();
  const base = PUBLIC_URL || `http://${ip}:${PORT}`;
  res.json({
    ip,
    port: PORT,
    joinUrl:  `${base}/join`,
    kioskUrl: base,
  });
});

// Participant registration
app.post('/api/participants', (req, res) => {
  const { name, blockCount, tasks } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (![6, 12].includes(parseInt(blockCount))) {
    return res.status(400).json({ error: 'Block count must be 6 or 12' });
  }
  if (!Array.isArray(tasks)) {
    return res.status(400).json({ error: 'Tasks must be an array' });
  }

  const cleanName = name.trim().slice(0, 60);
  const cleanBlockCount = parseInt(blockCount);
  const cleanTasks = tasks
    .slice(0, cleanBlockCount)
    .map((t) => (typeof t === 'string' ? t.trim().slice(0, 120) : ''));

  // Replace if same name already registered
  state.participants = state.participants.filter(
    (p) => p.name.toLowerCase() !== cleanName.toLowerCase()
  );

  state.participants.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: cleanName,
    blockCount: cleanBlockCount,
    tasks: cleanTasks,
    joinedAt: new Date().toISOString(),
  });

  saveState();
  ws.emit('participants:updated', { participants: state.participants });

  res.json({ success: true, participant: { name: cleanName, blockCount: cleanBlockCount } });
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Operator auth — socket must present correct secret when OPERATOR_SECRET is set
// ---------------------------------------------------------------------------
function isOperator(socket) {
  return !OPERATOR_SECRET || socket.handshake.auth.secret === OPERATOR_SECRET;
}

// ---------------------------------------------------------------------------
// WebSocket — /ws namespace
// ---------------------------------------------------------------------------
ws.on('connection', (socket) => {
  console.log(`[ws] Client connected: ${socket.id} operator=${isOperator(socket)}`);

  // Send full state immediately on connect
  socket.emit('session:state', state);

  // --- Timer controls (kiosk operator only) ---
  socket.on('timer:startFocus', () => {
    if (!isOperator(socket)) return;
    console.log('[ws] timer:startFocus');
    startTimer('focus');
  });

  socket.on('timer:startBreak', () => {
    if (!isOperator(socket)) return;
    console.log('[ws] timer:startBreak');
    startTimer('break');
  });

  socket.on('timer:stop', () => {
    if (!isOperator(socket)) return;
    console.log('[ws] timer:stop');
    stopTimer(true);
  });

  socket.on('timer:pause', () => {
    if (!isOperator(socket)) return;
    console.log('[ws] timer:pause');
    pauseTimer();
  });

  socket.on('timer:resume', () => {
    if (!isOperator(socket)) return;
    console.log('[ws] timer:resume');
    resumeTimer();
  });

  // --- Session controls (kiosk operator only) ---
  socket.on('session:nextBlock', () => {
    if (!isOperator(socket)) return;
    console.log('[ws] session:nextBlock');
    stopTimer(false);
    state.session.currentBlock += 1;
    saveState();
    ws.emit('session:state', state);
  });

  socket.on('session:reset', () => {
    if (!isOperator(socket)) return;
    console.log('[ws] session:reset');
    stopTimer(false);
    state = createInitialState();
    saveState();
    ws.emit('session:state', state);
    ws.emit('participants:updated', { participants: [] });
  });

  socket.on('disconnect', () => {
    console.log(`[ws] Client disconnected: ${socket.id}`);
  });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
loadState();

httpServer.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║        Focus Kiosk Server v1.2        ║');
  console.log('  ╠══════════════════════════════════════╣');
  console.log(`  ║  Kiosk UI : http://${ip}:${PORT}${' '.repeat(Math.max(0, 14 - ip.length - String(PORT).length))}║`);
  console.log(`  ║  Join URL : http://${ip}:${PORT}/join${' '.repeat(Math.max(0, 9 - ip.length - String(PORT).length))}║`);
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
});
