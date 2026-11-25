/**
 * CyberShield - AI-assisted question generation (Gemini)
 *
 * Flow: admin asks for a batch -> Gemini drafts questions -> EVERY draft is
 * structurally validated and duplicate-checked -> valid drafts are stored with
 * status:"pending". Nothing generated here is ever served to a student until
 * an administrator approves it (see routes/admin.js).
 *
 * Failure handling:
 *  - Gemini 429/503/timeout is retried by the existing gemini service; if it
 *    still fails, the batch stops, earlier accepted questions are kept, and a
 *    clear error is returned. Normal quizzes never depend on Gemini.
 *  - A batch id is generated once per request, so a timeout/retry cannot
 *    create the same batch twice (questionId uniqueness backs this up).
 */

import crypto from 'node:crypto';
import { Question } from '../models/quizBank.js';
import { generateQuizQuestions } from './gemini.js';
import { insertQuestion, normalizeText, textSimilarity, TOPIC_LABEL_SET } from './question-bank.js';
import { TOPICS, DIFFICULTIES } from './adaptive.js';

const CHUNK_SIZE = 10; // per Gemini request - keeps each call well inside timeouts
const MAX_PER_REQUEST = 20;

function batchSuffix() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${stamp}-${crypto.randomBytes(3).toString('hex')}`;
}

export async function generateQuestionBatch({ topic, difficulty, count, adminEmail }) {
  if (!TOPICS.includes(topic)) {
    const error = new Error('Choose a valid topic for generation.');
    error.status = 400;
    throw error;
  }
  const level = DIFFICULTIES.includes(difficulty) ? difficulty : 'medium';
  const requested = Math.min(Math.max(Number(count) || 10, 1), MAX_PER_REQUEST);

  const batchId = `ai-${batchSuffix()}`;
  const accepted = [];
  const rejected = [];
  let geminiError = null;

  // Existing texts from this topic keep the model away from duplicates; every
  // draft is still checked locally afterwards.
  const existing = await Question.find({ status: { $in: ['approved', 'pending'] }, topic })
    .select({ text: 1, normalizedText: 1 })
    .limit(500)
    .lean();
  const existingTexts = existing.map((doc) => doc.text);
  const seenNormalized = new Set(existing.map((doc) => doc.normalizedText || normalizeText(doc.text)));
  const seenRaw = existing.map((doc) => doc.text);

  let produced = 0;
  for (let offset = 0; offset < requested; offset += CHUNK_SIZE) {
    const chunk = Math.min(CHUNK_SIZE, requested - offset);
    let drafts;
    try {
      drafts = await generateQuizQuestions({
        topicLabel: TOPIC_LABEL_SET[topic] || topic,
        difficulty: level,
        count: chunk,
        existingTexts: existingTexts.slice(-60),
      });
    } catch (err) {
      geminiError = err?.message || 'Gemini request failed';
      break;
    }

    if (!Array.isArray(drafts) || !drafts.length) {
      geminiError = 'Gemini returned no usable questions';
      break;
    }

    for (const draft of drafts) {
      if (produced >= requested) break;
      produced++;

      const questionId = `ai-${batchId.slice(3)}-${produced}`;
      const normalized = normalizeText(draft?.text);

      // Batch-internal duplicate checks first (cheap, no DB round trip).
      if (!normalized || seenNormalized.has(normalized)) {
        rejected.push({ index: produced, errors: ['Duplicate or empty question text.'] });
        continue;
      }
      if (seenRaw.some((text) => textSimilarity(text, draft?.text) >= 0.82)) {
        rejected.push({ index: produced, errors: ['Near-duplicate of an existing question.'] });
        continue;
      }

      const result = await insertQuestion(
        { ...draft, topic, difficulty: level, questionId },
        { source: 'ai', status: 'pending', batchId, createdBy: `gemini:${adminEmail || 'admin'}` }
      );

      if (result.ok) {
        accepted.push({
          questionId,
          text: result.question.text,
          difficulty: result.question.difficulty,
          subtopic: result.question.subtopic,
        });
        seenNormalized.add(normalized);
        seenRaw.push(result.question.text);
        existingTexts.push(result.question.text);
      } else {
        rejected.push({ index: produced, errors: result.errors, duplicateOf: result.duplicateOf || null });
      }
    }

    if (produced >= requested) break;
  }

  return {
    batchId,
    topic,
    difficulty: level,
    requested,
    accepted: accepted.length,
    questions: accepted,
    rejected,
    geminiError,
  };
}
