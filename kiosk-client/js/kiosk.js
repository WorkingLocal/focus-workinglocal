'use strict';

// ---------------------------------------------------------------------------
// Socket.IO — connect to /ws namespace
// ---------------------------------------------------------------------------
const socket = io('/ws');

// ---------------------------------------------------------------------------
// IndexedDB — offline resilience cache
// ---------------------------------------------------------------------------
const DB_NAME = 'focus-kiosk-v1';
const DB_STORE = 'state';
let db = null;

function openDB() {
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(DB_STORE, { keyPath: 'id' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => resolve(null); // fail silently
  });
}

function idbSave(data) {
  if (!db) return;
  const tx = db.transaction(DB_STORE, 'readwrite');
  tx.objectStore(DB_STORE).put({ id: 'session', ...data });
}

function idbLoad() {
  if (!db) return Promise.resolve(null);
  return new Promise((resolve) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get('session');
    req.onsuccess = (e) => resolve(e.target.result || null);
    req.onerror = () => resolve(null);
  });
}

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const timerEl      = document.getElementById('timer-display');
const phaseEl      = document.getElementById('phase-label');
const blockEl      = document.getElementById('block-display');
const dateEl       = document.getElementById('date-display');
const hintEl       = document.getElementById('timer-hint');
const participantsEl = document.getElementById('participants-list');
const countEl      = document.getElementById('participants-count');
const joinUrlEl    = document.getElementById('join-url');
const statusEl     = document.getElementById('connection-status');

const ringTrack    = document.getElementById('ring-track');
const ringTicksEl  = document.getElementById('ring-ticks');

const btnFocus  = document.getElementById('btn-focus');
const btnBreak  = document.getElementById('btn-break');
const btnStop   = document.getElementById('btn-stop');
const btnNext   = document.getElementById('btn-next');
const btnReset  = document.getElementById('btn-reset');

const resetModal    = document.getElementById('reset-modal');
const btnResetConfirm = document.getElementById('btn-reset-confirm');
const btnCancel     = document.getElementById('btn-cancel');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentState = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pad(n) { return String(n).padStart(2, '0'); }

function formatTime(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

function formatDate(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ---------------------------------------------------------------------------
// Render functions
// ---------------------------------------------------------------------------
function renderTimer(remaining, type) {
  timerEl.textContent = formatTime(remaining);
  timerEl.className = 'timer-display ' + (type || '');
}

function renderPhase(phase) {
  phaseEl.className = 'phase-label ' + (phase || '');
  if (phase === 'focus') phaseEl.textContent = 'Focus Block';
  else if (phase === 'break') phaseEl.textContent = 'Break';
  else phaseEl.textContent = '';
}

function renderHint(phase, running) {
  if (phase === 'focus' && running) hintEl.textContent = 'Timer running — stay focused';
  else if (phase === 'break' && running) hintEl.textContent = 'Break in progress — rest up';
  else hintEl.textContent = 'Ready to start';
}

function renderControls(phase) {
  const running = phase !== 'idle';
  btnFocus.disabled = (phase === 'focus');
  btnBreak.disabled = (phase === 'break');
  btnStop.disabled  = !running;
}

function renderParticipants(participants, currentBlock) {
  countEl.textContent = participants.length;

  if (!participants.length) {
    participantsEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">◎</div>
        <div class="empty-text">No participants yet</div>
        <div class="empty-sub">Share the join link above</div>
      </div>`;
    return;
  }

  participantsEl.innerHTML = participants.map((p) => {
    const taskIdx = currentBlock - 1;
    const task = (p.tasks && p.tasks[taskIdx]) ? p.tasks[taskIdx] : '(no task for this block)';
    const isDone = currentBlock > p.blockCount;
    const isActive = !isDone;
    const cardClass = isDone ? 'participant-card done' : 'participant-card active-block';
    const joinTime = new Date(p.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return `<div class="${cardClass}">
      <div class="participant-name">${escapeHtml(p.name)}</div>
      <div class="participant-task">${escapeHtml(task)}</div>
      <div class="participant-meta">
        <span>${p.blockCount} blocks</span>
        <span>·</span>
        <span>joined ${joinTime}</span>
        ${isDone ? '<span>· done</span>' : ''}
      </div>
    </div>`;
  }).join('');
}

function applyState(state) {
  currentState = state;

  dateEl.textContent = formatDate(state.session.date);
  blockEl.textContent = `Block ${state.session.currentBlock}`;

  renderPhase(state.session.phase);
  renderControls(state.session.phase);
  renderHint(state.session.phase, state.timer.running);

  const displayTime = state.timer.running
    ? state.timer.remaining
    : (state.session.phase === 'break' ? BREAK_DEFAULT : FOCUS_DEFAULT);

  renderTimer(displayTime, state.session.phase === 'idle' ? '' : state.session.phase);

  renderParticipants(state.participants || [], state.session.currentBlock);

  if (state.timer.running && state.timer.duration) {
    ringDuration = state.timer.duration;
    buildRingTicks(ringDuration);
    updateRing(state.timer.remaining, ringDuration, state.timer.type);
  } else {
    resetRing();
  }

  idbSave(state);
}

const FOCUS_DEFAULT = 25 * 60;
const BREAK_DEFAULT = 10 * 60;

// ---------------------------------------------------------------------------
// Audio — Web Audio API (tick + alarm)
// ---------------------------------------------------------------------------
let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

// Unlock AudioContext on first user gesture
document.addEventListener('pointerdown', () => { try { getAudioCtx(); } catch(e) {} }, { once: true });

function playTick() {
  try {
    const ctx  = getAudioCtx();
    const now  = ctx.currentTime;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1100, now);
    osc.frequency.exponentialRampToValueAtTime(750, now + 0.055);
    gain.gain.setValueAtTime(0.10, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.start(now);
    osc.stop(now + 0.07);
  } catch (e) {}
}

function playAlarm() {
  try {
    const ctx    = getAudioCtx();
    const now    = ctx.currentTime;
    // Ascending chime → brief pause → descending repeat (clock alarm feel)
    const notes  = [523.25, 659.25, 783.99, 1046.5, 783.99, 659.25, 523.25];
    const timing = [0, 0.18, 0.36, 0.54, 1.0, 1.18, 1.36];
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + timing[i];
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
      osc.start(t);
      osc.stop(t + 0.65);
    });
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// Progress ring
// ---------------------------------------------------------------------------
const RING_R             = 185;
const RING_CX            = 200;
const RING_CY            = 200;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R; // ≈ 1162.39

let ringDuration = FOCUS_DEFAULT;

function buildRingTicks(duration) {
  ringTicksEl.innerHTML = '';
  for (let elapsed = 5 * 60; elapsed < duration; elapsed += 5 * 60) {
    const fraction  = elapsed / duration;
    const angleDeg  = fraction * 360;
    const rad       = angleDeg * Math.PI / 180;
    // Coordinates are in the rotate(-90) group space → visual 12 o'clock = angle 0
    const x1 = (RING_CX + (RING_R - 13) * Math.cos(rad)).toFixed(2);
    const y1 = (RING_CY + (RING_R - 13) * Math.sin(rad)).toFixed(2);
    const x2 = (RING_CX + (RING_R + 10) * Math.cos(rad)).toFixed(2);
    const y2 = (RING_CY + (RING_R + 10) * Math.sin(rad)).toFixed(2);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('class', 'ring-tick');
    ringTicksEl.appendChild(line);
  }
}

function updateRing(remaining, duration, type) {
  const progress = Math.max(0, Math.min(1, remaining / duration));
  const offset   = RING_CIRCUMFERENCE * (1 - progress);
  ringTrack.style.strokeDasharray  = RING_CIRCUMFERENCE;
  ringTrack.style.strokeDashoffset = offset;
  ringTrack.className = 'ring-track ' + (type || 'idle');
}

function resetRing() {
  ringTrack.style.strokeDasharray  = RING_CIRCUMFERENCE;
  ringTrack.style.strokeDashoffset = 0;
  ringTrack.className = 'ring-track idle';
  ringTicksEl.innerHTML = '';
}

// ---------------------------------------------------------------------------
// Socket events
// ---------------------------------------------------------------------------
socket.on('connect', () => {
  statusEl.textContent = 'Connected';
  statusEl.className = 'status-connection connected';
});

socket.on('disconnect', () => {
  statusEl.textContent = 'Disconnected';
  statusEl.className = 'status-connection disconnected';
});

socket.on('session:state', (state) => {
  applyState(state);
});

socket.on('timer:start', ({ type, remaining, duration }) => {
  ringDuration = duration || (type === 'focus' ? FOCUS_DEFAULT : BREAK_DEFAULT);
  buildRingTicks(ringDuration);
  updateRing(remaining, ringDuration, type);
  renderTimer(remaining, type);
  renderPhase(type);
  renderControls(type);
  renderHint(type, true);
  if (currentState) {
    currentState.timer.running = true;
    currentState.timer.type = type;
    currentState.session.phase = type;
  }
});

socket.on('timer:tick', ({ remaining, type }) => {
  renderTimer(remaining, type);
  updateRing(remaining, ringDuration, type);
  if (remaining > 0 && remaining <= 30) playTick();
  if (currentState) currentState.timer.remaining = remaining;
});

socket.on('timer:end', ({ type }) => {
  playAlarm();
  renderTimer(0, type);
  updateRing(0, ringDuration, type);
  timerEl.classList.add('end');
  hintEl.textContent = type === 'focus' ? 'Focus block complete!' : 'Break complete!';
  setTimeout(() => {
    timerEl.classList.remove('end');
    resetRing();
  }, 2000);
  renderControls('idle');
  renderPhase('idle');
});

socket.on('timer:stopped', () => {
  resetRing();
  renderPhase('idle');
  renderControls('idle');
  renderHint('idle', false);
  if (currentState) {
    currentState.session.phase = 'idle';
    currentState.timer.running = false;
    renderTimer(FOCUS_DEFAULT, '');
  }
});

socket.on('participants:updated', ({ participants }) => {
  if (currentState) {
    currentState.participants = participants;
    renderParticipants(participants, currentState.session.currentBlock);
    countEl.textContent = participants.length;
  }
});

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
btnFocus.addEventListener('click', () => socket.emit('timer:startFocus'));
btnBreak.addEventListener('click', () => socket.emit('timer:startBreak'));
btnStop.addEventListener('click',  () => socket.emit('timer:stop'));
btnNext.addEventListener('click',  () => socket.emit('session:nextBlock'));

btnReset.addEventListener('click', () => {
  resetModal.style.display = 'flex';
});

btnResetConfirm.addEventListener('click', () => {
  resetModal.style.display = 'none';
  socket.emit('session:reset');
});

btnCancel.addEventListener('click', () => {
  resetModal.style.display = 'none';
});

// Close modal on overlay click
resetModal.addEventListener('click', (e) => {
  if (e.target === resetModal) resetModal.style.display = 'none';
});

// ---------------------------------------------------------------------------
// Fetch join URL for display
// ---------------------------------------------------------------------------
async function fetchInfo() {
  try {
    const res = await fetch('/api/info');
    const info = await res.json();
    joinUrlEl.textContent = info.joinUrl;
  } catch {
    joinUrlEl.textContent = `${location.hostname}:${location.port}/join`;
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
async function init() {
  db = await openDB();

  // Show cached state instantly while server responds
  const cached = await idbLoad();
  if (cached) {
    applyState(cached);
  } else {
    // Default display before first server message
    const today = new Date().toISOString().split('T')[0];
    dateEl.textContent = formatDate(today);
    renderTimer(FOCUS_DEFAULT, '');
    renderPhase('idle');
    renderControls('idle');
  }

  await fetchInfo();
}

init();
