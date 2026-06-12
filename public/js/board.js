const boardId = window.location.pathname.split('/').pop();
const sessionId = sessionStorage.getItem('sessionId');
const displayName = sessionStorage.getItem('displayName');
const socket = io();

let isAdmin = false;
let boardData = null;
let myReactions = {}; // { cardId: 'reaction_type' }

const AVATARS = {
  chris_happy:  { label: 'Chris 😊', file: 'chris-happy.png' },
  chris_grumpy: { label: 'Chris 😠', file: 'chris-grumpy.png' },
  phani_happy:  { label: 'Phani 😊', file: 'phani-happy.png' },
  phani_grumpy: { label: 'Phani 😠', file: 'phani-grumpy.png' },
  scott_happy:  { label: 'Scott 😊', file: 'scott-happy.png' },
  scott_grumpy: { label: 'Scott 😠', file: 'scott-grumpy.png' },
};

const REACTION_TYPES = [
  { type: 'thumbs_up', emoji: '👍' },
  { type: 'thumbs_down', emoji: '👎' },
  { type: 'heart', emoji: '❤️' },
  { type: 'chris_happy', avatar: true },
  { type: 'chris_grumpy', avatar: true },
  { type: 'phani_happy', avatar: true },
  { type: 'phani_grumpy', avatar: true },
  { type: 'scott_happy', avatar: true },
  { type: 'scott_grumpy', avatar: true },
];

// Pending attachments for card being composed
const pendingAttachments = {};

// Timer state
let timerInterval = null;

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
    document.getElementById('lock-toggle').style.display = 'flex';
    const lockCheckbox = document.getElementById('lock-checkbox');
    lockCheckbox.checked = !!boardData.is_locked;
    updateLockLabel(!!boardData.is_locked);
    lockCheckbox.addEventListener('change', async () => {
      await fetch(`/api/boards/${boardId}/lock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_locked: lockCheckbox.checked })
      });
      socket.emit('board:lock', { is_locked: lockCheckbox.checked });
    });

    // Show timer button
    document.getElementById('timer-btn').style.display = 'inline-block';
  }

  updateLockState(!!boardData.is_locked);
  renderAllCards(boardData.cards);

  const joinName = isAdmin ? (auth.username || 'Admin') : (displayName || 'Anonymous');
  const joinSessionId = sessionId || `admin-${Date.now()}`;
  socket.emit('join-board', { boardId, sessionId: joinSessionId, display_name: joinName });
}

function updateLockLabel(locked) {
  document.getElementById('lock-label').textContent = locked ? 'Unlock Board' : 'Lock Board';
}

function updateLockState(locked) {
  document.getElementById('locked-banner').style.display = locked ? 'block' : 'none';
  document.querySelectorAll('.add-card').forEach(el => {
    el.style.display = locked ? 'none' : 'flex';
  });
}

function renderAllCards(cards) {
  ['went_well', 'to_improve', 'stop_doing', 'action_items'].forEach(col => {
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

  // Assignee
  if (card.assignee && card.column === 'action_items') {
    const assigneeEl = document.createElement('div');
    assigneeEl.className = 'card-assignee';
    assigneeEl.textContent = `→ ${card.assignee}`;
    div.appendChild(assigneeEl);
  }

  // Text
  if (card.text) {
    const textEl = document.createElement('div');
    textEl.className = 'card-text';
    textEl.textContent = card.text;
    div.appendChild(textEl);
  }

  // Avatar embed
  if (card.avatar && AVATARS[card.avatar]) {
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'card-avatar-embed';
    const img = document.createElement('img');
    img.src = `/images/avatars/${AVATARS[card.avatar].file}`;
    img.alt = AVATARS[card.avatar].label;
    img.title = AVATARS[card.avatar].label;
    avatarDiv.appendChild(img);
    div.appendChild(avatarDiv);
  }

  // GIF embed
  if (card.gif_url) {
    const gifDiv = document.createElement('div');
    gifDiv.className = 'card-gif-embed';
    const img = document.createElement('img');
    img.src = card.gif_url;
    img.alt = 'GIF';
    img.loading = 'lazy';
    gifDiv.appendChild(img);
    div.appendChild(gifDiv);
  }

  // Meta row: author + actions
  const metaEl = document.createElement('div');
  metaEl.className = 'card-meta';

  const authorEl = document.createElement('span');
  authorEl.className = 'card-author';
  authorEl.textContent = card.author;
  metaEl.appendChild(authorEl);

  if (isOwn) {
    const ownActions = document.createElement('span');
    ownActions.className = 'card-own-actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click', () => editCard(card.id));
    ownActions.appendChild(editBtn);
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '🗑️';
    deleteBtn.addEventListener('click', () => deleteCard(card.id));
    ownActions.appendChild(deleteBtn);
    metaEl.appendChild(ownActions);
  }

  div.appendChild(metaEl);

  // Reactions row
  const reactions = card.reactions || {};
  const reactionsRow = document.createElement('div');
  reactionsRow.className = 'card-reactions';
  reactionsRow.id = `reactions-${card.id}`;

  renderReactionsRow(reactionsRow, card.id, reactions);
  div.appendChild(reactionsRow);

  container.appendChild(div);
}

function renderReactionsRow(container, cardId, reactions) {
  container.innerHTML = '';

  // Show existing reaction counts
  const summary = document.createElement('div');
  summary.className = 'reaction-summary';

  for (const rt of REACTION_TYPES) {
    const count = reactions[rt.type] || 0;
    if (count > 0) {
      const badge = document.createElement('span');
      badge.className = 'reaction-badge';
      if (myReactions[cardId] === rt.type) badge.classList.add('my-reaction');

      if (rt.avatar) {
        const img = document.createElement('img');
        img.src = `/images/avatars/${AVATARS[rt.type].file}`;
        img.alt = AVATARS[rt.type].label;
        img.className = 'reaction-avatar-img';
        badge.appendChild(img);
      } else {
        badge.appendChild(document.createTextNode(rt.emoji));
      }
      const countSpan = document.createElement('span');
      countSpan.textContent = ` ${count}`;
      badge.appendChild(countSpan);

      badge.addEventListener('click', () => reactToCard(cardId, rt.type));
      summary.appendChild(badge);
    }
  }
  container.appendChild(summary);

  // Add reaction button (+ emoji face)
  const addBtn = document.createElement('button');
  addBtn.className = 'add-reaction-btn';
  addBtn.textContent = '😀+';
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showReactionPicker(cardId, addBtn);
  });
  container.appendChild(addBtn);
}

function showReactionPicker(cardId, anchorEl) {
  // Remove any existing picker
  const existing = document.querySelector('.reaction-picker');
  if (existing) existing.remove();

  const picker = document.createElement('div');
  picker.className = 'reaction-picker';

  for (const rt of REACTION_TYPES) {
    const btn = document.createElement('button');
    btn.className = 'reaction-option';
    if (myReactions[cardId] === rt.type) btn.classList.add('selected');

    if (rt.avatar) {
      const img = document.createElement('img');
      img.src = `/images/avatars/${AVATARS[rt.type].file}`;
      img.alt = AVATARS[rt.type].label;
      img.title = AVATARS[rt.type].label;
      btn.appendChild(img);
    } else {
      btn.textContent = rt.emoji;
      btn.title = rt.type.replace('_', ' ');
    }

    btn.addEventListener('click', () => {
      reactToCard(cardId, rt.type);
      picker.remove();
    });
    picker.appendChild(btn);
  }

  anchorEl.parentElement.appendChild(picker);

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function closePicker(e) {
      if (!picker.contains(e.target)) {
        picker.remove();
        document.removeEventListener('click', closePicker);
      }
    });
  }, 0);
}

async function reactToCard(cardId, type) {
  const res = await fetch(`/api/cards/${cardId}/react`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type })
  });
  if (res.ok) {
    const data = await res.json();
    // Track my reaction
    if (myReactions[cardId] === type) {
      delete myReactions[cardId]; // toggled off
    } else {
      myReactions[cardId] = type;
    }
    updateReactionsDisplay(cardId, data.reactions);
    socket.emit('card:react', { id: cardId, reactions: data.reactions });
  }
}

function updateReactionsDisplay(cardId, reactions) {
  const container = document.getElementById(`reactions-${cardId}`);
  if (container) renderReactionsRow(container, cardId, reactions);
}

async function addCard(column) {
  const input = document.getElementById(`input-${column}`);
  const text = input.value.trim();

  let assignee = null;
  if (column === 'action_items') {
    const assigneeInput = document.getElementById('assignee-action_items');
    assignee = assigneeInput.value.trim() || null;
    assigneeInput.value = '';
  }

  const gifUrl = pendingAttachments[column]?.gif || null;
  const avatar = pendingAttachments[column]?.avatar || null;

  if (!text && !gifUrl && !avatar) return;

  const res = await fetch(`/api/boards/${boardId}/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ column, text: text || null, assignee, gif_url: gifUrl, avatar })
  });

  if (res.ok) {
    const card = await res.json();
    renderCard(card);
    socket.emit('card:add', card);
    input.value = '';
    input.focus();
    clearPendingAttachments(column);
  }
}

function clearPendingAttachments(column) {
  delete pendingAttachments[column];
  const preview = document.getElementById(`preview-${column}`);
  if (preview) preview.innerHTML = '';
}

function showAttachmentPreview(column) {
  const preview = document.getElementById(`preview-${column}`);
  if (!preview) return;
  preview.innerHTML = '';

  const att = pendingAttachments[column];
  if (!att) return;

  if (att.gif) {
    const img = document.createElement('img');
    img.src = att.gif;
    img.style.maxHeight = '60px';
    img.style.borderRadius = '4px';
    preview.appendChild(img);
  }
  if (att.avatar) {
    const img = document.createElement('img');
    img.src = `/images/avatars/${AVATARS[att.avatar].file}`;
    img.style.maxHeight = '40px';
    preview.appendChild(img);
  }

  const removeBtn = document.createElement('button');
  removeBtn.textContent = '✕';
  removeBtn.className = 'remove-attachment';
  removeBtn.addEventListener('click', () => clearPendingAttachments(column));
  preview.appendChild(removeBtn);
}

// GIF Search
const TENOR_API_KEY = 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ'; // free Tenor API key

function openGifSearch(column) {
  const modal = document.getElementById('gif-modal');
  modal.classList.add('active');
  modal.dataset.column = column;
  const searchInput = document.getElementById('gif-search-input');
  searchInput.value = '';
  searchInput.focus();
  document.getElementById('gif-results').innerHTML = '<p style="color:#888;text-align:center;padding:20px">Search for a GIF...</p>';
}

async function searchGifs(query) {
  if (!query.trim()) return;
  const results = document.getElementById('gif-results');
  results.innerHTML = '<p style="color:#888;text-align:center;padding:20px">Searching...</p>';

  try {
    const res = await fetch(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${TENOR_API_KEY}&limit=20&media_filter=gif,tinygif`);
    const data = await res.json();

    results.innerHTML = '';
    if (!data.results || data.results.length === 0) {
      results.innerHTML = '<p style="color:#888;text-align:center;padding:20px">No GIFs found</p>';
      return;
    }

    for (const gif of data.results) {
      const tinyUrl = gif.media_formats?.tinygif?.url;
      const fullUrl = gif.media_formats?.gif?.url;
      if (!tinyUrl || !fullUrl) continue;

      const img = document.createElement('img');
      img.src = tinyUrl;
      img.alt = gif.title || 'GIF';
      img.className = 'gif-result-item';
      img.addEventListener('click', () => {
        const column = document.getElementById('gif-modal').dataset.column;
        if (!pendingAttachments[column]) pendingAttachments[column] = {};
        pendingAttachments[column].gif = fullUrl;
        showAttachmentPreview(column);
        document.getElementById('gif-modal').classList.remove('active');
      });
      results.appendChild(img);
    }
  } catch (err) {
    results.innerHTML = '<p style="color:#dc2626;text-align:center;padding:20px">Failed to search GIFs</p>';
  }
}

// Avatar picker
function openAvatarPicker(column) {
  const modal = document.getElementById('avatar-modal');
  modal.classList.add('active');
  modal.dataset.column = column;
}

function selectAvatarEmbed(avatarKey) {
  const column = document.getElementById('avatar-modal').dataset.column;
  if (!pendingAttachments[column]) pendingAttachments[column] = {};
  pendingAttachments[column].avatar = avatarKey;
  showAttachmentPreview(column);
  document.getElementById('avatar-modal').classList.remove('active');
}

// Timer
function showTimerDropdown() {
  const dropdown = document.getElementById('timer-dropdown');
  dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
}

function startTimer(minutes) {
  const endTime = Date.now() + minutes * 60 * 1000;
  socket.emit('timer:start', { endTime });
  document.getElementById('timer-dropdown').style.display = 'none';
}

function cancelTimer() {
  socket.emit('timer:cancel');
}

function displayTimer(endTime) {
  clearInterval(timerInterval);
  const timerDisplay = document.getElementById('timer-display');
  const timerBtn = document.getElementById('timer-btn');

  function update() {
    const remaining = endTime - Date.now();
    if (remaining <= 0) {
      timerDisplay.textContent = "⏱ Time's up!";
      timerDisplay.className = 'timer-display times-up';
      clearInterval(timerInterval);
      if (isAdmin) document.getElementById('timer-cancel').style.display = 'none';
      setTimeout(() => {
        timerDisplay.textContent = '';
        timerDisplay.className = 'timer-display';
        if (isAdmin) timerBtn.style.display = 'inline-block';
      }, 10000);
      return;
    }

    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    timerDisplay.textContent = `⏱ ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    timerDisplay.className = 'timer-display active';
  }

  update();
  timerInterval = setInterval(update, 1000);
  timerDisplay.style.display = 'inline-block';
  if (isAdmin) {
    timerBtn.style.display = 'none';
    document.getElementById('timer-cancel').style.display = 'inline-block';
    document.getElementById('timer-dropdown').style.display = 'none';
  }
}

function hideTimer() {
  clearInterval(timerInterval);
  const timerDisplay = document.getElementById('timer-display');
  timerDisplay.textContent = '';
  timerDisplay.className = 'timer-display';
  if (isAdmin) {
    document.getElementById('timer-btn').style.display = 'inline-block';
    document.getElementById('timer-cancel').style.display = 'none';
  }
}

async function editCard(cardId) {
  const cardEl = document.getElementById(`card-${cardId}`);
  const textEl = cardEl.querySelector('.card-text');
  const currentText = textEl ? textEl.textContent : '';
  const newText = prompt('Edit card:', currentText);
  if (newText === null || newText === currentText) return;
  const res = await fetch(`/api/cards/${cardId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: newText.trim() || null })
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
    document.getElementById(`card-${cardId}`)?.remove();
    socket.emit('card:delete', { id: cardId });
  }
}

// Socket.IO listeners
socket.on('card:added', (card) => {
  if (!document.getElementById(`card-${card.id}`)) renderCard(card);
});
socket.on('card:edited', (card) => renderCard(card));
socket.on('card:deleted', (data) => document.getElementById(`card-${data.id}`)?.remove());
socket.on('card:reacted', (data) => updateReactionsDisplay(data.id, data.reactions));
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
socket.on('timer:started', (data) => displayTimer(data.endTime));
socket.on('timer:cancelled', () => hideTimer());
socket.on('connect', () => {
  if (boardData) {
    socket.emit('join-board', { boardId, sessionId: sessionId || `admin-${Date.now()}`, display_name: displayName || 'Admin' });
  }
});

// Enter key for card inputs
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('.add-card input[id^="input-"]')) {
    addCard(e.target.id.replace('input-', ''));
  }
});

// GIF search debounce
let gifSearchTimeout;
document.addEventListener('DOMContentLoaded', () => {
  const gifInput = document.getElementById('gif-search-input');
  if (gifInput) {
    gifInput.addEventListener('input', () => {
      clearTimeout(gifSearchTimeout);
      gifSearchTimeout = setTimeout(() => searchGifs(gifInput.value), 500);
    });
    gifInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        searchGifs(gifInput.value);
      }
    });
  }
});

init();
