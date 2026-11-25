# -*- coding: utf-8 -*-
"""Report content, part B: Chapter 6 (module description)."""

BLOCKS = []
b = BLOCKS.append

b(("h1", "Chapter 6  Detailed Module Description"))
b(("p", "Eleven modules are described below. Each description follows the same order: purpose, features, "
        "working, frontend implementation, backend implementation, API and database interaction where they "
        "apply, the user workflow and the output the user sees. Where a capability is partially implemented or "
        "deliberately absent, it is stated rather than implied."))

# 6.1
b(("h2", "6.1  User Authentication"))
b(("p", "Purpose. Authentication establishes who is using the platform so that quiz attempts, roadmap "
        "progress and tutor conversation can be attached to the right person and to nobody else."))
b(("p", "Features. Registration with name, email and password; sign-in; sign-out; a session that survives a "
        "server restart; a protected dashboard; administrator-only routes. There is no email verification, no "
        "password reset and no third-party login - these are listed as future work, not described as existing."))
b(("p", "How it works. Registration validates the three fields, rejects an existing email with 409, hashes the "
        "password with bcrypt at cost 12 and creates the user with an explicit field list, so a request body "
        "containing role or admin is ignored. The session is then regenerated and the user object is attached. "
        "Login normalises the email, looks the user up, and compares the password with bcrypt; when the email "
        "is unknown it compares against a fixed dummy hash so that timing does not reveal account existence. "
        "Both failure cases return the same message, Invalid email or password. On success the session id is "
        "regenerated again, the lastLogin timestamp is written asynchronously, and a safe user object is "
        "returned."))
b(("p", "Validation rules. Name at least two characters and at most eighty; email must match a simple "
        "address pattern and is lower-cased; password must be 8 to 128 characters and contain at least one "
        "letter and one digit, expressed as a regular expression with Unicode property escapes. Control "
        "characters are stripped from all text inputs before validation."))
b(("p", "Frontend. html/register.html and html/login.html contain the forms; js/auth.js submits them with "
        "fetch, disables the submit button while the request is in flight, and renders the returned error "
        "message in an alert region instead of navigating away. A successful sign-in redirects to "
        "dashboard.html."))
b(("p", "Backend and database. server/routes/auth.js implements the four endpoints; server/middleware/auth.js "
        "implements requireAuth, which answers 401 with a JSON body when the session has no user id. Passwords "
        "exist only as passwordHash; User.toSafeJSON removes the hash from every response, which the audit "
        "verifies by asserting that the string 'passwordHash' never appears in a payload."))
b(("p", "User workflow. Open the register page, submit the form, land on the dashboard, sign out from the "
        "navigation; later sign in again and find the same attempt history."))
b(("p", "Output. A session cookie, a dashboard that greets the user by name, and a navigation bar that shows "
        "'My Dashboard' instead of 'Sign In'."))

# 6.2
b(("h2", "6.2  AI Scam Analyzer"))
b(("p", "Purpose. To give the user an immediate, structured assessment of a suspicious message, URL or "
        "screenshot, together with the reasoning and the actions to take next."))
b(("p", "Features. Text analysis up to 6,000 characters; a dedicated URL field; screenshot upload in PNG, "
        "JPEG or WebP up to approximately 10 MB; a structured result containing risk level, risk score, threat "
        "category, verdict, suspicious phrases, red flags, explanation, recommended actions and safety tips; a "
        "separate structural URL panel; and a client-side history of recent analyses kept only in the browser."))
b(("p", "How it works. The route validates each input independently. Text is trimmed and truncated. A URL, if "
        "present, is passed to the structural analyser; an unparseable value returns 400 with a message asking "
        "for a URL such as https://example.com/page. An image is accepted only if its media type is in an "
        "allow-list and its base64 length is within the limit; a data-URL prefix is stripped if the client sent "
        "one. If none of the three inputs is usable the route returns 400 with a request to paste a message or "
        "attach a screenshot."))
b(("p", "The structural findings are then formatted into a short text block that is sent to the model together "
        "with the message. This is the grounding step: the model is told that these findings are machine-"
        "detected facts, that it must not contradict them, and that HTTPS availability alone is never a safety "
        "verdict. The model answers with JSON conforming to a declared schema. The server then normalises the "
        "result: the risk level is restricted to LOW, MEDIUM, HIGH or CRITICAL (anything else becomes MEDIUM); "
        "the numeric score is rounded, clamped to 0-100 and corrected if it contradicts the level; list items are "
        "limited to eight entries of 300 characters; the verdict, explanation and category are truncated to "
        "documented maximum lengths."))
b(("p", "The structural analysis is returned in a separate url_analysis object containing the host, the "
        "registrable domain, whether a scheme was supplied, whether plain HTTP was used, and up to ten warning "
        "objects. The frontend can therefore present computed facts and generated sentences side by side."))
b(("p", "Frontend. The analyzer lives in html/toolkit.html and is driven by js/scam-analyzer.js with the shared "
        "request helper js/ai-client.js. The result panel renders the risk badge, a score bar, the verdict, the "
        "quoted suspicious phrases, the red-flag list, the recommended actions and the safety tips. Errors "
        "returned by the API are displayed as messages; the page does not retry automatically."))
b(("p", "Backend and privacy. The route is POST /api/ai/scam-analyze with a 12 MB body limit and the general "
        "AI limiter. Request bodies are deliberately never logged because they can contain secrets a user was "
        "tricked into pasting. Nothing from the request is written to the database: the ScamReport collection "
        "exists in the schema but remains empty in this implementation, and the dashboard reports that honestly."))
b(("p", "Output. For a KYC-expiry message with a fake bank domain, the tested result was CRITICAL risk, "
        "category Phishing, a score of 95 out of 100, a verdict naming the urgency and OTP request as the "
        "mechanism, and the exact phrases copied from the message (see Figure 12.8)."))

# 6.3
b(("h2", "6.3  Password Strength Checker"))
b(("p", "Purpose. To teach, by demonstration, what makes a password weak and to produce a strong alternative."))
b(("p", "Features. Live analysis as the user types with a 150 ms debounce; a five-level classification; an "
        "entropy estimate in bits; a feedback list with pass, warning and failure items; a visibility toggle; a "
        "generator that produces a 16-character password containing at least one lower-case letter, one "
        "upper-case letter, one digit and one symbol; a clear button and a copy button; and links into the "
        "glossary that change with the strength of the password."))
b(("p", "How it works. The analysis is entirely client-side. The character-pool size is computed from which "
        "character classes are present: 26 for lower case, 26 for upper case, 10 for digits and 32 for symbols. "
        "Raw entropy is length multiplied by the base-2 logarithm of the pool size. Deductions are then applied: "
        "10 bits for fewer than 8 characters, 15 for a single character class, 5 for two classes, 30 for a "
        "password in the built-in common-password list, 10 for a character repeated three or more times, 15 for a "
        "sequential keyboard or numeric pattern, 5 for leetspeak substitutions and 10 for a year or date pattern. "
        "The final entropy selects the band: below 28 bits very weak, below 36 weak, below 60 fair, below 128 "
        "strong, otherwise very strong. The exact thresholds and weights are in js/password.js."))
b(("p", "Frontend. html/password.html provides the markup; js/password.js implements the analyser as a class and "
        "updates the strength bar, the label, the badge and the feedback list. The generator uses Math.random, "
        "which is acceptable for a demonstration but is stated in Chapter 14 as a limitation: a password that is "
        "actually going to be used should be generated by a cryptographically secure source, such as the browser's "
        "crypto.getRandomValues."))
b(("p", "Backend. None. The password is never transmitted, never logged and never stored; the page states this "
        "under the input field. The only persistence is a local progress flag, used by the toolkit checklist."))
b(("p", "Output. Typing password123 produces 7 bits and the label Very Weak, with four feedback items "
        "including 'This is a very common password - easily guessed' and 'Sequential keyboard/character pattern "
        "detected' (Figure 12.6)."))

# 6.4
b(("h2", "6.4  Adaptive Cybersecurity Quiz"))
b(("p", "Purpose. To measure cybersecurity knowledge, teach through explanations, and produce the per-topic "
        "data on which personalisation depends."))
b(("p", "Features. A bank of 300 approved questions across nine topics and three difficulties; a normal mode "
        "with a category filter and a choice of 5, 10, 15 or 20 questions; an adaptive mode; an optional "
        "30-second timer; server-side scoring; per-question review; and a history endpoint that reports how many "
        "distinct questions the user has attempted."))
b(("p", "How it works in normal mode. The server samples unseen approved questions with an aggregation "
        "$sample, excluding ids the user has already answered. When the unseen pool is exhausted it tops up with "
        "the least recently seen questions, which is the documented rotation policy, and finally with any "
        "remaining approved question so that a small bank still fills the run. The ordered queue is stored in "
        "the quiz session document; each next request pops the next id."))
b(("p", "How it works in adaptive mode. At start, the server builds a profile from the user's last twenty "
        "attempts and constructs a topic plan: about 45 per cent of slots are assigned to weak topics, 20 per cent "
        "to strong topics and the remainder to unmeasured topics, then the plan is shuffled. Starting difficulty "
        "comes from the profile. While the run proceeds, each served question is recorded in the session with its "
        "shuffled option order and the correct index under that order. A correct answer extends a positive "
        "streak, a wrong answer extends a negative streak, and when the streak reaches plus or minus two the "
        "difficulty steps one level in the corresponding direction and the streak resets. Question selection "
        "tries, in order: the planned topic at the current difficulty unseen by the user, the planned topic at "
        "any difficulty unseen, the current difficulty on any topic unseen, then the same combinations allowing "
        "repeats, and finally any approved question."))
b(("p", "Scoring. Each question has a weight: easy 1, medium 1.5, hard 2. The official score of an adaptive run "
        "is the weighted percentage; a normal run keeps the plain percentage. The score is computed on the "
        "server from the recorded answers when the run is submitted, and the client's own count is never trusted: "
        "the submit route recomputes and, on the dashboard save route, rejects a submission whose total or "
        "correct count does not match its question breakdown."))
b(("p", "Backend and database. server/routes/quiz.js implements the six endpoints; selection lives in "
        "server/services/question-bank.js and profile computation in server/services/adaptive.js. Quiz sessions "
        "are stored with an expiresAt field indexed as a TTL so abandoned runs disappear after six hours. Finished "
        "runs are written to quizattempts with a unique (userId, submissionId) index, which makes a repeated "
        "submit idempotent; the second attempt receives the stored result instead of a duplicate row. Answered "
        "questions are recorded in questionhistories with a compound unique index on (userId, questionId) and "
        "counters for times seen and times correct."))
b(("p", "Output. A question card showing topic, subtopic, difficulty and a 'new question' marker, an "
        "immediate verdict with the explanation after answering, and a results screen with the score, the "
        "difficulty distribution, per-topic accuracy and links into the tutor and the roadmap."))

# 6.5
b(("h2", "6.5  AI Cybersecurity Tutor"))
b(("p", "Purpose. To answer a learner's question at the right level, using the learner's own measured "
        "performance as context, and to keep the conversation available across sessions."))
b(("p", "Features. Three explanation levels (beginner, intermediate, advanced); a curated opening message; "
        "suggested prompts derived from the learner's weak topics; persistent conversation per account; key "
        "takeaways and follow-up questions with each answer; an optional link to a practice page; a new-"
        "conversation and a clear-conversation action; and a visible learning-profile panel that states what the "
        "personalisation is based on."))
b(("p", "How it works. The route requires a session, applies the same-origin guard and a per-user limiter of "
        "forty messages per ten minutes, then loads the stored conversation and the learner context in parallel. "
        "The learner context is built from the same adaptive profile used by the quiz plus roadmap progress, and "
        "is rendered into a compact text block that is inserted into the prompt. Conversation history is taken "
        "from the server-stored document, not from the browser, so a client cannot inject a fake history."))
b(("p", "A deterministic guard runs before any AI call. A list of patterns detects requests for actionable "
        "attack instructions - malware, phishing kits, credential theft, MFA bypass, Wi-Fi cracking - and, when "
        "one matches, the route returns a reviewed curated answer that redirects to the defensive side of the "
        "topic and marks the response with safety = 'redirected'. The model is never asked for the unsafe "
        "content. If the key is missing or the model fails, the route returns a curated answer with "
        "generatedBy = 'curated' and a notice explaining that a reviewed guide is shown instead."))
b(("p", "The model is instructed to refuse operational attack detail, never to request secrets, never to "
        "claim certainty, to mention India's 1930 cybercrime helpline for active incidents, and to use only the "
        "measured facts supplied. The answer comes back as a JSON object with answer, keyTakeaways, followUps, "
        "topic and an optional practice page; the route validates the shape, truncates the text to 8,000 "
        "characters and appends both the question and the answer to the stored conversation, trimming the "
        "document to the most recent forty messages."))
b(("p", "Output. A chat transcript with the answer rendered as markdown sections, a key-takeaways block, "
        "follow-up chips and a profile panel such as 'You have not taken any quizzes yet, so I am starting you "
        "at beginner level' (Figure 12.7)."))

# 6.6
b(("h2", "6.6  Personalised Learning Path"))
b(("p", "Purpose. To convert a quiz result into an ordered plan of study, with measurable progress."))
b(("p", "Features. A stored roadmap with six to ten lessons grouped into Beginner, Intermediate and Advanced "
        "stages; each lesson has a topic, objective, reason, estimated time, activity type, resource link and a "
        "concrete exercise; per-lesson completion toggles; stage and overall progress percentages; a record of "
        "whether the plan came from Gemini or from the rule-based planner, with the reason when it did not."))
b(("p", "How it works. The roadmap is generated only when the user asks, from the last twenty attempts. The "
        "prompt contains the measured accuracy per topic, the weakest and strongest measured topics, the current "
        "difficulty and the list of allowed topic slugs, and instructs the model not to claim a weakness for a "
        "topic that was never measured. The response is validated lesson by lesson: the topic must be one of the "
        "nine slugs, the stage must be one of three, the difficulty must match the stage, the resource must be "
        "one of ten page ids and the estimated time must be between ten and ninety minutes. Anything invalid is "
        "repaired to a safe default or rejected, and if the whole response is unusable the deterministic planner "
        "is used instead."))
b(("p", "The rule-based planner is not a stub: it contains a topic blueprint with objectives, activities and "
        "resources for every topic, orders lessons by measured accuracy, guarantees that each stage appears and "
        "computes the estimated time from the stage. It exists so that the feature remains correct when the AI "
        "service is unavailable, which the audit observed once during the test run, with the API still returning "
        "a usable plan."))
b(("p", "Progress preservation. Regenerating a roadmap archives the previous one instead of deleting it, and "
        "carries forward completion for any lesson whose stable key survives the refresh, so a learner does not "
        "lose ticks after re-planning."))
b(("p", "Backend and database. server/routes/learning.js implements three endpoints; the generator and "
        "normaliser live in server/services/learning-roadmap.js and the model call in gemini.js. Roadmaps are "
        "stored in the existing learningprogresses collection with kind = 'roadmap' and status = 'active', which "
        "keeps them separate from the quiz-generated paths saved with kind = 'path'."))
b(("p", "Output. A staged timeline with a progress ring, the next incomplete lesson highlighted, and a note "
        "such as 'Gemini is unavailable right now, so this roadmap was generated from your saved quiz results' "
        "when the fallback was used (Figure 12.9)."))

# 6.7
b(("h2", "6.7  Real-Time Threat Intelligence"))
b(("p", "Purpose. To show vulnerabilities that are actually being exploited, with enough context to be "
        "useful, without maintaining a static list."))
b(("p", "Features. Two official sources - the CISA Known Exploited Vulnerabilities catalogue and the NIST "
        "National Vulnerability Database; about 5,300 records in the tested environment; filters for severity, "
        "source, exploited status, ransomware use, a date range and free-text search; four sort orders; "
        "pagination; and a status endpoint that reports the health and last-update time of each source."))
b(("p", "How it works. The service polls CISA every three hours and NVD every ninety minutes, with a fourteen-"
        "day publication window and a maximum of five hundred CVEs per poll. Each fetch has a fifteen-second "
        "timeout and one retry, and results are upserted by CVE identifier so a refresh does not duplicate rows. "
        "Sync state (last success, last error, record count) is written to threatsyncstates and is what the "
        "status panel displays. The NVD API key is optional and is used only if configured."))
b(("p", "The read path is deliberately cheap. Every list request calls a lazy refresh check, which starts a "
        "background refresh if a feed is due but never waits for it, then queries the cached collection with the "
        "validated filters. Query parameters are whitelisted: an unknown severity is ignored rather than passed "
        "through, a date in the future beyond one day is rejected, and pagination is clamped to between 5 and 50 "
        "rows per page and 500 pages."))
b(("p", "Frontend. html/threat-intel.html with js/threat-intel.js renders a severity summary strip, filter "
        "controls, a table of vulnerabilities and a details drawer, and displays the source health and the last "
        "update time from the status endpoint."))
b(("p", "Output. The tested page reported 5,353 records, 1,795 from CISA KEV and 3,558 from NVD, with the most "
        "recent CVE dated the same day as the test (Figure 12.11)."))

# 6.8
b(("h2", "6.8  Cybersecurity News and AI News Explainer"))
b(("p", "Purpose. To connect general awareness to current incidents, and to explain an incident in terms a "
        "student can use."))
b(("p", "Features. A curated article set in data/news-data.json with category, source, date, excerpt, tags and "
        "attached protection advice; category filtering and search; a details view; an AI explainer that returns "
        "a simple summary, threat category, who is affected, why it matters, key lessons and general defensive "
        "actions; and a question box that answers only from the supplied article information."))
b(("p", "How it works. The client sends the article fields, truncated to documented lengths, plus an optional "
        "question. Without a question the route calls the explainer; with one it calls the question-answering "
        "function, which uses a different system instruction and a single-field schema. Both prompts contain "
        "explicit grounding rules: base the summary only on the supplied article, say when something is not "
        "specified, and present the defensive actions as general advice rather than as claims from the article."))
b(("p", "Important limitation. The news list itself is curated content shipped with the application; there is "
        "no live news API. Only the explanation is generated. This is stated here and again in Chapter 14 so "
        "that the feature is not mistaken for a live feed."))
b(("p", "Output. An article panel with the original summary and, beneath it, an AI explanation card with the "
        "usual sections and a set of general actions."))

# 6.9
b(("h2", "6.9  Threat Awareness"))
b(("p", "Purpose. To provide the reference knowledge that the quiz and the tutor assume."))
b(("p", "Features. Eighteen threat categories in data/threat-details.json, each with a description, warning "
        "signs, real-world examples, prevention advice and imagery; a filterable list on html/threats.html; and "
        "a dedicated details page driven by js/threat-details.js that loads the entry selected in the query "
        "string."))
b(("p", "How it works. The list page reads the JSON at load time and renders cards; the details page resolves "
        "the requested identifier, renders the full entry and falls back to the list when the identifier is "
        "unknown. No database is involved, which keeps the content versioned with the code and editable without "
        "a migration."))
b(("p", "Output. A browsable catalogue of threats with a consistent structure that mirrors the fields used by "
        "the scam analyzer: what it is, how to recognise it, what to do."))

# 6.10
b(("h2", "6.10  Dashboard"))
b(("p", "Purpose. To show the signed-in user their own measured progress and nothing else."))
b(("p", "Features. Greeting with the stored name; counters for attempts, best score, latest score, average "
        "score, learning paths and the size of the live question bank; normal and adaptive attempt counts; the "
        "current difficulty; per-topic accuracy; weak, strong and improved topics; the ten most recent attempts "
        "with score, mode and duration; and the stored learning paths."))
b(("p", "How it works. GET /api/dashboard performs ten queries in parallel, all filtered by the session user "
        "id. Best and latest scores are separate finds with explicit sorts; the average is an aggregation; the "
        "profile is the same buildProfile function used by the adaptive quiz, so the numbers on the page and the "
        "difficulty used by the quiz cannot disagree. When the user has no attempts, the fields are null and the "
        "page shows an empty state with a link to the quiz rather than a zero that looks like a result."))
b(("p", "Output. For a new account the dashboard shows zero attempts, no best score and the real bank size - "
        "300 in the tested environment - which is precisely what Figure 12.4 shows."))

# 6.11
b(("h2", "6.11  Other Educational Modules"))
b(("p", "Safety Toolkit. html/toolkit.html contains interactive checklists in six areas (password and MFA, "
        "device security, browsing, data privacy, accounts and recovery, incident readiness) with a locally "
        "saved completion state and a per-area progress bar. It also hosts the AI Scam Analyzer described in "
        "6.2, because the two belong to the same 'what do I do now' task."))
b(("p", "Emergency Guide. A fixed emergency strip appears on the home page with the 24x7 cybercrime helpline, "
        "the cybercrime.gov.in reporting portal, the CEIR portal for blocking a stolen phone and a step-by-step "
        "guide page. js/emergency.js renders it from a single source so the numbers cannot drift between pages."))
b(("p", "Glossary. data/glossary-data.json holds the definitions; html/glossary.html provides search and "
        "alphabetical navigation; deep links such as glossary.html?term=Passphrase are supported, and the "
        "password checker uses them to link a weak result to the relevant terms."))
b(("p", "Resources. data/resources-data.json lists trusted external sources with a description and a link, "
        "grouped by purpose so a learner can find an authoritative reference rather than an arbitrary blog."))
b(("p", "Daily Tips and simulator. data/tips-data.json and data/simulator-data.json drive the tip rotator and "
        "the 'spot the scam' practice cards: short scenarios with a correct classification and an explanation, "
        "used as low-stakes practice before the assessed quiz."))
b(("p", "About and Privacy. Static pages that state the educational purpose, the limits of AI-generated "
        "advice and what the platform does and does not store."))
