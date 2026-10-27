#!/usr/bin/env node
/**
 * One-time helper: insert the "AI CyberShield" nav item into every page's
 * standard header nav (desktop + mobile), right before the About link.
 *
 * - Skips pages that already contain the AI nav item (ai-assistant.html).
 * - Skips pages without the standard nav (e.g. emergency-print.html).
 * - Run once:  node scripts/add_ai_nav.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HTML_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'html');

const AI_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"></path><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"></path></svg>';

const NAVS = [
  { cls: 'nav-link', size: 18 },
  { cls: 'mobile-nav-link', size: 22 },
];

const files = fs.readdirSync(HTML_DIR).filter((f) => f.endsWith('.html'));
let changed = 0;

for (const file of files) {
  const p = path.join(HTML_DIR, file);
  let src = fs.readFileSync(p, 'utf8');

  if (src.includes('href="ai-assistant.html"')) {
    console.log(`skip (already has AI nav): ${file}`);
    continue;
  }

  let edits = 0;
  for (const nav of NAVS) {
    // Match the About <li> opening regardless of "active" classes after nav-link,
    // preserving the original indentation.
    const re = new RegExp(`(^[ \\t]*)(<li><a href="about\\.html" class="${nav.cls})`, 'm');
    if (!re.test(src)) continue;
    const item =
      `<li><a href="ai-assistant.html" class="${nav.cls}">` +
      AI_ICON.replaceAll('{SIZE}', String(nav.size)) +
      'AI CyberShield</a></li>';
    src = src.replace(re, (_m, indent, li) => `${indent}${item}\n${indent}${li}`);
    edits++;
  }

  if (edits > 0) {
    fs.writeFileSync(p, src);
    console.log(`updated (${edits} navs): ${file}`);
    changed++;
  } else {
    console.log(`skip (no standard nav found): ${file}`);
  }
}

console.log(`\nDone. ${changed} file(s) updated.`);
