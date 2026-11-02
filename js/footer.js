/**
 * CyberShield - Shared Footer Component
 *
 * Maintains the site footer in ONE place: every page contains a single
 * placeholder footer element (<footer id="site-footer" ...>) and this script
 * fills it with the shared markup. Edit footer content here and it updates on
 * every page automatically. CSS lives in css/style.css (footer-* rules).
 *
 * Why client-side rendering: the site is a pure static HTML/vanilla-JS frontend
 * served by express.static (no templating engine, no build step). A shared JS
 * component is the standard mechanism for partial reuse in this stack and works
 * whether a page is opened through the local server or directly.
 *
 * The placeholder keeps role="contentinfo" / the .footer classes so the footer
 * reserves its space in the document flow even before this script runs.
 */
(function () {
  'use strict';

  function render(el) {
    el.innerHTML = ''
      // Learning Modules
      + '<div class="container">'
      +   '<div class="footer-grid">'
      +     '<nav class="footer-column" aria-labelledby="footer-heading-learning">'
      +       '<h3 class="footer-title" id="footer-heading-learning">Learning Modules</h3>'
      +       '<ul class="footer-links">'
      +         '<li><a href="index.html" class="footer-link">Home</a></li>'
      +         '<li><a href="password.html" class="footer-link">Password Checker</a></li>'
      +         '<li><a href="quiz.html" class="footer-link">Cybersecurity Quiz</a></li>'
      +         '<li><a href="threats.html" class="footer-link">Common Threats</a></li>'
      +         '<li><a href="toolkit.html#emergency-response" class="footer-link">Emergency Guide</a></li>'
      +         '<li><a href="toolkit.html" class="footer-link">Safety Toolkit</a></li>'
      +       '</ul>'
      +     '</nav>'
      // Tools & Resources
      +     '<nav class="footer-column" aria-labelledby="footer-heading-tools">'
      +       '<h3 class="footer-title" id="footer-heading-tools">Tools &amp; Resources</h3>'
      +       '<ul class="footer-links">'
      +         '<li><a href="quiz.html" class="footer-link">Spot the Scam</a></li>'
      +         '<li><a href="index.html#daily-tips" class="footer-link">Daily Tips</a></li>'
      +         '<li><a href="glossary.html" class="footer-link">Cyber Glossary</a></li>'
      +         '<li><a href="news.html" class="footer-link">Cyber News</a></li>'
      +         '<li><a href="resources.html" class="footer-link">Trusted Sources</a></li>'
      +       '</ul>'
      +     '</nav>'
      // Legal & Privacy
      +     '<nav class="footer-column" aria-labelledby="footer-heading-legal">'
      +       '<h3 class="footer-title" id="footer-heading-legal">Legal &amp; Privacy</h3>'
      +       '<ul class="footer-links">'
      +         '<li><a href="about.html" class="footer-link">About &amp; Disclaimer</a></li>'
      +         '<li><a href="about.html" class="footer-link">Privacy Policy</a></li>'
      +       '</ul>'
      +     '</nav>'
      +   '</div>'
      +   '<div class="footer-bottom">'
      +     '<p>&copy; 2025 CyberShield. Educational purposes only. Not a substitute for professional security advice.</p>'
      +   '</div>'
      + '</div>';
  }

  function init() {
    const el = document.getElementById('site-footer');
    if (el && !(el.dataset.footerRendered === 'true')) {
      render(el);
      el.dataset.footerRendered = 'true';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
