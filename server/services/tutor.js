/**
 * CyberShield - advanced AI cybersecurity tutor engine
 *
 * Shared by the tutor endpoints (/api/tutor/* and POST /api/ai/tutor):
 *   - loadLearnerContext()  : measured quiz profile + active roadmap (read-only)
 *   - buildLearnerPrompt()  : the ONLY personalization text sent to Gemini
 *   - detectUnsafeRequest() : deterministic redirect for actionable attack asks
 *   - buildFallbackReply()  : curated defensive answers for the 8 core domains
 *   - normalizeTutorReply() : validates structured Gemini output
 *
 * Nothing here invents performance data: topics that were never measured are
 * reported as unmeasured, and the prompt says so explicitly.
 */

import { TOPICS, TOPIC_LABELS, buildProfile } from './adaptive.js';
import { QuizAttempt, LearningProgress } from '../models/index.js';

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_HISTORY_TURNS = 12;
export const MAX_STORED_MESSAGES = 40;
export const LEVELS = ['beginner', 'intermediate', 'advanced'];

const DIFFICULTY_TO_LEVEL = { easy: 'beginner', medium: 'intermediate', hard: 'advanced' };

export const PAGE_LABELS = {
  home: 'CyberShield home',
  password: 'Password Checker',
  quiz: 'Adaptive quiz',
  news: 'News explainer',
  threats: 'Threat library',
  toolkit: 'Safety toolkit',
  glossary: 'Glossary',
  resources: 'Resources',
  ai: 'AI tutor',
  about: 'About CyberShield',
};

export function isLevel(value) {
  return LEVELS.includes(value);
}

/* ------------------------------------------------------------------ */
/* 1. Personalization (measured data only)                             */
/* ------------------------------------------------------------------ */

function publicRows(rows) {
  return (rows || []).slice(0, 5).map((row) => ({
    topic: row.topic,
    label: row.label || TOPIC_LABELS[row.topic] || row.topic,
    accuracy: row.accuracy,
    correct: row.correct,
    total: row.total,
  }));
}

function suggestedPromptsFor(context) {
  const prompts = [];
  for (const topic of context.weakTopics.slice(0, 2)) {
    prompts.push(`Explain ${topic.label} in simple terms and how to defend against it.`);
  }
  if (context.roadmap?.nextLesson) {
    prompts.push(`How do I practise ${context.roadmap.nextLesson.topicLabel || 'my next lesson'} safely?`);
  }
  prompts.push(
    'How can I spot a phishing message before I click?',
    'How does ransomware spread and how do I protect my files?',
    'What makes a password strong, and is a password manager safe?',
    'How do I stay safe on public Wi-Fi?',
    'What should I do if I clicked a suspicious link?',
    'How do I protect my UPI and online payments?',
    'How do I check whether my account has been compromised?',
    "What's the difference between malware, spyware and ransomware?"
  );

  const seen = new Set();
  return prompts.filter((prompt) => {
    const key = prompt.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

/**
 * Loads the signed-in user's measured profile and active roadmap.
 * Returns only facts that exist in the database.
 */
export async function loadLearnerContext(userId) {
  const [attempts, totalAttempts, adaptiveCount, roadmap] = await Promise.all([
    QuizAttempt.find({ userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .select({ questions: 1, score: 1, mode: 1, finalDifficulty: 1, createdAt: 1 })
      .lean(),
    QuizAttempt.countDocuments({ userId }),
    QuizAttempt.countDocuments({ userId, mode: 'adaptive' }),
    LearningProgress.findOne({ userId, kind: 'roadmap', status: 'active' })
      .sort({ createdAt: -1 })
      .select({ title: 1, steps: 1, level: 1, createdAt: 1 })
      .lean(),
  ]);

  const profile = buildProfile(attempts, {
    adaptiveAttempts: adaptiveCount,
    normalAttempts: Math.max(0, totalAttempts - adaptiveCount),
  });

  const nextLesson = roadmap
    ? (roadmap.steps || []).find((step) => step.completed !== true && step.lessonKey)
    : null;

  const context = {
    userId: String(userId),
    hasHistory: totalAttempts > 0,
    attempts: totalAttempts,
    answeredQuestions: profile.answeredQuestions,
    currentDifficulty: profile.currentDifficulty || 'easy',
    recommendedLevel: DIFFICULTY_TO_LEVEL[profile.currentDifficulty] || 'beginner',
    averageScore: profile.averageScore ?? null,
    lastScore: profile.lastScore ?? null,
    weakTopics: publicRows(profile.weakTopics),
    strongTopics: publicRows(profile.strongTopics),
    roadmap: roadmap
      ? {
          id: String(roadmap._id),
          title: roadmap.title || 'Your cybersecurity roadmap',
          nextLesson: nextLesson
            ? {
                lessonKey: nextLesson.lessonKey,
                title: nextLesson.title || 'Next lesson',
                topic: nextLesson.topic || null,
                topicLabel: nextLesson.topicLabel || TOPIC_LABELS[nextLesson.topic] || null,
                stage: nextLesson.stage || null,
                why: nextLesson.why || '',
                resource: nextLesson.resource || 'resources',
                resourceLabel: nextLesson.resourceLabel || PAGE_LABELS[nextLesson.resource] || 'CyberShield',
              }
            : null,
        }
      : null,
  };

  context.suggestedPrompts = suggestedPromptsFor(context);
  return context;
}

/** Public subset returned to the browser (no internal fields). */
export function publicPersonalization(context) {
  return {
    hasHistory: context.hasHistory,
    attempts: context.attempts,
    answeredQuestions: context.answeredQuestions,
    currentDifficulty: context.currentDifficulty,
    recommendedLevel: context.recommendedLevel,
    averageScore: context.averageScore,
    lastScore: context.lastScore,
    weakTopics: context.weakTopics,
    strongTopics: context.strongTopics,
    roadmap: context.roadmap,
  };
}

/** The only personalization text Gemini receives. */
export function buildLearnerPrompt(context) {
  const lines = ['Learner profile (measured quiz data - the ONLY performance facts you may use):'];

  if (!context.hasHistory) {
    lines.push(
      '- No saved quiz attempts yet. Do not claim any score, weak topic or level for this learner.'
    );
  } else {
    const average = context.averageScore == null ? 'not measured' : `${context.averageScore}%`;
    const latest = context.lastScore == null ? 'not measured' : `${context.lastScore}%`;
    lines.push(
      `- Saved quiz attempts: ${context.attempts}`,
      `- Current quiz difficulty: ${context.currentDifficulty}`,
      `- Average score: ${average}; latest score: ${latest}`,
      `- Weak measured topics: ${
        context.weakTopics.length
          ? context.weakTopics.map((t) => `${t.label} ${t.accuracy}% (${t.correct}/${t.total} correct)`).join('; ')
          : 'none identified'
      }`,
      `- Strong measured topics: ${
        context.strongTopics.length
          ? context.strongTopics.map((t) => `${t.label} ${t.accuracy}%`).join('; ')
          : 'none identified'
      }`
    );
  }

  if (context.roadmap?.nextLesson) {
    const lesson = context.roadmap.nextLesson;
    lines.push(
      `- Active roadmap "${context.roadmap.title}", next unfinished lesson: "${lesson.title}"` +
        (lesson.stage ? ` (${lesson.stage})` : '') +
        '. You may connect the answer to this lesson if the question is relevant.'
    );
  }

  if (context.hasHistory) {
    lines.push(
      `- Recommended explanation level: ${context.recommendedLevel} (the learner can override it).`
    );
  }

  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* 2. Structured conversation serialization                            */
/* ------------------------------------------------------------------ */

export function serializeConversation(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    title: doc.title || 'New conversation',
    difficulty: doc.difficulty || 'beginner',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    messages: (doc.messages || []).map((message) => ({
      id: message._id ? String(message._id) : null,
      role: message.role === 'model' ? 'model' : 'user',
      text: message.text || '',
      difficulty: message.difficulty || 'beginner',
      generatedBy: message.generatedBy || 'gemini',
      safety: message.safety || 'ok',
      topic: message.topic || 'general',
      keyTakeaways: Array.isArray(message.keyTakeaways) ? message.keyTakeaways : [],
      followUps: Array.isArray(message.followUps) ? message.followUps : [],
      createdAt: message.createdAt,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* 3. Safety guard (defense in depth, Gemini prompt is primary)        */
/* ------------------------------------------------------------------ */

const DEFENSIVE_CONTEXT =
  /\b(?:protect|protecting|prevent|preventing|detect|detecting|avoid|secure|securing|recover|recovering|recovery|report|reporting|awareness|recogni[sz]e|spot|signs?|warnings?|safe|safety|defen[cs]e|defensive|educat\w*|explain|understand|why do|how do attackers|how do criminals|after (?:i|my)|been hacked|was hacked|has my|is my)\b/i;

const UNSAFE_PATTERNS = [
  /\b(?:how (?:can|do|would|should) (?:i|we)|help me|teach me|tell me how|steps? (?:to|for)|give me|show me|send me|i (?:want|need) to|write|build|create|make|deploy|spread|code)\b[^.!?\n]{0,90}\b(?:hack|crack|breach|break into|steal|bypass|evade|ddos|dox|phish|infect|exploit|keylog|sniff)\b/i,
  /\b(?:malware|ransomware|keylogger|spyware|botnet|trojan|phishing kit|phishing page|fake login page|credential stealer|ddos tool)\b[^.!?\n]{0,60}\b(?:code|script|source|download|build|write|make|create|deploy|buy|install)\b/i,
  /\b(?:steal|harvest|dump|exfiltrate|sniff|intercept)\b[^.!?\n]{0,60}\b(?:passwords?|credentials?|otps?|cookies?|tokens?|sessions?|card (?:data|numbers?))\b/i,
  /\b(?:bypass|disable|get around|evade|turn off)\b[^.!?\n]{0,50}\b(?:mfa|2fa|two[- ]factor|firewall|antivirus|edr|filter|captcha|security control)\b/i,
  /\b(?:crack|brute[- ]?force|hack|access)\b[^.!?\n]{0,50}\b(?:wifi|wi-fi|router|instagram|facebook|snapchat|whatsapp|email|inbox|server|database|cctv|camera)\b/i,
  /\b(?:phishing kit|keylogger code|credential stealer|ddos tool|carding tutorial)\b/i,
];

/**
 * Best-effort deterministic check for ACTIONABLE attack requests.
 * Conceptual questions ("how do criminals steal passwords?") and defensive
 * questions ("my account was hacked, what now?") intentionally pass through.
 */
export function detectUnsafeRequest(message) {
  const text = String(message || '').toLowerCase();
  if (!text) return false;
  if (DEFENSIVE_CONTEXT.test(text)) return false;
  return UNSAFE_PATTERNS.some((pattern) => pattern.test(text));
}

/* ------------------------------------------------------------------ */
/* 4. Curated fallback knowledge base                                  */
/* ------------------------------------------------------------------ */

const FALLBACK_ENTRIES = [
  {
    id: 'phishing',
    title: 'Phishing and social engineering',
    topic: 'phishing-social',
    practice: { page: 'toolkit', label: 'Scam safety toolkit' },
    keywords: ['phishing', 'smishing', 'vishing', 'fake email', 'phishing link', 'otp fraud', 'kyc', 'social engineering', 'scam message', 'suspicious email', 'urgent message', 'fake link', 'suspicious link', 'verify account', 'fake message'],
    summary:
      'Phishing is a message that pretends to come from someone you trust so you hand over a password, OTP, payment or personal data. Social engineering is the same trick aimed at people: fake urgency, authority or friendship.',
    signs: [
      'Urgency or a threat: "your account closes in 24 hours", "KYC suspended", "salary blocked".',
      'A link whose real domain does not match the organisation - hover or long-press to read it.',
      'A request for a password, OTP, UPI PIN, card CVV or a "small verification payment".',
      'Unexpected attachments, shortened links, or a display name hiding the real address.',
      'Generic greetings and small errors in language, logo or sender address.',
    ],
    actions: [
      'Do not click, reply or call the number in the message.',
      'Open the official app or type the official website yourself, then check the claim there.',
      'Never share OTPs or passwords - no bank, school or company will ask for them.',
      'Report the message in your mail/WhatsApp app and forward suspicious email to report@cybersafe.gov.in (India).',
      'If you already entered details, change that password from a clean device, enable MFA and contact the provider.',
    ],
    example:
      'A "KYC expiring" SMS opens a lookalike page asking for your net-banking password and OTP. The real bank app shows no such notice - that mismatch is the tell.',
    advanced:
      'Email authentication (SPF, DKIM, DMARC) lets a receiving server check whether a message was authorised by the domain it claims. Display names are free text, so they prove nothing, and AI-written phishing removes grammar tells - which is why out-of-band verification matters more than wording.',
    takeaways: [
      'Verify through the official app, never through the link.',
      'Genuine support never asks for OTPs or passwords.',
      'Report near misses - it protects other people too.',
    ],
    followUps: [
      'How do I check a link without clicking it?',
      'What should I do if I already entered my OTP?',
      'How do I report a phishing SMS in India?',
    ],
  },
  {
    id: 'malware',
    title: 'Malware, ransomware and spyware',
    topic: 'malware-ransomware',
    practice: { page: 'threats', label: 'Malware threat guide' },
    keywords: ['malware', 'ransomware', 'virus', 'trojan', 'worm', 'spyware', 'keylogger', 'infected', 'encrypted files', 'ransom', 'computer slow', 'popup virus', 'remove virus', 'cracked software', 'spy'],
    summary:
      'Malware is software that does something harmful: steal data, spy on you, show ads, lock files or give an attacker control. Ransomware encrypts your files and demands payment; spyware watches activity and quietly sends data out.',
    signs: [
      'Files renamed with odd extensions, or a ransom note on the desktop.',
      'Sudden slowdown, battery drain, pop-ups, unknown apps or a changed browser search engine.',
      'Apps installed outside an official store, or an "admin" app you never added.',
      'Security software disabled without your action.',
    ],
    actions: [
      'Disconnect from the network and unplug backup drives so encryption cannot spread.',
      'Do not pay - payment funds crime and does not guarantee recovery.',
      'Restore from a verified offline backup (keep 3 copies, on 2 media, 1 off-site).',
      'Update the OS, browser and apps, run the built-in security scan, remove unknown apps.',
      'Report to cybercrime.gov.in / CERT-In and your institution\'s IT helpdesk.',
    ],
    example:
      'A "free PDF converter" from a search ad installs a dropper that pulls ransomware. Use only official stores or the vendor\'s own site for utilities.',
    advanced:
      'Most ransomware arrives through phishing attachments, exposed RDP or unpatched VPN appliances. Modern variants steal data first ("double extortion"), so backups alone are not enough - segmentation and least privilege limit the blast radius.',
    takeaways: [
      'Offline backups are the only reliable ransomware recovery.',
      'Never pay; report instead.',
      'Install only from official sources.',
    ],
    followUps: [
      'How do I set up a safe offline backup?',
      'How can I tell whether my phone has spyware?',
      'What should I do first if ransomware locks my laptop?',
    ],
  },
  {
    id: 'spyware',
    title: 'Spyware and stalkerware',
    topic: 'malware-ransomware',
    practice: { page: 'toolkit', label: 'Device safety checklist' },
    keywords: ['spyware', 'stalkerware', 'someone watching my phone', 'phone monitored', 'hidden app', 'screen recording', 'track my phone'],
    summary:
      'Spyware records what you type, your location, calls or screen and sends it to someone else. On phones it often arrives as a sideloaded app or a "family safety" tool installed with physical access.',
    signs: [
      'Battery and mobile-data use jump without a new habit.',
      'Unknown apps with device-admin or accessibility access.',
      'The device runs hot or restarts unexpectedly.',
      'Someone knows things you only typed on the device.',
    ],
    actions: [
      'Open settings and review device-admin, accessibility and "install unknown apps" permissions.',
      'Remove apps you do not recognise, then run the built-in security scan.',
      'Change passwords from a different, trusted device and enable MFA.',
      'Check active sessions in email, Google/Apple and social accounts.',
      'If the device may be compromised, back up personal files and factory reset; contact police if someone is stalking you.',
    ],
    example:
      'A "free phone cleaner" asks for accessibility access, then reads notifications - including OTPs. Accessibility access should only go to apps you deliberately trust.',
    takeaways: [
      'Accessibility and device-admin access are the highest-risk permissions.',
      'Change passwords from a clean device.',
      'Factory reset removes most consumer spyware.',
    ],
    followUps: [
      'Which Android permissions should I audit first?',
      'How do I check active sessions in my Google account?',
      'How do I reset my phone safely without losing photos?',
    ],
  },
  {
    id: 'passwords',
    title: 'Password security and authentication',
    topic: 'password-security',
    practice: { page: 'password', label: 'Password Checker' },
    keywords: ['password', 'passphrase', 'mfa', '2fa', 'two-factor', 'authenticator', 'passkey', 'password manager', 'login security', 'strong password', 'account security', 'secure my account', 'instagram', 'facebook', 'gmail account', 'credential stuffing', 'breached password', 'login'],
    summary:
      'Account security rests on three habits: unique passwords, a second factor, and fast recovery when something goes wrong. Length beats complexity, and a password manager removes the need to memorise or reuse anything.',
    actions: [
      'Use a password manager and let it generate 16+ character random passwords; never reuse one across sites.',
      'Turn on MFA - an authenticator app or a passkey is safer than SMS.',
      'Check haveibeenpwned.com for your email and change any exposed password.',
      'Never share an OTP; enable login alerts and review active sessions monthly.',
      'Protect the manager with a long passphrase and keep an offline recovery kit.',
    ],
    example:
      'One leaked password from a shopping site is retried on email and Instagram ("credential stuffing"). Unique passwords stop that chain at the first step.',
    advanced:
      'Sites should store passwords with a slow salted hash such as Argon2id or bcrypt. Passkeys (FIDO2/WebAuthn) bind a key pair to the site origin, which makes them phishing-resistant in a way OTPs are not.',
    takeaways: [
      'Unique passwords + MFA stop most account takeovers.',
      'Length matters more than symbols.',
      'Never share an OTP, even with "support".',
    ],
    followUps: [
      'Which password manager should a student use?',
      'Is SMS OTP good enough for my bank account?',
      'What should I do if my password appears in a breach?',
    ],
  },
  {
    id: 'network',
    title: 'Network and Wi-Fi security',
    topic: 'network-security',
    practice: { page: 'resources', label: 'Network security resources' },
    keywords: ['wifi', 'wi-fi', 'router', 'public wifi', 'network security', 'hotspot', 'vpn', 'dns', 'firewall', 'home network', 'internet security', 'tethering'],
    summary:
      'Network security is mostly about the router at home and the networks you join. Treat public Wi-Fi as monitored, and make your home network hard to join and easy to update.',
    actions: [
      'Change the router admin password, use WPA2/WPA3, and update its firmware.',
      'Disable WPS and remote administration; rename the network so it does not identify you.',
      'On public Wi-Fi avoid banking/UPI, prefer mobile data for sensitive logins, and "forget" the network afterwards.',
      'Check for HTTPS and the correct domain before typing anything; a captive portal asking for your email password is a red flag.',
      'Use a reputable VPN only if you trust the provider - VPNs do not make you anonymous.',
    ],
    example:
      '"Free Airport WiFi" with a fake login page harvests email passwords. Tethering to your phone avoids the risk entirely.',
    advanced:
      'An evil-twin access point copies an SSID and captures traffic or serves a fake portal; ARP spoofing lets a local attacker intercept unencrypted traffic. TLS with certificate validation is the real protection, not the Wi-Fi password.',
    takeaways: [
      'Assume public Wi-Fi is monitored.',
      'WPA3 + firmware updates protect your home network.',
      'TLS protects traffic, not the network itself.',
    ],
    followUps: [
      'How do I change my router password safely?',
      'Is a free VPN safe to use?',
      'How can I tell if a Wi-Fi network is fake?',
    ],
  },
  {
    id: 'privacy',
    title: 'Data privacy and protection',
    topic: 'data-privacy',
    practice: { page: 'resources', label: 'Data privacy resources' },
    keywords: ['privacy', 'data protection', 'personal data', 'permissions', 'trackers', 'cookies', 'dpdp', 'gdpr', 'share data', 'metadata', 'data leak', 'data breach'],
    summary:
      'Privacy is controlling what you share, who can see it, and how long it stays online. Most harm comes from small pieces of personal data being combined, not from one dramatic leak.',
    actions: [
      'Review app permissions: a torch app does not need contacts, SMS or location.',
      'Lock social profiles, remove phone/address/birthdate from public bios, and limit tagging.',
      'Use separate emails for banking, social and shopping; use aliases for signups.',
      'Turn on device encryption and a screen lock, and back up important data.',
      'Under India\'s DPDP Act 2023 you can ask a company to correct or erase your data - use its privacy request channel.',
    ],
    example:
      'A public "birthday + pet name" post supplies answers to common security questions. Keep those details private.',
    advanced:
      'Photos carry metadata (GPS, device), and data brokers combine public records with app data. Minimisation plus periodic deletion requests reduce the aggregation risk that enables identity theft.',
    takeaways: [
      'Share the minimum, and lock down profiles.',
      'Audit app permissions regularly.',
      'You can request deletion of your data in India.',
    ],
    followUps: [
      'How do I remove my phone number from social media?',
      'Which app permissions are actually dangerous?',
      'How do I request data deletion under the DPDP Act?',
    ],
  },
  {
    id: 'browsing',
    title: 'Safe browsing and online payments',
    topic: 'safe-browsing',
    practice: { page: 'toolkit', label: 'Browser safety checklist' },
    keywords: ['safe browsing', 'browser', 'https', 'fake website', 'online payment', 'upi', 'payment security', 'shopping online', 'card details', 'website safe', 'chrome', 'extension', 'download', 'padlock', 'qr code', 'collect request', 'refund scam'],
    summary:
      'Safe browsing means verifying where you are before typing anything, and keeping the browser and its extensions trustworthy. HTTPS protects the connection but says nothing about who owns the site.',
    actions: [
      'Read the domain right-to-left before the first slash: paypal.com.evil.example is not PayPal.',
      'Install software and extensions only from official stores and remove unused extensions.',
      'Keep the browser and OS updated and use the built-in safe-browsing warnings.',
      'Never paste card or UPI details into a page reached from an ad, SMS or DM.',
      'For payments use the merchant\'s official app, verify the payee name, and never approve a "collect request" to receive money.',
    ],
    example:
      'A sponsored search result for "IRCTC tatkal trick" opens a lookalike login page. Bookmark the real site instead of searching each time.',
    advanced:
      'Lookalike domains use homoglyphs (rn vs m), extra subdomains and new TLDs. Certificate Transparency logs and a password manager\'s domain binding help expose mismatches.',
    takeaways: [
      'The padlock is not a safety verdict.',
      'Check the domain before typing credentials.',
      'Receiving money never needs your PIN.',
    ],
    followUps: [
      'How can I tell a lookalike domain from the real one?',
      'Is it safe to save my card in a browser?',
      'What should I do if a UPI collect request appears?',
    ],
  },
  {
    id: 'financial',
    title: 'UPI, banking and payment fraud',
    topic: 'financial-fraud',
    practice: { page: 'toolkit', label: 'Fraud response toolkit' },
    keywords: ['upi fraud', 'payment fraud', 'bank fraud', 'money stolen', 'transaction fraud', 'financial fraud', 'otp scam', 'screen sharing', 'remote access', 'anydesk', 'olx', 'paytm', 'gpay', 'phonepe'],
    summary:
      'Payment frauds rely on you authorising the transfer: a collect request, a screen-share, a fake refund or a QR code. Your UPI PIN is only needed to send money, never to receive it.',
    actions: [
      'Never approve a collect request you did not create; receiving money needs no PIN.',
      'Never share your screen or install remote-access apps for "support" or a "refund".',
      'Verify the payee name in the app before paying, and ignore QR codes from strangers.',
      'If money is lost, call 1930 immediately and file at cybercrime.gov.in - the first hours matter most.',
      'Report the UPI ID/number in the app and to your bank; keep screenshots.',
    ],
    example:
      'An "OLX buyer" sends ₹5,000 as a request and asks you to enter your PIN to receive it. Approving it sends money out instead.',
    takeaways: [
      'Receiving money never requires a PIN.',
      'Call 1930 immediately after a fraudulent transfer.',
      'No genuine support asks to share your screen.',
    ],
    followUps: [
      'What details should I keep for a 1930 complaint?',
      'How can I check whether a UPI request is genuine?',
      'What does my bank do after I report fraud?',
    ],
  },
  {
    id: 'identity',
    title: 'Identity theft and account security',
    topic: 'identity-theft',
    practice: { page: 'resources', label: 'Identity theft resources' },
    keywords: ['identity theft', 'identity', 'impersonation', 'aadhaar', 'pan card', 'sim swap', 'credit report', 'cibil', 'loan fraud', 'stolen identity', 'kyc fraud', 'e-kyc'],
    summary:
      'Identity theft is someone using your personal details to open accounts, take loans or impersonate you. Early detection decides how much damage is done.',
    signs: [
      'Loan enquiries, new accounts or SIM activation you did not request.',
      'OTP messages for services you never signed up for.',
      'A credit report containing unknown entries.',
    ],
    actions: [
      'Freeze/lock your credit report with the bureaus and review it.',
      'Inform your bank, block the SIM with the operator, and change passwords from a clean device.',
      'File a complaint at cybercrime.gov.in and call 1930; keep the acknowledgement number.',
      'Never share an Aadhaar OTP or e-KYC link; use masked Aadhaar where possible.',
      'Watch for phishing that uses stolen details to look convincing.',
    ],
    example:
      'A fake "Aadhaar update" call asks for an OTP. That OTP authorises e-KYC for a loan in your name; no genuine office needs it.',
    advanced:
      'Synthetic identity fraud mixes real and fabricated data, so it may not appear in your own credit file immediately. Monitoring, KYC alerts and prompt police complaints are the practical controls.',
    takeaways: [
      'Review your credit report at least twice a year.',
      'Never share Aadhaar OTPs or e-KYC links.',
      'Report identity theft to police and 1930 quickly.',
    ],
    followUps: [
      'How do I freeze my credit report in India?',
      'What should I do if a SIM is issued in my name?',
      'Which documents do I need for an identity theft complaint?',
    ],
  },
  {
    id: 'emerging',
    title: 'AI scams, fake jobs and investment fraud',
    topic: 'emerging-threats',
    practice: { page: 'news', label: 'Latest threat news' },
    keywords: ['ai scam', 'deepfake', 'voice cloning', 'fake job', 'job offer', 'investment scam', 'crypto scam', 'work from home', 'internship fee', 'guaranteed returns', 'telegram investment', 'pig butchering'],
    summary:
      'Newer scams use AI voice cloning, deepfake video, QR codes and fake job or investment offers. The common defence is out-of-band verification: check through a channel you chose, not one the message gave you.',
    signs: [
      'A "family emergency" voice call asking for an urgent transfer.',
      'A job or internship that asks for a registration, training or security fee.',
      'Investment groups promising guaranteed returns or "task-based" earnings.',
      'A video call that looks slightly wrong (lip sync, lighting, frozen frames).',
    ],
    actions: [
      'Agree a family code word for emergency money requests and call back on a known number.',
      'Never pay to get a job, internship or government refund.',
      'Verify investment platforms against SEBI/RBI registries; guaranteed returns are a red flag.',
      'Check QR codes before paying - a QR only sends money, it never receives.',
      'Slow down: urgency and secrecy are the core of every social-engineering script.',
    ],
    example:
      'A cloned voice of a "son" asks for ₹20,000 for a hospital bill. Calling the son\'s own number resolves it in seconds.',
    advanced:
      'Deepfakes need only a few seconds of public audio or video. Because detection tools lag, procedural controls (code words, callbacks, dual approval for large transfers) are the reliable defence.',
    takeaways: [
      'Verify emergency requests on a known number.',
      'No genuine job charges a fee to join.',
      'Guaranteed returns are always a scam signal.',
    ],
    followUps: [
      'How do I spot a deepfake video call?',
      'How can I verify an investment platform in India?',
      'What should I do if I paid a fake recruiter?',
    ],
  },
  {
    id: 'clicked',
    title: 'You clicked a suspicious link - what now',
    topic: 'phishing-social',
    practice: { page: 'toolkit', label: 'Emergency response guide' },
    keywords: ['clicked', 'clicked link', 'after clicking', 'entered password', 'entered details', 'suspicious link', 'link opened', 'downloaded file'],
    summary:
      'If you clicked a suspicious link, the risk depends on what you entered or downloaded. Acting in the first minutes limits the damage.',
    actions: [
      'Close the page and do not enter more information or install anything it offered.',
      'If you typed a password, change it from a clean device and enable MFA.',
      'Review active sessions/devices in that account and sign out anything unknown.',
      'Check bank/UPI activity and turn on transaction alerts.',
      'Run a security scan and report the link; call 1930 if money moved.',
    ],
    example:
      'Clicking a "courier failed delivery" link alone is low risk; entering card details on the page is high risk and needs a card block.',
    takeaways: [
      'What you entered matters more than the click.',
      'Change exposed passwords from a clean device.',
      'Call 1930 immediately if money moved.',
    ],
    followUps: [
      'Do I need to factory reset my phone after a bad link?',
      'How do I check which devices are signed in to my account?',
      'How do I block my card if I entered its details?',
    ],
  },
  {
    id: 'account',
    title: 'Recovering a compromised account',
    topic: 'identity-theft',
    practice: { page: 'toolkit', label: 'Emergency response guide' },
    keywords: ['account hacked', 'hacked account', 'someone has my account', 'unauthorized login', 'account compromised', 'locked out', 'recovery', 'unknown login', 'someone logged in'],
    summary:
      'A compromised account needs containment first: regain access, remove the attacker\'s persistence, then warn contacts.',
    actions: [
      'Use the official recovery flow; if email is lost, contact the provider with proof of ownership.',
      'Change the password and sign out all sessions/devices.',
      'Update the recovery email, phone and 2FA method; remove unknown authenticators.',
      'Revoke third-party app access and check for forwarding rules or linked devices.',
      'Warn contacts about messages sent from your account and report to cybercrime.gov.in.',
    ],
    example:
      'An attacker keeps access through a recovery email or app password, so changing the password alone fails.',
    takeaways: [
      'Change recovery details, not just the password.',
      'Sign out all sessions and revoke app access.',
      'Warn contacts quickly to stop the next victim.',
    ],
    followUps: [
      'How do I check for email forwarding rules?',
      'What if the attacker changed my recovery email?',
      'How do I report an impersonation profile?',
    ],
  },
  {
    id: 'general',
    title: 'Core defensive checklist',
    topic: null,
    practice: { page: 'toolkit', label: 'Personal security checklist' },
    keywords: ['prevention', 'protect myself', 'stay safe', 'common threats', 'security tips', 'best practices', 'cybersecurity basics', 'safety', 'secure my devices', 'online safety', 'protect my data'],
    summary:
      'Most attacks succeed through people, not code. A small set of habits prevents the majority of student incidents.',
    actions: [
      'Patch everything automatically and restart when asked.',
      'Use unique passwords with MFA on email, banking and social accounts.',
      'Keep offline backups of important files.',
      'Verify unexpected requests through an official channel before acting.',
      'Report early: 1930 for money lost, cybercrime.gov.in for complaints, and your institution\'s IT desk.',
    ],
    example:
      'One reused password without MFA turns a leaked shopping site into a hijacked email account.',
    takeaways: [
      'Patch, unique passwords, MFA, backups, verify.',
      'Slow down when a message creates urgency.',
      'Report early - speed limits the damage.',
    ],
    followUps: [
      'What is the single most important habit to start with?',
      'How do I set up MFA on my college email?',
      'What should every student back up?',
    ],
  },
];

function scoreEntry(entry, text) {
  let score = 0;
  for (const keyword of entry.keywords) {
    if (keyword.includes(' ')) {
      if (text.includes(keyword)) score += 3;
    } else {
      const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (pattern.test(text)) score += 2;
    }
  }
  return score;
}

function matchEntry(message) {
  const text = String(message || '').toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const entry of FALLBACK_ENTRIES) {
    const score = scoreEntry(entry, text);
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  return best;
}

function measuredRow(topic, context) {
  if (!topic) return null;
  return [...(context.weakTopics || []), ...(context.strongTopics || [])].find(
    (row) => row.topic === topic
  ) || null;
}

function personalNote(entry, context) {
  if (!context?.hasHistory) return '';
  const row = measuredRow(entry.topic, context);
  const parts = [];
  if (row) {
    parts.push(
      `**Your learning data:** you answered ${row.accuracy}% of ${row.label} questions correctly ` +
        `(${row.correct}/${row.total}) in your saved quizzes.`
    );
  }
  const lesson = context.roadmap?.nextLesson;
  if (lesson && lesson.topic && lesson.topic === entry.topic) {
    parts.push(
      `**From your roadmap:** the next unfinished lesson is "${lesson.title}"` +
        (lesson.stage ? ` (${lesson.stage})` : '') +
        '.'
    );
  }
  return parts.join('\n\n');
}

function renderEntry(entry, { difficulty, context }) {
  const sections = [`**${entry.title}**\n${entry.summary}`];

  if (entry.signs?.length) {
    sections.push('**How to recognise it**\n' + entry.signs.map((sign) => `- ${sign}`).join('\n'));
  }
  if (entry.actions?.length) {
    sections.push(
      '**Defensive steps**\n' + entry.actions.map((action, index) => `${index + 1}. ${action}`).join('\n')
    );
  }
  if (entry.example) {
    sections.push(`**Practical example**\n${entry.example}`);
  }
  if (difficulty === 'advanced' && entry.advanced) {
    sections.push(`**Going deeper**\n${entry.advanced}`);
  }
  const note = personalNote(entry, context);
  if (note) sections.push(note);

  return sections.join('\n\n');
}

function cleanText(value, max) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max)
    : '';
}

function cleanList(value, maxItems, maxLen) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    const text = cleanText(item, maxLen);
    if (text) out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

const GENERIC_FOLLOW_UPS = [
  'How can I protect my accounts with MFA?',
  'How do I recognise a phishing message?',
  'What should I do if I clicked a suspicious link?',
];

function fallbackTopic(entry) {
  return entry?.topic && TOPICS.includes(entry.topic) ? entry.topic : 'general';
}

function practiceFor(entry, context) {
  const lesson = context?.roadmap?.nextLesson;
  if (lesson && lesson.topic && entry?.topic && lesson.topic === entry.topic) {
    return { page: lesson.resource, label: lesson.resourceLabel || PAGE_LABELS[lesson.resource] || 'Next lesson' };
  }
  return entry?.practice ? { ...entry.practice } : null;
}

/**
 * Deterministic, useful answer used when Gemini is unavailable, returns
 * invalid output, or the request was redirected by the safety guard.
 */
export function buildFallbackReply({ message, difficulty, context, unsafe = false, reason = null }) {
  const entry = matchEntry(message) || FALLBACK_ENTRIES[FALLBACK_ENTRIES.length - 1];

  if (unsafe) {
    const reply = [
      "I can't help with hacking, stealing credentials or bypassing security controls - that crosses CyberShield's safety line.",
      'What I can do is explain the defensive side, which is what protects you and your accounts:',
      renderEntry(entry, { difficulty, context }),
      'If you are dealing with an active incident (money lost, account taken over), call **1930** and use the Toolkit page\'s emergency guide.',
    ].join('\n\n');

    return {
      reply,
      keyTakeaways: [
        'I only cover defensive, legal security.',
        'Redirecting to protection instead of attack instructions.',
        ...entry.takeaways.slice(0, 2),
      ],
      followUps: entry.followUps.slice(0, 3),
      topic: fallbackTopic(entry),
      practice: practiceFor(entry, context),
      generatedBy: 'safety-guard',
      safety: 'redirected',
      notice: 'This request asked for attack instructions, so it was redirected to defensive guidance.',
    };
  }

  const reply = [
    renderEntry(entry, { difficulty, context }),
    reason
      ? `_${reason} This answer comes from CyberShield's curated, reviewed guides rather than a live AI explanation._`
      : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    reply,
    keyTakeaways: entry.takeaways.slice(0, 4),
    followUps: (entry.followUps || GENERIC_FOLLOW_UPS).slice(0, 3),
    topic: fallbackTopic(entry),
    practice: practiceFor(entry, context),
    generatedBy: 'curated',
    safety: 'ok',
    notice: reason || null,
  };
}

/* ------------------------------------------------------------------ */
/* 5. Gemini output validation                                         */
/* ------------------------------------------------------------------ */

/**
 * Validates the structured tutor answer. Returns null when the model output
 * is unusable, in which case the curated reply is served instead.
 */
export function normalizeTutorReply(data, { difficulty = 'beginner', context = null } = {}) {
  if (!data || typeof data !== 'object') return null;

  const reply = cleanText(data.answer, 7000);
  if (reply.length < 20) return null;

  const keyTakeaways = cleanList(data.keyTakeaways, 5, 240);
  if (!keyTakeaways.length) return null;

  let followUps = cleanList(data.followUps, 4, 160).filter((question) => question.length >= 8);
  if (followUps.length < 2) followUps = GENERIC_FOLLOW_UPS.slice(0, 3);
  followUps = followUps.slice(0, 3);

  const topic = TOPICS.includes(data.topic) ? data.topic : 'general';

  const page = typeof data.practicePage === 'string' ? data.practicePage.trim() : '';
  const practice = PAGE_LABELS[page]
    ? { page, label: cleanText(data.practiceLabel, 90) || PAGE_LABELS[page] }
    : null;

  return {
    reply,
    keyTakeaways,
    followUps,
    topic,
    practice,
    generatedBy: 'gemini',
    safety: 'ok',
    notice: null,
    difficulty,
    context,
  };
}

export const TUTOR_FALLBACK_TOPICS = FALLBACK_ENTRIES.map((entry) => entry.id);
