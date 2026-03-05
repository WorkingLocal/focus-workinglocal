'use strict';

// ---------------------------------------------------------------------------
// i18n — NL / EN translations
// ---------------------------------------------------------------------------
const TRANSLATIONS = {
  en: {
    brandSub:       'Focus Session',
    nameLabel:      'Your Name',
    namePlaceholder:'e.g. Alex',
    blocksLabel:    'Focus Blocks',
    block6title:    '6 Blocks',
    block6sub:      '~3 hours',
    block12title:   '12 Blocks',
    block12sub:     '~6 hours',
    tasksLabel:     'Tasks Per Block',
    tasksHint:      'What will you work on in each 25-minute block?',
    blockN:         n => `Block ${n}`,
    taskPlaceholder:'What will you work on?',
    btnSubmit:      'Join Session',
    btnJoining:     'Joining…',
    errName:        'Please enter your name.',
    errBlocks:      'Please choose 6 or 12 focus blocks.',
    confirmBlocks:  n => `${n} blocks`,
    currentBlockLabel: 'Current Block',
    blockDisplay:   n => `Block ${n}`,
    phaseLabel:     'Phase',
    timerLabel:     'Timer',
    myTaskLabel:    'Your task this block:',
    phaseWaiting:   'Waiting',
    phaseFocus:     'Focus',
    phaseBreak:     'Break',
    btnUpdate:      'Update My Tasks',
    noTask:         '(no task set for this block)',
  },
  nl: {
    brandSub:       'Focussessie',
    nameLabel:      'Jouw naam',
    namePlaceholder:'bijv. Alex',
    blocksLabel:    'Focus blokken',
    block6title:    '6 Blokken',
    block6sub:      '~3 uur',
    block12title:   '12 Blokken',
    block12sub:     '~6 uur',
    tasksLabel:     'Taken per blok',
    tasksHint:      'Waar werk je aan in elk 25-minutenblok?',
    blockN:         n => `Blok ${n}`,
    taskPlaceholder:'Waar werk je aan?',
    btnSubmit:      'Sessie deelnemen',
    btnJoining:     'Bezig…',
    errName:        'Vul jouw naam in.',
    errBlocks:      'Kies 6 of 12 focus blokken.',
    confirmBlocks:  n => `${n} blokken`,
    currentBlockLabel: 'Huidig blok',
    blockDisplay:   n => `Blok ${n}`,
    phaseLabel:     'Fase',
    timerLabel:     'Timer',
    myTaskLabel:    'Jouw taak dit blok:',
    phaseWaiting:   'Wachten',
    phaseFocus:     'Focus',
    phaseBreak:     'Pauze',
    btnUpdate:      'Taken bijwerken',
    noTask:         '(geen taak ingesteld voor dit blok)',
  },
};

let currentLang = localStorage.getItem('focus-lang') || 'nl';

function tr(key, arg) {
  const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.nl;
  const val  = dict[key];
  return typeof val === 'function' ? val(arg) : (val ?? key);
}

function applyStaticTranslations() {
  const get = id => document.getElementById(id);

  if (get('brand-sub-el'))       get('brand-sub-el').textContent       = tr('brandSub');
  if (get('name-label-el'))      get('name-label-el').textContent      = tr('nameLabel');
  if (get('name'))               get('name').placeholder               = tr('namePlaceholder');
  if (get('blocks-label-el'))    get('blocks-label-el').textContent    = tr('blocksLabel');
  if (get('choice-6-title'))     get('choice-6-title').textContent     = tr('block6title');
  if (get('choice-6-sub'))       get('choice-6-sub').textContent       = tr('block6sub');
  if (get('choice-12-title'))    get('choice-12-title').textContent    = tr('block12title');
  if (get('choice-12-sub'))      get('choice-12-sub').textContent      = tr('block12sub');
  if (get('tasks-label-el'))     get('tasks-label-el').textContent     = tr('tasksLabel');
  if (get('tasks-hint-el'))      get('tasks-hint-el').textContent      = tr('tasksHint');
  if (get('current-block-label-el')) get('current-block-label-el').textContent = tr('currentBlockLabel');
  if (get('phase-label-el'))     get('phase-label-el').textContent     = tr('phaseLabel');
  if (get('timer-label-el'))     get('timer-label-el').textContent     = tr('timerLabel');
  if (get('my-task-label-el'))   get('my-task-label-el').textContent   = tr('myTaskLabel');
  if (get('btn-update-el'))      get('btn-update-el').textContent      = tr('btnUpdate');

  // Submit button (only if not in joining state)
  if (btnSubmit && !btnSubmit.disabled) btnSubmit.textContent = tr('btnSubmit');

  // Regenerate task fields in current language if visible
  const count = getSelectedBlockCount();
  if (count) generateTaskFields(count);
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
// State
// ---------------------------------------------------------------------------
let participantData = null; // { name, blockCount, tasks }
let hasJoined = false;

// ---------------------------------------------------------------------------
// DOM refs — form
// ---------------------------------------------------------------------------
const formSection   = document.getElementById('form-section');
const confirmSection = document.getElementById('confirm-section');
const joinForm      = document.getElementById('join-form');
const nameInput     = document.getElementById('name');
const radios        = document.querySelectorAll('input[name="blockCount"]');
const tasksSection  = document.getElementById('tasks-section');
const tasksContainer = document.getElementById('tasks-container');
const errorMsg      = document.getElementById('error-msg');
const btnSubmit     = document.getElementById('btn-submit');

// DOM refs — confirm view
const confirmNameEl  = document.getElementById('confirm-name');
const confirmBlocksEl = document.getElementById('confirm-blocks');
const currentBlockEl = document.getElementById('current-block');
const currentPhaseEl = document.getElementById('current-phase');
const currentTimerEl = document.getElementById('current-timer');
const myTaskEl       = document.getElementById('my-task');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pad(n) { return String(n).padStart(2, '0'); }

function formatTime(s) {
  const sec = Math.max(0, s);
  return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
}

function getSelectedBlockCount() {
  const checked = document.querySelector('input[name="blockCount"]:checked');
  return checked ? parseInt(checked.value) : null;
}

// ---------------------------------------------------------------------------
// Dynamic task fields
// ---------------------------------------------------------------------------
function generateTaskFields(count) {
  tasksContainer.innerHTML = '';
  for (let i = 1; i <= count; i++) {
    const div = document.createElement('div');
    div.className = 'task-field';
    div.innerHTML = `
      <label for="task-${i}">${tr('blockN', i)}</label>
      <input
        type="text"
        id="task-${i}"
        name="task-${i}"
        placeholder="${tr('taskPlaceholder')}"
        maxlength="120"
        autocomplete="off"
      />`;
    tasksContainer.appendChild(div);
  }
}

// Block count radio change
radios.forEach((radio) => {
  radio.addEventListener('change', () => {
    const count = getSelectedBlockCount();
    if (!count) return;
    tasksSection.style.display = 'flex';
    generateTaskFields(count);
    validateForm();
  });
});

// Name input validation
nameInput.addEventListener('input', validateForm);

function validateForm() {
  const nameOk = nameInput.value.trim().length > 0;
  const blockOk = getSelectedBlockCount() !== null;
  btnSubmit.disabled = !(nameOk && blockOk);
}

// ---------------------------------------------------------------------------
// Form submission
// ---------------------------------------------------------------------------
joinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorMsg.textContent = '';

  const name = nameInput.value.trim();
  const blockCount = getSelectedBlockCount();

  if (!name) {
    errorMsg.textContent = tr('errName');
    return;
  }
  if (!blockCount) {
    errorMsg.textContent = tr('errBlocks');
    return;
  }

  // Collect tasks (allow empty strings, they default server-side)
  const tasks = [];
  for (let i = 1; i <= blockCount; i++) {
    const input = document.getElementById(`task-${i}`);
    tasks.push(input ? input.value.trim() : '');
  }

  btnSubmit.disabled = true;
  btnSubmit.textContent = tr('btnJoining');

  try {
    const res = await fetch('/api/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, blockCount, tasks }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Server error ${res.status}`);
    }

    participantData = { name, blockCount, tasks };
    hasJoined = true;

    // Persist to localStorage so the participant view survives page refresh
    localStorage.setItem('focus-participant', JSON.stringify(participantData));

    showConfirmView();

  } catch (err) {
    errorMsg.textContent = err.message || tr('errName');
    btnSubmit.disabled = false;
    btnSubmit.textContent = tr('btnSubmit');
  }
});

// ---------------------------------------------------------------------------
// Confirm / participant live view
// ---------------------------------------------------------------------------
function showConfirmView() {
  formSection.style.display = 'none';
  confirmSection.style.display = 'flex';
  confirmSection.style.flexDirection = 'column';
  confirmSection.style.gap = '16px';

  confirmNameEl.textContent  = participantData.name;
  confirmBlocksEl.textContent = tr('confirmBlocks', participantData.blockCount);
}

function updateParticipantView(state) {
  if (!hasJoined || !participantData) return;

  currentBlockEl.textContent = tr('blockDisplay', state.session.currentBlock);

  const phase = state.session.phase;
  currentPhaseEl.className = `phase-badge ${phase}`;
  if (phase === 'focus')      currentPhaseEl.textContent = tr('phaseFocus');
  else if (phase === 'break') currentPhaseEl.textContent = tr('phaseBreak');
  else                        currentPhaseEl.textContent = tr('phaseWaiting');

  if (state.timer.remaining > 0) {
    currentTimerEl.textContent = formatTime(state.timer.remaining);
  } else {
    currentTimerEl.textContent = '—:——';
  }

  const taskIdx = state.session.currentBlock - 1;
  const myTask = participantData.tasks[taskIdx] || tr('noTask');
  myTaskEl.textContent = myTask;
}

// ---------------------------------------------------------------------------
// Socket events — live updates for participant view
// ---------------------------------------------------------------------------
socket.on('session:state', updateParticipantView);

socket.on('timer:tick', ({ remaining, type }) => {
  if (!hasJoined) return;
  currentTimerEl.textContent = formatTime(remaining);
});

socket.on('timer:start', ({ type, remaining }) => {
  if (!hasJoined) return;
  currentTimerEl.textContent = formatTime(remaining);
  currentPhaseEl.className = `phase-badge ${type}`;
  currentPhaseEl.textContent = type === 'focus' ? tr('phaseFocus') : tr('phaseBreak');
});

socket.on('timer:end', () => {
  if (!hasJoined) return;
  currentTimerEl.textContent = '—:——';
  currentPhaseEl.className = 'phase-badge idle';
  currentPhaseEl.textContent = tr('phaseWaiting');
});

socket.on('timer:stopped', () => {
  if (!hasJoined) return;
  currentTimerEl.textContent = '—:——';
  currentPhaseEl.className = 'phase-badge idle';
  currentPhaseEl.textContent = tr('phaseWaiting');
});

// ---------------------------------------------------------------------------
// Restore previous join from localStorage
// ---------------------------------------------------------------------------
function restorePreviousJoin() {
  try {
    const saved = localStorage.getItem('focus-participant');
    if (!saved) return;

    const data = JSON.parse(saved);
    if (!data.name || !data.blockCount || !Array.isArray(data.tasks)) return;

    // Pre-fill the form
    nameInput.value = data.name;
    const radio = document.querySelector(`input[name="blockCount"][value="${data.blockCount}"]`);
    if (radio) {
      radio.checked = true;
      tasksSection.style.display = 'flex';
      generateTaskFields(data.blockCount);
      data.tasks.forEach((task, idx) => {
        const input = document.getElementById(`task-${idx + 1}`);
        if (input) input.value = task;
      });
    }
    validateForm();
  } catch {
    localStorage.removeItem('focus-participant');
  }
}

restorePreviousJoin();

// Language toggle
document.querySelectorAll('.lang-btn').forEach(btn =>
  btn.addEventListener('click', () => setLang(btn.dataset.lang))
);
setLang(currentLang);
