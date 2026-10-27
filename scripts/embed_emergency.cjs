/**
 * CyberShield - One-time content migration (2025)
 *
 * Moves two sections into html/toolkit.html before their source pages are removed:
 *   1. The AI Scam Analyzer section (from simulator.html)  -> toolkit.html (after checklists)
 *   2. The Emergency Response guide (from emergency.html)  -> toolkit.html#emergency-response
 *
 * Also adds the required script tags (ai-client.js, scam-analyzer.js, emergency.js).
 * Safe to re-run: skips if #ai-analyzer-section already exists in toolkit.html.
 */

const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'html', f), 'utf8');

const toolkit = read('toolkit.html');
if (toolkit.includes('id="ai-analyzer-section"')) {
  console.log('toolkit.html already migrated, skipped');
  process.exit(0);
}

// --- 1. AI Scam Analyzer section (self-contained <section>) ---
const sim = read('simulator.html');
const aStart = sim.indexOf('<!-- AI Scam Analyzer (Gemini) -->');
const aEnd = sim.indexOf('<!-- About Section -->');
if (aStart === -1 || aEnd === -1 || aEnd <= aStart) throw new Error('analyzer section not found in simulator.html');
const analyzerChunk = sim.slice(aStart, aEnd).replace(/\s+$/, '');

// --- 2. Emergency guide content (quickref + disclaimer + contacts + tabs + panels) ---
const em = read('emergency.html');
const eStart = em.indexOf('<!-- Panic Quick Reference');
const eEnd = em.indexOf('<!-- Print-Friendly');
if (eStart === -1 || eEnd === -1 || eEnd <= eStart) throw new Error('emergency content not found in emergency.html');
const emergencyChunk = em.slice(eStart, eEnd).replace(/\s+$/, '');

const emergencySection = [
  '    <!-- Cyber Emergency Response Guide (migrated from the former Emergency page) -->',
  '    <section class="section" id="emergency-response" style="background: var(--color-bg-elevated);">',
  '      <div class="container">',
  '        <div style="max-width: 900px; margin: 0 auto;">',
  '          <header style="text-align: center; margin-bottom: 2rem;">',
  '            <h2>Cyber Emergency Response Guide</h2>',
  '            <p style="color: var(--color-text-secondary); font-size: 1.125rem; margin-top: 0.75rem;">Immediate step-by-step actions for common cyber incidents. India-specific reporting guidance included.</p>',
  '          </header>',
  '',
  emergencyChunk
].join('\r\n');

// --- Insert into toolkit.html before </main> ---
const mainClose = toolkit.lastIndexOf('</main>');
if (mainClose === -1) throw new Error('</main> not found in toolkit.html');
let out = toolkit.slice(0, mainClose) + '\r\n' + analyzerChunk + '\r\n\r\n' + emergencySection + '\r\n  ' + toolkit.slice(mainClose);

// --- 3. Script tags after main.js ---
out = out.replace(
  /(<script src="\.\.\/js\/main\.js"><\/script>)/,
  '$1\r\n  <script src="../js/ai-client.js"></script>\r\n  <script src="../js/scam-analyzer.js"></script>\r\n  <script src="../js/emergency.js"></script>'
);
if (!out.includes('scam-analyzer.js')) throw new Error('script tags not inserted');

fs.writeFileSync(path.join(__dirname, '..', 'html', 'toolkit.html'), out);
console.log('toolkit.html: embedded AI Scam Analyzer + Emergency Response Guide + scripts');
