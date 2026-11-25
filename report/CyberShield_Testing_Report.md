# CyberShield — Testing Report

**Project:** CyberShield, AI-powered cybersecurity awareness platform
**Document type:** Test execution report (companion to *CyberShield Final Project Report*, Chapter 11)
**Audit script:** `scripts/system-audit.mjs`
**Raw log:** `report/logs/system-audit.log`
**Date of recorded run:** 25 November 2026
**Result:** 107 passed, 4 failed, 111 checks (96.4 % pass rate)

---

## 1. Scope and method

Testing was performed by executing the project's own end-to-end audit script against a **running instance** of the application, with the **real MongoDB Atlas database** and the **configured Gemini API key**. No mocks, stubs or fixtures replaced the database or the AI service.

The audit script:

1. Starts from a clean HTTP client with no session.
2. Creates its own temporary user accounts, quiz sessions and question fixtures, each identified by a per-run random token.
3. Exercises the HTTP API exactly as the browser client does (same routes, same JSON bodies, same cookie jar).
4. Verifies results in two ways: the HTTP status and response body, and a **direct MongoDB query** for the persisted state (for example reading `passwordHash` from the user document, or comparing the approved question count before and after an approval).
5. Removes the fixtures whose identifiers it generated during that run.

Pre-existing user data is not modified. Sessions created by the script are its own; the temporary users are deleted at the end of the run.

### 1.1 What "passed" means

A check passes only when the observed status code **and** the observed payload **and**, where applicable, the database state all match the expected result. A check that returns the right status with the wrong body fails. No check was skipped, retried until green, or adjusted after the fact.

---

## 2. Test environment

| Item | Value |
|---|---|
| Application | `node server/server.js`, listening on `http://localhost:3000` |
| Database | MongoDB Atlas, database `cybershield`, connection verified at start-up |
| AI service | Google Gemini API, key loaded from `.env` (server-side only) |
| Node.js | v24.21.0 on the test machine (`package.json` requires >= 20) |
| Audit script | `scripts/system-audit.mjs` |
| Server log | `report/logs/server-run.log` |
| Browser used for screenshots | Packaged Chromium, viewport 1366 × 900 |

Start-up was verified before the audit: the server printed the database-connected banner and `GET /api/quiz/meta` returned 200 with `approved = 300`.

---

## 3. Summary of results by area

| Area | Checks | Passed | Failed |
|---|---:|---:|---:|
| Pages and static assets | 19 | 19 | 0 |
| Authentication and authorisation | 18 | 18 | 0 |
| User data isolation | 6 | 6 | 0 |
| Quiz, normal mode | 24 | 24 | 0 |
| Repetition and rotation | 4 | 4 | 0 |
| Adaptive quiz | 8 | 8 | 0 |
| Admin question management | 13 | 9 | 4 |
| AI features | 11 | 11 | 0 |
| Threat intelligence | 8 | 8 | 0 |
| **Total** | **111** | **107** | **4** |

Additional counters printed by the script: **17 pages** swept, **243 local assets** resolved, **1 external AI failure** (recorded as a graceful-degradation pass, see TC-39).

---

## 4. Functional test cases

Status column: **P** = passed, **F** = failed.

| Test Case ID | Module | Test Scenario | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|
| TC-01 | Pages | Request each of the 17 HTML pages | Every page returns 200 | 17 of 17 returned 200 | P |
| TC-02 | Assets | Resolve every local asset referenced by every page | All assets resolve | 243 assets resolved | P |
| TC-03 | Auth | Register a new account | 201 with a safe user object | Created; no `passwordHash` field in the response | P |
| TC-04 | Auth | Register with `role=admin` in the request body | Role stays `user` | `role = user` | P |
| TC-05 | Auth | Inspect the session cookie | `HttpOnly` and `SameSite` set | `HttpOnly = true`, `SameSite = Lax` | P |
| TC-06 | Auth | Register the same email twice | 409 with an explanatory message | 409 returned | P |
| TC-07 | Auth | Sign in with a wrong password | 401, identical to the unknown-email response | 401 | P |
| TC-08 | Auth | Compare unknown-email and wrong-password responses | No difference that reveals account existence | Identical status and message | P |
| TC-09 | Auth | Sign in successfully and compare session ids | Session id changes (fixation defence) | Rotated | P |
| TC-10 | Auth | Read the stored password | bcrypt hash, cost 12 | `$2b$12$...` | P |
| TC-11 | Auth | `GET /api/dashboard` without a session | 401 | 401 | P |
| TC-12 | Auth | `GET /api/quiz/history` without a session | 401 | 401 | P |
| TC-13 | Auth | `GET /api/admin/stats` as a normal user | 403 | 403 | P |
| TC-14 | Auth | POST with a foreign `Origin` header | 403 | 403 | P |
| TC-15 | Isolation | User B requests User A's quiz id | 404, not A's data | 404 | P |
| TC-16 | Isolation | Compare two dashboards | Different user objects and statistics | Separate data returned | P |
| TC-17 | Quiz | `GET /api/quiz/meta` | Approved count, no answer keys | `approved = 300` | P |
| TC-18 | Quiz | Serve a question | Four options, no correct index | 4 options, key absent | P |
| TC-19 | Quiz | Answer five questions and submit | Official score matches the answers given | 3 of 5 correct, score 60 | P |
| TC-20 | Quiz | Submit the same quiz twice | One attempt row, idempotent response | `duplicate = true`, count = 1 | P |
| TC-21 | Quiz | Check the dashboard after a saved attempt | Attempt appears with score | `attempts = 1` | P |
| TC-22 | Rotation | Take a second run | No duplicate ids inside the run, unseen preferred | `overlap = 0` | P |
| TC-23 | Adaptive | Answer two questions correctly in a row | Difficulty steps up once | `moved = 1`, `medium` | P |
| TC-24 | Adaptive | Then answer two incorrectly | Difficulty steps down once | `moved = -1`, `easy` | P |
| TC-25 | Adaptive | Submit an adaptive run | Difficulty-weighted score and raw score both reported | weighted 29, raw 33 | P |
| TC-26 | Admin | Log in as an administrator | 200 with `role = admin` | 200, admin | P |
| TC-27 | Admin | Create a pending question through the API | 201 with status `pending` | **400 — duplicate of an existing question** | **F** |
| TC-28 | Admin | Approve that pending question | 200 with status `approved` | **Not possible — the question was never created** | **F** |
| TC-29 | Admin | See the approved count increment after approval | approved + 1 | **300 → 300** | **F** |
| TC-30 | Admin | Retire the approved question | 200 with `retired = true` | **Not possible — the question was never created** | **F** |
| TC-31 | Admin | Reject a pending question | 200 with status `rejected` | Rejected | P |
| TC-32 | Admin | Check the moderation log | Every action recorded with its actor | `reject, create-pending, reject, create-pending, retire, approve` | P |
| TC-33 | Admin | Approve a question as a normal user | 403 | 403 | P |
| TC-34 | AI | Submit an empty scam analysis | 400 | 400 | P |
| TC-35 | AI | Submit an invalid URL | 400 with a request for a valid URL | 400 | P |
| TC-36 | AI | Analyse a phishing message with a URL | Structured result with URL findings | `CRITICAL`, with `url_analysis` and defensive actions | P |
| TC-37 | AI | Call the tutor without a session | 401, body not processed | 401 | P |
| TC-38 | AI | Ask the tutor a normal question | A reply and key takeaways | Reply returned | P |
| TC-39 | AI | Request a learning path | A usable path, or a graceful degradation | Degraded gracefully (one external AI failure) | P |
| TC-40 | AI | Request a news explanation | A summary | Summary returned | P |
| TC-41 | Threats | List threats | 200 with pagination and source metadata | 200 | P |
| TC-42 | Threats | Filter by severity and search text | 200 | 200 | P |
| TC-43 | Threats | Request an impossible search | Zero results, not an error | `total = 0` | P |
| TC-44 | Threats | Send hostile pagination values | Values clamped | Clamped | P |
| TC-45 | Threats | Read source status | Per-source health and last update | 200 | P |

The 45 rows above are the consolidated scenarios behind the 111 individual assertions; several rows (TC-02, TC-19, TC-36, TC-41) expand into multiple assertions inside the script.

---

## 5. Analysis of the four failures

### 5.1 Single root cause

TC-27 to TC-30 are consecutive steps of one admin scenario and share one cause. The audit creates a question whose text embeds a random per-run token, then approves, counts and retires it. On this run the **create** call returned **400**, so no question existed and the three dependent steps could not execute.

### 5.2 Root cause established by direct reproduction

The duplicate detector was queried directly against the database with the same payload (`report/logs/check-duplicate.mjs`). A question left behind by an **earlier, interrupted audit run** — `audit-mwchhmjf-p1` — is stored with status `approved` and has nearly identical normalised text to the new payload:

```
duplicate result: near -> audit-mwchhmjf-p1
  "Audit pending question mwchhmjf: which practice best protects an account from credential stuffing?"
```

The platform's duplicate check compares normalised question text within the same topic using a **Jaccard similarity threshold of 0.82**, and it correctly classified the new payload as a near-duplicate.

### 5.3 Interpretation

- The application **behaved as designed**: it refused to add a near-identical second question to the assessed bank. A duplicate-accepting implementation would be the actual defect.
- The failure is a **test-fixture hygiene problem**, not a functional regression in admin question management.
- The audit script's cleanup removes only the fixture ids generated in the current run, so a run interrupted between create and cleanup leaves an approved question behind.
- That leftover question is now part of the real bank, which is why the approved count reads 300 and why the check *"retired question leaves the active bank"* passed by comparing 300 with 300.

### 5.4 Remediation (recommended, not performed)

1. Add a cleanup pass to the audit script that deletes rows whose `questionId` begins with the audit prefix, run before the fixtures are created.
2. Alternatively, isolate fixtures in a dedicated topic or a `test` flag excluded from the duplicate comparison.
3. Re-run the audit; TC-27 to TC-30 are expected to pass with an approved count of 300 → 301 → 300.

The cleanup was **not** performed during this documentation task because the task explicitly forbids modifying project data, schemas or the database.

---

## 6. Additional verified behaviour (non-assertion observations)

These were observed during the run and are recorded because they support statements made in the report, but they are **not** counted among the 111 checks:

- `password123` scores **7 bits / Very Weak** in the client-side checker; the algorithm pool is 26 + 26 + 10 + 32 characters and the penalty schedule is implemented in `js/password.js`.
- Gemini primary model `gemini-3.8-flash` with a 12 s timeout and fallback `gemini-3.5-flash-lite` with 20 s, two attempts with backoff.
- Threat intelligence page reported **5,353 records** (1,795 CISA KEV + 3,558 NIST NVD).
- Scam analyzer returned a normalised risk score of **95/100, CRITICAL**, with evidence phrases copied from the submitted message.

---

## 7. Tests not performed

The following were **not** executed and are therefore not claimed anywhere in the report.

| Activity | Status / reason |
|---|---|
| Full manual click-through of every control on every page | Not performed; only the pages needed for the screenshot chapter were exercised |
| Cross-browser testing (Firefox, Safari) | Not performed; captures taken in the packaged Chromium |
| Mobile and tablet layout verification | Not performed; layout described, not visually verified at those widths |
| Accessibility audit (WCAG 2.1) | Not performed; ARIA attributes read in source but not audited |
| Load, stress and performance measurement | Not performed; no response-time figures reported |
| Penetration test or vulnerability scan | Not performed |
| Email verification, password reset, two-factor flows | Not applicable — not implemented |
| Re-run of the audit after cleaning the stale fixture | Not performed, to avoid modifying project data |
| Unit-test suite | No unit-test framework is present in the repository; all testing is end-to-end |

---

## 8. How to reproduce

```bash
# 1. from the project root, with .env configured
npm install
node server/server.js

# 2. in a second terminal, after the database banner appears
node scripts/system-audit.mjs
```

The script prints each check with `PASS`/`FAIL` and a one-line observation, then a summary line of the form:

```
SUMMARY: 107/111 checks passed
Pages swept: 17; assets checked: 243; AI external failures: 1
FAILURES: 4
```

The recorded output of the run documented here is preserved verbatim in `report/logs/system-audit.log`.
