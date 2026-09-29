/**
 * CyberShield - Emergency Print Guide
 * Print button + generated date for the print-friendly emergency page
 */

(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    // Fill the "Printed" date with today's date
    const dateEl = document.getElementById('print-date');
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }

    // Wire up the Print / Save-as-PDF button
    const printBtn = document.getElementById('print-btn');
    if (printBtn) {
      printBtn.addEventListener('click', () => window.print());
    }
  });
})();
