/**
 * CyberShield - Login & Registration page logic (shared)
 *
 * Talks only to the real backend endpoints (/api/auth/...). No demo users,
 * no fake auth. Passwords use native password inputs; the show/hide toggle
 * never stores anything. Buttons are disabled while a request is in flight
 * to prevent double submissions.
 */
(function () {
  'use strict';

  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const errorBox = document.getElementById('auth-error');

  /* Show / hide password toggles (both pages) */
  document.querySelectorAll('.toggle-visibility').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn.closest('.input-wrapper')?.querySelector('input');
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      input.focus({ preventScroll: true });
    });
  });

  function showError(message) {
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.classList.add('show');
  }

  function clearError() {
    if (!errorBox) return;
    errorBox.textContent = '';
    errorBox.classList.remove('show');
  }

  function setBusy(form, busy) {
    const btn = form.querySelector('button[type="submit"]');
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = busy
      ? (form.id === 'login-form' ? 'Signing in…' : 'Creating account…')
      : (form.id === 'login-form' ? 'Sign In' : 'Create Account');
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      // Same-origin, but we make the cookie sending explicit (credentials)
      // so the session cookie is always included exactly like the spec asks.
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      /* non-JSON (e.g. server offline) */
    }
    return { ok: res.ok, status: res.status, data };
  }

  /* Already signed in? Go straight to the dashboard. */
  fetch('/api/auth/me', { credentials: 'include' })
    .then((res) => {
      if (res.ok) window.location.replace('dashboard.html');
    })
    .catch(() => {});

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError();

      const email = loginForm.email.value.trim();
      const password = loginForm.password.value;

      if (!email || !password) {
        return showError('Please enter your email and password.');
      }

      setBusy(loginForm, true);
      try {
        const { ok, data } = await postJSON('/api/auth/login', { email, password });
        if (ok) {
          window.location.replace('dashboard.html');
          return;
        }
        showError(data.error || 'Invalid email or password.');
      } catch {
        showError('Cannot reach the CyberShield server. Is it running? (npm start)');
      } finally {
        setBusy(loginForm, false);
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError();

      const name = registerForm.name.value.trim();
      const email = registerForm.email.value.trim();
      const password = registerForm.password.value;
      const confirm = registerForm.confirm.value;

      if (name.length < 2) return showError('Please enter your full name (at least 2 characters).');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError('Please enter a valid email address.');
      if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
        return showError('Password must be at least 8 characters and include a letter and a digit.');
      }
      if (password !== confirm) return showError('Passwords do not match. Please re-enter them.');

      setBusy(registerForm, true);
      try {
        const { ok, data } = await postJSON('/api/auth/register', { name, email, password });
        if (ok) {
          window.location.replace('dashboard.html');
          return;
        }
        showError(data.error || 'Registration failed. Please try again.');
      } catch {
        showError('Cannot reach the CyberShield server. Is it running? (npm start)');
      } finally {
        setBusy(registerForm, false);
      }
    });
  }
})();
