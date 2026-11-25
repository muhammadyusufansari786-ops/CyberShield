/**
 * CyberShield - admin question bank UI
 *
 * Every action goes through /api/admin/*, which is protected server-side by
 * requireAdmin (role re-read from MongoDB per request). This page is only a
 * convenience layer: hiding it would change nothing about access control.
 */
(function () {
  'use strict';

  const state = { status: 'pending', page: 1, pages: 1, topic: '', difficulty: '', source: '', batchId: '', q: '' };
  let meta = null;

  const $ = (id) => document.getElementById(id);
  const statusEl = $('admin-status');
  const deniedEl = $('admin-denied');
  const appEl = $('admin-app');
  const listEl = $('admin-list');

  const esc = (value) => {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  };

  function setStatus(message, kind) {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.className = `admin-status ${kind || ''}`.trim();
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      credentials: 'include',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      window.location.replace('login.html');
      throw new Error('Please sign in.');
    }
    if (res.status === 403) {
      if (deniedEl) deniedEl.hidden = false;
      if (appEl) appEl.hidden = true;
      throw new Error('Administrator access required.');
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  /* ------------------------------------------------------------------ */
  /* Stats                                                               */
  /* ------------------------------------------------------------------ */

  function statTile(label, value, tone) {
    return `<div class="admin-stat ${tone || ''}">
      <span class="admin-stat-value">${esc(value)}</span>
      <span class="admin-stat-label">${esc(label)}</span>
    </div>`;
  }

  function renderStats(stats) {
    const el = $('admin-stats');
    if (!el) return;
    el.innerHTML = [
      statTile('Approved & active', stats.available, 'ok'),
      statTile('Pending review', stats.pending, 'warn'),
      statTile('Rejected', stats.rejected, 'bad'),
      statTile('Human-authored', stats.source.human || 0),
      statTile('AI-generated', stats.source.ai || 0),
      statTile('Retired', stats.retiredApproved || 0),
    ].join('');

    const health = $('admin-bank-health');
    if (health) {
      const topics = Object.entries(stats.topicCounts || {}).map(([slug, row]) =>
        `<div class="admin-row"><span>${esc(row.label || slug)}</span>
          <span class="admin-row-meta">${row.easy}E · ${row.medium}M · ${row.hard}H · <strong>${row.total}</strong></span></div>`
      ).join('');
      const diff = stats.difficulty || {};
      health.innerHTML = `
        <p class="admin-note">Easy ${diff.easy || 0} · Medium ${diff.medium || 0} · Hard ${diff.hard || 0}</p>
        ${topics}`;
    }

    const batchSelect = $('filter-batch');
    if (batchSelect) {
      batchSelect.innerHTML = '<option value="">All batches</option>' +
        (stats.batches || []).map((b) => `<option value="${esc(b.batchId)}">${esc(b.batchId)} (${b.total})</option>`).join('');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Question list                                                       */
  /* ------------------------------------------------------------------ */

  function questionCard(q) {
    const options = q.options.map((opt, i) => {
      const correct = i === q.correct;
      return `<li class="admin-opt ${correct ? 'admin-opt-correct' : ''}">
        <span class="admin-opt-letter">${String.fromCharCode(65 + i)}</span>
        <span>${esc(opt)}</span>
        ${correct ? '<span class="badge badge-success">correct</span>' : ''}
      </li>`;
    }).join('');

    const statusBadge = q.status === 'approved'
      ? '<span class="badge badge-success">Approved</span>'
      : q.status === 'rejected'
        ? '<span class="badge badge-danger">Rejected</span>'
        : '<span class="badge badge-warning">Pending</span>';

    const actions = [];
    if (q.status === 'pending') {
      actions.push(`<button type="button" class="btn btn-primary btn-sm" data-action="approve" data-id="${esc(q.questionId)}">Approve</button>`);
      actions.push(`<button type="button" class="btn btn-ghost btn-sm" data-action="edit" data-id="${esc(q.questionId)}">Edit</button>`);
      actions.push(`<button type="button" class="btn btn-ghost btn-sm" data-action="reject" data-id="${esc(q.questionId)}">Reject</button>`);
    } else if (q.status === 'approved') {
      actions.push(`<button type="button" class="btn btn-ghost btn-sm" data-action="edit" data-id="${esc(q.questionId)}">Edit</button>`);
      if (!q.retired) {
        actions.push(`<button type="button" class="btn btn-ghost btn-sm" data-action="retire" data-id="${esc(q.questionId)}">Retire</button>`);
      }
    }

    return `<article class="admin-q" data-qid="${esc(q.questionId)}">
      <header class="admin-q-head">
        <div class="admin-q-meta">
          <code>${esc(q.questionId)}</code>
          ${statusBadge}
          <span class="badge badge-neutral">${esc(q.difficulty)}</span>
          <span class="badge badge-info">${q.source === 'ai' ? 'AI draft' : 'Human'}</span>
          <span class="badge badge-neutral">${esc(q.topic)}</span>
          ${q.retired ? '<span class="badge badge-danger">Retired</span>' : ''}
        </div>
        <span class="admin-note">${esc(q.subtopic)}${q.batchId ? ` · ${esc(q.batchId)}` : ''}</span>
      </header>
      <h3 class="admin-q-text">${esc(q.text)}</h3>
      <ol class="admin-opts">${options}</ol>
      <p class="admin-q-expl"><strong>Explanation:</strong> ${esc(q.explanation)}</p>
      ${q.rejectionReason ? `<p class="admin-note">Rejection: ${esc(q.rejectionReason)}</p>` : ''}
      <div class="admin-q-actions">${actions.join('')}</div>
    </article>`;
  }

  async function loadList() {
    const params = new URLSearchParams({
      status: state.status,
      page: String(state.page),
      limit: '10',
    });
    if (state.topic) params.set('topic', state.topic);
    if (state.difficulty) params.set('difficulty', state.difficulty);
    if (state.source) params.set('source', state.source);
    if (state.batchId) params.set('batchId', state.batchId);
    if (state.q) params.set('q', state.q);

    listEl.innerHTML = '<p class="admin-note">Loading questions…</p>';
    try {
      const data = await api(`/api/admin/questions?${params.toString()}`);
      state.pages = data.pages || 1;
      $('page-label').textContent = `Page ${data.page} of ${data.pages} · ${data.total} question${data.total === 1 ? '' : 's'}`;
      $('page-prev').disabled = data.page <= 1;
      $('page-next').disabled = data.page >= data.pages;
      listEl.innerHTML = data.items.length
        ? data.items.map(questionCard).join('')
        : '<p class="admin-note">No questions match these filters.</p>';
    } catch (err) {
      listEl.innerHTML = `<p class="admin-note">${esc(err.message)}</p>`;
    }
  }

  async function loadStats() {
    try {
      const data = await api('/api/admin/stats');
      renderStats(data.stats);
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  async function loadLogs() {
    try {
      const data = await api('/api/admin/logs?limit=20');
      $('admin-logs').innerHTML = data.logs.length
        ? data.logs.map((log) => `<li>
            <span class="badge badge-neutral">${esc(log.action)}</span>
            <span>${esc(log.questionId || log.batchId || 'batch')}</span>
            <span class="admin-note">${esc(new Date(log.createdAt).toLocaleString())}</span>
          </li>`).join('')
        : '<li class="admin-note">No admin actions recorded yet.</li>';
    } catch {
      /* audit list is non-critical */
    }
  }

  /* ------------------------------------------------------------------ */
  /* Approve / reject / retire                                           */
  /* ------------------------------------------------------------------ */

  async function approve(id) {
    setStatus(`Approving ${id}…`);
    try {
      await api(`/api/admin/questions/${encodeURIComponent(id)}/approve`, { method: 'POST' });
      setStatus(`✓ ${id} approved and now available in quizzes.`, 'ok');
      await Promise.all([loadList(), loadStats(), loadLogs()]);
    } catch (err) {
      setStatus(`Could not approve: ${err.message}`, 'error');
    }
  }

  let rejectId = null;
  function openReject(id) {
    rejectId = id;
    $('reject-target').textContent = `Rejecting ${id}`;
    $('reject-reason').value = '';
    $('reject-dialog').showModal();
  }

  async function reject(reason) {
    if (!rejectId) return;
    try {
      await api(`/api/admin/questions/${encodeURIComponent(rejectId)}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      $('reject-dialog').close();
      setStatus(`✓ ${rejectId} rejected. It will never be served.`, 'ok');
      rejectId = null;
      await Promise.all([loadList(), loadStats(), loadLogs()]);
    } catch (err) {
      setStatus(`Could not reject: ${err.message}`, 'error');
    }
  }

  async function retire(id) {
    if (!window.confirm('Retire this approved question? Existing attempts stay valid.')) return;
    try {
      await api(`/api/admin/questions/${encodeURIComponent(id)}/retire`, { method: 'POST' });
      setStatus(`✓ ${id} retired. Existing quiz history is unchanged.`, 'ok');
      await Promise.all([loadList(), loadStats(), loadLogs()]);
    } catch (err) {
      setStatus(`Could not retire: ${err.message}`, 'error');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Edit dialog                                                         */
  /* ------------------------------------------------------------------ */

  let editingId = null;

  async function openEdit(id) {
    try {
      const { question } = await api(`/api/admin/questions/${encodeURIComponent(id)}`);
      editingId = id;
      $('edit-id').value = id;
      $('edit-title').textContent = `Edit ${id}`;
      $('edit-error').textContent = '';
      $('edit-text').value = question.text;
      question.options.forEach((opt, i) => { $(`edit-opt-${i}`).value = opt; });
      $('edit-correct').value = String(question.correct);
      $('edit-topic').value = question.topic;
      $('edit-subtopic').value = question.subtopic;
      $('edit-difficulty').value = question.difficulty;
      $('edit-explanation').value = question.explanation;
      $('edit-dialog').showModal();
    } catch (err) {
      setStatus(`Could not open editor: ${err.message}`, 'error');
    }
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editingId) return;
    const body = {
      text: $('edit-text').value,
      options: [0, 1, 2, 3].map((i) => $(`edit-opt-${i}`).value),
      correct: Number($('edit-correct').value),
      topic: $('edit-topic').value,
      subtopic: $('edit-subtopic').value,
      difficulty: $('edit-difficulty').value,
      explanation: $('edit-explanation').value,
    };
    $('edit-error').textContent = '';
    try {
      await api(`/api/admin/questions/${encodeURIComponent(editingId)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      $('edit-dialog').close();
      setStatus(`✓ ${editingId} updated.`, 'ok');
      editingId = null;
      await Promise.all([loadList(), loadStats(), loadLogs()]);
    } catch (err) {
      $('edit-error').textContent = err.message;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Generation                                                          */
  /* ------------------------------------------------------------------ */

  async function generate(event) {
    event.preventDefault();
    const btn = $('gen-submit');
    const out = $('generate-result');
    btn.disabled = true;
    btn.textContent = 'Generating…';
    out.textContent = 'Asking Gemini for drafts. This can take a few seconds.';
    try {
      const data = await api('/api/admin/generate', {
        method: 'POST',
        body: JSON.stringify({
          topic: $('gen-topic').value,
          difficulty: $('gen-difficulty').value,
          count: Number($('gen-count').value),
        }),
      });
      out.textContent = `Batch ${data.batchId}: ${data.accepted} pending question(s) accepted, ${data.rejected.length} rejected by validation.${data.partial ? ' Gemini stopped early; accepted questions were kept.' : ''}`;
      await Promise.all([loadList(), loadStats(), loadLogs()]);
    } catch (err) {
      out.textContent = `Generation failed: ${err.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate batch';
    }
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                              */
  /* ------------------------------------------------------------------ */

  function fillTopicSelects() {
    const topics = (meta && meta.topics) || [];
    const options = topics.map((t) => `<option value="${esc(t.slug)}">${esc(t.label)} (${t.count})</option>`).join('');
    $('gen-topic').innerHTML = options;
    $('filter-topic').innerHTML = '<option value="">All topics</option>' + options;
    $('edit-topic').innerHTML = options;
  }

  async function init() {
    try {
      const me = await fetch('/api/auth/me', { credentials: 'include' });
      if (me.status === 401) {
        window.location.replace('login.html');
        return;
      }
      const { user } = await me.json();
      if (user.role !== 'admin') {
        deniedEl.hidden = false;
        return;
      }
      deniedEl.hidden = true;
      appEl.hidden = false;

      meta = await (await fetch('/api/quiz/meta', { credentials: 'include' })).json();
      fillTopicSelects();

      $('generate-form').addEventListener('submit', generate);
      $('filter-apply').addEventListener('click', () => {
        state.status = $('filter-status').value;
        state.topic = $('filter-topic').value;
        state.difficulty = $('filter-difficulty').value;
        state.source = $('filter-source').value;
        state.batchId = $('filter-batch').value;
        state.q = $('filter-search').value.trim();
        state.page = 1;
        loadList();
      });
      $('filter-search').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') $('filter-apply').click();
      });
      $('page-prev').addEventListener('click', () => {
        if (state.page > 1) { state.page--; loadList(); }
      });
      $('page-next').addEventListener('click', () => {
        if (state.page < state.pages) { state.page++; loadList(); }
      });
      listEl.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-action]');
        if (!btn) return;
        const { action, id } = btn.dataset;
        if (action === 'approve') approve(id);
        if (action === 'reject') openReject(id);
        if (action === 'edit') openEdit(id);
        if (action === 'retire') retire(id);
      });
      $('edit-form').addEventListener('submit', saveEdit);
      $('edit-cancel').addEventListener('click', () => {
        editingId = null;
        $('edit-dialog').close();
      });
      $('reject-form').addEventListener('submit', (e) => {
        e.preventDefault();
        reject($('reject-reason').value.trim());
      });
      $('reject-cancel').addEventListener('click', () => {
        rejectId = null;
        $('reject-dialog').close();
      });

      await Promise.all([loadStats(), loadList(), loadLogs()]);
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
