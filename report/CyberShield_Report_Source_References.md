# CyberShield — Source References and Code Inventory

**Purpose.** This document records what was actually read and inspected while writing *CyberShield Final Project Report*, so that every technical claim in the report can be traced to a file. It also inventories the API surface, the data model and the external sources consulted.

All line counts are from the delivered repository at the time of the report. No project source file was modified to produce the report; the report generator lives entirely in `report/`.

---

## 1. Repository layout

| Path | Contents | Lines |
|---|---|---:|
| `server/server.js` | Express application, middleware order, mount points, start-up checks, graceful shutdown | 273 |
| `server/config/database.js` | Mongoose connection, retry/backoff, `requireDb` guard | 89 |
| `server/config/session.js` | `express-session` + `connect-mongo` configuration, cookie flags | 67 |
| `server/middleware/auth.js` | `requireAuth`, `requireAdmin`, `sameOriginGuard` | 59 |
| `server/models/User.js` | User schema, bcrypt pre-save hook, `comparePassword`, safe projection | 62 |
| `server/models/index.js` | `QuizAttempt`, `ScamReport`, `LearningProgress`, `TutorConversation` schemas + indexes | 195 |
| `server/models/quizBank.js` | `Question`, `QuizSession`, `QuestionHistory`, `AdminQuestionLog` schemas | ~190 |
| `server/models/ThreatIntel.js` | `ThreatItem`, `ThreatSyncState` schemas | ~90 |
| `server/routes/auth.js` | register, login, logout, me | 199 |
| `server/routes/quiz.js` | meta, start, next, answer, submit, history | 483 |
| `server/routes/admin.js` | stats, question CRUD, approve/reject/retire, generate, logs | 380 |
| `server/routes/dashboard.js` | dashboard, adaptive profile, quiz-attempts, learning-paths | 423 |
| `server/routes/learning.js` | roadmap read/create, lesson progress | 312 |
| `server/routes/ai.js` | scam-analyze, tutor, learning-path, news-explain | 392 |
| `server/routes/tutor.js` | conversation read/append/clear | 92 |
| `server/routes/threats.js` | threat list and per-source status | 135 |
| `server/services/gemini.js` | model selection, timeouts, retries, prompts, JSON schemas, validation, error mapping | 867 |
| `server/services/tutor.js` | tutor prompt, safety guard, personalisation context | 888 |
| `server/services/question-bank.js` | selection, rotation, duplicate detection (Jaccard 0.82) | 624 |
| `server/services/adaptive.js` | difficulty ladder, weighted scoring | 208 |
| `server/services/url-analyzer.js` | structural URL analysis, brand list, no network I/O | 300 |
| `server/services/learning-roadmap.js` | rule-based roadmap generation and degradation | 319 |
| `server/services/threat-intel.js` | CISA KEV and NIST NVD sync, normalisation, search | 517 |
| `server/services/question-generator.js` | AI question generation with validation | 126 |
| **Server total** | | **7,285** |

### 1.1 Front end

| Path | Contents | Lines |
|---|---|---:|
| `html/index.html` | Home page, emergency strip, hero | 483 |
| `html/register.html`, `html/login.html` | Account pages | 99 / 83 |
| `html/dashboard.html` | User dashboard | 108 |
| `html/quiz.html` | Quiz runner | 249 |
| `html/password.html` | Password strength checker | 283 |
| `html/ai-assistant.html` | AI tutor / assistant | 138 |
| `html/threats.html` | Threat awareness catalogue | 679 |
| `html/toolkit.html` | Safety toolkit with progress | 808 |
| `html/news.html` | Curated news with AI explanation | 154 |
| `html/glossary.html` | Glossary with search | 121 |
| `html/resources.html`, `html/about.html` | Resources and about | 112 / 192 |
| `html/admin.html` | Administrative question management | — |
| `index.html` | Root redirect into `html/` | 14 |
| `js/quiz.js` | Quiz client: serving, timers, adaptive flow, submission | 1,355 |
| `js/ai-assistant.js` | Tutor client | 665 |
| `js/news.js` | News client | 531 |
| `js/password.js` | Strength algorithm (entropy, penalties, bands) | 404 |
| `js/main.js` | Shared navigation, layout behaviour | 397 |
| `js/glossary.js` | Glossary client | 372 |
| `js/dashboard.js` | Dashboard rendering | 351 |
| `js/scam-analyzer.js` | Scam analyzer client | 309 |
| `js/auth.js` | Session-aware navigation | 134 |
| `js/ai-client.js` | Shared AI fetch helper with error mapping | 170 |
| `js/resources.js`, `js/emergency.js`, `js/footer.js`, `js/view-more.js` | Page helpers | 155 / 125 / 75 / 65 |
| `css/style.css` | Single stylesheet, design tokens, responsive rules | 3,562 |

Totals: **17 HTML pages** under `html/` (plus the root `index.html` redirect, which is not counted as a page — the audit sweeps 17), **19 JavaScript modules ≈ 7,010 lines**, **3 CSS files** (`style.css`, `tutor.css`, `learning-path.css`), **8 bundled JSON data files**.

### 1.2 Data files

| File | Records/role |
|---|---|
| `data/quiz-questions.json` | Seed question bank (imported on first run when the collection is empty) |
| `data/glossary-data.json` | Glossary terms, definitions and categories (920 lines) |
| `data/news-data.json` | Curated news items (280 lines) |
| `data/threats-data.json` | Awareness threat entries (351 lines) |
| `data/tips-data.json`, `data/resources-data.json`, `data/simulator-data.json` | Tips, resources, simulator scenarios |

---

## 2. API surface (verified by route inspection)

**36 endpoints across 8 routers.** Mount order matters and is taken from `server/server.js` lines 174–183.

### 2.1 `/api/auth` — `server/routes/auth.js`

| Method | Path | Guard |
|---|---|---|
| POST | `/register` | `sameOriginGuard`, 16 kB body, register limiter |
| POST | `/login` | `sameOriginGuard`, login limiter, `session.regenerate()` |
| POST | `/logout` | `sameOriginGuard`, session destroy |
| GET | `/me` | — (returns null when signed out) |

### 2.2 `/api/quiz` — `server/routes/quiz.js`

| Method | Path | Guard |
|---|---|---|
| GET | `/meta` | — |
| POST | `/start` | `sameOriginGuard`, quiz limiter |
| POST | `/next` | `sameOriginGuard`, quiz limiter |
| POST | `/answer` | `sameOriginGuard`, quiz limiter |
| POST | `/submit` | `sameOriginGuard`, quiz limiter, idempotent |
| GET | `/history` | `requireAuth` |

### 2.3 `/api/admin` — `server/routes/admin.js`

| Method | Path | Guard |
|---|---|---|
| GET | `/stats` | `requireAdmin` |
| GET | `/questions` | `requireAdmin` |
| GET | `/questions/:questionId` | `requireAdmin` |
| POST | `/questions` | `requireAdmin`, `sameOriginGuard` |
| PATCH | `/questions/:questionId` | `requireAdmin`, `sameOriginGuard` |
| POST | `/questions/:questionId/approve` | `requireAdmin`, `sameOriginGuard` |
| POST | `/questions/:questionId/reject` | `requireAdmin`, `sameOriginGuard` |
| POST | `/questions/:questionId/retire` | `requireAdmin`, `sameOriginGuard` |
| POST | `/generate` | `requireAdmin`, generate limiter |
| GET | `/logs` | `requireAdmin` |

### 2.4 `/api/learning` — `server/routes/learning.js`

| Method | Path | Guard |
|---|---|---|
| GET | `/roadmap` | — |
| POST | `/roadmap` | `sameOriginGuard`, write limiter |
| PATCH | `/roadmap/:roadmapId/lessons/:lessonKey` | `sameOriginGuard`, write limiter |

### 2.5 `/api/tutor` — `server/routes/tutor.js`

| Method | Path | Guard |
|---|---|---|
| GET | `/conversation` | `requireAuth` |
| POST | `/conversation` | `requireAuth`, `sameOriginGuard` |
| DELETE | `/conversation` | `requireAuth`, `sameOriginGuard` |

### 2.6 `/api` (dashboard) — `server/routes/dashboard.js`

| Method | Path | Guard |
|---|---|---|
| GET | `/dashboard` | `requireAuth` |
| GET | `/adaptive/profile` | `requireAuth` |
| POST | `/quiz-attempts` | `writeLimiter`, `sameOriginGuard`, `requireAuth` |
| POST | `/learning-paths` | `writeLimiter`, `sameOriginGuard`, `requireAuth` |

### 2.7 `/api/ai` — `server/routes/ai.js`

| Method | Path | Guard |
|---|---|---|
| POST | `/scam-analyze` | 12 MB body (screenshots), AI limiter |
| POST | `/tutor` | `requireAuth`, `sameOriginGuard`, tutor limiter, 100 kB |
| POST | `/learning-path` | 50 kB body |
| POST | `/news-explain` | 100 kB body |

### 2.8 `/api/threats` — `server/routes/threats.js`

| Method | Path | Guard |
|---|---|---|
| GET | `/` | threats limiter, pagination clamping |
| GET | `/status` | threats limiter |

Unknown `/api/*` paths fall through to a JSON 404 (`server/server.js` line 186), so API errors never return HTML.

---

## 3. Data model (11 collections)

| Model | Collection | Purpose | Notable indexes / rules |
|---|---|---|---|
| `User` | `users` | Account, role, bcrypt hash | unique `email`; `passwordHash` select:false |
| `Question` | `questions` | Question bank | `status`, topic/subtopic, difficulty |
| `QuizSession` | `quizsessions` | In-progress run with server-side answer key | TTL 6 h; `user` + `status` |
| `QuizAttempt` | `quizattempts` | Completed run and official score | `user` + `createdAt` |
| `QuestionHistory` | `questionhistories` | Per-user per-question exposure | `user` + `question` |
| `AdminQuestionLog` | `adminquestionlogs` | Moderation audit trail | `questionId`, `actor`, `action` |
| `ScamReport` | `scamreports` | Schema exists; intentionally **never written** (privacy) | — |
| `LearningProgress` | `learningprogresses` | Lesson completion and streaks | `user` unique |
| `TutorConversation` | `tutorconversations` | Bounded conversation history | `user` unique |
| `ThreatItem` | `threatitems` | Normalised KEV/NVD records | `cveId` unique, severity, `source` |
| `ThreatSyncState` | `threatsyncstates` | Per-source sync cursor and health | `source` unique |

---

## 4. Quality-assurance assets inspected

| File | Lines | Role |
|---|---:|---|
| `scripts/system-audit.mjs` | 584 | End-to-end audit: 111 checks, 17 pages, 243 assets; source of Chapter 11 |
| `scripts/quiz-bank-qa.mjs` | ~370 | Question-bank integrity checks |
| `scripts/learning-roadmap-qa.mjs` | ~360 | Roadmap generation checks |
| `scripts/make-admin.js` | 34 | Promotes an existing account; keeps admin creation off the public API |
| `scripts/gemini-diagnose.mjs` | 86 | Reports which models the key can reach |
| `scripts/probe_models.cjs` | 31 | Model availability probe |
| `report/logs/system-audit.log` | 137 | Verbatim output of the recorded run (107 pass / 4 fail) |
| `report/logs/check-duplicate.mjs` | — | Reproduction of the duplicate detector for the TC-27 root cause |

---

## 5. Where specific report claims come from

| Report claim | Source |
|---|---|
| bcrypt cost 12, `$2b$12$` hash prefix | `server/models/User.js` pre-save hook; audit assertion |
| Session id regenerates on login | `server/routes/auth.js` `req.session.regenerate()`; audit assertion |
| Cookie is `HttpOnly`, `SameSite=Lax` | `server/config/session.js`; audit cookie assertion |
| `sameOriginGuard` on every state change | `server/middleware/auth.js`, applied in the route files listed in §2 |
| Quiz answer key never sent to the client | `server/routes/quiz.js` (`/next` projection), `server/models/quizBank.js` session schema |
| Difficulty-weighted adaptive score | `server/services/adaptive.js`; audit `weighted=29 raw=33` |
| Two correct steps difficulty up, two wrong steps down | `server/services/adaptive.js`; audit `moved = 1 / -1` |
| Duplicate threshold Jaccard 0.82 within topic | `server/services/question-bank.js`; `check-duplicate.mjs` output |
| Gemini primary/fallback models, 12 s / 20 s, two attempts | `server/services/gemini.js` |
| AI errors map to 503 / 422 with fixed messages | `server/services/gemini.js` (`AI_UNAVAILABLE_MESSAGE`, `AI_BLOCKED_MESSAGE`) |
| URL analyzer performs no network request | `server/services/url-analyzer.js` (no `fetch`/`http` call), stated as SSRF prevention |
| Scam content is never persisted | `server/routes/ai.js` (no model write), `ScamReport` unused |
| Password algorithm pool and penalties, 7 bits for `password123` | `js/password.js`; screenshot 06 |
| 300 approved questions, 5,353 threat records, 36 endpoints | Audit run and route/model inspection (§2, §3) |
| Performance/pages: 17 HTML pages, 243 assets, 17 JS modules 7,010 lines | Repository inventory (§1) |

---

## 6. External sources consulted

Documentation and standards referenced while designing, building or documenting the system:

1. Google — Gemini API documentation (generateContent, structured output, safety settings): https://ai.google.dev/gemini-api/docs
2. Google — Gen AI SDK for JavaScript (`@google/genai`): https://googleapis.github.io/js-genai/
3. Google — Gemini API rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
4. MongoDB — Manual (data modelling, indexes, TTL): https://www.mongodb.com/docs/manual/
5. Mongoose — Schemas, indexes, middleware: https://mongoosejs.com/docs/
6. Node.js — v20 LTS API documentation: https://nodejs.org/docs/latest-v20.x/api/
7. Express 5 — Routing, middleware, error handling: https://expressjs.com/
8. `express-session`: https://github.com/expressjs/session
9. `connect-mongo`: https://github.com/jdesboeufs/connect-mongo
10. `express-rate-limit`: https://express-rate-limit.mintlify.app/
11. OWASP Top 10 — 2021: https://owasp.org/Top10/
12. OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
13. OWASP CSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
14. OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
15. OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
16. NIST SP 800-63B — Digital Identity Guidelines: https://pages.nist.gov/800-63-3/sp800-63b.html
17. CISA — Known Exploited Vulnerabilities Catalog: https://www.cisa.gov/known-exploited-vulnerabilities-catalog
18. NIST — National Vulnerability Database API 2.0: https://nvd.nist.gov/developers/vulnerabilities
19. CERT-In — Advisories: https://www.cert-in.org.in/
20. National Cyber Crime Reporting Portal (India): https://cybercrime.gov.in/
21. CEIR (India): https://ceir.gov.in/
22. MDN Web Docs — Fetch API and URL: https://developer.mozilla.org/en-US/docs/Web/API
23. W3C — HTML Living Standard / WAI-ARIA Authoring Practices: https://www.w3.org/TR/wai-aria-practices/
24. bcryptjs: https://github.com/dcodeIO/bcrypt.js
25. ReportLab User Guide (PDF edition of this report): https://docs.reportlab.com/
26. python-docx (DOCX edition of this report): https://python-docx.readthedocs.io/

---

## 7. Document-generation assets (not part of the application)

These files exist only to produce the report and do not affect the running platform:

| File | Role |
|---|---|
| `report/docmodel.py` | Shared content model: front matter, team, placeholders, figure/table numbering, block expansion |
| `report/content_a.py` … `content_d.py` | Report text as typed blocks (Chapters 1–5, 6, 7–9, 10–16 + references) |
| `report/build_docx.py` | Builds the DOCX edition (styles, live TOC field, footer page numbers) |
| `report/build_pdf.py` | Builds the PDF edition and the architecture PDF (two-pass page numbering) |
| `report/make_diagrams.py` | Renders the 8 diagrams with matplotlib at 200 dpi |
| `report/clean_shots.py` | Paints over the browser badge on the captures; no page content altered |
| `report/diagrams/` | 8 diagram PNGs |
| `report/screenshots/` | 15 cleaned screenshots of the running application |
| `report/logs/` | Server log, audit log, duplicate reproduction |

---

## 8. Statement of integrity

- No application source file, schema, route, prompt, `.env` file or database record was modified for this report.
- Screenshots are captures of the running application; the only image edit removes the browser chrome badge.
- Test results quoted in the report are the verbatim output of `scripts/system-audit.mjs`; the four failures are reported as failures with their root cause, and the stale fixture was left in place because deleting it would modify project data.
- Where a fact could not be verified, the report says so rather than estimating it (see Table 11.4 and Chapter 14).
