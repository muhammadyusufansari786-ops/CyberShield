/**
 * CyberShield - One-time navigation restructure (2025)
 *
 * Converts every standard page from [top horizontal nav + right mobile drawer]
 * to a single LEFT-side navigation drawer opened by a hamburger button
 * (visible at every viewport width).
 *
 * Per page it:
 *   1. Removes the <nav class="nav-desktop"> block.
 *   2. Inserts the hamburger toggle button before the logo in .header-inner.
 *   3. Replaces the #mobile-nav-overlay block with a left drawer (#nav-overlay
 *      > #nav-drawer) containing exactly 10 links.
 *   4. Repoints references to removed pages:
 *        emergency.html[?incident=X] -> toolkit.html[#emergency-response | ?incident=X]
 *        simulator.html              -> quiz.html
 *        tips.html                   -> index.html#daily-tips
 *
 * Skips: emergency-print.html, tips.html, emergency.html, simulator.html
 * (the latter three are deleted by the migration; the first is a print view).
 * Safe to re-run: pages already migrated are detected and left untouched.
 */

const fs = require('fs');
const path = require('path');

const HTML_DIR = path.join(__dirname, '..', 'html');
const SKIP = new Set(['emergency-print.html', 'tips.html', 'emergency.html', 'simulator.html']);

const svgOpen = 'xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const icon = (paths) => `<svg ${svgOpen}>${paths}</svg>`;

const LINKS = [
  ['index.html', 'Home', icon('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>')],
  ['password.html', 'Password Checker', icon('<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>')],
  ['quiz.html', 'Quiz', icon('<circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line>')],
  ['news.html', 'News', icon('<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2z"></path><polyline points="8 14 12 10 16 14"></polyline><line x1="12" y1="16" x2="12" y2="22"></line>')],
  ['threats.html', 'Threats', icon('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>')],
  ['toolkit.html', 'Toolkit', icon('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>')],
  ['glossary.html', 'Glossary', icon('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>')],
  ['resources.html', 'Resources', icon('<circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>')],
  ['ai-assistant.html', 'AI CyberShield', icon('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"></path><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"></path>')],
  ['about.html', 'About', icon('<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>')]
];

const HAMBURGER = [
  '      <button id="nav-toggle" class="nav-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="nav-drawer" type="button">',
  '        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>',
  '      </button>'
].join('\r\n');

function drawerMarkup() {
  const items = LINKS.map(([href, label, svg]) =>
    `        <li><a href="${href}" class="nav-drawer-link">${svg}${label}</a></li>`
  ).join('\r\n');
  return [
    '  <!-- Navigation Drawer (opens from the left) -->',
    '  <div id="nav-overlay" class="nav-overlay" role="dialog" aria-modal="true" aria-label="Navigation menu">',
    '    <nav id="nav-drawer" class="nav-drawer" aria-label="Main navigation">',
    '      <div class="nav-drawer-header">',
    '        <a href="index.html" class="logo" aria-label="CyberShield Home">',
    '          <span class="logo-icon" aria-hidden="true">\uD83D\uDEE1\uFE0F</span>',
    '          <span>CyberShield</span>',
    '        </a>',
    '        <button id="nav-close" class="nav-close" aria-label="Close menu" type="button">',
    '          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
    '        </button>',
    '      </div>',
    '      <ul class="nav-drawer-list">',
    items,
    '      </ul>',
    '      <div class="nav-drawer-footer">',
    '        <p>In an emergency? Call <strong>1930</strong> or report at',
    '          <a href="https://cybercrime.gov.in" target="_blank" rel="noopener">cybercrime.gov.in</a></p>',
    '      </div>',
    '    </nav>',
    '  </div>'
  ].join('\r\n');
}

function migrate(file) {
  const full = path.join(HTML_DIR, file);
  let html = fs.readFileSync(full, 'utf8');
  const original = html;
  const log = [];

  // 0. Already migrated?
  if (html.includes('id="nav-drawer"')) {
    return `${file}: already migrated, skipped`;
  }

  // 1. Remove desktop nav block
  const navRe = /[ \t]*<nav class="nav-desktop"[\s\S]*?<\/nav>\r?\n/;
  if (navRe.test(html)) {
    html = html.replace(navRe, '');
    log.push('removed nav-desktop');
  } else {
    log.push('WARN: nav-desktop not found');
  }

  // 2. Insert hamburger before the logo inside .header-inner
  const logoRe = /(<div class="header-inner">)(\r?\n[ \t]*)(<a href="index\.html" class="logo")/;
  if (logoRe.test(html)) {
    html = html.replace(logoRe, `$1\r\n${HAMBURGER}$2$3`);
    log.push('added nav-toggle');
  } else {
    log.push('WARN: header-inner logo pattern not found');
  }

  // 2b. Remove the old right-side hamburger from .header-actions
  const oldBtnRe = /[ \t]*<button id="mobile-menu-btn"[\s\S]*?<\/button>\r?\n/;
  if (oldBtnRe.test(html)) {
    html = html.replace(oldBtnRe, '');
    log.push('removed old mobile-menu-btn');
  } else {
    log.push('WARN: old mobile-menu-btn not found');
  }

  // 3. Replace the mobile overlay block (up to <main) with the left drawer
  const start = html.indexOf('<div id="mobile-nav-overlay"');
  const end = html.indexOf('<main', start);
  if (start !== -1 && end !== -1 && end > start) {
    // Also swallow a preceding "<!-- Mobile Navigation Overlay -->" comment
    let from = start;
    const commentStart = html.lastIndexOf('<!--', start);
    if (commentStart !== -1 && /Mobile Navigation Overlay/i.test(html.slice(commentStart, start))) {
      from = commentStart;
      // include leading indentation/newline before the comment
      while (from > 0 && /[ \t]/.test(html[from - 1])) from--;
      if (html[from - 1] === '\n') from--;
    }
    html = html.slice(0, from) + drawerMarkup() + '\r\n\r\n  ' + html.slice(end).replace(/^\r?\n/, '');
    log.push('replaced overlay with left drawer');
  } else {
    log.push('WARN: mobile-nav-overlay block not found');
  }

  // 4. Repoint removed pages
  html = html.replace(/emergency\.html\?incident=/g, 'toolkit.html?incident=');
  html = html.replace(/emergency\.html/g, 'toolkit.html#emergency-response');
  html = html.replace(/simulator\.html/g, 'quiz.html');
  html = html.replace(/tips\.html/g, 'index.html#daily-tips');
  log.push('repointed removed-page links');

  if (html === original) return `${file}: no changes`;

  // 5. Sanity checks
  if (html.includes('nav-desktop') || html.includes('mobile-nav-overlay') || html.includes('mobile-menu-btn') || html.includes('mobile-nav-link')) {
    throw new Error(`${file}: leftover old nav markup -> ${log.join(' | ')}`);
  }
  fs.writeFileSync(full, html);
  return `${file}: ${log.join(', ')}`;
}

const files = fs.readdirSync(HTML_DIR).filter(f => f.endsWith('.html'));
let failures = 0;
for (const f of files) {
  if (SKIP.has(f)) { console.log(`${f}: skipped`); continue; }
  try {
    console.log(migrate(f));
  } catch (e) {
    failures++;
    console.error(`ERROR ${e.message}`);
  }
}
console.log(failures ? `\n${failures} file(s) FAILED` : '\nAll files processed.');
process.exit(failures ? 1 : 0);
