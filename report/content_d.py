# -*- coding: utf-8 -*-
"""Report content, part D: Chapters 10-16 and references."""

BLOCKS = []
b = BLOCKS.append

# ----------------------------------------------------------------- 10
b(("h1", "Chapter 10  Security Implementation"))
b(("p", "This chapter separates what is implemented from what is recommended. Every item in section 10.2 was "
        "found in the source and, where marked, was verified by the audit described in Chapter 11. Section 10.4 "
        "lists controls that are not implemented, so that the report does not overstate the security of the "
        "application."))

b(("h2", "10.1  Threat Model Used"))
b(("p", "The design assumes four adversaries: a curious user of the same application trying to read another "
        "account's data, a malicious website attempting a cross-site request against a signed-in user, an "
        "attacker submitting hostile content to the AI or URL endpoints, and a script attempting to exhaust "
        "resources or guess credentials. Nation-state attackers, physical access to the server and supply-chain "
        "compromise of npm packages are out of scope."))

b(("h2", "10.2  Implemented Controls"))
b(("table", "Table 10.1  Security controls implemented in the project",
   ["Control", "Implementation", "Verified"],
   [
       ["Password hashing", "bcryptjs, cost factor 12, per-password salt", "Audit: stored hash begins $2b$12$"],
       ["Credential enumeration resistance", "Identical 401 message and a dummy-hash comparison for unknown emails",
        "Audit: wrong password does not enumerate"],
       ["Session fixation defence", "req.session.regenerate() on register and on login",
        "Audit: session id rotates on login"],
       ["Cookie hardening", "HttpOnly and SameSite=Lax, path '/', cleared on logout",
        "Audit: cookie flags asserted"],
       ["Server-side sessions", "connect-mongo store; no user data in the cookie", "Manual inspection"],
       ["Authorisation", "requireAuth on protected routes; requireAdmin re-reads the role from MongoDB",
        "Audit: 401 anonymous, 403 non-admin"],
       ["CSRF", "sameOriginGuard on every state-changing route", "Audit: cross-origin POST returns 403"],
       ["Mass assignment", "Explicit field lists on create; role cannot be set from a request body",
        "Audit: registration cannot set role=admin"],
       ["Input validation", "Type, length and pattern checks per field; control characters stripped",
        "Audit: invalid inputs return 400"],
       ["Body size limits", "Per-route express.json limits from 16 kB to 12 MB", "Manual inspection"],
       ["Rate limiting", "Per-route limits for login, register, AI, tutor, quiz, writes, threats, admin",
        "Manual inspection"],
       ["Answer-key protection", "Correct index exists only in the quiz session; responses omit it until answered",
        "Audit: question payload hides answer key"],
       ["Ownership checks", "Every query filtered by the session user id; foreign ids return 404",
        "Audit: user B cannot read user A's session"],
       ["SSRF prevention", "The URL analyzer parses only and performs no network request", "Code inspection, no fetch"],
       ["AI output validation", "Schema, required keys, clamping, allow-lists, truncation", "Manual inspection"],
       ["AI safety", "Safety settings, refusal instruction, deterministic unsafe-request guard", "Manual inspection"],
       ["Secret management", "dotenv; the key is read server-side only; .env is git-ignored", "Code inspection"],
       ["Error hygiene", "Generic client messages; classified diagnostics server-side only", "Manual inspection"],
       ["Privacy by design", "Scam text and screenshots are never stored; requests are never logged",
        "Code inspection"],
       ["Audit trail", "adminquestionlogs records every moderation action with the actor", "Audit: admin actions audited"],
   ]))

b(("h2", "10.3  Discussion of Selected Controls"))
b(("h3", "10.3.1  Session and Cookie Design"))
b(("p", "A cookie-based session was chosen over a bearer token because the application is same-origin and "
        "server-rendered. The cookie holds only an identifier; the session document holds the user. Regenerating "
        "the identifier at authentication removes the fixation window, and destroying the session on logout "
        "removes the server-side record as well as clearing the cookie, so a copied cookie stops working."))
b(("h3", "10.3.2  Why the Answer Key Is Server-Side"))
b(("p", "A quiz whose answers are in the page source is not an assessment. In CyberShield the option order is "
        "shuffled per serving and stored with the session; the correct index under that order is stored "
        "server-side and returned only after an answer is recorded. The audit checks five consecutive questions "
        "for the absence of the key and verifies that each served option set maps to exactly one source answer."))
b(("h3", "10.3.3  Prompt Injection and Content Safety"))
b(("p", "User content is placed inside a quoted block in the prompt, and the system instruction fixes the task "
        "and the output schema. This reduces, but does not eliminate, the risk that a message attempts to "
        "instruct the model. The application does not rely on the model for safety-critical decisions: the "
        "unsafe-request guard for the tutor is a deterministic pattern check that runs before the call, and every "
        "AI result is validated structurally afterwards. A successful injection could therefore change wording, "
        "but could not change a score, grant access or store arbitrary fields."))
b(("h3", "10.3.4  Privacy Decisions"))
b(("p", "The most consequential privacy decision is not to store analysed content. Scam messages frequently "
        "contain an OTP, an account fragment or a token that the user was tricked into pasting. Storing them "
        "would create a database of exactly the secrets an attacker wants. The analyzer therefore keeps the "
        "content in memory for the duration of the request, logs only error types, and leaves the ScamReport "
        "collection empty. The dashboard reports zero analyses rather than displaying fabricated history, and "
        "Chapter 14 lists this as a limitation of the analytics that can be offered."))

b(("h2", "10.4  Recommended Improvements Not Implemented"))
b(("b", [
    "Email verification and a password reset flow, which are the two standard account-recovery controls that are "
    "currently absent.",
    "A content security policy and Subresource Integrity for the external font stylesheet.",
    "Two-factor authentication for accounts, and a separate administrator login path.",
    "Encryption of particularly sensitive fields at rest, and a documented retention policy for conversations.",
    "Distributed rate limiting, which is required if the application is ever run as more than one process.",
    "Centralised structured logging with alerting, instead of console output.",
    "Automated dependency scanning and a pinned lockfile audit in CI.",
]))

# ----------------------------------------------------------------- 11
b(("h1", "Chapter 11  Testing and Results"))
b(("p", "Testing used the project's own end-to-end audit script, scripts/system-audit.mjs, run against the "
        "running application with the real MongoDB Atlas database and the configured Gemini key. The script "
        "creates its own temporary users, questions and sessions, exercises the HTTP API, verifies database "
        "state directly, and removes the records it created. It does not modify pre-existing user data. The run "
        "recorded in this chapter is the actual output of that execution, preserved in report/logs/system-audit.log."))

b(("h2", "11.1  Test Environment"))
b(("table", "Table 11.1  Environment used for the recorded run",
   ["Item", "Value"],
   [
       ["Application", "node server/server.js on http://localhost:3000"],
       ["Database", "MongoDB Atlas, database cybershield, connected"],
       ["AI service", "Gemini API key loaded from .env"],
       ["Node.js", "20 or later (engines requirement)"],
       ["Audit script", "scripts/system-audit.mjs, 584 lines"],
       ["Result", "107 passed, 4 failed, 111 checks; 17 pages and 243 assets swept"],
   ]))

b(("h2", "11.2  Summary of Results"))
b(("table", "Table 11.2  Results by area",
   ["Area", "Checks", "Passed", "Failed"],
   [
       ["Pages and static assets", "19", "19", "0"],
       ["Authentication and authorisation", "18", "18", "0"],
       ["User data isolation", "6", "6", "0"],
       ["Quiz, normal mode", "24", "24", "0"],
       ["Repetition and rotation", "4", "4", "0"],
       ["Adaptive quiz", "8", "8", "0"],
       ["Admin question management", "13", "9", "4"],
       ["AI features", "11", "11", "0"],
       ["Threat intelligence", "8", "8", "0"],
       ["Total", "111", "107", "4"],
   ]))

b(("h2", "11.3  Functional Test Cases"))
b(("table", "Table 11.3  Functional test cases (P = passed, F = failed)",
   ["ID", "Module", "Test scenario", "Expected result", "Actual result", "Status"],
   [
       ["TC-01", "Pages", "Request each of the 17 HTML pages", "Every page returns 200", "17 of 17 returned 200", "P"],
       ["TC-02", "Assets", "Resolve every local asset referenced by every page", "All assets resolve",
        "243 assets resolved", "P"],
       ["TC-03", "Auth", "Register a new account", "201 with a safe user object", "Created; no passwordHash field", "P"],
       ["TC-04", "Auth", "Register with role=admin in the body", "Role stays 'user'", "role = user", "P"],
       ["TC-05", "Auth", "Inspect the session cookie", "HttpOnly and SameSite set",
        "HttpOnly = true, SameSite = Lax", "P"],
       ["TC-06", "Auth", "Register the same email twice", "409 with an explanatory message", "409 returned", "P"],
       ["TC-07", "Auth", "Sign in with a wrong password", "401, identical to unknown-email response", "401", "P"],
       ["TC-08", "Auth", "Compare unknown-email and wrong-password responses",
        "No difference that reveals account existence", "Identical status and message", "P"],
       ["TC-09", "Auth", "Sign in successfully and compare session ids", "Session id changes (fixation defence)",
        "Rotated", "P"],
       ["TC-10", "Auth", "Read the stored password", "bcrypt hash, cost 12", "$2b$12$...", "P"],
       ["TC-11", "Auth", "GET /api/dashboard without a session", "401", "401", "P"],
       ["TC-12", "Auth", "GET /api/quiz/history without a session", "401", "401", "P"],
       ["TC-13", "Auth", "GET /api/admin/stats as a normal user", "403", "403", "P"],
       ["TC-14", "Auth", "POST with a foreign Origin header", "403", "403", "P"],
       ["TC-15", "Isolation", "User B requests User A's quiz id", "404, not A's data", "404", "P"],
       ["TC-16", "Isolation", "Compare two dashboards", "Different user objects and statistics",
        "Separate data returned", "P"],
       ["TC-17", "Quiz", "GET /api/quiz/meta", "Approved count, no answer keys", "approved = 300", "P"],
       ["TC-18", "Quiz", "Serve a question", "Four options, no correct index",
        "4 options, key absent", "P"],
       ["TC-19", "Quiz", "Answer five questions and submit", "Official score matches the answers given",
        "3 of 5 correct, score 60", "P"],
       ["TC-20", "Quiz", "Submit the same quiz twice", "One attempt row, idempotent response",
        "duplicate = true, count = 1", "P"],
       ["TC-21", "Quiz", "Check the dashboard after a saved attempt", "Attempt appears with score",
        "attempts = 1", "P"],
       ["TC-22", "Rotation", "Take a second run", "No duplicate ids inside the run, unseen preferred",
        "overlap = 0", "P"],
       ["TC-23", "Adaptive", "Answer two questions correctly in a row", "Difficulty steps up once",
        "moved = 1, medium", "P"],
       ["TC-24", "Adaptive", "Then answer two incorrectly", "Difficulty steps down once",
        "moved = -1, easy", "P"],
       ["TC-25", "Adaptive", "Submit an adaptive run", "Difficulty-weighted score and raw score both reported",
        "weighted 29, raw 33", "P"],
       ["TC-26", "Admin", "Log in as an administrator", "200 with role = admin", "200, admin", "P"],
       ["TC-27", "Admin", "Create a pending question through the API", "201 with status pending",
        "400 - duplicate of an existing question", "F"],
       ["TC-28", "Admin", "Approve that pending question", "200 with status approved",
        "Not possible - the question was never created", "F"],
       ["TC-29", "Admin", "See the approved count increment after approval", "approved + 1",
        "300 -> 300", "F"],
       ["TC-30", "Admin", "Retire the approved question", "200 with retired = true",
        "Not possible - the question was never created", "F"],
       ["TC-31", "Admin", "Reject a pending question", "200 with status rejected", "Rejected", "P"],
       ["TC-32", "Admin", "Check the moderation log", "Every action recorded with its actor",
        "reject, create-pending, reject, create-pending, retire, approve", "P"],
       ["TC-33", "Admin", "Approve a question as a normal user", "403", "403", "P"],
       ["TC-34", "AI", "Submit an empty scam analysis", "400", "400", "P"],
       ["TC-35", "AI", "Submit an invalid URL", "400 with a request for a valid URL", "400", "P"],
       ["TC-36", "AI", "Analyse a phishing message with a URL", "Structured result with URL findings",
        "CRITICAL, with url_analysis and defensive actions", "P"],
       ["TC-37", "AI", "Call the tutor without a session", "401, body not processed", "401", "P"],
       ["TC-38", "AI", "Ask the tutor a normal question", "A reply and key takeaways", "Reply returned", "P"],
       ["TC-39", "AI", "Request a learning path", "A usable path, or a graceful degradation",
        "Degraded gracefully (one external AI failure)", "P"],
       ["TC-40", "AI", "Request a news explanation", "A summary", "Summary returned", "P"],
       ["TC-41", "Threats", "List threats", "200 with pagination and source metadata", "200", "P"],
       ["TC-42", "Threats", "Filter by severity and search text", "200", "200", "P"],
       ["TC-43", "Threats", "Request an impossible search", "Zero results, not an error", "total = 0", "P"],
       ["TC-44", "Threats", "Send hostile pagination values", "Values clamped", "Clamped", "P"],
       ["TC-45", "Threats", "Read source status", "Per-source health and last update", "200", "P"],
   ]))

b(("h2", "11.4  Analysis of the Four Failures"))
b(("p", "The four failing checks are consecutive steps of one admin scenario, so they have a single cause. The "
        "audit creates a question whose text embeds a random run token, then approves and retires it. On this run "
        "the create call returned 400, so the question never existed and the three dependent steps could not "
        "execute."))
b(("p", "The cause was identified by reproducing the duplicate check directly against the database. A question "
        "left behind by an earlier audit run, audit-mwchhmjf-p1, is stored with status approved and has nearly "
        "the same text as the new payload. The platform's duplicate detector compares normalised question text "
        "with a Jaccard similarity threshold of 0.82 within the same topic, and it correctly classified the new "
        "text as a near-duplicate:"))
b(("code", "duplicate result: near -> audit-mwchhmjf-p1\n"
          "  \"Audit pending question mwchhmjf: which practice best protects an account from credential stuffing?\""))
b(("p", "The application therefore behaved correctly: it refused to add a second, near-identical question to "
        "the bank. The failure is a test-fixture problem, not a functional defect. Two consequences are worth "
        "recording. First, the audit script's cleanup only removes the fixtures whose identifiers it generated in "
        "the current run, so a run that is interrupted can leave an approved question behind. Second, that "
        "leftover question is now part of the real bank, which explains why the approved count is 300 and why the "
        "check 'retired question leaves the active bank' passed trivially by comparing 300 with 300."))
b(("p", "The correct remediation is a cleanup pass for rows whose questionId begins with the audit prefix, "
        "followed by a re-run. That cleanup was not performed during this documentation task because the task "
        "forbids modifying project data; it is listed here and in Chapter 15 so that the owner can decide."))

b(("h2", "11.5  Tests Not Performed"))
b(("table", "Table 11.4  Activities that were not executed and are therefore not claimed",
   ["Activity", "Reason / status"],
   [
       ["Full manual click-through of every control on every page", "Not performed; only the pages needed for Chapter 12 were exercised"],
       ["Cross-browser testing on Firefox and Safari", "Not performed; captures were taken in the packaged Chromium"],
       ["Mobile and tablet layout verification", "Not performed; the layout is described, not visually verified at those widths"],
       ["Accessibility audit (WCAG)", "Not performed; ARIA attributes were read in source but not audited"],
       ["Load, stress and performance measurement", "Not performed; no response-time figures are reported"],
       ["Penetration test and vulnerability scan", "Not performed"],
       ["Email delivery, password reset, two-factor flows", "Not applicable - these features are not implemented"],
       ["Re-run of the audit after cleaning the stale fixture", "Not performed, to avoid modifying project data"],
   ]))

# ----------------------------------------------------------------- 12
b(("h1", "Chapter 12  Screenshots and User Interface"))
b(("p", "All screenshots in this chapter were captured from the running application during the preparation of "
        "this report, at a viewport of 1366 by 900 pixels. They show real pages with real data returned by the "
        "API. No mock-ups were used. The signed-in captures were taken with the project's own QA test account; no "
        "password, token or API key is visible in any image."))

b(("h2", "12.1  Home Page"))
b(("fig", "screenshots/01-home.png", "Home page with the emergency strip, primary actions and hero image", 15.6))
b(("p", "The home page carries the emergency reporting strip, the two primary calls to action (password checker "
        "and quiz) and the platform description. The navigation is collapsed into a menu button at narrow widths."))

b(("h2", "12.2  Registration and Sign-In"))
b(("fig", "screenshots/02-register.png", "Account registration page", 15.6))
b(("fig", "screenshots/03-login.png", "Sign-in page", 15.6))

b(("h2", "12.3  User Dashboard"))
b(("fig", "screenshots/04-dashboard.png", "Dashboard for a signed-in account with no quiz attempts yet", 15.6))
b(("p", "The empty state is deliberate: the attempt counters read zero and the score fields are absent rather "
        "than showing a fabricated value. The live bank size, 300 approved questions, is read from MongoDB on "
        "every load."))

b(("h2", "12.4  Quiz"))
b(("fig", "screenshots/05-quiz-question.png",
        "A served quiz question: topic, subtopic, difficulty, new-question marker and four options", 15.6))
b(("p", "The question shown was served by /api/quiz/next, which returns the shuffled options without the correct "
        "index. The 'NEW QUESTION' marker reflects the isNew flag computed from the user's history."))

b(("h2", "12.5  Password Strength Checker"))
b(("fig", "screenshots/06-password-checker.png",
        "Password checker analysing the common password password123 entirely in the browser", 15.6))
b(("p", "The result shows 7 bits, the Very Weak band, four specific findings and glossary links that change with "
        "the strength band. Nothing typed into this field leaves the browser."))

b(("h2", "12.6  AI Cybersecurity Tutor"))
b(("fig", "screenshots/07-ai-tutor.png", "AI tutor answer to a question about fake UPI payment requests", 15.6))
b(("p", "The answer follows the instructed shape: numbered steps, a student-specific example, a safety caveat, "
        "follow-up prompts and the learning-profile panel that states the basis of the personalisation."))

b(("h2", "12.7  AI Scam Analyzer"))
b(("fig", "screenshots/09-scam-analyzer.png",
        "Scam analyzer result for a KYC-expiry message: CRITICAL risk, score 95 of 100, phishing verdict", 15.6))
b(("p", "The evidence block lists the exact phrases copied from the message, which is what the schema requires. "
        "The risk score is the server-normalised value, not the raw model output."))

b(("h2", "12.8  Learning Path"))
b(("fig", "screenshots/10-learning-path.png", "Personalised learning roadmap page", 15.6))

b(("h2", "12.9  Threat Awareness"))
b(("fig", "screenshots/11-threats.png", "Threat awareness catalogue", 15.6))

b(("h2", "12.10  Real-Time Threat Intelligence"))
b(("fig", "screenshots/12-threat-intel.png",
        "Threat intelligence page with live CISA KEV and NIST NVD records, 5,353 in total", 15.6))
b(("p", "The summary strip reports the two sources separately (1,795 KEV and 3,558 NVD), and the table shows the "
        "most recent CVEs with severity, CVSS and the KEV flag. This page was captured after a refresh, which is "
        "why the newest record carries the date of capture."))

b(("h2", "12.11  Cybersecurity News"))
b(("fig", "screenshots/13-news.png", "Cybersecurity news page with category filters", 15.6))

b(("h2", "12.12  Educational Modules"))
b(("fig", "screenshots/14-glossary.png", "Glossary with search and alphabetical navigation", 15.6))
b(("fig", "screenshots/15-toolkit.png", "Safety toolkit with progress tracking", 15.6))
b(("fig", "screenshots/08-ai-assistant.png", "AI assistant landing page used as the entry point to the tutor", 15.6))

# ----------------------------------------------------------------- 13
b(("h1", "Chapter 13  Installation and Execution"))

b(("h2", "13.1  Prerequisites"))
b(("b", [
    "Node.js version 20 or later, with npm. Confirm with node -v and npm -v.",
    "A MongoDB Atlas account and a cluster, or any reachable MongoDB deployment.",
    "A Google Gemini API key from Google AI Studio.",
    "A modern browser (Chrome, Edge, Firefox or Safari).",
    "Git, if the project is obtained by cloning.",
]))

b(("h2", "13.2  Obtaining the Project and Installing Dependencies"))
b(("code", "git clone <repository-url> CyberShield\ncd CyberShield\nnpm install"))
b(("p", "npm install reads package.json and package-lock.json and installs the eight runtime dependencies: "
        "@google/genai, bcryptjs, connect-mongo, dotenv, express, express-rate-limit, express-session and "
        "mongoose. No build step exists; the HTML, CSS and JavaScript in the repository are served as they are."))

b(("h2", "13.3  Environment Configuration"))
b(("p", "Copy .env.example to .env and fill in the values. The example file documents each key; the real .env "
        "must never be committed, and its contents are not reproduced here."))
b(("table", "Table 13.1  Environment variables",
   ["Variable", "Required", "Purpose"],
   [
       ["MONGODB_URI", "Yes", "MongoDB Atlas connection string"],
       ["DB_NAME", "No", "Database name, default cybershield"],
       ["SESSION_SECRET", "Yes in production", "Session signing secret; a generated value is used in development"],
       ["GEMINI_API_KEY", "Yes for AI features", "Gemini API key, read on the server only"],
       ["GEMINI_MODEL", "No", "Primary model identifier"],
       ["GEMINI_FALLBACK_MODEL", "No", "Fallback model identifier"],
       ["NVD_API_KEY", "No", "Raises the NIST NVD rate limit"],
       ["THREAT_KEV_REFRESH_MS / THREAT_NVD_REFRESH_MS", "No", "Feed refresh intervals"],
       ["PORT", "No", "HTTP port, default 3000"],
   ]))

b(("h2", "13.4  Database Configuration"))
b(("p", "Create a cluster in MongoDB Atlas, add a database user, allow the current IP address in the network "
        "access list, and copy the connection string into MONGODB_URI. The application creates its collections "
        "and indexes on first use; no migration script is needed. On start-up the server connects, verifies the "
        "connection and seeds the question bank if it is empty."))

b(("h2", "13.5  Starting the Application"))
b(("code", "npm start            # equivalent to: node server/server.js"))
b(("p", "The server prints a banner with the site address, the database status, whether the Gemini key is "
        "loaded and the main API groups. Open http://localhost:3000 in a browser; the root page redirects to "
        "html/index.html. On Windows, start-server.bat and stop-server.bat are provided as convenience wrappers."))

b(("h2", "13.6  Creating an Administrator"))
b(("p", "All accounts are created with the role user. scripts/make-admin.js promotes an existing account, which "
        "keeps administrator creation out of the public API. The administrative interface is html/admin.html."))

b(("h2", "13.7  Troubleshooting"))
b(("table", "Table 13.2  Common problems and their causes",
   ["Symptom", "Cause and remedy"],
   [
       ["Start-up stops with a database error", "Wrong MONGODB_URI, database user or IP allow-list entry. The "
        "connection attempt times out after twenty seconds."],
       ["AI features return 'AI service is temporarily unavailable'", "Missing or invalid GEMINI_API_KEY, exhausted "
        "quota, or both models unreachable. The server log classifies the failure."],
       ["Pages load but style is missing", "The page was opened as a file instead of through the server; use "
        "http://localhost:3000."],
       ["Every database route answers 503", "The server started without a database connection; requireDb is "
        "reporting that honestly."],
       ["Threat list is empty on first load", "The first refresh has not completed; the page starts a background "
        "refresh and the data appears shortly."],
       ["Port 3000 already in use", "Stop the previous instance with stop-server.bat or change PORT."],
       ["Quiz says the bank is empty", "The questions collection has no approved documents; the server seeds the "
        "bank only when it is empty at start-up."],
   ]))

# ----------------------------------------------------------------- 14
b(("h1", "Chapter 14  Limitations"))
b(("p", "The limitations below are properties of the delivered system, not of a hypothetical future version."))
b(("h2", "14.1  Dependence on an External AI Service"))
b(("p", "Five features degrade without the Gemini API. Latency, quota and availability are outside the "
        "application's control, and the model that answered a request yesterday may be replaced or retired. The "
        "mitigations - a fallback model, bounded retries, curated answers and a rule-based roadmap - reduce the "
        "impact but do not remove the dependency. During the recorded test run one AI call failed externally, "
        "which is why the learning-path check reports graceful degradation rather than success."))
b(("h2", "14.2  Limits of Automated URL Analysis"))
b(("p", "The analyzer is structural. It cannot know whether a domain that passes every check is hosting a "
        "phishing kit, and it cannot know whether a link inside a shortened URL is malicious, because it "
        "deliberately never resolves the link. Its brand list contains eighteen brands, so impersonation of a "
        "brand outside that list is not detected. The public-suffix heuristic covers the common two-label "
        "suffixes but is not a full Public Suffix List. These limits are stated in the interface rather than "
        "hidden: the warnings are described as signs worth double-checking, never as a verdict."))
b(("h2", "14.3  Limits of AI-Generated Assessment"))
b(("p", "A language model can be wrong, can be misled by content designed to look benign, and can produce "
        "confident wording for an uncertain conclusion. The prompts require hedged language and forbid claims of "
        "certainty, and the server validates the structure of every answer, but neither measure can make the "
        "content correct. The platform therefore presents AI output as an assessment, keeps deterministic "
        "findings in a separate field, and offers human-verifiable next steps such as contacting the bank through "
        "its official application."))
b(("h2", "14.4  Internet Connectivity and Local Execution"))
b(("p", "The application is a networked client-server system: it needs a running Node.js process, a reachable "
        "MongoDB Atlas cluster and, for the AI features, outbound internet access. It has no offline mode and no "
        "service worker. It is also a single-process application, so it is suitable for a demonstration or a "
        "small deployment rather than for concurrent institutional use."))
b(("h2", "14.5  Unimplemented Account Features"))
b(("p", "There is no email verification, no password reset, no two-factor authentication, no account deletion "
        "and no profile editing. A user who forgets a password cannot recover the account through the "
        "application. These are the most visible functional gaps for a real deployment."))
b(("h2", "14.6  Data-Hygiene Findings"))
b(("p", "The audit left one approved test question (`audit-mwchhmjf-p1`) in the bank from an interrupted earlier "
        "run. It inflates the approved count by one and caused the four failing checks documented in section "
        "11.4. It was not removed during this documentation work because the task forbids modifying project data."))
b(("h2", "14.7  News Content is Curated"))
b(("p", "The news list is a bundled data file, not a live feed. Only the explanation and the question-answering "
        "are generated. A user may therefore read an article that is older than the interface implies."))
b(("h2", "14.8  Not Verified in This Report"))
b(("p", "Cross-browser behaviour, mobile layout, accessibility conformance, performance under load and "
        "resistance to a determined attacker were not measured. Table 11.4 lists these explicitly so that the "
        "absence of a claim is not mistaken for a passing result."))

# ----------------------------------------------------------------- 15
b(("h1", "Chapter 15  Future Scope"))
b(("p", "The following items are proposals. None of them is implemented in the delivered system."))
b(("h2", "15.1  Account and Identity"))
b(("b", [
    "Email verification at registration and a time-limited password reset token.",
    "Optional two-factor authentication using TOTP, with recovery codes.",
    "A separate administrator sign-in with a stronger policy and an audit of every session.",
    "Profile management and account deletion with data export.",
]))
b(("h2", "15.2  Detection Capability"))
b(("b", [
    "Phishing detection for email headers (SPF, DKIM, DMARC results) where the user can supply the raw message.",
    "Screenshot OCR before analysis, so that text in an image is quoted as evidence rather than described loosely.",
    "Expansion of the brand list and a full Public Suffix List for the structural analyzer.",
    "Optional reputation lookups through a third-party threat-intelligence API, clearly separated from the "
    "structural findings.",
    "Detection of repeated scam campaigns across submissions, using only aggregated, non-identifying features.",
]))
b(("h2", "15.3  Learning and Assessment"))
b(("b", [
    "Spaced repetition: schedule a topic for revision when its measured accuracy starts to decay.",
    "Item-response calibration of question difficulty from real answer data, replacing the fixed weights.",
    "Instructor view with class-level topic heat maps for classroom use.",
    "Certificates or badges for completed roadmaps, with a verifiable identifier.",
    "Localisation into Hindi and other Indian languages, including the tutor prompts.",
]))
b(("h2", "15.4  Platform and Operations"))
b(("b", [
    "A content security policy, Subresource Integrity for external assets and self-hosted fonts.",
    "Structured logging, metrics and alerting, and a documented incident-response procedure for the platform itself.",
    "Multi-instance deployment with a shared session store and distributed rate limiting.",
    "Automated tests in continuous integration, including a cleaned-up audit fixture.",
    "A progressive web application wrapper with an offline glossary and checklist.",
    "A mobile application that reuses the same API.",
]))

# ----------------------------------------------------------------- 16
b(("h1", "Chapter 16  Conclusion"))
b(("p", "CyberShield set out to close the gap between security advice and the moment a user needs it. The "
        "delivered system is a working web platform in which a suspicious message can be assessed, the reasoning "
        "behind the assessment can be explained, the user's understanding can be measured, and the next topic to "
        "study can be recommended from that measurement. All of these activities share one account and one data "
        "model, which is what distinguishes the platform from a collection of unrelated tools."))
b(("p", "The engineering work behind that result is substantial and verifiable. The server implements "
        "thirty-six endpoints across eight routers with per-route validation, per-route body limits and per-route "
        "rate limits. Authentication uses bcrypt at cost 12 and server-side sessions stored in MongoDB, with "
        "session regeneration at login and an origin check on every state change. The quiz never sends an answer "
        "key to the browser, scores runs on the server with difficulty weights, and records per-question history "
        "that makes rotation and adaptation possible. Eleven collections, twenty-three documented indexes and a "
        "six-hour TTL on in-progress runs hold the state."))
b(("p", "The artificial-intelligence layer is the part that required the most care. Four features funnel through "
        "one module that owns the model selection, the timeouts, the retry policy, the safety settings, the JSON "
        "schemas and the error mapping. Deterministic work is done in code before the model is called: URL "
        "structure is parsed, learner performance is computed, and the result is supplied as grounded facts. "
        "Everything the model returns is validated, clamped and truncated before it is stored or shown. When the "
        "service fails, the system says so and falls back to a reviewed answer or a rule-based plan rather than "
        "inventing a result."))
b(("p", "Testing produced a concrete, honest picture. The project's audit script exercised 111 checks against "
        "the running application and passed 107. The four failures trace to a single stale test fixture that the "
        "duplicate detector correctly rejected, not to a defect in the feature under test; the analysis and the "
        "remediation are recorded in section 11.4 rather than explained away. Several activities - cross-browser "
        "testing, mobile layout verification, accessibility audit, load measurement and penetration testing - "
        "were not performed, and Chapter 11 states that plainly."))
b(("p", "The educational value of the project lies in the loop it creates. A learner who reads about phishing, "
        "takes a quiz, sees that financial fraud is the weakest measured topic, receives a roadmap that starts "
        "there, and can ask a tutor to explain the mistake at their own level is learning in a way that a static "
        "page cannot support. The platform also demonstrates, in its own construction, the defensive habits it "
        "teaches: least privilege in queries, secrets kept on the server, validation at every boundary and "
        "honest failure instead of confident guessing."))
b(("p", "The work can be extended in the directions listed in Chapter 15 - account recovery, two-factor "
        "authentication, richer detection, localisation and operational hardening. What exists today is a "
        "complete, working, documented foundation for those extensions, built with a small dependency set and "
        "explainable end to end."))

# ----------------------------------------------------------------- references
b(("h1", "References and Bibliography"))
b(("p", "All sources below were consulted during the design, implementation or documentation of the project. "
        "Access dates refer to the preparation of this report."))
b(("n", [
    "Google. Gemini API documentation - generateContent, structured output and safety settings. "
    "https://ai.google.dev/gemini-api/docs",
    "Google. Gen AI SDK for JavaScript (@google/genai). https://googleapis.github.io/js-genai/",
    "Google. Gemini API - rate limits and quotas. https://ai.google.dev/gemini-api/docs/rate-limits",
    "MongoDB. MongoDB Manual - data modelling, indexes and TTL indexes. https://www.mongodb.com/docs/manual/",
    "MongoDB. Mongoose documentation - schemas, indexes and middleware. https://mongoosejs.com/docs/",
    "OpenJS Foundation. Node.js documentation (v20 LTS). https://nodejs.org/docs/latest-v20.x/api/",
    "OpenJS Foundation. Express 5 documentation - routing, middleware and error handling. https://expressjs.com/",
    "express-session. Session middleware for Express. https://github.com/expressjs/session",
    "connect-mongo. MongoDB session store for Express. https://github.com/jdesboeufs/connect-mongo",
    "express-rate-limit. Rate limiting middleware. https://express-rate-limit.mintlify.app/",
    "OWASP Foundation. OWASP Top 10 - 2021. https://owasp.org/Top10/",
    "OWASP Foundation. Application Security Verification Standard. https://owasp.org/www-project-application-security-verification-standard/",
    "OWASP Foundation. Cross-Site Request Forgery Prevention Cheat Sheet. "
    "https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html",
    "OWASP Foundation. Session Management Cheat Sheet. "
    "https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html",
    "OWASP Foundation. Password Storage Cheat Sheet. "
    "https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html",
    "NIST. Special Publication 800-63B - Digital Identity Guidelines: Authentication and Lifecycle Management. "
    "https://pages.nist.gov/800-63-3/sp800-63b.html",
    "CISA. Known Exploited Vulnerabilities Catalog (data feed used by the threat module). "
    "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
    "NIST. National Vulnerability Database API 2.0. https://nvd.nist.gov/developers/vulnerabilities",
    "CERT-In. Cyber security awareness and advisories. https://www.cert-in.org.in/",
    "Ministry of Home Affairs, Government of India. National Cyber Crime Reporting Portal. "
    "https://cybercrime.gov.in/",
    "Department of Telecommunications, Government of India. Central Equipment Identity Register (CEIR). "
    "https://ceir.gov.in/",
    "MDN Web Docs. Fetch API and the WHATWG URL interface. https://developer.mozilla.org/en-US/docs/Web/API",
    "W3C. HTML Living Standard and WAI-ARIA Authoring Practices. https://www.w3.org/TR/wai-aria-practices/",
    "bcryptjs. Password hashing library for JavaScript. https://github.com/dcodeIO/bcrypt.js",
    "Python Software Foundation. ReportLab User Guide (used to render the PDF edition of this report). "
    "https://docs.reportlab.com/",
    "python-docx. Create and update Microsoft Word files (used to render the DOCX edition). "
    "https://python-docx.readthedocs.io/",
]))
