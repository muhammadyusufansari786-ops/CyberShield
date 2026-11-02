/**
 * One-time migration: on every page, replace the duplicated inline footer with
 * a single shared-footer placeholder element and include js/footer.js.
 */
const fs = require('fs');
const path = require('path');

const PAGES = [
  'about', 'ai-assistant', 'glossary', 'index', 'news',
  'password', 'quiz', 'resources', 'threats', 'toolkit',
];

const FOOTER_RE = /\r?\n?[ \t]*<footer class="footer"[^>]*>[\s\S]*?<\/footer>/;

let changed = 0;
for (const name of PAGES) {
  const file = path.join(__dirname, '..', 'html', `${name}.html`);
  let html = fs.readFileSync(file, 'utf8');

  if (!FOOTER_RE.test(html)) {
    console.warn(`SKIP ${name}.html: existing <footer> not found`);
    continue;
  }

  // Keep the file's own detected EOL so diffs stay clean
  const eol = html.includes('\r\n') ? '\r\n' : '\n';

  const replacement =
    `${eol}  <footer id="site-footer" class="footer" role="contentinfo" aria-label="Site footer"></footer>`;

  html = html.replace(FOOTER_RE, replacement);

  // Include the shared component right after main.js
  if (!/js\/footer\.js/.test(html)) {
    const mainScript = html.match(/([ \t]*<script src="\.\.\/js\/main\.js"><\/script>)/);
    if (!mainScript) {
      console.warn(`SKIP ${name}.html: main.js include not found`);
      continue;
    }
    html = html.replace(
      mainScript[1],
      `${mainScript[1]}${eol}${' '.repeat(mainScript[1].search(/\S/))}<script src="../js/footer.js" defer></script>`
    );
  }

  fs.writeFileSync(file, html);
  changed++;
  console.log(`OK   ${name}.html`);
}
console.log(`\n${changed}/${PAGES.length} pages migrated.`);
