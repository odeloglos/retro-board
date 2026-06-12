document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('auth-form');
  const title = document.getElementById('page-title');
  const subtitle = document.getElementById('page-subtitle');
  const submitBtn = document.getElementById('submit-btn');
  const errorEl = document.getElementById('error');

  const statusRes = await fetch('/api/auth/status');
  const status = await statusRes.json();

  if (status.logged_in) {
    window.location.href = '/dashboard';
    return;
  }

  let isSetup = status.needs_setup;

  if (isSetup) {
    title.textContent = 'Create Admin Account';
    subtitle.textContent = 'Set up your admin account to get started';
    submitBtn.textContent = 'Create Account';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    const endpoint = isSetup ? '/api/auth/setup' : '/api/auth/login';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) {
        errorEl.textContent = data.error || 'Authentication failed.';
        errorEl.style.display = 'block';
        return;
      }

      window.location.href = '/dashboard';
    } catch (err) {
      errorEl.textContent = 'Connection error. Please try again.';
      errorEl.style.display = 'block';
    }
  });
});
