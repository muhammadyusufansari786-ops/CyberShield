/**
 * CyberShield - View More / View Less progressive disclosure
 *
 * Shared helper used across content-heavy sections (Threats, Toolkit,
 * Glossary, News, Resources). Works with server-rendered or dynamically
 * injected markup: a single delegated listener handles every toggle, so
 * cards re-rendered by filters / load-more / search keep working.
 *
 * Markup contract (no duplicated content - the full copy lives once in the
 * region and is simply revealed on demand):
 *
 *   <button type="button" class="viewmore-btn"
 *           aria-expanded="false" aria-controls="UNIQUE_ID">
 *     <span class="viewmore-label">View More</span>
 *     <span class="viewmore-arrow" aria-hidden="true">→</span>
 *   </button>
 *   <div class="viewmore-region" id="UNIQUE_ID">
 *     <div class="viewmore-inner"> ...hidden until expanded... </div>
 *   </div>
 */

(function () {
  'use strict';

  function applyState(btn, region, open) {
    region.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.classList.toggle('is-open', open);
    const label = btn.querySelector('.viewmore-label');
    if (label) label.textContent = open ? 'View Less' : 'View More';
    const arrow = btn.querySelector('.viewmore-arrow');
    if (arrow) arrow.textContent = open ? '↑' : '→';
  }

  function regionFor(btn) {
    const id = btn.getAttribute('aria-controls');
    return id ? document.getElementById(id) : btn.parentElement.querySelector('.viewmore-region');
  }

  // One delegated listener for the whole site (static + re-rendered cards).
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.viewmore-btn');
    if (!btn) return;
    const region = regionFor(btn);
    if (!region) return;
    applyState(btn, region, !region.classList.contains('is-open'));
  });

  // Public API for code that needs to open regions programmatically
  // (e.g. glossary deep links, toolkit incident deep links).
  window.CyberViewMore = {
    open(region) {
      if (!region) return;
      const id = region.id;
      const btn = id
        ? document.querySelector(`.viewmore-btn[aria-controls="${id}"]`)
        : region.parentElement.querySelector('.viewmore-btn');
      if (btn) applyState(btn, region, true);
      else region.classList.add('is-open');
    },
    openAll(root) {
      (root || document).querySelectorAll('.viewmore-region').forEach((region) => this.open(region));
    }
  };
})();
