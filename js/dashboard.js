/**
 * CyberShield - User dashboard
 *
 * Loads the signed-in user from /api/auth/me and the protected stats from
 * /api/dashboard. The identity ALWAYS comes from the server session - this
 * page supplies no user IDs. Shows loading, error (with retry) and clean
 * empty states. Unauthenticated visitors are sent to the login page.
 */
(function () {
  'use strict';

  const loadingEl = document.getElementById('dashboard-loading');
  const errorEl = document.getElementById('dashboard-error');
  const contentEl = document.getElementById('dashboard-content');
  const logoutBtn = document.getElementById('logout-btn');

  const welcomeEl = document.getElementById('dash-welcome');
  const emailEl = document.getElementById('dash-email');
  const createdEl = document.getElementById('dash-created');
  const avatarEl = document.getElementById('dash-avatar');

  function showError(message, withRetry) {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.classList.add('show');
    if (withRetry) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary btn-sm';
      btn.style.marginTop = '0.5rem';
      btn.textContent = 'Retry';
      btn.addEventListener('click', () => loadDashboard());
      errorEl.appendChild(document.createElement('br'));
      errorEl.appendChild(btn);
    }
  }

  function clearError() {
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.remove('show');
    }
  }

  function fillProfile(user) {
    if (welcomeEl) welcomeEl.textContent = `Welcome, ${user.name}!`;
    if (emailEl) emailEl.textContent = user.email;
    if (createdEl && user.createdAt) {
      createdEl.textContent = `Member since ${new Date(user.createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}`;
    }
    if (avatarEl) avatarEl.textContent = (user.name || '?').trim().charAt(0).toUpperCase();
  }

  function fillStats(stats) {
    if (!stats) return;

    if (stats.quizAttempts > 0) {
      const best = stats.bestQuizScore != null ? ` · Best score: ${stats.bestQuizScore}%` : '';
      document.getElementById('quiz-card-body').innerHTML =
        `<p><strong>${stats.quizAttempts}</strong> quiz attempt${stats.quizAttempts === 1 ? '' : 's'}${best}.</p>`;
    }

    if (stats.scamAnalyses > 0) {
      document.getElementById('scam-card-body').innerHTML =
        `<p><strong>${stats.scamAnalyses}</strong> saved scam analysis${stats.scamAnalyses === 1 ? '' : 'es'}.</p>`;
    }

    if (stats.learningPaths > 0) {
      document.getElementById('progress-card-body').innerHTML =
        `<p><strong>${stats.learningPaths}</strong> learning path${stats.learningPaths === 1 ? '' : 's'} generated.</p>`;
    }
    // All-zero counts keep the existing clean empty states as-is.
  }

  async function loadDashboard() {
    clearError();
    if (loadingEl) loadingEl.hidden = false;
    if (contentEl) contentEl.hidden = true;

    try {
      // Identity is the session; a 401 means "not signed in".
      const meRes = await fetch('/api/auth/me', { credentials: 'include' });
      if (meRes.status === 401) {
        window.location.replace('login.html');
        return;
      }
      if (!meRes.ok) throw new Error('unexpected');
      const { user } = await meRes.json();

      fillProfile(user);
      if (logoutBtn) logoutBtn.hidden = false;

      try {
        const dashRes = await fetch('/api/dashboard', { credentials: 'include' });
        if (dashRes.status === 401) {
          window.location.replace('login.html');
          return;
        }
        if (dashRes.ok) {
          const dash = await dashRes.json();
          fillStats(dash.stats);
        }
      } catch {
        /* Stats are a bonus - profile still loads. */
      }

      if (loadingEl) loadingEl.hidden = true;
      if (contentEl) contentEl.hidden = false;
    } catch {
      if (loadingEl) loadingEl.hidden = true;
      showError('Could not reach the CyberShield server. Is it running? (npm start)', true);
    }
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      logoutBtn.disabled = true;
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      } catch {
        /* even if the call fails, leave the dashboard */
      }
      window.location.replace('login.html');
    });
  }

  loadDashboard();
})();
