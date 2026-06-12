const boardId = window.location.pathname.split('/').pop();
const sessionId = sessionStorage.getItem('sessionId');
const displayName = sessionStorage.getItem('displayName');
const socket = io();

let isAdmin = false;
let boardData = null;
let votedCards = new Set();

async function init() {
  const authRes = await fetch('/api/auth/status');
  const auth = await authRes.json();
  isAdmin = auth.logged_in;

  const res = await fetch(`/api/boards/${boardId}`);
  if (!res.ok) {
    document.body.innerHTML = '<div class="container"><div class="card-form"><h1>Access Denied</h1><p>You need a PIN to access this board. <a href="/">Go back</a></p></div></div>';
    return;
  }

  boardData = await res.json();
  document.getElementById('board-title').textContent = boardData.title;
  document.title = `Retro Board — ${boardData.title}`;

  if (isAdmin) {
    const lockToggle = document.getElementById('lock-toggle');
    lockToggle.style.display = 'flex';
    const lockCheckbox = document.getElementById('lock-checkbox');
    lockCheckbox.checked = !!boardData.is_locked;
    updateLockLabel(!!boardData.is_locked);

    lockCheckbox.addEventListener('change', async () => {
      const newState = lockCheckbox.checked;
      await fetch(`/api/boards/${boardId}/lock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_locked: newState })
      });
      socket.emit('board:lock', { is_locked: newState });
    });
  }

  updateLockState(!!boardData.is_locked);
  renderAllCards(boardData.cards);

  const joinName = isAdmin ? (auth.username || 'Admin') : (displayName || 'Anonymous');
  const joinSessionId = sessionId || `admin-${Date.now()}`;

  socket.emit('join-board', {
    boardId,
    sessionId: joinSessionId,
    display_name: joinName
  });
}

function updateLockLabel(locked) {
  document.getElementById('lock-label').textContent = locked ? 'Unlock Board' : 'Lock Board';
}

function updateLockState(locked) {
  const banner = document.getElementById('locked-banner');
  banner.style.display = locked ? 'block' : 'none';

  const addSections = document.querySelectorAll('.add-card');
  addSections.forEach(el => {
    el.style.display = locked ? 'none' : 'flex';
  });
}

function renderAllCards(cards) {
  const columns = ['went_well', 'to_improve', 'stop_doing', 'action_items'];
  columns.forEach(col => {
    document.getElementById(`cards-${col}`).innerHTML = '';
  });

  cards.forEach(card => renderCard(card));
}

function renderCard(card) {
  const container = document.getElementById(`cards-${card.column}`);
  const existing = document.getElementById(`card-${card.id}`);
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.className = 'card-item';
  div.id = `card-${card.id}`;

  const isOwn = card.session_id === sessionId || card.session_id === `admin-${sessionId}`;
  const hasVoted = votedCards.has(card.id);

  // Build card using DOM methods only — no innerHTML with user data
  if (card.assignee && card.column === 'action_items') {
    const assigneeEl = document.createElement('div');
    assigneeEl.className = 'card-assignee';
    assigneeEl.textContent = `→ ${card.assignee}`;
    div.appendChild(assigneeEl);
  }

  const textEl = document.createElement('div');
  textEl.className = 'card-text';
  textEl.textContent = card.text;
  div.appendChild(textEl);

  const metaEl = document.createElement('div');
  metaEl.className = 'card-meta';

  const authorEl = document.createElement('span');
  authorEl.className = 'card-author';
  authorEl.textContent = card.author;
  metaEl.appendChild(authorEl);

  const actionsEl = document.createElement('span');
  actionsEl.className = 'card-actions';

  const voteBtn = document.createElement('button');
  voteBtn.className = `vote-btn${hasVoted ? ' voted' : ''}`;
  voteBtn.disabled = hasVoted;
  voteBtn.addEventListener('click', () => voteCard(card.id));

  const voteEmoji = document.createTextNode('👍 ');
  voteBtn.appendChild(voteEmoji);

  const votesSpan = document.createElement('span');
  votesSpan.id = `votes-${card.id}`;
  votesSpan.textContent = card.votes || 0;
  voteBtn.appendChild(votesSpan);
  actionsEl.appendChild(voteBtn);

  if (isOwn) {
    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click', () => editCard(card.id));
    actionsEl.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '🗑️';
    deleteBtn.addEventListener('click', () => deleteCard(card.id));
    actionsEl.appendChild(deleteBtn);
  }

  metaEl.appendChild(actionsEl);
  div.appendChild(metaEl);
  container.appendChild(div);
}


async function addCard(column) {
  const input = document.getElementById(`input-${column}`);
  const text = input.value.trim();
  if (!text) return;

  let assignee = null;
  if (column === 'action_items') {
    const assigneeInput = document.getElementById('assignee-action_items');
    assignee = assigneeInput.value.trim() || null;
    assigneeInput.value = '';
  }

  const res = await fetch(`/api/boards/${boardId}/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ column, text, assignee })
  });

  if (res.ok) {
    const card = await res.json();
    renderCard(card);
    socket.emit('card:add', card);
    input.value = '';
    input.focus();
  }
}

async function editCard(cardId) {
  const cardEl = document.getElementById(`card-${cardId}`);
  const textEl = cardEl.querySelector('.card-text');
  const currentText = textEl.textContent;

  const newText = prompt('Edit card:', currentText);
  if (newText === null || newText.trim() === '' || newText === currentText) return;

  const res = await fetch(`/api/cards/${cardId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: newText.trim() })
  });

  if (res.ok) {
    const updated = await res.json();
    renderCard(updated);
    socket.emit('card:edit', updated);
  }
}

async function deleteCard(cardId) {
  if (!confirm('Delete this card?')) return;

  const res = await fetch(`/api/cards/${cardId}`, { method: 'DELETE' });
  if (res.ok) {
    const el = document.getElementById(`card-${cardId}`);
    if (el) el.remove();
    socket.emit('card:delete', { id: cardId });
  }
}

async function voteCard(cardId) {
  const res = await fetch(`/api/cards/${cardId}/vote`, { method: 'POST' });
  if (res.ok) {
    const data = await res.json();
    votedCards.add(cardId);
    const votesEl = document.getElementById(`votes-${cardId}`);
    if (votesEl) votesEl.textContent = data.votes;
    const btn = votesEl?.closest('.vote-btn');
    if (btn) {
      btn.classList.add('voted');
      btn.disabled = true;
    }
    socket.emit('card:vote', { id: cardId, votes: data.votes });
  }
}

// Socket.IO event listeners
socket.on('card:added', (card) => {
  if (!document.getElementById(`card-${card.id}`)) {
    renderCard(card);
  }
});

socket.on('card:edited', (card) => {
  renderCard(card);
});

socket.on('card:deleted', (data) => {
  const el = document.getElementById(`card-${data.id}`);
  if (el) el.remove();
});

socket.on('card:voted', (data) => {
  const votesEl = document.getElementById(`votes-${data.id}`);
  if (votesEl) votesEl.textContent = data.votes;
});

socket.on('board:locked', (data) => {
  updateLockState(data.is_locked);
  if (isAdmin) {
    document.getElementById('lock-checkbox').checked = data.is_locked;
    updateLockLabel(data.is_locked);
  }
});

socket.on('presence:updated', (data) => {
  const parts = [];
  if (data.names.length > 0) parts.push(data.names.join(', '));
  if (data.anonCount > 0) parts.push(`${data.anonCount} anonymous`);
  document.getElementById('presence').textContent = 'Online: ' + (parts.join(', ') || 'Just you');
});

socket.on('connect', () => {
  if (boardData) {
    const authName = displayName || 'Admin';
    const sid = sessionId || `admin-${Date.now()}`;
    socket.emit('join-board', { boardId, sessionId: sid, display_name: authName });
  }
});

// Allow Enter key to add cards
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('.add-card input[id^="input-"]')) {
    const column = e.target.id.replace('input-', '');
    addCard(column);
  }
});

init();
