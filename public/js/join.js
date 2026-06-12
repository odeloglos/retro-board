document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('join-form');
  const pinInput = document.getElementById('pin');
  const nameInput = document.getElementById('display-name');
  const anonCheckbox = document.getElementById('anonymous');
  const errorEl = document.getElementById('error');

  anonCheckbox.addEventListener('change', () => {
    nameInput.disabled = anonCheckbox.checked;
    if (anonCheckbox.checked) {
      nameInput.value = '';
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';

    const pin = pinInput.value.trim();
    const anonymous = anonCheckbox.checked;
    const display_name = anonymous ? undefined : nameInput.value.trim();

    if (!anonymous && !display_name) {
      errorEl.textContent = 'Please enter your name or join anonymously.';
      errorEl.style.display = 'block';
      return;
    }

    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, display_name, anonymous })
      });

      const data = await res.json();
      if (!res.ok) {
        errorEl.textContent = data.error || 'Failed to join board.';
        errorEl.style.display = 'block';
        return;
      }

      sessionStorage.setItem('sessionId', data.session_id);
      sessionStorage.setItem('displayName', data.display_name);
      window.location.href = `/board/${data.board_id}`;
    } catch (err) {
      errorEl.textContent = 'Connection error. Please try again.';
      errorEl.style.display = 'block';
    }
  });
});
