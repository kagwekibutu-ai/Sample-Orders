const API = 'http://localhost:3000/api';

const existing = JSON.parse(localStorage.getItem('kiwas_ceo') || 'null');
if (existing && existing.token && existing.role === 'admin') {
  location.href = 'index.html';
}

document.getElementById('ceo-login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('ceo-login-btn');
  const errorEl = document.getElementById('login-error');
  const email = document.getElementById('ceo-email').value.trim();
  const password = document.getElementById('ceo-password').value;

  errorEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Logging in...';

  try {
    const res = await fetch(`${API}/auth/ceo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Login failed');
    if (data.role !== 'admin') throw new Error('This login is for the CEO only');

    localStorage.setItem('kiwas_ceo', JSON.stringify(data));
    location.href = 'index.html';
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Login to CEO Dashboard';
  }
});
