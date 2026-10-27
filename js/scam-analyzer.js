/**
 * CyberShield - AI Scam Analyzer (Gemini)
 *
 * Add-on panel for the existing "Spot the Scam" simulator page.
 * The simulator game itself is untouched - this module only powers the
 * new analyzer card defined in html/toolkit.html.
 *
 * Flow: message text and/or screenshot -> our backend (/api/ai/scam-analyze)
 *       -> Gemini -> structured assessment rendered below.
 * No API keys and no user passwords ever touch this file.
 */

(function () {
  'use strict';

  const MAX_CHARS = 6000;
  const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB before downscale
  const MAX_IMAGE_EDGE = 1600; // px - keeps base64 payloads small

  const AI = window.CyberAI;

  const el = {
    text: document.getElementById('scam-ai-text'),
    counter: document.getElementById('scam-ai-char-count'),
    file: document.getElementById('scam-ai-file'),
    fileLabel: document.getElementById('scam-ai-file-label'),
    previewWrap: document.getElementById('scam-ai-preview-wrap'),
    previewImg: document.getElementById('scam-ai-preview'),
    clearImage: document.getElementById('scam-ai-clear-image'),
    analyzeBtn: document.getElementById('scam-ai-analyze'),
    result: document.getElementById('scam-ai-result'),
  };

  if (!el.text || !el.analyzeBtn) return; // not on this page

  let currentImage = null; // { mimeType, data, previewUrl }

  /* ------------------------------------------------------------------ */
  /* Image handling (client-side downscale, base64 only in memory)       */
  /* ------------------------------------------------------------------ */

  function resetImage() {
    currentImage = null;
    if (el.previewWrap) el.previewWrap.style.display = 'none';
    if (el.previewImg) el.previewImg.removeAttribute('src');
    if (el.file) el.file.value = '';
    if (el.fileLabel) {
      el.fileLabel.innerHTML =
        '<span aria-hidden="true">📎</span> Upload Screenshot <span class="ai-input-hint">(optional)</span>';
    }
  }

  function downscaleToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read the image file.'));
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const img = new Image();
        img.onerror = () => reject(new Error('That file is not a valid image.'));
        img.onload = () => {
          try {
            const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.85)); // {mime, base64} below
          } catch (err) {
            // Fall back to the original data URL if canvas is unavailable.
            resolve(dataUrl);
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      AI.showError(el.result, 'Please upload an image file (PNG, JPG or WebP screenshot).');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      AI.showError(el.result, 'That image is too large. Please upload a screenshot under 8 MB.');
      return;
    }
    try {
      const dataUrl = await downscaleToBase64(file);
      const [meta, base64] = dataUrl.split(',');
      const mime = (meta.match(/^data:([^;,]+)/) || [])[1] || 'image/jpeg';
      currentImage = { mimeType: mime, data: base64 || '', previewUrl: dataUrl };
      if (el.previewImg) el.previewImg.src = dataUrl;
      if (el.previewWrap) el.previewWrap.style.display = 'flex';
      if (el.fileLabel) {
        el.fileLabel.innerHTML =
          '<span aria-hidden="true">✅</span> Screenshot attached <span class="ai-input-hint">(click to replace)</span>';
      }
      if (el.result) el.result.style.display = 'none';
    } catch (err) {
      resetImage();
      AI.showError(el.result, err.message || 'Could not read that image. Please try a different file.');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Result rendering                                                    */
  /* ------------------------------------------------------------------ */

  function listBlock(title, items, ordered) {
    if (!items || !items.length) return '';
    const tag = ordered ? 'ol' : 'ul';
    return (
      '<div class="ai-result-block">' +
      `<h4 class="ai-result-heading">${title}</h4>` +
      `<${tag} class="ai-list">${items
        .map((item) => `<li>${AI.escapeHtml(item)}</li>`)
        .join('')}</${tag}>` +
      '</div>'
    );
  }

  function renderResult(data) {
    const risk = (data.risk_level || 'MEDIUM').toUpperCase();
    const riskClass = { LOW: 'ai-risk-low', MEDIUM: 'ai-risk-medium', HIGH: 'ai-risk-high' }[risk] || 'ai-risk-medium';
    const riskLabel = { LOW: 'LOW RISK', MEDIUM: 'MEDIUM RISK', HIGH: 'HIGH RISK' }[risk] || risk;

    el.result.innerHTML = `
      <div class="ai-result-header">
        <span class="ai-risk-badge ${riskClass}">${riskLabel}</span>
        <span class="ai-chip">🎯 ${AI.escapeHtml(data.threat_category || 'Uncategorized')}</span>
        <span class="ai-chip ai-chip-gemini">🤖 Gemini AI assessment</span>
      </div>

      <div class="ai-result-block">
        <h4 class="ai-result-heading">AI Verdict</h4>
        <p class="ai-verdict">${AI.escapeHtml(data.verdict || '')}</p>
      </div>

      ${listBlock('🚩 Red flags detected', data.red_flags, false)}
      ${data.explanation ? `<div class="ai-result-block"><h4 class="ai-result-heading">💭 Why it is suspicious</h4><p class="ai-verdict">${AI.escapeHtml(data.explanation)}</p></div>` : ''}
      ${listBlock('✅ Recommended actions', data.recommended_actions, true)}
      ${listBlock('🛡️ Safety tips', data.safety_tips, false)}

      <div class="ai-tutor-cta">
        <a href="ai-assistant.html" class="btn btn-secondary btn-sm" id="scam-ai-ask-tutor">🎓 Ask the AI Tutor about this</a>
      </div>

      <p class="ai-disclaimer">This is an AI assessment, not a guarantee. Gemini cannot determine with
      100% certainty that a message is (or is not) a scam. Always verify independently through the
      organization's official website or app, and report suspicious messages where appropriate.</p>
    `;
    el.result.style.display = 'block';

    // Hand context to the tutor page for a connected demo experience.
    const tutorLink = document.getElementById('scam-ai-ask-tutor');
    if (tutorLink) {
      tutorLink.addEventListener('click', () => {
        try {
          sessionStorage.setItem(
            'cybershield-ai-context',
            JSON.stringify({
              label: `Scam analysis: ${data.threat_category || 'suspicious message'} (${risk} risk)`,
              message:
                `I received a message that your scam analyzer rated as ${risk} risk ` +
                `(${data.threat_category || 'suspicious'}). ` +
                'How could a college student recognize scams like this, and what should I do next?',
            })
          );
        } catch (e) {
          /* sessionStorage unavailable - link still works */
        }
      });
    }

    if (el.result.animate) {
      el.result.animate(
        [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 250, easing: 'ease-out' }
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /* Analyze                                                             */
  /* ------------------------------------------------------------------ */

  async function analyze() {
    const text = (el.text.value || '').trim();

    if (!text && !currentImage) {
      AI.showError(el.result, 'Paste a suspicious message or attach a screenshot first.');
      return;
    }
    if (text.length > MAX_CHARS) {
      AI.showError(el.result, `Message is too long (${text.length} characters). Please trim it to ${MAX_CHARS} or fewer.`);
      return;
    }

    el.result.style.display = 'block';
    el.result.innerHTML = AI.loadingHtml('Analyzing with Gemini');
    AI.setBtnLoading(el.analyzeBtn, true, 'Analyzing with Gemini');
    el.analyzeBtn.disabled = true;

    try {
      const payload = { text: text || undefined };
      if (currentImage && currentImage.data) {
        payload.imageBase64 = currentImage.data;
        payload.imageMime = currentImage.mimeType;
      }
      const data = await AI.request('/api/ai/scam-analyze', payload);
      renderResult(data);
    } catch (err) {
      AI.showError(el.result, err.message);
    } finally {
      AI.setBtnLoading(el.analyzeBtn, false);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                              */
  /* ------------------------------------------------------------------ */

  el.analyzeBtn.addEventListener('click', analyze);

  el.text.addEventListener('input', () => {
    if (el.counter) {
      const len = el.text.value.length;
      el.counter.textContent = `${len} / ${MAX_CHARS}`;
      el.counter.classList.toggle('over', len > MAX_CHARS);
    }
    if (el.text.value.length <= MAX_CHARS) el.result.style.display = 'none';
  });

  el.text.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') analyze();
  });

  el.file.addEventListener('change', () => {
    if (el.file.files && el.file.files[0]) handleFile(el.file.files[0]);
    else resetImage();
  });

  if (el.clearImage) el.clearImage.addEventListener('click', resetImage);
})();
