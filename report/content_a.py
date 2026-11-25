# -*- coding: utf-8 -*-
"""Report content, part A: Chapters 1-5."""

BLOCKS = []
b = BLOCKS.append

# ----------------------------------------------------------------- 1
b(("h1", "Chapter 1  Introduction"))

b(("h2", "1.1  Introduction to Cybersecurity"))
b(("p", "Cybersecurity is the practice of protecting systems, networks, applications and data from "
        "digital attacks. Its three classical goals are confidentiality, integrity and availability: "
        "information must be readable only by the people who are authorised to read it, it must not be "
        "altered without detection, and it must remain accessible to legitimate users. In everyday life "
        "these goals appear as very concrete questions - can somebody read my bank statement, can somebody "
        "change the amount on my payment request, and can I still reach my own account after an attacker "
        "has locked it?"))
b(("p", "For an ordinary internet user, most security failures do not begin with sophisticated malware. "
        "They begin with a decision made on a small screen: tapping a link in an SMS, entering an OTP on a "
        "page that looks like a bank, reusing one password across many websites, or believing an offer that "
        "is too good to be true. Technical defences such as firewalls and encryption cannot help when the "
        "user is persuaded to hand over the credential voluntarily. This is why security awareness is treated "
        "in the literature and in national policy as a first-class control rather than as an optional extra."))

b(("h2", "1.2  Importance of Cybersecurity Awareness"))
b(("p", "Awareness changes the economics of an attack. If a user recognises a phishing message before "
        "clicking, the attacker receives nothing and the campaign becomes unprofitable; if the same message "
        "reaches a user who has never been taught what a fake domain looks like, one click can compromise an "
        "account, a device and, through password reuse, a dozen unrelated services."))
b(("p", "Awareness is also the only control that scales to the whole population. An organisation can buy "
        "security products for its servers, but it cannot buy judgement for every relative, student and "
        "first-time internet user. What scales is education: a short, repeated, practical explanation of how "
        "an attack works and what the safe action is."))

b(("h2", "1.3  Growth of Cybercrime and Online Fraud"))
b(("p", "Digital payment adoption in India has grown much faster than the digital security literacy of the "
        "people who use it. Unified Payments Interface (UPI) transactions, KYC verification messages, courier "
        "delivery notifications, job offers and investment groups are now standard channels of everyday life - "
        "and therefore standard channels of fraud. The attack patterns that recur in public advisories are "
        "remarkably consistent: an urgent deadline, an authority figure, a link that imitates a known brand, "
        "and a request for an OTP, a PIN or a small \"verification\" payment."))
b(("p", "Phishing and smishing campaigns are cheap to run and can be aimed at thousands of recipients at "
        "once. Because the message is delivered through the same application the user trusts for personal "
        "communication, the victim's default trust in the channel is transferred to the attacker. Ransomware, "
        "credential stuffing and identity theft complete the picture: stolen credentials are reused "
        "automatically, and a single leaked password can unlock many accounts."))

b(("h2", "1.4  Problems Faced by Ordinary Internet Users"))
b(("p", "During the requirement study for this project, the following practical difficulties were identified "
        "as the ones a student or a non-technical user actually faces:"))
b(("b", [
    "Judgement is requested in the middle of a task. A suspicious message arrives while the user is paying a "
    "bill or waiting for a delivery, so there is no time to search for advice.",
    "Security material is written for specialists. Most guidance assumes familiarity with terms such as "
    "DMARC, TLS or multi-factor authentication, and does not answer the immediate question: \"is this message "
    "safe to act on?\"",
    "Knowledge is fragmented across sources. Password advice, phishing advice and incident-response advice "
    "live on different websites, in different formats, with no way to practise any of it.",
    "There is no feedback loop. A user who reads an article about phishing has no way to test whether the "
    "lesson was understood, and no way to find out which topic still needs work.",
    "Incident response is the weakest point. When an account is actually taken over, users do not know the "
    "first three actions to take, and delay makes recovery harder.",
]))

b(("h2", "1.5  Why an Integrated Awareness Platform is Required"))
b(("p", "Each of these problems has a partial solution somewhere, but the partial solutions do not combine. "
        "A quiz site teaches facts but cannot analyse the message in the user's hand. An article explains a "
        "recent breach but does not adjust to the reader's level. A password-strength page gives a score but "
        "does not tell the user what to study next. What is missing is a single environment in which a learner "
        "can read, practise, be assessed, receive an explanation written for their level, and be guided to the "
        "next activity - with the same account carrying the progress from one activity to the next."))
b(("p", "CyberShield was built to be that environment. It combines educational content, interactive tools, "
        "an assessed quiz with adaptive difficulty, and four AI-assisted features that explain rather than "
        "merely answer. Everything is delivered through the browser, and the personal data of a learner stays "
        "inside the learner's own account."))

b(("h2", "1.6  Introduction to CyberShield"))
b(("p", "CyberShield is a web-based cybersecurity awareness and protection platform. The application is "
        "implemented as a Node.js and Express 5 server that serves seventeen HTML pages and exposes a JSON API; "
        "the data layer is a MongoDB Atlas database named cybershield; artificial-intelligence features are "
        "implemented through the official Google Gen AI SDK (@google/genai) calling the Gemini model family."))
b(("p", "The implemented feature set is:"))
b(("b", [
    "Account registration and sign-in with bcrypt password hashing and server-side sessions stored in MongoDB.",
    "An AI Scam Analyzer that assesses pasted messages, URLs and screenshots and returns a structured risk verdict.",
    "A password strength checker and generator that runs entirely inside the browser.",
    "A three-hundred-question cybersecurity quiz with a normal mode and an adaptive mode that changes difficulty "
    "during the run.",
    "An AI Cybersecurity Tutor that answers questions at three explanation levels and personalises the answer "
    "using the learner's measured quiz results.",
    "A personalised learning roadmap generated from the learner's recorded topic accuracy, with lesson tracking.",
    "Real-time threat intelligence built from the CISA Known Exploited Vulnerabilities catalogue and the NIST "
    "National Vulnerability Database.",
    "A cybersecurity news section with an AI explainer and a question-answering mode over each article.",
    "Threat awareness pages, an emergency response guide, a safety toolkit, a glossary, curated resources and "
    "daily safety tips.",
    "A dashboard that reports only measured, stored data for the signed-in user.",
]))

b(("h2", "1.7  Purpose and Scope"))
b(("p", "The purpose of the project is educational. CyberShield is intended for college students and ordinary "
        "internet users who need practical, immediately usable guidance. The scope of the delivered system is "
        "deliberately bounded:"))
b(("b", [
    "It is a single-server web application, run locally with Node.js, not a distributed production service.",
    "It teaches defensive security only. The tutor explicitly refuses actionable attack instructions, and the "
    "question generator is instructed never to produce offensive content.",
    "The AI is used as an explainer of user-supplied content and of measured performance data. The platform does "
        "not claim certainty: every AI verdict is presented as an assessment, not as proof.",
    "Scam submissions are analysed and discarded. The design decision not to store analysed messages or "
        "screenshots is documented in Chapter 10.",
]))

b(("h2", "1.8  Motivation"))
b(("p", "The motivation came from a simple observation: the people who most need security advice are the least "
        "likely to read security documentation. A student who receives a fake KYC message will not open a "
        "browser tab, search for a government advisory and compare domain names - but the same student will "
        "paste the message into a box and read three sentences explaining why it is suspicious. Reducing the "
        "effort required to get a correct answer is therefore a security intervention in itself."))
b(("p", "A second motivation was technical. Modern generative models can explain a message in plain language, "
        "but they can also hallucinate, leak data or answer unsafe questions. Building the platform was an "
        "exercise in using a large language model responsibly: grounding it in facts computed by the server, "
        "constraining its output with a JSON schema, validating everything it returns, and degrading gracefully "
        "when the service is unavailable."))

# ----------------------------------------------------------------- 2
b(("h1", "Chapter 2  Problem Statement and Objectives"))

b(("h2", "2.1  Problem Statement"))
b(("p", "Cybersecurity awareness material is abundant but poorly matched to the situations in which users "
        "need it. Awareness is delivered as static content that cannot inspect the user's actual message, "
        "cannot adapt to the user's level, and cannot measure whether learning took place. Existing quiz "
        "applications measure recall but do not connect the result to a personalised plan, and existing "
        "scam-checking tools return a binary warning without teaching the user to recognise the pattern."))
b(("p", "The problem addressed by this project can therefore be stated as follows: how can a single web "
        "application give an ordinary user an immediate, trustworthy assessment of a suspicious message, "
        "teach the reasoning behind that assessment, measure what the user has understood, and guide the user "
        "to the topic that needs attention next - without storing the user's private messages and without "
        "depending on the user having any security background?"))

b(("h2", "2.2  Limitations of Traditional Awareness Methods"))
b(("table", "Table 2.1  Limitations of conventional awareness approaches",
   ["Conventional approach", "Limitation observed during the study"],
   [
       ["Printed or PDF handbooks", "Not available at the moment of decision; rarely re-read; no feedback."],
       ["One-off classroom session", "Knowledge decays quickly; no measurement of what was retained."],
       ["Static FAQ or blog page", "Cannot examine the user's own message or URL; generic wording."],
       ["Awareness posters and emails", "High visibility, low engagement; no practice component."],
       ["Fixed quiz with a question bank", "Same difficulty for everyone; a strong learner is bored and a weak "
        "learner is discouraged; no record of what was attempted."],
       ["Antivirus or browser warning only", "Binary signal without explanation; users cannot generalise the "
        "lesson to the next message."],
   ]))

b(("h2", "2.3  Specific Difficulties Addressed"))
b(("h3", "2.3.1  Identifying Phishing and Fraudulent Messages"))
b(("p", "A phishing message is not identified by one feature but by a combination: an unexpected sender, a "
        "manufactured deadline, a request for a secret, a link whose real domain differs from the brand it "
        "imitates, and wording that discourages verification. A learner who is shown these features in their "
        "own message, and then shown the structural evidence computed by the platform, learns a transferable "
        "pattern instead of memorising a single example. CyberShield supports this by running a structural URL "
        "analysis on the server and passing its findings to the model as machine-detected facts, so the model "
        "comments on evidence rather than on appearance."))
b(("h3", "2.3.2  Lack of Personalised Learning"))
b(("p", "A single difficulty level cannot serve a mixed classroom. CyberShield therefore records every "
        "answered question per user, computes per-topic accuracy from those records, and uses that measurement "
        "in three places: the adaptive quiz adjusts difficulty during the run, the tutor receives the measured "
        "profile as context, and the roadmap generator prioritises the topics with the lowest measured accuracy. "
        "Where no measurement exists, the system states that it has no data instead of inventing a weakness."))
b(("h3", "2.3.3  Need for Real-Time Threat Awareness"))
b(("p", "Awareness content ages quickly. A vulnerability that is being exploited this week is more relevant "
        "than a case study from five years ago. CyberShield addresses this by polling two official feeds - the "
        "CISA Known Exploited Vulnerabilities catalogue and the NIST National Vulnerability Database - caching "
        "the results in MongoDB, and presenting them with severity, CVSS score, ransomware use and the CISA "
        "required action."))
b(("h3", "2.3.4  Need for AI-Assisted Explanation"))
b(("p", "Explanations must match the reader. The same question - \"what is a passkey?\" - needs a different "
        "answer for a first-year student and for a final-year student preparing for an interview. A generative "
        "model can produce both, but only if it is instructed precisely and constrained in form. CyberShield "
        "uses a system instruction, a JSON response schema and a difficulty guide to control the answer, and "
        "validates the returned object before it is stored or displayed."))

b(("h2", "2.4  Objectives"))
b(("p", "The objectives of the project, in the order in which they were implemented, are:"))
b(("n", [
    "To design and implement a secure multi-page web platform with account registration, sign-in, session "
    "management and per-user data isolation.",
    "To implement an AI Scam Analyzer that accepts text, a URL or a screenshot and returns a structured, "
    "hedged risk assessment with evidence, recommended actions and safety tips.",
    "To implement a structural URL analyser that detects typosquatting, deceptive subdomains, IP-address hosts, "
    "punycode domains, embedded credentials, shorteners and scheme problems without ever contacting the "
    "submitted address.",
    "To implement a client-side password strength checker and generator that never transmits the password.",
    "To implement a server-scored quiz whose answer key never reaches the browser, with question rotation and "
    "per-user attempt history.",
    "To implement an adaptive quiz mode that selects questions by topic plan and adjusts difficulty from "
    "consecutive answers.",
    "To implement an AI tutor that personalises explanations from measured quiz performance and refuses "
    "offensive requests.",
    "To generate a staged, trackable learning roadmap from recorded topic accuracy, with a deterministic "
    "rule-based fallback when the AI service is unavailable.",
    "To integrate live vulnerability intelligence from CISA KEV and NIST NVD with caching and filtering.",
    "To document the system completely: architecture, database design, API, security controls and test results.",
]))

b(("h2", "2.5  Scope of the Delivered System"))
b(("p", "The delivered system consists of the seventeen pages listed in Chapter 6, thirty-six API endpoints, "
        "eleven MongoDB collections and eight diagrams describing the implementation. It runs locally on "
        "Node.js 20 or later, requires a MongoDB Atlas connection string and a Gemini API key, and is started "
        "with a single command. Features that were considered but not implemented are listed in Chapter 15 and "
        "are not described anywhere as existing functionality."))

# ----------------------------------------------------------------- 3
b(("h1", "Chapter 3  Existing System and Proposed System"))

b(("h2", "3.1  Study of Existing Systems"))
b(("p", "Four categories of existing solution were examined during the requirement study. Each solves part "
        "of the problem, and each was a source of design ideas as well as a source of gaps."))
b(("h3", "3.1.1  Static Awareness Websites"))
b(("p", "Government and vendor awareness portals publish advisories, best-practice pages and downloadable "
        "guides. Their strength is authority: the content is reviewed and accurate. Their weakness is that the "
        "content is one-directional. The reader cannot submit their own message, cannot practise, and cannot "
        "find out whether the advice was understood. Content is also rarely personalised to a reading level."))
b(("h3", "3.1.2  Standalone Quiz Applications"))
b(("p", "General-purpose quiz platforms provide question banks, scoring and review. Their strength is "
        "assessment. Their weakness in this context is that the questions are not tied to a curriculum of "
        "topics, the difficulty does not adapt, and the result is a score rather than a diagnosis. Nothing in "
        "such a system records which topic produced the wrong answers."))
b(("h3", "3.1.3  Scam-Checking and Link-Reputation Tools"))
b(("p", "URL reputation services and message checkers return a safety verdict based on blocklists and "
        "heuristics. Their strength is speed and breadth of data. Their weaknesses are threefold: the verdict is "
        "binary rather than explanatory, a new domain has no reputation and therefore no verdict, and the user "
        "learns nothing that transfers to the next message. Some tools also visit the submitted URL to inspect "
        "it, which introduces a server-side request forgery surface and can notify the attacker."))
b(("h3", "3.1.4  Chat-Based AI Assistants"))
b(("p", "General chat assistants can explain any security concept. Their strength is flexibility. Their "
        "weaknesses are the absence of grounding (they do not know the learner's measured performance), the "
        "absence of structure (answers are prose, not validated objects), the risk of unsafe output (a general "
        "assistant may describe an attack in operational detail), and the absence of any record that a learner "
        "can return to."))

b(("h2", "3.2  Proposed System"))
b(("p", "CyberShield is proposed as an integrated platform in which the four categories above are combined "
        "under one account, one visual language and one data model. The proposal has five parts:"))
b(("b", [
    "Assessment is grounded. Before any AI call, the server computes what it can compute deterministically - "
    "URL structure, per-topic accuracy, difficulty level - and supplies those facts to the model.",
    "Output is constrained. Every AI feature requests JSON conforming to a declared schema, and the server "
    "validates, clamps and whitelists every field before the value is stored or displayed.",
    "Learning is measured and reused. Quiz attempts are stored per user with per-question topic and difficulty, "
    "and the resulting profile drives the adaptive quiz, the tutor context and the roadmap.",
    "Content is fresh. Vulnerability data is retrieved from official feeds and cached, rather than written "
    "into the pages.",
    "Failure is designed for. Every AI-dependent feature has a defined degraded behaviour: a curated tutor "
    "answer, a rule-based roadmap, or a clear error message.",
]))

b(("h2", "3.3  Comparison of Existing and Proposed System"))
b(("table", "Table 3.1  Comparison of conventional approaches with CyberShield",
   ["Criterion", "Static awareness site", "Standalone quiz", "Link checker", "General chat AI", "CyberShield"],
   [
       ["Analyses the user's own message", "No", "No", "URL only", "Yes, ungrounded", "Yes - text, URL and screenshot"],
       ["Explains the reasoning", "Partly", "No", "No", "Yes", "Yes - evidence, red flags, actions"],
       ["Never contacts the submitted URL", "Yes", "Yes", "Sometimes no", "N/A", "Yes - parsing only"],
       ["Measures per-topic performance", "No", "Score only", "No", "No", "Yes - per topic and difficulty"],
       ["Adapts difficulty", "No", "No", "No", "No", "Yes - during the run"],
       ["Personalised next steps", "No", "No", "No", "Weak", "Yes - stored roadmap with progress"],
       ["Refuses offensive requests", "N/A", "N/A", "N/A", "Not guaranteed", "Yes - guard plus system instruction"],
       ["Works when the AI is down", "Yes", "Yes", "Yes", "No", "Yes - curated answer / rule-based plan"],
       ["Stores user data in one account", "No", "Sometimes", "No", "Session only", "Yes - MongoDB, per user"],
       ["Live threat data", "Manual", "No", "Separate", "No", "Yes - CISA KEV and NIST NVD"],
   ]))

b(("h2", "3.4  Advantages of the Proposed System"))
b(("b", [
    "One account carries all progress: quiz attempts, roadmap completions and tutor conversation are stored "
    "against the same user id and read back into every personalisation decision.",
    "The answer key never reaches the browser. Question selection, answer checking and final scoring all happen "
    "on the server, so the client cannot cheat and a leaked page source reveals nothing.",
    "Deterministic checks and AI text are kept separate. The URL analysis is returned in its own field, so the "
    "user can see which facts were computed and which sentences were generated.",
    "Degradation is explicit. When the model is unavailable the tutor says so in a notice field and returns a "
    "reviewed answer; the roadmap records generatedBy = 'rule-based' and a human-readable reason.",
    "Privacy is a design constraint. Scam text and screenshots are analysed in memory and never written to the "
    "database; the dashboard reports zero analyses instead of inventing history.",
]))

b(("h2", "3.5  How the Project Improves Cybersecurity Education"))
b(("p", "The improvement is not that CyberShield contains more text than an awareness website. It is that the "
        "platform closes the loop between reading, doing and measuring. A learner reads about phishing, takes a "
        "quiz, receives a topic breakdown of the mistakes, is given a staged roadmap that starts with the "
        "weakest measured topic, and can ask the tutor why the answer was wrong at the level that suits them. "
        "Each activity produces data that improves the next activity, which is precisely what a static page "
        "cannot do."))

# ----------------------------------------------------------------- 4
b(("h1", "Chapter 4  System Requirements and Technologies Used"))

b(("h2", "4.1  Development and Runtime Environment"))
b(("p", "Every technology listed in this chapter was confirmed in the project source: package.json for the "
        "server dependencies, the import statements in server/ and js/, and the file extensions in html/, css/ "
        "and data/."))
b(("table", "Table 4.1  Technology stack actually used",
   ["Layer", "Technology", "Version / form", "Purpose in CyberShield"],
   [
       ["Markup", "HTML5", "17 pages", "Static page structure for every screen"],
       ["Styling", "CSS3", "3 stylesheets", "Layout, dark/light theming, responsive rules"],
       ["Client logic", "Vanilla JavaScript (ES2017+)", "19 modules, 7,010 lines",
        "Page behaviour, fetch calls, client-side password analysis"],
       ["Server runtime", "Node.js", ">= 20 (engines field)", "Executes the Express application"],
       ["Web framework", "Express", "^5.1.0", "Routing, middleware, static file serving"],
       ["Sessions", "express-session", "^1.19.0", "Server-side session for each browser"],
       ["Session store", "connect-mongo", "^5.1.0", "Persists sessions in MongoDB"],
       ["Rate limiting", "express-rate-limit", "^8.0.0", "Per-route abuse protection"],
       ["Password hashing", "bcryptjs", "^3.0.3", "Salted password hashes, cost factor 12"],
       ["Database", "MongoDB Atlas with Mongoose", "^9.11.4", "Eleven collections plus the session store"],
       ["AI", "Google Gen AI SDK (@google/genai)", "^1.0.0", "Gemini calls for four AI features"],
       ["Configuration", "dotenv", "^16.4.5", "Loads .env without exposing values to the client"],
       ["Threat feeds", "CISA KEV JSON, NIST NVD 2.0 REST", "external HTTPS", "Live vulnerability intelligence"],
   ]))

b(("h2", "4.2  Frontend Technologies"))
b(("h3", "4.2.1  HTML5"))
b(("p", "The interface is a set of seventeen static documents in html/, each requesting the shared stylesheet "
        "and the scripts it needs. The root index.html redirects to html/index.html. Because the pages are "
        "static documents, they can be inspected and cached normally, and no template engine or build step is "
        "required. Accessibility attributes are used on interactive controls: for example the password "
        "visibility button updates its aria-label, and the feedback region is marked aria-hidden when empty."))
b(("h3", "4.2.2  CSS3"))
b(("p", "Three stylesheets are used. style.css contains the design system, layout and component styles shared "
        "by every page. tutor.css contains the chat interface of the AI tutor. learning-path.css contains the "
        "roadmap timeline, stage badges and progress indicators. The design uses CSS custom properties so that "
        "the dark and light themes share one set of components."))
b(("h3", "4.2.3  JavaScript"))
b(("p", "The client is written in plain JavaScript with no framework. Each page loads main.js, which provides "
        "shared utilities (a debounce helper, local-storage helpers, theme switching, navigation), plus the "
        "module for that page. Network calls use the Fetch API with credentials: 'same-origin' so the session "
        "cookie is sent, and every response is rendered with textContent or escaped HTML rather than injected "
        "as raw markup."))

b(("h2", "4.3  Backend Technologies"))
b(("h3", "4.3.1  Node.js and Express 5"))
b(("p", "The server is a Node.js application using ECMAScript modules (\"type\": \"module\" in package.json). "
        "Express 5 provides the routing layer and the middleware chain. The application is assembled in "
        "server/server.js in a fixed order: environment configuration, database connection and seeding, session "
        "middleware, per-router rate limiters, static file serving, a JSON 404 handler for unknown API routes, "
        "and a final error handler that always answers with JSON. This order matters: a request for an unknown "
        "API path must not fall through to the static handler and return an HTML page to a fetch() caller."))
b(("h3", "4.3.2  express-session and connect-mongo"))
b(("p", "Sessions are server-side. The cookie named cybershield.sid carries only an opaque identifier; the "
        "session object is stored in the sessions collection by connect-mongo, so restarting the server does "
        "not sign users out and no user data is placed in a client-readable cookie. The cookie is HttpOnly and "
        "SameSite=Lax, which the audit verified programmatically."))
b(("h3", "4.3.3  bcryptjs"))
b(("p", "Passwords are hashed with bcrypt at cost factor 12 before storage. Comparison uses bcrypt.compare, "
        "and when the supplied email does not exist the login route still performs a comparison against a "
        "dummy hash so that response time does not reveal whether an account exists."))
b(("h3", "4.3.4  express-rate-limit"))
b(("p", "Limits are applied per route rather than globally, because the routes have very different costs: ten "
        "login attempts per fifteen minutes, ten registrations per hour, forty tutor messages per ten minutes "
        "keyed by user id, three hundred quiz requests per fifteen minutes, one hundred and twenty writes per "
        "hour, and one hundred and twenty threat-intelligence requests per minute."))

b(("h2", "4.4  Database Technology"))
b(("p", "MongoDB Atlas hosts the database cybershield. Mongoose defines eleven schemas with explicit indexes: "
        "a unique index on the user email, a unique index on questionId, a compound unique index on "
        "(userId, questionId) for question history, a compound unique index on (userId, submissionId) for quiz "
        "attempts, and a TTL index on quiz sessions that removes abandoned runs after six hours. The document "
        "model suits the data: a quiz attempt is naturally one document containing an array of per-question "
        "records, and a tutor conversation is naturally one document containing an array of turns."))

b(("h2", "4.5  Artificial Intelligence"))
b(("p", "AI features are implemented with the official Google Gen AI SDK. The model identifier is read from "
        "GEMINI_MODEL with a documented default, and a second identifier is read from GEMINI_FALLBACK_MODEL. "
        "Requests use responseMimeType 'application/json' together with a responseSchema, so the model is asked "
        "for a specific object shape rather than free prose. Temperature is set per feature: 0.3 for scam "
        "analysis, 0.45 for the tutor, 0.4 for the learning path, 0.5 for the roadmap, 0.35 for news "
        "explanation and 0.7 for question generation."))
b(("p", "The SDK is never imported by client code. The API key is read on the server from process.env at the "
        "moment of the call, and the browser receives only the validated result."))

b(("h2", "4.6  Development and Testing Tools"))
b(("table", "Table 4.2  Development tools",
   ["Tool", "Use in the project"],
   [
       ["Visual Studio Code", "Source editing"],
       ["Node.js runtime and npm", "Dependency installation and local execution"],
       ["MongoDB Atlas web console", "Database inspection and index verification"],
       ["Google AI Studio", "Obtaining the API key and inspecting model availability"],
       ["Browser developer tools", "Network inspection, console errors, responsive checks"],
       ["Git", "Version control"],
       ["scripts/system-audit.mjs", "End-to-end audit of pages, auth, isolation, quiz, admin, AI and threats"],
       ["scripts/quiz-bank-qa.mjs, scripts/learning-roadmap-qa.mjs", "Focused quality checks for the bank and roadmap"],
   ]))

b(("h2", "4.7  Hardware and Browser Requirements"))
b(("table", "Table 4.3  Minimum requirements",
   ["Item", "Requirement"],
   [
       ["Processor", "Dual-core 1.6 GHz or better"],
       ["Memory", "4 GB RAM (8 GB recommended when running the database tooling)"],
       ["Disk", "300 MB for the project and node_modules"],
       ["Network", "Internet access for MongoDB Atlas, the Gemini API and the threat feeds"],
       ["Server OS", "Windows 10/11, macOS or Linux with Node.js 20 or later"],
       ["Browser", "Current Chrome, Edge, Firefox or Safari with JavaScript enabled"],
       ["Display", "1280 x 720 or larger; the layout is responsive below that width"],
   ]))

b(("h2", "4.8  Software Configuration"))
b(("p", "Configuration is supplied through a .env file that is excluded from version control. The documented "
        "keys are MONGODB_URI, DB_NAME, SESSION_SECRET, GEMINI_API_KEY, GEMINI_MODEL, GEMINI_FALLBACK_MODEL, "
        "NVD_API_KEY (optional) and the threat-refresh intervals. No key, connection string or secret is "
        "reproduced anywhere in this report or in the client code."))

# ----------------------------------------------------------------- 5
b(("h1", "Chapter 5  System Architecture and Working"))

b(("h2", "5.1  Architectural Overview"))
b(("p", "CyberShield follows a three-tier architecture: a static browser client, an Express application server "
        "that holds all logic and all secrets, and a MongoDB Atlas database. Two external services are consumed "
        "by the server only: the Gemini API for the four AI features, and the CISA and NIST feeds for threat "
        "intelligence. The client never talks to any of these services directly."))
b(("fig", "diagrams/fig_architecture.png", "Overall system architecture of CyberShield", 16.4))
b(("p", "The separation is deliberate. Because the browser only ever calls /api/* on the same origin, there is "
        "no cross-origin API surface, no API key in client code, and no way for a page to reach the database "
        "except through a route that checks the session. Static assets are served by the same origin, which "
        "removes an entire class of CORS and cookie problems."))

b(("h2", "5.2  Frontend Architecture"))
b(("p", "The frontend is a set of independent documents that share three resources: style.css, main.js and "
        "footer.js. main.js exposes a small namespace with utilities used by every page (debounce, local "
        "storage helpers, theme persistence, navigation behaviour). Page-specific modules are loaded only by "
        "the page that needs them, so the quiz page does not download the tutor client and the password page "
        "does not download the news renderer."))
b(("p", "State that belongs to the server - session identity, quiz progress, attempts, roadmap completion - is "
        "always fetched from the API. Local storage is used only for cosmetic state such as the chosen theme and "
        "the toolkit checklist ticks, and the toolkit page states explicitly that progress is saved in the "
        "browser. This avoids the common failure in which a page shows personalised information that the server "
        "never recorded."))

b(("h2", "5.3  Backend Architecture"))
b(("p", "The server is organised into four layers:"))
b(("b", [
    "Configuration (server/config): database connection with a twenty-second server-selection timeout, session "
    "configuration, and the default database name cybershield.",
    "Middleware (server/middleware): requireAuth, requireAdmin and sameOriginGuard.",
    "Routes (server/routes): eight routers - auth, ai, quiz, dashboard, learning, tutor, threats and admin.",
    "Services (server/services): gemini, tutor, adaptive, question-bank, question-generator, url-analyzer, "
    "learning-roadmap and threat-intel. Routes validate and translate; services contain the logic that is worth "
    "testing on its own.",
]))
b(("p", "Two cross-cutting behaviours are implemented as middleware. requireDb answers 503 for every "
        "database-backed route when the connection is unavailable, which converts an infrastructure failure into "
        "an honest message instead of a timeout. The AI limiter applies forty requests per fifteen minutes per "
        "address and skips the tutor endpoint, because the tutor has its own per-user limit and applying both "
        "would double-count the same request."))

b(("h2", "5.4  Database Architecture"))
b(("p", "MongoDB Atlas stores eleven collections. Three of them hold user-generated learning data: quizattempts, "
        "questionhistories and learningprogresses. One holds private chat (tutorconversations), one holds the "
        "question bank (questions), one holds short-lived quiz state (quizsessions), one holds credentials "
        "(users), one holds sessions, one holds threat intelligence (threatitems), one holds feed sync state "
        "(threatsyncstates) and one holds the moderation trail (adminquestionlogs). Chapter 8 documents each "
        "collection field by field."))

b(("h2", "5.5  AI Integration Architecture"))
b(("p", "All four AI features pass through one module, server/services/gemini.js, which owns the client, the "
        "model selection, the timeouts, the retry policy, the safety settings, the schemas and the error "
        "mapping. A feature therefore cannot accidentally omit a safety setting or leak a raw provider error to "
        "the browser: it can only call the typed functions that the module exports, and those functions return "
        "validated plain objects."))

b(("h2", "5.6  Authentication and Session Architecture"))
b(("p", "Authentication is session-based, not token-based. On successful registration or login the server "
        "regenerates the session identifier before attaching the user to it, which prevents session fixation. "
        "The session object contains only an id, a name and an email; the role is read from the database on "
        "every administrative request, so a stale session cannot retain administrator rights after a role "
        "change."))
b(("fig", "diagrams/fig_authflow.png", "Authentication and session workflow", 16.4))

b(("h2", "5.7  Communication Between Frontend and Backend"))
b(("p", "Communication is HTTPS with JSON bodies and a session cookie. Every route parses its own body with an "
        "explicit size limit - 16 kB for authentication and quiz control, 20 kB for a saved attempt, 50 kB for a "
        "learning path request, 100 kB for tutor and news text, and 12 MB for the scam analyzer, which must "
        "carry a base64 screenshot. There is no global body parser, so an endpoint that should not accept a large "
        "payload cannot be made to accept one."))
b(("p", "Every state-changing request from the browser carries an Origin header that must match the host. "
        "sameOriginGuard rejects anything else with 403 before the route body runs. This is the CSRF control for "
        "a cookie-based session: a cross-site form post cannot read the cookie response, but it can still cause "
        "a state change, so the origin is checked explicitly."))

b(("h2", "5.8  Communication Between Backend and Gemini"))
b(("p", "The server sends a system instruction, a list of content parts and a generation config containing the "
        "response MIME type, the response schema, the temperature and the safety settings. The response is read "
        "from response.text, which is parsed as JSON after removing accidental code fences, then checked for the "
        "required keys. The complete workflow, including the fallback model and the failure mapping, is shown "
        "below and documented in Chapter 7."))
b(("fig", "diagrams/fig_aiflow.png", "AI request and response workflow on the server", 16.4))

b(("h2", "5.9  MongoDB Atlas Data Flow"))
b(("p", "The server connects once at start-up, after loading configuration, and then keeps a pooled connection "
        "for the lifetime of the process. Each request that needs data issues a query scoped by the session user "
        "id; no route accepts a user id from the client. Reads for the dashboard are performed in parallel with "
        "Promise.all so that ten independent counts and lookups do not serialise into ten round trips."))

b(("h2", "5.10  Data Flow Diagrams"))
b(("p", "The context diagram shows the platform as a single process with four external entities: the user, the "
        "administrator, the Gemini API and the threat feeds. The database is shown as a data store in the level-1 "
        "diagram."))
b(("fig", "diagrams/fig_dfd0.png", "Data Flow Diagram - Level 0 (context diagram)", 15.0))
b(("p", "The level-1 diagram decomposes the platform into eight processes. Processes 2.0, 5.0 and 8.0 all read "
        "and write the same learning collections, which is why every query in those processes is filtered by the "
        "session user id."))
b(("fig", "diagrams/fig_dfd1.png", "Data Flow Diagram - Level 1", 16.4))

b(("h2", "5.11  Use Case Diagram"))
b(("p", "Three actors were identified. The visitor can browse content, use the password checker and the scam "
        "analyzer, and register or sign in. The registered user additionally has a dashboard, an adaptive quiz "
        "with saved history, an AI tutor with stored conversation and a personalised roadmap. The administrator "
        "moderates the question bank and can request an AI-generated batch of questions."))
b(("fig", "diagrams/fig_usecase.png", "Use case diagram of the implemented features", 15.6))

b(("h2", "5.12  Activity Diagram of a Quiz Run"))
b(("p", "The activity diagram shows a run in adaptive mode, including the only two loops that exist in the "
        "flow: the loop that serves the next question, and the loop that changes difficulty when the "
        "consecutive-answer streak reaches plus or minus two."))
b(("fig", "diagrams/fig_activity.png", "Activity diagram of a quiz run with adaptive difficulty", 12.6))
