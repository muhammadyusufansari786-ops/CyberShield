# -*- coding: utf-8 -*-
"""Report content, part C: Chapters 7-9."""

BLOCKS = []
b = BLOCKS.append

# ----------------------------------------------------------------- 7
b(("h1", "Chapter 7  AI Integration and Algorithms"))

b(("h2", "7.1  Where Artificial Intelligence is Used"))
b(("p", "Artificial intelligence is used in five places, all of them server side: the scam analyzer (text, URL "
        "and screenshot analysis), the cybersecurity tutor, the learning path saved from a quiz result, the "
        "staged learning roadmap, and the news explainer with its question-answering mode. A sixth AI function, "
        "question generation, is available to an administrator and produces draft questions that enter the bank "
        "with the status pending until a human approves them."))
b(("p", "Two things are deliberately not done with AI. Scoring is deterministic: the quiz score is computed from "
        "stored answers with fixed weights, never estimated by a model. And URL structure analysis is "
        "deterministic: it is a parser, not a classifier, so its findings can be presented as facts."))

b(("h2", "7.2  Gemini API Architecture"))
b(("p", "The platform uses the official Google Gen AI JavaScript SDK. One module, server/services/gemini.js, "
        "constructs the client lazily from process.env.GEMINI_API_KEY, and every feature calls a typed wrapper "
        "exported by that module. Concentrating the integration has three consequences: the key is read in "
        "exactly one place, the safety settings and timeouts cannot be forgotten by a new feature, and the raw "
        "provider error can be logged server side while a friendly message is returned to the client."))
b(("table", "Table 7.1  Model configuration",
   ["Setting", "Value used", "Reason"],
   [
       ["Primary model", "GEMINI_MODEL, default gemini-3.8-flash", "General purpose flash model with JSON schema support"],
       ["Fallback model", "GEMINI_FALLBACK_MODEL, default gemini-3.5-flash-lite",
        "Different model, so a capacity problem on one is answered by the other"],
       ["Primary timeout", "12 000 ms", "Normal replies finish well inside it; a hang fails over quickly"],
       ["Fallback timeout", "20 000 ms", "Live testing showed the lightweight model needed up to ~14 s under load"],
       ["Retries", "2 attempts with exponential backoff and jitter, capped at 5 s", "Clears brief 429/503 capacity spikes"],
       ["Response type", "application/json with a responseSchema per feature", "Makes the output machine-checkable"],
       ["Safety", "Four harm categories at BLOCK_ONLY_HIGH", "Allows security discussion without allowing abuse"],
       ["Temperature", "0.3 - 0.7 depending on the feature", "Lower for analysis, higher for question generation"],
   ]))

b(("h2", "7.3  Request Construction and Payload Format"))
b(("p", "Every call is built from three parts. The system instruction defines the role, the rules and the "
        "output contract. The contents array carries the user turn: for the scam analyzer it may contain a "
        "text part with the machine-detected URL findings, a text part with the message, and an inlineData part "
        "with the screenshot bytes and MIME type; for the tutor it contains the last twelve turns of the stored "
        "conversation followed by the new question. The generation config carries the response MIME type, the "
        "schema, the temperature and the safety settings."))
b(("code", "contents: [\n"
          "  { role: 'user', parts: [\n"
          "      { text: 'Automated structural URL check (machine-detected ...): ...' },\n"
          "      { text: 'Message/URL to analyze:\\n\"\"\"\\n<user text>\\n\"\"\"' },\n"
          "      { inlineData: { mimeType: 'image/png', data: '<base64>' } }\n"
          "  ] }\n"
          "],\n"
          "config: {\n"
          "  systemInstruction: SCAM_SYSTEM,\n"
          "  temperature: 0.3,\n"
          "  safetySettings: SAFETY_SETTINGS,\n"
          "  responseMimeType: 'application/json',\n"
          "  responseSchema: SCAM_SCHEMA\n"
          "}"))
b(("p", "The schema for the scam analyzer declares nine properties and marks all nine as required: risk_level, "
        "risk_score, threat_category, verdict, suspicious_phrases, red_flags, explanation, recommended_actions "
        "and safety_tips. Because the schema is supplied to the model, the response is an object of the right "
        "shape rather than prose containing a JSON fragment; the schema also carries descriptions that act as "
        "field-level instructions, for example that risk_score must be consistent with risk_level and that "
        "suspicious_phrases must be copied exactly from the supplied content."))

b(("h2", "7.4  Prompt Engineering"))
b(("p", "Four techniques are used consistently."))
b(("b", [
    "Role and scope. Each system instruction names the role (defensive educator, tutor for college students in "
    "India, roadmap designer, news explainer) and the boundary of the role.",
    "Grounding. The model is told which facts it may use. The scam analyzer is told that URL findings are "
    "machine-detected and must not be contradicted; the roadmap is told that measured accuracy is the only "
    "performance fact available; the news explainer is told to say 'not specified' instead of inventing details.",
    "Honesty rules. A shared block instructs the model never to claim certainty, to use hedged wording such as "
    "'AI assessment' or 'potential phishing', never to invent details and never to request passwords or OTPs.",
    "Output contract. The schema, the required-key list and the length limits are all stated, so that validation "
    "after the call is a confirmation rather than a repair.",
]))

b(("h2", "7.5  Response Processing"))
b(("p", "The SDK returns a response object. The module reads the first candidate's finishReason and rejects any "
        "value other than STOP; a SAFETY, PROHIBITED_CONTENT or BLOCKLIST finish becomes a 422 with the message "
        "that the content could not be analysed, and any other non-STOP finish becomes a 503. The text is read "
        "through a helper that supports both the property and the function form of response.text, so an SDK "
        "upgrade cannot silently break the module. Accidental markdown fences are stripped before JSON.parse, and "
        "the parsed object is checked for the required keys."))
b(("p", "Each feature then applies its own normalisation. The scam analyzer clamps the score to 0-100, raises a "
        "CRITICAL score to at least 60, lowers a LOW score to at most 40, restricts the level to four allowed "
        "values, truncates the verdict to 1,200 characters and the explanation to 2,000, and limits every list to "
        "eight items of 300 characters. The learning path restricts the step type to Learn, Read, Practice or "
        "Take, the link to ten allowed page ids, and keeps at most six steps. The roadmap validates every lesson "
        "against the topic list and the stage-difficulty mapping. The tutor truncates the answer to 8,000 "
        "characters before storage and keeps at most five takeaways and three follow-ups."))

b(("h2", "7.6  Error Handling, Retry and Fallback"))
b(("p", "Failures are classified before they are handled. A timeout or hang is recognised from the timeout "
        "message or from an AbortError or a connection reset code; a transient error is a timeout, a 429, a 500, "
        "a 502, a 503, or a message containing UNAVAILABLE, RESOURCE_EXHAUSTED or overload; everything else - "
        "authentication failure, invalid model, malformed request - is permanent."))
b(("p", "The policy follows from that classification. A hung request is never retried on the same model, because "
        "a model that hangs usually hangs again; it fails over immediately. A fast transient error is retried "
        "once on the same model after a delay of 1.5 seconds multiplied by two and jittered by up to forty per "
        "cent, so parallel requests do not retry in lockstep. A permanent error fails fast. If the primary model "
        "still fails, the fallback model is attempted with a longer timeout; if both fail, the client receives "
        "AI_UNAVAILABLE_MESSAGE with status 503 and the server log records a classified diagnostic that never "
        "contains the key or the prompt."))
b(("p", "Feature-level fallbacks sit above the transport-level ones. The tutor returns a curated answer with "
        "generatedBy = 'curated' and a notice; the roadmap uses the rule-based planner and stores the reason; the "
        "scam analyzer, the learning path and the news explainer return the friendly error, because inventing a "
        "verdict for a suspicious message or a plan for a learner would be worse than admitting the failure."))

b(("h2", "7.7  Rate Limiting of AI Endpoints"))
b(("p", "The AI router applies forty requests per fifteen minutes per address, skipping the tutor path. The "
        "tutor has its own limiter of forty messages per ten minutes keyed by the signed-in user id (falling "
        "back to the address for anonymous callers), so one account cannot exhaust the quota for a shared "
        "network and the same message is not counted twice. Question generation has a separate limit of twenty "
        "requests per hour and is administrator-only."))

b(("h2", "7.8  Rule-Based Checks versus AI Analysis"))
b(("p", "The distinction matters for trust, so it is made explicit in the interface. Rule-based results are "
        "computed by code whose behaviour can be read: the URL structure warnings, the password entropy score, "
        "the quiz score, the per-topic accuracy and the difficulty level. AI results are generated text that "
        "must be interpreted: the verdict sentences, the explanation, the red-flag wording, the tutor answer and "
        "the roadmap lesson descriptions."))
b(("table", "Table 7.2  Division of responsibility",
   ["Question", "Answered by", "Deterministic?"],
   [
       ["Is the password weak?", "js/password.js entropy model", "Yes"],
       ["Does the URL use an IP host, punycode, a look-alike domain, a shortener?", "url-analyzer.js", "Yes"],
       ["Which questions are served next?", "question-bank.js selection order", "Yes"],
       ["Is an answer correct, and what is the score?", "quiz route, weighted by difficulty", "Yes"],
       ["Which topics are weak?", "adaptive.js thresholds", "Yes"],
       ["What difficulty should the next run start at?", "adaptive.js step rules", "Yes"],
       ["Is this message likely a scam, and why?", "Gemini with grounded URL findings", "No - assessment"],
       ["How should this concept be explained to me?", "Gemini tutor with learner context", "No - generated"],
       ["In what order should I study?", "Gemini roadmap, or the rule-based planner", "Hybrid"],
       ["Is this article about a real incident?", "Curated article data, not the model", "Yes"],
   ]))

b(("h2", "7.9  The Structural URL Analyzer"))
b(("p", "The analyzer is the most security-sensitive deterministic component, because it processes attacker-"
        "controlled input. It never contacts the submitted address: there is no fetch, no HTTP client and no DNS "
        "lookup in the module, so there is no server-side request forgery surface and no way to notify an "
        "attacker that a link was checked. Invisible joiner characters are stripped first, because they are used "
        "to defeat visual inspection of a domain."))
b(("n", [
    "Reject empty input. Treat data:, javascript:, vbscript: and file: values as immediately suspicious and "
    "return a warning without parsing.",
    "Add a scheme if none was supplied, then parse with the WHATWG URL parser. Report a missing scheme as its "
    "own warning, because transport security cannot be judged without it.",
    "Compute the registrable domain with a small public-suffix heuristic that knows the common two-label "
    "suffixes used in India (co.in, org.in, ac.in, gov.in and others).",
    "Check the host: a bare IPv4 address, a punycode label (xn--), five or more labels, a URL longer than 200 "
    "characters, embedded user:password, a non-standard port, or a known shortener each produce a warning.",
    "Compare the domain against eighteen brands. A brand token in the host whose registrable domain is not the "
    "brand's real domain is reported as impersonation; a second-level label within one or two edits of a brand "
    "name (with a tighter threshold for short names) is reported as a near-miss.",
    "Check the path and query for verify, KYC, OTP, UPI, PIN and login wording, reporting at most one such hint "
    "to avoid stacking near-duplicates.",
]))
b(("code", "analyze(url):\n"
          "    strip invisible characters; reject empty\n"
          "    if scheme in {data, javascript, vbscript, file}: return one high-severity warning\n"
          "    parse URL (prepend https:// when no scheme); reject unparseable / non-http(s)\n"
          "    host  <- lowercase hostname\n"
          "    rd    <- registrableDomain(host)          # 2 or 3 labels\n"
          "    warnings <- []\n"
          "    if no scheme given      : warn 'scheme not stated'\n"
          "    if scheme == http       : warn 'no encryption'\n"
          "    if host is IPv4 literal : warn 'IP host'\n"
          "    if host contains 'xn--' : warn 'punycode'\n"
          "    if labelCount >= 5      : warn 'long subdomain chain'\n"
          "    if length > 200         : warn 'long URL'\n"
          "    if userinfo present     : warn 'embedded credentials'\n"
          "    if port not in {80,443} : warn 'unusual port'\n"
          "    if rd is a shortener    : warn 'shortened link'\n"
          "    brand <- findBrandImpersonation(rd, host)\n"
          "    if brand.nearMiss       : warn 'domain imitates X'\n"
          "    if brand.tokenElsewhere : warn 'brand outside its domain'\n"
          "    if path matches verify|kyc|otp|upi|pin|login: warn once\n"
          "    return { ok, host, registrableDomain, warnings, summary }"))

b(("h2", "7.10  The Password Strength Algorithm"))
b(("p", "The algorithm is an entropy estimate with penalties, not a dictionary attack and not a machine-learning "
        "model. It runs in the browser, so the password is not transmitted. The steps are as follows."))
b(("code", "pool <- 0\n"
          "if has lowercase : pool += 26\n"
          "if has uppercase : pool += 26\n"
          "if has digit     : pool += 10\n"
          "if has symbol    : pool += 32\n"
          "rawEntropy <- length * log2(pool)\n"
          "penalty <- 0\n"
          "if length < 8            : penalty += 10\n"
          "variety <- count of character classes present\n"
          "if variety == 1          : penalty += 15\n"
          "else if variety == 2    : penalty += 5\n"
          "if password in COMMON    : penalty += 30\n"
          "if /(.)\\1{2,}/ matches    : penalty += 10\n"
          "if sequentialPattern     : penalty += 15\n"
          "if leetSubstitution      : penalty += 5\n"
          "if yearOrDatePattern     : penalty += 10\n"
          "final <- max(0, rawEntropy - penalty)\n"
          "band  <- very-weak < 28 | weak < 36 | fair < 60 | strong < 128 | very-strong"))
b(("p", "The sequential check is not a single regular expression. It scans every three-character substring of "
        "the keyboard rows qwertyuiop, asdfghjkl, zxcvbnm and 1234567890 in both directions, then checks numeric "
        "triples such as 000, 012 and 210. The personal-information check looks for a four-digit year and for "
        "numeric date patterns. Each deduction also produces a human-readable feedback item classified as pass, "
        "warning or failure, and the strength class selects which glossary terms are suggested."))

b(("h2", "7.11  The Adaptive Quiz Algorithm"))
b(("h3", "7.11.1  Profile Construction"))
b(("p", "The profile is built from the twenty most recent saved attempts. Questions are walked in chronological "
        "order into a per-topic list of booleans, which gives an accuracy per topic. A topic is weak when it has "
        "at least three answers and accuracy below 60 per cent; if no topic meets that bar but the weakest "
        "measured topic is below 80 per cent, that topic becomes the single weak topic. A topic is strong at 80 "
        "per cent or more with at least two answers. A topic is improving when its newer half of answers is at "
        "least twenty percentage points better than its older half and at least 50 per cent in absolute terms."))
b(("h3", "7.11.2  Starting Difficulty"))
b(("code", "if no attempts                     : difficulty <- easy\n"
          "else if last adaptive run exists   : difficulty <- that run's finalDifficulty\n"
          "else if average score available    : difficulty <- avg >= 80 ? hard : avg >= 50 ? medium : easy\n"
          "if answers >= 8:\n"
          "    if lastScore < 50  : difficulty <- step(difficulty, -1)\n"
          "    if lastScore >= 85 : difficulty <- step(difficulty, +1)"))
b(("h3", "7.11.3  Topic Plan"))
b(("p", "The plan is a list of topic slugs, one per question. About 45 per cent of the slots are assigned to weak "
        "topics when any exist, 20 per cent to strong topics, and the remainder to topics without a measurement. "
        "Each group is shuffled and the final plan is shuffled again, so the order does not reveal the diagnosis. "
        "If every topic has been measured, the neutral slots are folded into the weak group."))
b(("h3", "7.11.4  Selection Order"))
b(("p", "For question i the planned topic and the current difficulty are known. The selector attempts seven "
        "filters in order and takes the first that yields a document: planned topic at current difficulty unseen "
        "by the user; planned topic unseen; current difficulty unseen; planned topic at current difficulty; "
        "planned topic; current difficulty; any approved question. Each attempt uses a random sample, so two "
        "learners at the same level do not receive an identical paper. The final fallback guarantees that a run "
        "always completes even when the bank is small."))
b(("h3", "7.11.5  In-Run Difficulty Adjustment"))
b(("code", "on answer(isCorrect):\n"
          "    if mode == adaptive:\n"
          "        streak <- isCorrect ? max(1, streak + 1) : min(-1, streak - 1)\n"
          "        if streak >= 2 :  currentDifficulty <- step(up);   streak <- 0\n"
          "        if streak <= -2:  currentDifficulty <- step(down); streak <- 0\n"
        "    record answer, selectedIndex, correctIndex, answeredAt"))
b(("p", "The requirement of two consecutive answers before a change is what stops the level from swinging on a "
        "single guess. The stair-step rule is mirrored in the client module js/adaptive-quiz.js only for "
        "display; the authoritative value is the one stored in the quiz session and returned by the server after "
        "each answer, which the audit verified by asserting that two correct answers produce moved = 1 and "
        "difficulty = medium."))

b(("h2", "7.12  Question Generation and Human Review"))
b(("p", "Administrators can request a batch of questions for a topic and difficulty. The request is chunked into "
        "batches of ten and capped at twenty per request, and the prompt includes an avoid-list of existing "
        "question texts so the model does not produce near-duplicates. Generated questions are validated "
        "structurally - four distinct options, a correct index between 0 and 3, an explanation of at least "
        "twenty characters, a valid topic and difficulty - and inserted with status pending. They become part of "
        "the quiz only after an administrator approves them, and every approval, rejection, retirement and "
        "creation is written to adminquestionlogs with the administrator's email and a timestamp."))

# ----------------------------------------------------------------- 8
b(("h1", "Chapter 8  Database Design"))

b(("h2", "8.1  Database and Connection"))
b(("p", "The database is MongoDB Atlas, a managed document database. The application uses the database named "
        "cybershield by default (configurable through DB_NAME) and connects with Mongoose at start-up. The "
        "connection uses a twenty-second server-selection timeout so that an unreachable cluster produces a clear "
        "failure in about twenty seconds instead of a two-minute hang, and the server refuses to start if the "
        "connection fails rather than serving pages that cannot work. Connection events are logged without the "
        "connection string."))

b(("h2", "8.2  Collections"))
b(("table", "Table 8.1  Collections in the cybershield database",
   ["Collection", "Purpose", "Key indexes"],
   [
       ["users", "Account record and role", "unique email"],
       ["sessions", "Session store managed by connect-mongo", "expiresAt (TTL by the store)"],
       ["questions", "Approved, pending and retired quiz questions", "unique questionId; normalizedText; topic + status"],
       ["quizsessions", "In-progress run state, answer keys per run", "unique sessionKey; expiresAt TTL 6 h"],
       ["quizattempts", "Finished runs with per-question records", "unique (userId, submissionId); userId + createdAt"],
       ["questionhistories", "Which questions a user has seen and how often", "unique (userId, questionId); lastSeenAt"],
       ["learningprogresses", "Saved learning paths and staged roadmaps", "userId + kind + status"],
       ["tutorconversations", "One private chat document per user", "unique userId"],
       ["scamreports", "Defined for future opt-in history; unused by design", "userId + createdAt"],
       ["threatitems", "Cached CISA KEV and NVD vulnerabilities", "_id = CVE id; severity; source; feedDate"],
       ["threatsyncstates", "Per-source sync health", "_id = source"],
       ["adminquestionlogs", "Moderation audit trail", "createdAt; questionId"],
   ]))

b(("h2", "8.3  Schema Details"))
b(("h3", "8.3.1  users"))
b(("p", "Fields: _id, name (2-80 characters, required), email (lower-cased, unique, required), passwordHash "
        "(required, never selected into a client payload), role (user or admin, default user), lastLogin and the "
        "automatic createdAt and updatedAt timestamps. The model provides toSafeJSON, which returns the id, name, "
        "email, role and timestamps only."))
b(("h3", "8.3.2  questions"))
b(("p", "Fields: questionId (unique, used as the public identifier), text, normalizedText (lower-cased and "
        "punctuation-stripped, used for duplicate detection), options (exactly four strings), correct (an index "
        "0-3), explanation, topic (one of nine slugs), subtopic, difficulty (easy, medium or hard), category "
        "(derived from the topic), status (approved, pending or rejected), retired (boolean), source (human or "
        "generated), createdBy and batchId. A question is served only when status is approved and retired is not "
        "true."))
b(("h3", "8.3.3  quizsessions"))
b(("p", "Fields: sessionKey (a UUID, also the public quiz id), userId (null for anonymous runs), mode, category, "
        "count, status, startDifficulty and currentDifficulty (adaptive runs), weakTopics and strongTopics "
        "snapshots, queue (the preselected normal-mode ids), topicPlan, seenIds, askedIds, streak, questions and "
        "expiresAt. Each element of questions stores questionId, topic, subtopic, difficulty, category, "
        "optionOrder, correctIndex, newToUser and, once answered, selectedIndex, isCorrect and answeredAt. This "
        "is the only place where a correct index exists during a run, which is why the answer key cannot be "
        "obtained from the client."))
b(("h3", "8.3.4  quizattempts"))
b(("p", "Fields: userId, submissionId (the quiz session key), score, rawScore (adaptive runs only), total, "
        "correct, category, durationSeconds, mode, startDifficulty, finalDifficulty and questions. Each element "
        "of questions is deliberately minimal - questionId, topic, difficulty, correct - so that a leaked attempt "
        "row cannot be used to reconstruct option text or answer keys. The compound unique index on (userId, "
        "submissionId) is the idempotency guarantee for a repeated submission."))
b(("h3", "8.3.5  questionhistories"))
b(("p", "Fields: userId, questionId, timesSeen, timesCorrect, lastCorrect, lastSeenAt and firstSeenAt, with a "
        "compound unique index on (userId, questionId) and an update performed as an unordered bulkWrite of "
        "upserts. This collection is what makes rotation and repetition avoidance possible, and it is what the "
        "history endpoint reports."))
b(("h3", "8.3.6  learningprogresses"))
b(("p", "One collection holds two kinds of document. kind = 'path' documents store the summary, focus area, "
        "strong and weak area lists and the four-field steps produced by the quiz learning-path feature. "
        "kind = 'roadmap' documents store the title, summary, level, generatedBy, fallbackReason, "
        "profileSnapshot and the full lesson array with lessonKey, topic, stage, difficulty, type, title, "
        "objective, why, estimatedMinutes, description, resource, resourceLabel, exercise, completed and "
        "completedAt. status distinguishes the active roadmap from archived ones, and sourceAttemptId links a "
        "path to the attempt that produced it."))
b(("h3", "8.3.7  tutorconversations"))
b(("p", "Fields: userId (one document per user), title, difficulty, messages and lastMessageAt. Each message "
        "stores role, text, difficulty, generatedBy, safety, topic, keyTakeaways and followUps. The array is "
        "trimmed to the most recent forty messages, and clearing a conversation deletes the document so that "
        "'clear' really removes the private chat."))
b(("h3", "8.3.8  threatitems and threatsyncstates"))
b(("p", "A threat document is keyed by its CVE identifier and stores source, title, description, severity, "
        "cvss, cvssVersion, published, lastModified, feedDate, vendor, product, the CISA kev flag, kevDateAdded, "
        "kevDueDate, ransomwareUse, requiredAction, cwes and url. A sync-state document stores the source, the "
        "last attempt time, the last success time, the last error and the record count, which is what the status "
        "panel displays."))

b(("h2", "8.4  Relationships and Document Structure"))
b(("p", "MongoDB does not enforce foreign keys, so relationships are expressed as ObjectId references and "
        "enforced by query scope. A quiz attempt references a user, a roadmap references the attempt that "
        "produced it, a question history row references a user and a question, and a tutor conversation "
        "references a user. Because the server always filters by the session user id, a missing reference can "
        "never widen access: it can only make a document invisible."))
b(("fig", "diagrams/fig_er.png", "Collection relationship diagram of the cybershield database", 16.6))
b(("p", "The document model is used where it is natural. A quiz run is one document with an embedded array of "
        "questions, because the answers only make sense together with the run; a tutor conversation is one "
        "document with an embedded array of turns, because the chat is always read as a whole. Collections are "
        "used where the data grows without bound or is queried independently: attempts, histories and attempts "
        "per user are separate documents with indexes rather than arrays inside the user."))

b(("h2", "8.5  Data Storage and Retrieval Workflow"))
b(("p", "A quiz run writes in three places and reads from two. Reads: approved questions, and the user's last "
        "twenty attempts when building a profile. Writes: the quiz session on start and on every served or "
        "answered question, the attempt on submit, and the question history on submit. A tutor message writes the "
        "conversation document; a roadmap generation archives the previous active roadmap and inserts a new one; "
        "a lesson toggle modifies one element of the steps array with markModified so Mongoose persists the "
        "change. Threat refresh upserts by CVE id and then writes the sync state."))
b(("p", "Retrieval is always scoped. Dashboard queries use the session user id in every filter; the best score "
        "is a find sorted by score and date; the average is an aggregation with a $group on the same match. "
        "Nothing in any route accepts a user id from the request body or query string, which is the structural "
        "reason that the isolation test in Chapter 11 passes."))

# ----------------------------------------------------------------- 9
b(("h1", "Chapter 9  API Documentation"))
b(("p", "Thirty-six endpoints are implemented across eight routers. All request and response bodies are JSON. "
        "Authentication is a session cookie; where a route requires it, the table states so. Every route that "
        "changes state also requires a same-origin request, which is enforced by middleware and is not repeated "
        "in each row."))

b(("h2", "9.1  Authentication Endpoints"))
b(("table", "Table 9.1  /api/auth",
   ["Method and path", "Auth", "Request body", "Success response"],
   [
       ["POST /api/auth/register", "No", "{ name, email, password }",
        "201 { user: { id, name, email, role, createdAt } } and a session cookie"],
       ["POST /api/auth/login", "No", "{ email, password }", "200 { user: { ... } } and a new session id"],
       ["POST /api/auth/logout", "No", "none", "200 { ok: true } and an expired cookie"],
       ["GET /api/auth/me", "Yes", "none", "200 { user: { ... } }"],
   ]))
b(("p", "Errors: 400 for a validation failure (the message lists every problem in one string), 401 for invalid "
        "credentials or a missing session, 409 for an existing email, 429 when the login limit of ten attempts "
        "per fifteen minutes or the registration limit of ten per hour is exceeded. A malformed JSON body on "
        "login or register is answered with 400 and the same generic credential message, so a parse error cannot "
        "be used to probe the endpoint."))
b(("code", "POST /api/auth/login\n{ \"email\": \"student@example.edu\", \"password\": \"<password>\" }\n\n"
          "200 OK\n{ \"user\": { \"id\": \"6512...\", \"name\": \"Student\", \"email\": \"student@example.edu\",\n"
          "            \"role\": \"user\", \"createdAt\": \"2026-11-25T09:12:44.120Z\" } }\n\n"
          "401 Unauthorized\n{ \"error\": \"Invalid email or password.\" }"))

b(("h2", "9.2  AI Endpoints"))
b(("table", "Table 9.2  /api/ai",
   ["Method and path", "Auth", "Body limit", "Request", "Response"],
   [
       ["POST /api/ai/scam-analyze", "No", "12 MB", "{ text?, url?, imageBase64?, imageMime? }",
        "200 { risk_level, risk_score, threat_category, verdict, suspicious_phrases, red_flags, explanation, "
        "recommended_actions, safety_tips, url_analysis? }"],
       ["POST /api/ai/tutor", "Yes", "100 kB", "{ message, difficulty?, history? }",
        "200 { reply, keyTakeaways, followUps, topic, topicLabel, practice, generatedBy, safety, notice, "
        "difficulty, personalization, suggestedPrompts }"],
       ["POST /api/ai/learning-path", "No", "50 kB",
        "{ score, total, correct, strongAreas, weakAreas, categoryStats }",
        "200 { summary, steps: [{ type, title, description, link }] }"],
       ["POST /api/ai/news-explain", "No", "100 kB", "{ article, question? }",
        "200 explanation object, or { answer } when a question is supplied"],
   ]))
b(("p", "Errors: 400 when the input is missing, too long, of an unsupported image type or an unparseable URL; "
        "401 for the tutor without a session; 422 when the model blocks the content; 503 when the AI service is "
        "unavailable or not configured. The 503 body always contains the same friendly message, and the "
        "diagnostic stays in the server log."))
b(("code", "POST /api/ai/scam-analyze\n{ \"text\": \"Your KYC has expired...\", \"url\": \"http://sbi-kyc-verify.online/update\" }\n\n"
          "200 OK\n{\n  \"risk_level\": \"CRITICAL\",\n  \"risk_score\": 95,\n"
          "  \"threat_category\": \"Phishing\",\n  \"verdict\": \"This message is a potential phishing scam ...\",\n"
          "  \"suspicious_phrases\": [\"your SBI KYC has expired\", \"blocked in 24 hours\"],\n"
          "  \"red_flags\": [\"urgency\", \"OTP request\", \"look-alike domain\"],\n"
          "  \"recommended_actions\": [\"Do not click the link\", \"Open the bank app yourself\"],\n"
          "  \"safety_tips\": [\"...\"],\n  \"url_analysis\": { \"host\": \"sbi-kyc-verify.online\",\n"
          "    \"http_warning\": true, \"warnings\": [{ \"headline\": \"No encryption (plain HTTP)\", \"detail\": \"...\" }] }\n}"))

b(("h2", "9.3  Quiz Endpoints"))
b(("table", "Table 9.3  /api/quiz",
   ["Method and path", "Auth", "Request", "Response"],
   [
       ["GET /api/quiz/meta", "No", "none", "200 { approved, topics[], difficulties[], maxQuestions, categories[] }"],
       ["POST /api/quiz/start", "Optional", "{ mode, count, category }",
        "201 { quizId, mode, total, startDifficulty, currentDifficulty, personalized, rotated, availableQuestions }"],
       ["POST /api/quiz/next", "Optional", "{ quizId }",
        "200 { done, index, total, mode, difficulty, question: { id, question, options[], topic, topicLabel, "
        "subtopic, difficulty, category, source, isNew } }"],
       ["POST /api/quiz/answer", "Optional", "{ quizId, questionId, selectedIndex }",
        "200 { correct, correctIndex, explanation, moved, difficulty, answered }"],
       ["POST /api/quiz/submit", "Optional", "{ quizId, durationSeconds }",
        "200 { saved, duplicate, score, rawScore, total, correct, mode, summary, review[] }"],
       ["GET /api/quiz/history", "Yes", "none", "200 { attempted, recent[] }"],
   ]))
b(("p", "Errors: 400 for an invalid count, answer index or question id; 404 for an unknown session or one that "
        "belongs to another account; 409 when a quiz is updated in two tabs at once; 503 when the bank is empty "
        "or no question matches the category. The submit route is idempotent: a second submit returns the stored "
        "attempt with duplicate = true instead of creating another row."))

b(("h2", "9.4  Dashboard, Adaptive and Learning Endpoints"))
b(("table", "Table 9.4  Dashboard, adaptive profile and learning roadmap",
   ["Method and path", "Auth", "Request", "Response"],
   [
       ["GET /api/dashboard", "Yes", "none",
        "200 { user, stats { quizAttempts, bestQuizScore, latestQuizScore, averageQuizScore, scamAnalyses, "
        "learningPaths, normalQuizAttempts, adaptiveQuizAttempts, currentDifficulty, historySufficient, "
        "topicPerformance[], weakTopics[], strongTopics[], improvedTopics[], approvedQuestions }, quizAttempts[], "
        "learningPaths[] }"],
       ["GET /api/adaptive/profile", "Yes", "none", "200 { profile, topics[], difficulties[] }"],
       ["POST /api/quiz-attempts", "Yes", "{ submissionId, total, correct, score, mode, questions[], ... }",
        "201 { saved, duplicate, attempt }"],
       ["POST /api/learning-paths", "Yes", "{ score, summary, steps[], ... }", "201 { saved, path }"],
       ["GET /api/learning/roadmap", "Yes", "none",
        "200 { roadmap | null, profile, topics[], hasAttempts }"],
       ["POST /api/learning/roadmap", "Yes", "none", "201 { roadmap, generatedBy, fallbackReason }"],
       ["PATCH /api/learning/roadmap/:id/lessons/:key", "Yes", "{ completed }", "200 { roadmap }"],
   ]))
b(("p", "Errors: 400 for a score that does not match its breakdown, an invalid submission id, a missing roadmap "
        "step list or a non-boolean completed value; 401 without a session; 404 for a roadmap or lesson that does "
        "not belong to the caller; 429 for more than one hundred and twenty writes per hour or thirty roadmap "
        "updates per hour."))

b(("h2", "9.5  Tutor Conversation Endpoints"))
b(("table", "Table 9.5  /api/tutor",
   ["Method and path", "Auth", "Request", "Response"],
   [
       ["GET /api/tutor/conversation", "Yes", "none",
        "200 { conversation, personalization, suggestedPrompts }"],
       ["POST /api/tutor/conversation", "Yes", "none", "201 { conversation, personalization, suggestedPrompts }"],
       ["DELETE /api/tutor/conversation", "Yes", "none", "200 { ok: true, conversation: null }"],
   ]))
b(("p", "Chat generation itself is POST /api/ai/tutor; these routes manage the stored conversation so that there "
        "is only one generation path. Clearing replaces the stored document rather than archiving it, which is "
        "what makes the action honest."))

b(("h2", "9.6  Threat Intelligence Endpoints"))
b(("table", "Table 9.6  /api/threats",
   ["Method and path", "Auth", "Query parameters", "Response"],
   [
       ["GET /api/threats", "No",
        "page, pageSize (5-50), severity, source (cisa-kev|nvd), search, exploited, ransomware, dateFrom, "
        "dateTo, sort (newest|oldest|severity)",
        "200 { items[], total, page, pageSize, pages } with cveId, sourceName, title, severity, cvss, published, "
        "kev, ransomwareUse, requiredAction, cwes, url"],
       ["GET /api/threats/status", "No", "none", "200 per-source sync state and last update time"],
   ]))
b(("p", "Unknown filter values are ignored rather than forwarded, pagination is clamped, and a date more than a "
        "day in the future is rejected. The list route starts a background refresh if a feed is due and never "
        "waits for it; a failure is reported as 500 with a message that the data is temporarily unavailable."))

b(("h2", "9.7  Administrative Endpoints"))
b(("table", "Table 9.7  /api/admin (all require the admin role)",
   ["Method and path", "Purpose"],
   [
       ["GET /api/admin/stats", "Counts by status, retired approved count, bank totals"],
       ["GET /api/admin/questions", "Paginated bank listing with filters"],
       ["GET /api/admin/questions/:questionId", "One question including the answer key"],
       ["POST /api/admin/questions", "Create a question (status approved or pending)"],
       ["PATCH /api/admin/questions/:questionId", "Edit a question with re-validation and duplicate check"],
       ["POST /api/admin/questions/:questionId/approve", "Approve a pending question"],
       ["POST /api/admin/questions/:questionId/reject", "Reject a pending question"],
       ["POST /api/admin/questions/:questionId/retire", "Retire an approved question from the active bank"],
       ["POST /api/admin/generate", "Generate an AI batch of questions (twenty per hour)"],
       ["GET /api/admin/logs", "Moderation audit trail"],
   ]))
b(("p", "requireAdmin re-reads the role from the database on every request, so a demoted account loses access "
        "immediately; a signed-in non-administrator receives 403, which the audit verified. All administrative "
        "writes are written to adminquestionlogs with the acting administrator's email."))

b(("h2", "9.8  Error Format and Status Codes"))
b(("table", "Table 9.8  Status codes used by the API",
   ["Code", "Meaning in CyberShield"],
   [
       ["200", "Successful read or update"],
       ["201", "Resource created (user, quiz session, attempt, roadmap, path)"],
       ["400", "Validation failure; the body explains what to correct"],
       ["401", "No session, or invalid credentials"],
       ["403", "Cross-site request blocked, or authenticated user without the admin role"],
       ["404", "Unknown resource, or a resource belonging to another account"],
       ["409", "Duplicate email, already-submitted quiz, or concurrent update"],
       ["422", "AI safety block"],
       ["429", "Rate limit exceeded"],
       ["500", "Unexpected server error (generic message, details logged)"],
       ["503", "Database unavailable, empty question bank, or AI service unavailable"],
   ]))
b(("p", "Every error body has the shape { error: string }. Technical detail - stack traces, driver messages, "
        "provider errors - is logged on the server and never returned. The unknown-API handler returns 404 JSON "
        "rather than the single-page HTML shell, so a client that mistypes a path receives a parseable error."))
