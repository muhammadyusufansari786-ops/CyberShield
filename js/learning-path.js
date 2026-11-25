/**
 * CyberShield - personalized learning roadmap page
 *
 * Reads and writes /api/learning/roadmap only. Identity comes from the server
 * session (no user id is ever sent), and every rendered string is escaped.
 */

(function () {
  'use strict';

  const PAGE_LINKS = {
    home: 'index.html',
    password: 'password.html',
    quiz: 'quiz.html',
    news: 'news.html',
    threats: 'threats.html',
    toolkit: 'toolkit.html',
    glossary: 'glossary.html',
    resources: 'resources.html',
    ai: 'ai-assistant.html',
    about: 'about.html',
  };

  const STAGE_ICONS = { Beginner: '🌱', Intermediate: '⚡', Advanced: '🏆' };
  const DIFFICULTY_BADGES = { easy: 'badge-success', medium: 'badge-warning', hard: 'badge-danger' };

  const el = {
    subtitle: document.getElementById('lp-subtitle'),
    heroBadges: document.getElementById('lp-hero-badges'),
    refresh: document.getElementById('lp-refresh'),
    error: document.getElementById('lp-error'),
    status: document.getElementById('lp-status'),
    loading: document.getElementById('lp-loading'),
    empty: document.getElementById('lp-empty'),
    emptyText: document.getElementById('lp-empty-text'),
    generate: document.getElementById('lp-generate'),
    content: document.getElementById('lp-content'),
    progressValue: document.getElementById('lp-progress-value'),
    progressTrack: document.getElementById('lp-progress-track'),
    progressBar: document.getElementById('lp-progress-bar'),
    overviewStats: document.getElementById('lp-overview-stats'),
    focus: document.getElementById('lp-focus'),
    resume: document.getElementById('lp-resume'),
    resumeText: document.getElementById('lp-resume-text'),
    resumeBtn: document.getElementById('lp-resume-btn'),
    stages: document.getElementById('lp-stages'),
    meta: document.getElementById('lp-meta'),
    fallback: document.getElementById('lp-fallback'),
  };

  const state = { roadmap: null, profile: null, hasAttempts: false, busy: false };

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  function esc(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'recently';
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      credentials: 'include',
      ...options,
      headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      window.location.replace('login.html');
      throw new Error('Please sign in to view your roadmap.');
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
    return data;
  }

  function clearError() {
    if (!el.error) return;
    el.error.textContent = '';
    el.error.classList.remove('show');
  }

  function showError(message) {
    if (!el.error) return;
    el.error.textContent = message;
    el.error.classList.add('show');
  }

  let statusTimer = null;
  function setStatus(message, kind) {
    if (!el.status) return;
    el.status.textContent = message || '';
    el.status.className = `lp-status ${kind || ''}`.trim();
    clearTimeout(statusTimer);
    if (message) {
      statusTimer = setTimeout(() => {
        el.status.textContent = '';
        el.status.className = 'lp-status';
      }, 7000);
    }
  }

  function setBusy(busy, label) {
    state.busy = busy;
    [el.refresh, el.generate].forEach((btn) => {
      if (btn) btn.disabled = busy;
    });
    if (el.refresh) {
      el.refresh.textContent = busy ? label || 'Working…' : 'Refresh recommendations';
    }
    if (el.generate) {
      el.generate.textContent = busy ? label || 'Generating…' : 'Generate my roadmap';
    }
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */

  function stageBadge(stage) {
    const tone = stage === 'Beginner' ? 'badge-success' : stage === 'Intermediate' ? 'badge-warning' : 'badge-danger';
    return `<span class="badge ${tone}">${esc(stage)}</span>`;
  }

  function renderHero(roadmap, profile) {
    if (!roadmap || !el.heroBadges) return;
    const level = (roadmap.level || 'easy').replace(/^./, (c) => c.toUpperCase());
    const source = roadmap.generatedBy === 'gemini' ? '🤖 Gemini AI' : '🧩 Rule-based plan';
    const weakCount = (profile?.weakTopics || []).length;
    el.heroBadges.innerHTML = [
      `<span class="badge badge-neutral">Level: ${esc(level)}</span>`,
      `<span class="badge badge-info">${source}</span>`,
      `<span class="badge badge-neutral">${roadmap.progress.completed}/${roadmap.progress.total} lessons complete</span>`,
      weakCount ? `<span class="badge badge-warning">${weakCount} weak topic${weakCount === 1 ? '' : 's'}</span>` : '',
    ].join('');

    if (el.subtitle) {
      el.subtitle.textContent = roadmap.summary || el.subtitle.textContent;
    }
  }

  function renderOverview(roadmap, profile) {
    const { completed, total, percent } = roadmap.progress;
    if (el.progressValue) el.progressValue.textContent = `${percent}%`;
    if (el.progressBar) el.progressBar.style.width = `${percent}%`;
    if (el.progressTrack) el.progressTrack.setAttribute('aria-valuenow', String(percent));

    const stagesDone = roadmap.stages.filter((stage) => stage.total > 0 && stage.completed === stage.total).length;
    const attempts = roadmap.profileSnapshot?.attempts ?? profile?.attempts ?? 0;
    const level = (roadmap.level || 'easy').replace(/^./, (c) => c.toUpperCase());

    if (el.overviewStats) {
      el.overviewStats.innerHTML = `
        <div class="lp-stat">
          <span class="lp-stat-value">${completed}/${total}</span>
          <span class="lp-stat-label">Lessons done</span>
        </div>
        <div class="lp-stat">
          <span class="lp-stat-value">${stagesDone}/${roadmap.stages.length}</span>
          <span class="lp-stat-label">Stages finished</span>
        </div>
        <div class="lp-stat">
          <span class="lp-stat-value">${esc(level)}</span>
          <span class="lp-stat-label">Current level</span>
        </div>
        <div class="lp-stat">
          <span class="lp-stat-value">${attempts}</span>
          <span class="lp-stat-label">Quiz attempts used</span>
        </div>`;
    }

    if (el.focus) {
      const weak = (profile?.weakTopics || [])
        .map((topic) => profile?.topicPerformance?.find((row) => row.topic === topic) || null)
        .filter(Boolean)
        .map((row) => `<span class="adaptive-chip">${esc(row.label)} · ${row.accuracy}%</span>`);
      const strong = (profile?.strongTopics || [])
        .map((topic) => profile?.topicPerformance?.find((row) => row.topic === topic) || null)
        .filter(Boolean)
        .map((row) => `<span class="adaptive-chip adaptive-chip-improved">${esc(row.label)} · ${row.accuracy}%</span>`);

      el.focus.innerHTML = `
        ${weak.length ? `<p class="lp-focus-line"><strong>Focus first:</strong> ${weak.join('')}</p>` : ''}
        ${strong.length ? `<p class="lp-focus-line"><strong>Already strong:</strong> ${strong.join('')}</p>` : ''}
        ${!weak.length && !strong.length ? '<p class="lp-focus-line lp-muted">No topic accuracy measured yet - this roadmap starts with the fundamentals.</p>' : ''}`;
    }
  }

  function renderResume(roadmap) {
    if (!el.resume) return;
    if (roadmap.progress.complete) {
      el.resume.hidden = false;
      if (el.resumeText) el.resumeText.textContent = 'Every lesson is complete. Refresh the roadmap after your next quiz to keep improving.';
      if (el.resumeBtn) el.resumeBtn.hidden = true;
      return;
    }
    const next = roadmap.steps.find((step) => !step.completed);
    if (!next) {
      el.resume.hidden = true;
      return;
    }
    el.resume.hidden = false;
    if (el.resumeBtn) el.resumeBtn.hidden = false;
    if (el.resumeText) el.resumeText.textContent = `${next.title} · ${next.stage} · ${next.estimatedMinutes} min`;
  }

  function lessonHtml(step) {
    const completed = step.completed === true;
    const difficulty = (step.difficulty || 'easy').toLowerCase();
    return `
      <article class="lp-lesson ${completed ? 'is-complete' : ''}" id="lesson-${esc(step.lessonKey)}" data-lesson="${esc(step.lessonKey)}">
        <button type="button" class="lp-check" data-key="${esc(step.lessonKey)}" data-completed="${completed}"
          aria-pressed="${completed}" aria-label="${completed ? 'Mark lesson incomplete' : 'Mark lesson complete'}: ${esc(step.title)}">
          ${completed ? '✓' : ''}
        </button>
        <div class="lp-lesson-body">
          <div class="lp-lesson-meta">
            ${stageBadge(step.stage)}
            <span class="badge ${DIFFICULTY_BADGES[difficulty] || 'badge-neutral'}">${esc(difficulty)}</span>
            <span class="lp-time">⏱ ${esc(step.estimatedMinutes)} min</span>
            <span class="lp-topic">${esc(step.topicLabel || step.topic)}</span>
            ${completed ? '<span class="badge badge-success">Completed</span>' : ''}
          </div>
          <h4 class="lp-lesson-title">${esc(step.title)}</h4>
          <p class="lp-objective"><strong>Objective:</strong> ${esc(step.objective)}</p>
          <p class="lp-why"><strong>Why this for you:</strong> ${esc(step.why)}</p>
          ${step.description ? `<p class="lp-desc">${esc(step.description)}</p>` : ''}
          <div class="lp-practice">
            <span aria-hidden="true">🎯</span>
            <p><strong>Practice:</strong> ${esc(step.exercise)}</p>
          </div>
          <div class="lp-lesson-foot">
            <a class="btn btn-ghost btn-sm" href="${esc(PAGE_LINKS[step.resource] || 'resources.html')}">
              ${esc(step.resourceLabel || 'Open resource')} →
            </a>
            <button type="button" class="btn btn-secondary btn-sm lp-toggle" data-key="${esc(step.lessonKey)}" data-completed="${completed}">
              ${completed ? 'Mark incomplete' : 'Mark complete'}
            </button>
          </div>
        </div>
      </article>`;
  }

  function renderStages(roadmap) {
    if (!el.stages) return;
    el.stages.innerHTML = roadmap.stages
      .map((stage) => {
        const lessons = roadmap.steps.filter((step) => step.stage === stage.stage);
        return `
          <section class="lp-stage" aria-labelledby="lp-stage-${esc(stage.stage)}">
            <header class="lp-stage-head">
              <div class="lp-stage-title">
                <span class="lp-stage-icon" aria-hidden="true">${STAGE_ICONS[stage.stage] || '•'}</span>
                <div>
                  <h3 id="lp-stage-${esc(stage.stage)}">${esc(stage.stage)}</h3>
                  <p class="lp-stage-sub">${stage.completed} of ${stage.total} lessons complete</p>
                </div>
              </div>
              <span class="badge ${stage.percent === 100 ? 'badge-success' : 'badge-neutral'}">${stage.percent}%</span>
            </header>
            <div class="lp-stage-bar" aria-hidden="true"><span style="width:${stage.percent}%"></span></div>
            <div class="lp-lessons">${lessons.map(lessonHtml).join('')}</div>
          </section>`;
      })
      .join('');
  }

  function renderMeta(roadmap, profile) {
    if (!el.meta) return;
    const source = roadmap.generatedBy === 'gemini' ? 'Gemini AI' : 'rule-based fallback';
    const attempts = roadmap.profileSnapshot?.attempts ?? profile?.attempts ?? 0;
    el.meta.textContent = `Generated ${formatDate(roadmap.generatedAt)} · ${source} · Based on ${attempts} saved quiz attempt${attempts === 1 ? '' : 's'}. Completing a lesson saves it to your account.`;

    if (el.fallback) {
      if (roadmap.fallbackReason) {
        el.fallback.hidden = false;
        el.fallback.textContent = roadmap.fallbackReason;
      } else {
        el.fallback.hidden = true;
        el.fallback.textContent = '';
      }
    }
  }

  function render() {
    if (!state.roadmap) {
      if (el.loading) el.loading.hidden = true;
      if (el.content) el.content.hidden = true;
      if (el.empty) el.empty.hidden = false;
      if (el.emptyText) {
        el.emptyText.textContent = state.hasAttempts
          ? 'You have saved quiz attempts. Generate a roadmap that targets your weakest measured topics first.'
          : 'No quiz history yet - you can still generate a beginner starter roadmap. Take a quiz afterwards and refresh it to personalize the focus.';
      }
      return;
    }

    if (el.loading) el.loading.hidden = true;
    if (el.empty) el.empty.hidden = true;
    if (el.content) el.content.hidden = false;

    renderHero(state.roadmap, state.profile);
    renderOverview(state.roadmap, state.profile);
    renderResume(state.roadmap);
    renderStages(state.roadmap);
    renderMeta(state.roadmap, state.profile);
  }

  /* ------------------------------------------------------------------ */
  /* Actions                                                             */
  /* ------------------------------------------------------------------ */

  async function load() {
    clearError();
    if (el.loading) el.loading.hidden = false;
    if (el.content) el.content.hidden = true;
    if (el.empty) el.empty.hidden = true;
    try {
      const data = await api('/api/learning/roadmap');
      state.roadmap = data.roadmap;
      state.profile = data.profile;
      state.hasAttempts = !!data.hasAttempts;
      render();
    } catch (err) {
      if (el.loading) el.loading.hidden = true;
      showError(err.message || 'Could not load your roadmap.');
    }
  }

  async function generate() {
    if (state.busy) return;
    clearError();
    setStatus('Building your roadmap from your saved quiz results…');
    setBusy(true, 'Generating your roadmap…');
    try {
      const data = await api('/api/learning/roadmap', { method: 'POST', body: '{}' });
      state.roadmap = data.roadmap;
      state.profile = data.roadmap?.profileSnapshot || state.profile;
      render();
      setStatus(
        data.generatedBy === 'gemini'
          ? 'Roadmap refreshed with Gemini.'
          : 'Roadmap generated from your quiz results (Gemini fallback).',
        'ok'
      );
    } catch (err) {
      showError(err.message || 'Could not generate the roadmap. Please try again.');
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  async function toggleLesson(key, completed) {
    if (state.busy || !state.roadmap) return;
    clearError();
    const buttons = document.querySelectorAll(`[data-key="${CSS.escape(key)}"]`);
    buttons.forEach((btn) => {
      btn.disabled = true;
    });
    try {
      const data = await api(
        `/api/learning/roadmap/${encodeURIComponent(state.roadmap.id)}/lessons/${encodeURIComponent(key)}`,
        { method: 'PATCH', body: JSON.stringify({ completed }) }
      );
      state.roadmap = data.roadmap;
      render();
      setStatus(completed ? 'Lesson marked complete.' : 'Lesson marked incomplete.', 'ok');
    } catch (err) {
      showError(err.message || 'Could not update this lesson.');
    } finally {
      buttons.forEach((btn) => {
        btn.disabled = false;
      });
    }
  }

  function resumeNext() {
    if (!state.roadmap) return;
    const next = state.roadmap.steps.find((step) => !step.completed);
    if (!next) return;
    const target = document.getElementById(`lesson-${next.lessonKey}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('lp-lesson-highlight');
      setTimeout(() => target.classList.remove('lp-lesson-highlight'), 1800);
      const toggle = target.querySelector('.lp-toggle');
      if (toggle) toggle.focus({ preventScroll: true });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                              */
  /* ------------------------------------------------------------------ */

  if (el.refresh) el.refresh.addEventListener('click', generate);
  if (el.generate) el.generate.addEventListener('click', generate);
  if (el.resumeBtn) el.resumeBtn.addEventListener('click', resumeNext);

  if (el.stages) {
    el.stages.addEventListener('click', (event) => {
      const button = event.target.closest('.lp-check, .lp-toggle');
      if (!button) return;
      const key = button.getAttribute('data-key');
      const completed = button.getAttribute('data-completed') !== 'true';
      if (key) toggleLesson(key, completed);
    });
  }

  load();
})();
