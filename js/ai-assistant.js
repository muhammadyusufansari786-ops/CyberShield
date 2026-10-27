/**
 * CyberShield - AI CyberShield Tutor (Gemini)
 *
 * A specialized (not generic) cybersecurity tutor:
 * - Difficulty levels (Beginner / Intermediate / Advanced) are sent with
 *   every question so Gemini adapts explanations.
 * - Conversation context is kept in the browser for the current session
 *   (last 12 turns are sent along; nothing is stored server-side).
 * - Answers are rendered through the safe markdown renderer in ai-client.js,
 *   so AI output can never inject HTML/JS.
 * - Strictly defensive: the backend system prompt refuses offensive content.
 */

(function () {
  'use strict';

  const AI = window.CyberAI;

  const el = {
    window: document.getElementById('ai-chat-window'),
    input: document.getElementById('ai-chat-input'),
    sendBtn: document.getElementById('ai-send-btn'),
    newChatBtn: document.getElementById('ai-new-chat'),
    suggestions: document.getElementById('ai-suggestions'),
    difficultyBtns: document.querySelectorAll('.ai-difficulty-row .filter-btn'),
  };

  if (!el.window || !el.input || !el.sendBtn) return;

  const GREETING =
    '👋 Hi! I\'m your **CyberShield AI Tutor**, powered by Google Gemini.\n\n' +
    'Ask me anything about staying safe online - spotting phishing, securing your accounts, ' +
    'understanding malware, protecting your money and privacy.\n\n' +
    'Pick a level above (Beginner / Intermediate / Advanced) and try one of the suggestion chips below!';

  let difficulty = 'beginner';
  let history = []; // { role: 'user' | 'model', text }
  let busy = false;

  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */

  function scrollToEnd() {
    el.window.scrollTop = el.window.scrollHeight;
  }

  function addMessage(role, html, extraClass) {
    const wrap = document.createElement('div');
    wrap.className = 'ai-chat-msg ' + (role === 'user' ? 'ai-msg-user' : 'ai-msg-model') + (extraClass ? ' ' + extraClass : '');

    const avatar = document.createElement('span');
    avatar.className = 'ai-msg-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = role === 'user' ? '🧑‍🎓' : '🤖';

    const bubble = document.createElement('div');
    bubble.className = 'ai-chat-bubble';
    bubble.innerHTML = html;

    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    el.window.appendChild(wrap);
    scrollToEnd();
    return bubble;
  }

  function addUserMessage(text) {
    addMessage('user', AI.escapeHtml(text).replace(/\n/g, '<br>'));
  }

  function addModelMessage(markdown) {
    return addMessage('model', AI.renderMarkdown(markdown));
  }

  function addErrorMessage(message) {
    addMessage('model', '⚠️ ' + AI.escapeHtml(message), 'ai-msg-error');
  }

  /* ------------------------------------------------------------------ */
  /* Chat flow                                                           */
  /* ------------------------------------------------------------------ */

  function setBusy(isBusy) {
    busy = isBusy;
    el.sendBtn.disabled = isBusy;
    el.sendBtn.innerHTML = isBusy
      ? '<span class="ai-spinner" aria-hidden="true"></span> Thinking…'
      : 'Send ➤';
  }

  async function send() {
    const message = (el.input.value || '').trim();
    if (!message || busy) return;
    if (message.length > 4000) {
      addErrorMessage('That question is too long. Please trim it to 4000 characters or fewer.');
      return;
    }

    el.input.value = '';
    addUserMessage(message);
    setBusy(true);

    const loadingBubble = addMessage('model', AI.loadingHtml('Analyzing with Gemini'));

    try {
      const data = await AI.request('/api/ai/tutor', {
        message,
        difficulty,
        history: history.slice(-12),
      });
      loadingBubble.closest('.ai-chat-msg').remove();
      addModelMessage(data.reply);
      history.push({ role: 'user', text: message });
      history.push({ role: 'model', text: data.reply });
    } catch (err) {
      loadingBubble.closest('.ai-chat-msg').remove();
      addErrorMessage(err.message);
      el.input.value = message; // give the question back so they can retry
    } finally {
      setBusy(false);
      el.input.focus();
    }
  }

  function resetConversation() {
    history = [];
    el.window.innerHTML = '';
    addModelMessage(GREETING);
    applyContextPrefill();
    el.input.focus();
  }

  /* ------------------------------------------------------------------ */
  /* Context hand-off from the Scam Analyzer                             */
  /* ------------------------------------------------------------------ */

  function applyContextPrefill() {
    try {
      const raw = sessionStorage.getItem('cybershield-ai-context');
      if (!raw) return;
      sessionStorage.removeItem('cybershield-ai-context');
      const ctx = JSON.parse(raw);
      if (ctx && ctx.message) {
        if (ctx.label) {
          const chip = document.createElement('div');
          chip.className = 'ai-context-chip';
          chip.textContent = '📌 ' + ctx.label;
          el.window.prepend(chip);
        }
        el.input.value = ctx.message;
      }
    } catch (e) {
      /* ignore malformed context */
    }
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                              */
  /* ------------------------------------------------------------------ */

  el.sendBtn.addEventListener('click', send);

  el.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  el.newChatBtn.addEventListener('click', resetConversation);

  el.difficultyBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      difficulty = btn.dataset.difficulty || 'beginner';
      el.difficultyBtns.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', active);
      });
    });
  });

  if (el.suggestions) {
    el.suggestions.addEventListener('click', (e) => {
      const chip = e.target.closest('.ai-suggestion');
      if (!chip) return;
      el.input.value = chip.textContent.trim();
      el.input.focus();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Init                                                                */
  /* ------------------------------------------------------------------ */

  addModelMessage(GREETING);
  applyContextPrefill();
})();
