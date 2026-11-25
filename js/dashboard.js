/**
 * CyberShield - User dashboard
 *
 * Loads the signed-in user from /api/auth/me and the protected stats from
 * /api/dashboard. The identity ALWAYS comes from the server session - this
 * page supplies no user IDs. Shows loading, error (with retry) and clean
 * empty states. Unauthenticated visitors are sent to the login page.
 *
 * Everything rendered here comes from stored records for this user only:
 * quiz attempts saved by the quiz page and learning paths that Gemini
 * actually generated and the server accepted. Nothing is invented client-side.
 */
(function () {
  'use strict';

  const PAGE_LINKS = {
    home: 'index.html', password: 'password.html', quiz: 'quiz.html', news: 'news.html',
    threats: 'threats.html', toolkit: 'toolkit.html', glossary: 'glossary.html',
    resources: 'resources.html', ai: 'ai-assistant.html', about: 'about.html',
  };

  const CATEGORY_LABELS = {
    all: 'All categories',
    passwords: 'Passwords & Authentication',
    phishing: 'Phishing & Social Engineering',
    malware: 'Malware & Threats',
    privacy: 'Privacy & Data Protection',
    mobile: 'Mobile Security',
    scam: 'Scam Awareness',
  };

  const loadingEl = document.getElementById('dashboard-loading');
  const errorEl = document.getElementById('dashboard-error');
  const contentEl = document.getElementById('dashboard-content');
  const logoutBtn = document.getElementById('logout-btn');

  const welcomeEl = document.getElementById('dash-welcome');
  const emailEl = document.getElementById('dash-email');
  const createdEl = document.getElementById('dash-created');
  const avatarEl = document.getElementById('dash-avatar');

  function esc(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  function formatDate(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'Unknown date';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatDateTime(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'Unknown date';
    return d.toLocaleString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  const categoryLabel = (key) => CATEGORY_LABELS[key] || 'All categories';

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

  /* ------------------------------------------------------------------ */
  /* Quiz performance (real attempts only)                              */
  /* ------------------------------------------------------------------ */

  function renderQuiz(stats, attempts) {
    const emptyEl = document.getElementById('quiz-empty');
    const statsEl = document.getElementById('quiz-stats');
    const historyEl = document.getElementById('quiz-history');
    if (!statsEl || !historyEl) return;

    const count = Number(stats.quizAttempts) || 0;
    if (!count || !Array.isArray(attempts) || !attempts.length) {
      if (emptyEl) emptyEl.hidden = false;
      statsEl.hidden = true;
      historyEl.hidden = true;
      return;
    }

    if (emptyEl) emptyEl.hidden = true;

    const latest = attempts[0];
    const avg = stats.averageQuizScore != null ? `${stats.averageQuizScore}%` : '—';
    const best = stats.bestQuizScore != null ? `${stats.bestQuizScore}%` : '—';

    statsEl.innerHTML = `
      <div class="dash-stat">
        <span class="dash-stat-value">${count}</span>
        <span class="dash-stat-label">Quizzes completed</span>
      </div>
      <div class="dash-stat">
        <span class="dash-stat-value">${latest && latest.score != null ? latest.score + '%' : '—'}</span>
        <span class="dash-stat-label">Latest score</span>
      </div>
      <div class="dash-stat">
        <span class="dash-stat-value">${avg}</span>
        <span class="dash-stat-label">Average score</span>
      </div>
      <div class="dash-stat">
        <span class="dash-stat-value">${best}</span>
        <span class="dash-stat-label">Best score</span>
      </div>`;
    statsEl.hidden = false;

    const rows = attempts.map((a) => {
      const score = Number(a.score) || 0;
      const badgeClass = score >= 80 ? 'badge-success' : score >= 50 ? 'badge-warning' : 'badge-danger';
      return `
        <li class="dash-history-row">
          <span class="badge ${badgeClass}">${score}%</span>
          <span class="dash-history-score">${Number(a.correct) || 0} / ${Number(a.total) || 0} correct
            · <span class="dash-history-cat">${esc(categoryLabel(a.category))}</span></span>
          <time datetime="${esc(a.completedAt || '')}" title="${esc(formatDateTime(a.completedAt))}">${esc(formatDate(a.completedAt))}</time>
        </li>`;
    });

    historyEl.innerHTML = `
      <h3 class="dash-subhead">Recent attempts</h3>
      <ul class="dash-history-list">${rows.join('')}</ul>`;
    historyEl.hidden = false;
  }

  /* ------------------------------------------------------------------ */
  /* Learning paths (stored Gemini output only)                         */
  /* ------------------------------------------------------------------ */

  function renderPaths(stats, paths) {
    const emptyEl = document.getElementById('progress-empty');
    const listEl = document.getElementById('learning-paths');
    if (!listEl) return;

    const count = Number(stats.learningPaths) || 0;
    if (!count || !Array.isArray(paths) || !paths.length) {
      if (emptyEl) emptyEl.hidden = false;
      listEl.hidden = true;
      return;
    }

    if (emptyEl) emptyEl.hidden = true;

    listEl.innerHTML = paths
      .slice(0, 5)
      .map((path) => {
        const steps = Array.isArray(path.steps) ? path.steps : [];
        const stepHtml = steps
          .map(
            (step, i) => `
              <li>
                <strong>${i + 1}. ${esc(step.title || 'Next step')}</strong>
                ${step.description ? `<span> — ${esc(step.description)}</span>` : ''}
                <a href="${esc(PAGE_LINKS[step.link] || 'index.html')}">Open ${esc(step.link || 'page')} →</a>
              </li>`
          )
          .join('');

        return `
          <article class="dash-path">
            <div class="dash-path-head">
              <span class="badge badge-info">🗺️ Learning path</span>
              ${path.score != null ? `<span class="badge badge-neutral">Generated from a ${esc(path.score)}% quiz</span>` : ''}
              <time class="dash-meta" datetime="${esc(path.createdAt || '')}">${esc(formatDate(path.createdAt))}</time>
            </div>
            ${path.summary ? `<p class="dash-path-summary">${esc(path.summary)}</p>` : ''}
            ${stepHtml ? `<ol class="dash-path-steps">${stepHtml}</ol>` : ''}
          </article>`;
      })
      .join('');
    listEl.hidden = false;
  }

  /* ------------------------------------------------------------------ */
  /* Adaptive quiz statistics (server-computed from saved attempts)     */
  /* ------------------------------------------------------------------ */

  const DIFFICULTY_BADGES = { easy: 'badge-success', medium: 'badge-warning', hard: 'badge-danger' };

  function renderAdaptive(stats) {
    const statsEl = document.getElementById('quiz-adaptive-stats');
    const topicsEl = document.getElementById('quiz-topic-performance');
    if (!statsEl || !topicsEl) return;

    const normal = Number(stats.normalQuizAttempts) || 0;
    const adaptive = Number(stats.adaptiveQuizAttempts) || 0;
    const difficulty = DIFFICULTY_BADGES[stats.currentDifficulty] ? stats.currentDifficulty : 'easy';
    const weak = Array.isArray(stats.weakTopics) ? stats.weakTopics.filter(Boolean) : [];
    const improved = Array.isArray(stats.improvedTopics) ? stats.improvedTopics : [];
    const topics = Array.isArray(stats.topicPerformance) ? stats.topicPerformance : [];

    if (!normal && !adaptive) {
      statsEl.hidden = true;
      topicsEl.hidden = true;
      return;
    }

    statsEl.innerHTML = `
      <div class="dash-stat">
        <span class="dash-stat-value">${normal}</span>
        <span class="dash-stat-label">Normal quizzes</span>
      </div>
      <div class="dash-stat">
        <span class="dash-stat-value">${adaptive}</span>
        <span class="dash-stat-label">Adaptive quizzes</span>
      </div>
      <div class="dash-stat">
        <span class="badge ${DIFFICULTY_BADGES[difficulty]} adaptive-difficulty-badge">${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}</span>
        <span class="dash-stat-label">Current difficulty</span>
      </div>
      <div class="dash-stat">
        <span class="dash-stat-value dash-weak-count">${weak.length}</span>
        <span class="dash-stat-label">Weak topics</span>
      </div>`;
    statsEl.hidden = false;

    const weakChips = weak.length
      ? weak.map((label) => `<span class="adaptive-chip">${esc(label)}</span>`).join('')
      : '<span class="dash-meta">No weak topic measured yet.</span>';
    const improvedChips = improved.length
      ? improved.map((t) => `<span class="adaptive-chip adaptive-chip-improved">${esc(t.label)}</span>`).join('')
      : '';

    const rows = topics.map((t) => {
      const accuracy = Number(t.accuracy) || 0;
      return `
        <div class="adaptive-row">
          <span class="adaptive-row-label">${esc(t.label || t.topic)}</span>
          <span class="adaptive-bar" aria-hidden="true"><span class="adaptive-bar-fill" style="width:${accuracy}%"></span></span>
          <span class="adaptive-row-value">${Number(t.correct) || 0}/${Number(t.total) || 0} · ${accuracy}%</span>
        </div>`;
    }).join('');

    topicsEl.innerHTML = `
      <h3 class="dash-subhead">Topic performance</h3>
      ${rows}
      <p class="dash-topic-note"><strong>Weak topics:</strong> ${weakChips}</p>
      ${improvedChips ? `<p class="dash-topic-note"><strong>Improved recently:</strong> ${improvedChips}</p>` : ''}`;
    topicsEl.hidden = false;
  }

  function renderBankInfo(stats) {
    const el = document.getElementById('quiz-bank-info');
    if (!el) return;
    const approved = Number(stats.approvedQuestions) || 0;
    el.textContent = approved
      ? `${approved} approved questions available in the bank`
      : '';
  }

  function fillStats(stats, attempts, paths) {
    if (!stats) return;
    renderBankInfo(stats);
    renderQuiz(stats, attempts);
    renderAdaptive(stats);
    renderPaths(stats, paths);
  }

  /* ------------------------------------------------------------------ */
  /* Load                                                               */
  /* ------------------------------------------------------------------ */

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
          fillStats(dash.stats, dash.quizAttempts, dash.learningPaths);
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
