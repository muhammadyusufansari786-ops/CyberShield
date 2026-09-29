/**
 * CyberShield - Emergency Response
 * Category tab switching for emergency incident panels
 * (Tabs use the ARIA tabs pattern: roving tabindex + arrow-key navigation)
 *
 * Deep links: emergency.html?incident=<slug> opens the matching tab directly.
 * Supported slugs: phishing | financial | hacked | malware | identity | device
 * The URL query is kept in sync when the user switches tabs.
 */

(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const tabs = Array.from(document.querySelectorAll('.emergency-category-btn'));
    const panels = Array.from(document.querySelectorAll('.emergency-steps'));
    if (!tabs.length || !panels.length) return;

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

    // Deep link support: emergency.html?incident=financial
    const requested = new URLSearchParams(window.location.search).get('incident');
    if (requested) {
      const target = tabs.find(t => t.dataset.category === requested);
      if (target) {
        activateTab(target, { focus: false, updateUrl: false });
        const panel = document.getElementById(target.getAttribute('aria-controls'));
        if (panel && panel.scrollIntoView) {
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      // Unknown slug: fall through and leave the default (Phishing) tab active
    }
  });
})();
