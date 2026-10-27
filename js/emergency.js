/**
 * CyberShield - Emergency Response
 * Category tab switching for emergency incident panels
 * (Tabs use the ARIA tabs pattern: roving tabindex + arrow-key navigation)
 *
 * Deep links: toolkit.html?incident=<slug> opens the matching tab directly.
 * Supported slugs: phishing | financial | hacked | malware | identity | device
 * The URL query is kept in sync when the user switches tabs.
 */

(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const tabs = Array.from(document.querySelectorAll('.emergency-category-btn'));
    const panels = Array.from(document.querySelectorAll('.emergency-steps'));
    if (!tabs.length || !panels.length) return;

    // Progressive disclosure: each incident panel shows its first 3 response
    // steps; the remaining steps + notes stay in the DOM behind View More so
    // deep links and screen readers still reach the full guide.
    function setupPanelDisclosure() {
      panels.forEach((panel) => {
        const stepList = panel.querySelector('.step-list');
        if (!stepList || stepList.parentElement.querySelector('.emergency-more-region')) return;
        const steps = Array.from(stepList.children).filter(el => el.classList.contains('step-item'));
        if (steps.length <= 3) return;

        const region = document.createElement('div');
        region.className = 'viewmore-region emergency-more-region';
        region.id = 'emergency-more-' + panel.id;
        const inner = document.createElement('div');
        inner.className = 'viewmore-inner';
        region.appendChild(inner);

        const toMove = steps.slice(3);
        let sib = stepList.nextElementSibling; // notes / glossary links after the list
        while (sib) {
          const next = sib.nextElementSibling;
          toMove.push(sib);
          sib = next;
        }
        toMove.forEach(el => inner.appendChild(el));

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'viewmore-btn';
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', region.id);
        btn.innerHTML = '<span class="viewmore-label">View More</span> <span class="viewmore-arrow" aria-hidden="true">→</span>';

        // Button sits AFTER the expandable region so it lands at the bottom of
        // the revealed steps when expanded; collapsed the region is zero-height
        // so the button still reads as the next thing after the visible steps.
        stepList.insertAdjacentElement('afterend', region);
        region.insertAdjacentElement('afterend', btn);
      });
    }

    setupPanelDisclosure();

    function activateTab(tab, { focus = true, updateUrl = true } = {}) {
      tabs.forEach(t => {
        const selected = t === tab;
        t.classList.toggle('active', selected);
        t.setAttribute('aria-selected', String(selected));
        t.setAttribute('tabindex', selected ? '0' : '-1');
      });

      panels.forEach(panel => {
        const isTarget = panel.id === tab.getAttribute('aria-controls');
        panel.classList.toggle('active', isTarget);
        panel.hidden = !isTarget;
      });

      // Keep the URL in sync so the active tab can be shared/bookmarked
      if (updateUrl && tab.dataset.category) {
        try {
          const url = new URL(window.location.href);
          url.searchParams.set('incident', tab.dataset.category);
          window.history.replaceState(null, '', url);
        } catch (e) { /* very old browser without URL API - ignore */ }
      }

      if (focus) tab.focus();
    }

    tabs.forEach(tab => {
      tab.addEventListener('click', () => activateTab(tab, { focus: false }));
    });

    // Roving tabindex keyboard navigation (Left/Right/Home/End)
    tabs.forEach((tab, i) => {
      tab.setAttribute('tabindex', i === 0 ? '0' : '-1');
      tab.addEventListener('keydown', (e) => {
        let target = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = tabs[(i + 1) % tabs.length];
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') target = tabs[0];
        else if (e.key === 'End') target = tabs[tabs.length - 1];
        if (target) {
          e.preventDefault();
          activateTab(target);
        }
      });
    });

    // Deep link support: toolkit.html?incident=financial
    const requested = new URLSearchParams(window.location.search).get('incident');
    if (requested) {
      const target = tabs.find(t => t.dataset.category === requested);
      if (target) {
        activateTab(target, { focus: false, updateUrl: false });
        const panel = document.getElementById(target.getAttribute('aria-controls'));
        if (panel) {
          // A deliberately deep-linked guide is wanted in full: expand it.
          const region = panel.querySelector('.viewmore-region');
          if (region && window.CyberViewMore) window.CyberViewMore.open(region);
          if (panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      // Unknown slug: fall through and leave the default (Phishing) tab active
    }
  });
})();
