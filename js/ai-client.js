/**
 * CyberShield - Shared AI client helpers
 *
 * One small helper used by all four Gemini features (scam analyzer, tutor,
 * learning path, news explainer) so fetch handling, friendly errors, safe
 * markdown rendering and loading states stay consistent.
 *
 * Security:
 * - Talks only to our own backend (/api/ai/*) - no keys in the browser.
 * - renderMarkdown() escapes ALL HTML first, so AI output can never inject
 *   scripts or event handlers. Only a tiny markdown subset is re-added.
 * - AI output is never inserted via raw innerHTML without escaping.
 */

(function () {
  'use strict';

  const AI_ERROR = 'AI service is temporarily unavailable. Please try again.';

  /** Escape everything, then re-enable a minimal markdown subset. */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str ?? '');
    return div.innerHTML;
  }

  function inlineFormat(escaped) {
    return escaped
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`\n]+)`/g, '<code>$1</code>');
  }

  /**
   * Safe markdown-lite renderer: headings (#, ##, ###), bullet lists (-, *),
   * numbered lists (1.), **bold**, `code`, paragraphs. Everything is escaped
   * first; raw HTML/JS in AI output is displayed as plain text, never executed.
   */
  function renderMarkdown(text) {
    const lines = String(text ?? '').split(/\r?\n/);
    const out = [];
    let list = null; // 'ul' | 'ol' | null

    const closeList = () => {
      if (list) {
        out.push(`</${list}>`);
        list = null;
      }
    };

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();

      if (!trimmed) {
        closeList();
        continue;
      }

      const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
      if (heading) {
        closeList();
        const level = Math.min(heading[1].length + 2, 6); // # -> h3 ... #### -> h6
        out.push(`<h${level}>${inlineFormat(escapeHtml(heading[2]))}</h${level}>`);
        continue;
      }

      const bullet = trimmed.match(/^[-*•]\s+(.*)$/);
      if (bullet) {
        if (list !== 'ul') {
          closeList();
          out.push('<ul>');
          list = 'ul';
        }
        out.push(`<li>${inlineFormat(escapeHtml(bullet[1]))}</li>`);
        continue;
      }

      const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/);
      if (numbered) {
        if (list !== 'ol') {
          closeList();
          out.push('<ol>');
          list = 'ol';
        }
        out.push(`<li>${inlineFormat(escapeHtml(numbered[1]))}</li>`);
        continue;
      }

      closeList();
      out.push(`<p>${inlineFormat(escapeHtml(line))}</p>`);
    }
    closeList();
    return out.join('\n');
  }

  /**
   * POST to one of our AI endpoints. Returns parsed JSON or throws Error
   * with a user-friendly message (raw backend errors are never shown).
   */
  async function request(endpoint, payload) {
    let res;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
    } catch (networkErr) {
      // Backend not running, offline, CORS, etc.
      throw new Error(AI_ERROR);
    }

    let data = null;
    try {
      data = await res.json();
    } catch (parseErr) {
      /* non-JSON response -> fall through to generic error */
    }

    if (!res.ok || !data || data.error) {
      throw new Error((data && data.error) || AI_ERROR);
    }
    return data;
  }

  /** Show a friendly error inside a result container. */
  function showError(container, message) {
    if (!container) return;
    container.style.display = 'block';
    container.innerHTML =
      '<div class="ai-error" role="alert">⚠️ ' + escapeHtml(message || AI_ERROR) + '</div>';
  }

  /** Toggle a button's loading state; returns its original label. */
  function setBtnLoading(btn, isLoading, loadingText) {
    if (!btn) return '';
    if (isLoading) {
      const original = btn.dataset.originalLabel || btn.innerHTML;
      btn.dataset.originalLabel = original;
      btn.disabled = true;
      btn.innerHTML =
        '<span class="ai-spinner" aria-hidden="true"></span>' + escapeHtml(loadingText || 'Working…');
      return original;
    }
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalLabel || btn.innerHTML;
    delete btn.dataset.originalLabel;
    return '';
  }

  /** Small loading placeholder with animated dots. */
  function loadingHtml(text) {
    return (
      '<div class="ai-loading" role="status" aria-live="polite"><span class="ai-spinner" aria-hidden="true"></span>' +
      escapeHtml(text || 'Working…') +
      '<span class="ai-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></div>'
    );
  }

  window.CyberAI = {
    AI_ERROR,
    request,
    renderMarkdown,
    showError,
    setBtnLoading,
    loadingHtml,
    escapeHtml,
  };
})();
