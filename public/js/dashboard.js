document.addEventListener('DOMContentLoaded', async () => {
  const boardList = document.getElementById('board-list');
  const emptyState = document.getElementById('empty-state');
  const modal = document.getElementById('modal');
  const newBoardBtn = document.getElementById('new-board-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const newBoardForm = document.getElementById('new-board-form');
  const logoutBtn = document.getElementById('logout-btn');
  const modalError = document.getElementById('modal-error');

  const statusRes = await fetch('/api/auth/status');
  const status = await statusRes.json();
  if (!status.logged_in) {
    window.location.href = '/login';
    return;
  }

  async function loadBoards() {
    const res = await fetch('/api/boards');
    const boards = await res.json();

    boardList.innerHTML = '';

    if (boards.length === 0) {
      boardList.innerHTML = '<li class="empty-state">No boards yet. Create your first retro board!</li>';
      return;
    }

    for (const board of boards) {
      const li = document.createElement('li');
      li.className = 'board-item';
      li.onclick = () => { window.location.href = `/board/${board.id}`; };

      const date = new Date(board.created_at).toLocaleDateString();
      const statusClass = board.is_locked ? 'status-locked' : 'status-active';
      const statusText = board.is_locked ? 'Locked' : 'Active';

      // Build DOM nodes with textContent to avoid XSS via untrusted board data
      const boardInfo = document.createElement('div');
      boardInfo.className = 'board-info';

      const h3 = document.createElement('h3');
      h3.textContent = board.title;

      const meta = document.createElement('div');
      meta.className = 'board-meta';

      const pinSpan = document.createElement('span');
      pinSpan.textContent = `PIN: ${board.pin}`;

      const dateSpan = document.createElement('span');
      dateSpan.textContent = date;

      meta.appendChild(pinSpan);
      meta.appendChild(dateSpan);
      boardInfo.appendChild(h3);
      boardInfo.appendChild(meta);

      const statusBadge = document.createElement('span');
      statusBadge.className = `board-status ${statusClass}`;
      statusBadge.textContent = statusText;

      li.appendChild(boardInfo);
      li.appendChild(statusBadge);
      boardList.appendChild(li);
    }
  }

  await loadBoards();

  newBoardBtn.addEventListener('click', () => {
    modal.classList.add('active');
    document.getElementById('board-title').focus();
  });

  cancelBtn.addEventListener('click', () => {
    modal.classList.remove('active');
    newBoardForm.reset();
    modalError.style.display = 'none';
  });

  newBoardForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    modalError.style.display = 'none';

    const title = document.getElementById('board-title').value.trim();
    if (!title) return;

    try {
      const res = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });

      if (!res.ok) {
        const data = await res.json();
        modalError.textContent = data.error || 'Failed to create board.';
        modalError.style.display = 'block';
        return;
      }

      modal.classList.remove('active');
      newBoardForm.reset();
      await loadBoards();
    } catch (err) {
      modalError.textContent = 'Connection error. Please try again.';
      modalError.style.display = 'block';
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  });
});
