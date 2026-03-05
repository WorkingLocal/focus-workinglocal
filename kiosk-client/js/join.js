'use strict';

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
      <label for="task-${i}">Block ${i}</label>
      <input
        type="text"
        id="task-${i}"
        name="task-${i}"
        placeholder="What will you work on?"
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
    errorMsg.textContent = 'Please enter your name.';
    return;
  }
  if (!blockCount) {
    errorMsg.textContent = 'Please choose 6 or 12 focus blocks.';
    return;
  }

  // Collect tasks (allow empty strings, they default server-side)
  const tasks = [];
  for (let i = 1; i <= blockCount; i++) {
    const input = document.getElementById(`task-${i}`);
    tasks.push(input ? input.value.trim() : '');
  }

  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Joining…';

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
    errorMsg.textContent = err.message || 'Could not join. Please try again.';
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Join Session';
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

  confirmNameEl.textContent = participantData.name;
  confirmBlocksEl.textContent = `${participantData.blockCount} blocks`;
}

function updateParticipantView(state) {
  if (!hasJoined || !participantData) return;

  currentBlockEl.textContent = `Block ${state.session.currentBlock}`;

  const phase = state.session.phase;
  currentPhaseEl.className = `phase-badge ${phase}`;
  if (phase === 'focus')      currentPhaseEl.textContent = 'Focus';
  else if (phase === 'break') currentPhaseEl.textContent = 'Break';
  else                        currentPhaseEl.textContent = 'Waiting';

  if (state.timer.remaining > 0) {
    currentTimerEl.textContent = formatTime(state.timer.remaining);
  } else {
    currentTimerEl.textContent = '—:——';
  }

  const taskIdx = state.session.currentBlock - 1;
  const myTask = participantData.tasks[taskIdx] || '(no task set for this block)';
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
  currentPhaseEl.textContent = type === 'focus' ? 'Focus' : 'Break';
});

socket.on('timer:end', ({ type }) => {
  if (!hasJoined) return;
  currentTimerEl.textContent = '—:——';
  currentPhaseEl.className = 'phase-badge idle';
  currentPhaseEl.textContent = 'Waiting';
});

socket.on('timer:stopped', () => {
  if (!hasJoined) return;
  currentTimerEl.textContent = '—:——';
  currentPhaseEl.className = 'phase-badge idle';
  currentPhaseEl.textContent = 'Waiting';
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
