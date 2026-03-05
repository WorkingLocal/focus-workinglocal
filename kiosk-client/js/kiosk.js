'use strict';

// ---------------------------------------------------------------------------
// i18n — NL / EN translations
// ---------------------------------------------------------------------------
const TRANSLATIONS = {
  en: {
    phaseLabel_focus:  'Focus Block',
    phaseLabel_break:  'Break',
    hint_focus:        'Timer running — stay focused',
    hint_break:        'Break in progress — rest up',
    hint_idle:         'Ready to start',
    blockDisplay:      n => `Block ${n}`,
    noTask:            '(no task for this block)',
    emptyText:         'No participants yet',
    emptySub:          'Share the join link above',
    joinLabel:         'Participants join at:',
    participantsTitle: 'Participants',
    focusComplete:     'Focus block complete!',
    breakComplete:     'Break complete!',
    blocksWord:        'blocks',
    joinedWord:        'joined',
    doneWord:          'done',
    btnFocus:          'Start Focus',
    btnBreak:          'Start Break',
    btnStop:           'Stop',
    btnNext:           'Next Block',
    btnReset:          'Reset',
    modalTitle:        'Reset Session?',
    modalBody:         'This will clear all participants and return to Block 1. This cannot be undone.',
    btnResetConfirm:   'Yes, Reset',
    btnCancel:         'Cancel',
    statusApp:         'Working Local · Focus Kiosk v1.1.1',
    connecting:        'Connecting…',
    connected:         'Connected',
    disconnected:      'Disconnected',
    dateLocale:        'en-US',
  },
  nl: {
    phaseLabel_focus:  'Focus Blok',
    phaseLabel_break:  'Pauze',
    hint_focus:        'Timer loopt — blijf geconcentreerd',
    hint_break:        'Pauze bezig — rust even uit',
    hint_idle:         'Klaar om te starten',
    blockDisplay:      n => `Blok ${n}`,
    noTask:            '(geen taak voor dit blok)',
    emptyText:         'Nog geen deelnemers',
    emptySub:          'Deel de link hierboven',
    joinLabel:         'Deelnemers verbinden via:',
    participantsTitle: 'Deelnemers',
    focusComplete:     'Focus blok voltooid!',
    breakComplete:     'Pauze voltooid!',
    blocksWord:        'blokken',
    joinedWord:        'ingeschreven',
    doneWord:          'klaar',
    btnFocus:          'Start Focus',
    btnBreak:          'Start Pauze',
    btnStop:           'Stop',
    btnNext:           'Volgend Blok',
    btnReset:          'Herstart',
    modalTitle:        'Sessie herstarten?',
    modalBody:         'Dit wist alle deelnemers en keert terug naar Blok 1. Dit kan niet ongedaan worden gemaakt.',
    btnResetConfirm:   'Ja, herstarten',
    btnCancel:         'Annuleren',
    statusApp:         'Working Local · Focus Kiosk v1.1.1',
    connecting:        'Verbinden…',
    connected:         'Verbonden',
    disconnected:      'Verbroken',
    dateLocale:        'nl-BE',
  },
};

let currentLang = localStorage.getItem('focus-lang') || 'nl';

function tr(key, arg) {
  const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.nl;
  const val  = dict[key];
  return typeof val === 'function' ? val(arg) : (val ?? key);
}

function applyStaticTranslations() {
  document.querySelector('.participants-title').textContent        = tr('participantsTitle');
  document.querySelector('.header-join-label').textContent         = tr('joinLabel');
  document.querySelector('#reset-modal h2').textContent            = tr('modalTitle');
  document.querySelector('#reset-modal p').textContent             = tr('modalBody');
  document.querySelector('.status-app').textContent                = tr('statusApp');
  document.querySelector('#btn-focus span:last-child').textContent = tr('btnFocus');
  document.querySelector('#btn-break span:last-child').textContent = tr('btnBreak');
  document.querySelector('#btn-stop span:last-child').textContent  = tr('btnStop');
  document.querySelector('#btn-next span:last-child').textContent  = tr('btnNext');
  document.querySelector('#btn-reset span:last-child').textContent = tr('btnReset');
  btnResetConfirm.textContent = tr('btnResetConfirm');
  btnCancel.textContent       = tr('btnCancel');

  // Update connection status text to match current state
  const cls = statusEl.className;
  statusEl.textContent = cls.includes('connected') && !cls.includes('disconnected')
    ? tr('connected')
    : cls.includes('disconnected') ? tr('disconnected') : tr('connecting');

  // Re-render dynamic parts using current state
  if (currentState) {
    blockEl.textContent = tr('blockDisplay', currentState.session.currentBlock);
    dateEl.textContent  = formatDate(currentState.session.date);
    renderPhase(currentState.session.phase);
    renderHint(currentState.session.phase, currentState.timer.running);
    renderParticipants(currentState.participants || [], currentState.session.currentBlock);
  }
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('focus-lang', lang);
  document.querySelectorAll('.lang-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.lang === lang)
  );
  applyStaticTranslations();
}

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
const timeEl       = document.getElementById('time-display');
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
  return d.toLocaleDateString(tr('dateLocale'), {
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
  if (phase === 'focus') phaseEl.textContent = tr('phaseLabel_focus');
  else if (phase === 'break') phaseEl.textContent = tr('phaseLabel_break');
  else phaseEl.textContent = '';
}

function renderHint(phase, running) {
  if (phase === 'focus' && running) hintEl.textContent = tr('hint_focus');
  else if (phase === 'break' && running) hintEl.textContent = tr('hint_break');
  else hintEl.textContent = tr('hint_idle');
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
        <div class="empty-text">${tr('emptyText')}</div>
        <div class="empty-sub">${tr('emptySub')}</div>
      </div>`;
    return;
  }

  participantsEl.innerHTML = participants.map((p) => {
    const taskIdx = currentBlock - 1;
    const task = (p.tasks && p.tasks[taskIdx]) ? p.tasks[taskIdx] : tr('noTask');
    const isDone = currentBlock > p.blockCount;
    const cardClass = isDone ? 'participant-card done' : 'participant-card active-block';
    const joinTime = new Date(p.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return `<div class="${cardClass}">
      <div class="participant-name">${escapeHtml(p.name)}</div>
      <div class="participant-task">${escapeHtml(task)}</div>
      <div class="participant-meta">
        <span>${p.blockCount} ${tr('blocksWord')}</span>
        <span>·</span>
        <span>${tr('joinedWord')} ${joinTime}</span>
        ${isDone ? `<span>· ${tr('doneWord')}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

function applyState(state) {
  currentState = state;

  dateEl.textContent  = formatDate(state.session.date);
  blockEl.textContent = tr('blockDisplay', state.session.currentBlock);

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

function buildRingTicks() {
  ringTicksEl.innerHTML = ''; // markers disabled
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
  buildRingTicks(FOCUS_DEFAULT);
}

// ---------------------------------------------------------------------------
// Socket events
// ---------------------------------------------------------------------------
socket.on('connect', () => {
  statusEl.textContent = tr('connected');
  statusEl.className = 'status-connection connected';
});

socket.on('disconnect', () => {
  statusEl.textContent = tr('disconnected');
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

  // First 15 s after start: ticking
  if (remaining > 0 && remaining >= ringDuration - 15) {
    playTick();
  // Focus only: warning bell at 10 min and 5 min remaining
  } else if (type === 'focus' && (remaining === 600 || remaining === 300)) {
    playAlarm();
  // Last 30 s: ticking
  } else if (remaining > 0 && remaining <= 30) {
    playTick();
  }

  if (currentState) currentState.timer.remaining = remaining;
});

socket.on('timer:end', ({ type }) => {
  playAlarm();
  renderTimer(0, type);
  updateRing(0, ringDuration, type);
  timerEl.classList.add('end');
  hintEl.textContent = type === 'focus' ? tr('focusComplete') : tr('breakComplete');
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
// Digital clock — 24 h
// ---------------------------------------------------------------------------
function updateClock() {
  const now = new Date();
  if (timeEl) timeEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// ---------------------------------------------------------------------------
// Fetch join URL for display
// ---------------------------------------------------------------------------
async function fetchInfo() {
  const port = location.port ? `:${location.port}` : '';
  joinUrlEl.textContent = `${location.hostname}${port}/join`;
  try {
    const res = await fetch('/api/info');
    const info = await res.json();
    if (info.joinUrl) joinUrlEl.textContent = info.joinUrl;
  } catch { /* already showing local address */ }
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
    resetRing();
  }

  await fetchInfo();

  // Clock
  updateClock();
  setInterval(updateClock, 1000);

  // Language toggle
  document.querySelectorAll('.lang-btn').forEach(btn =>
    btn.addEventListener('click', () => setLang(btn.dataset.lang))
  );
  setLang(currentLang); // apply translations + mark active button
}

init();
