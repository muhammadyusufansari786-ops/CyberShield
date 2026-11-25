import 'dotenv/config';
import { connectDatabase, closeDatabase } from '../../server/config/database.js';
import { Question } from '../../server/models/index.js';
import { findDuplicateText } from '../../server/services/question-bank.js';

const TEXT =
  'Audit pending question: which practice best protects an account from credential stuffing?';

await connectDatabase();
const rows = await Question.find({
  $or: [
    { normalizedText: /credential stuffing/ },
    { text: /credential stuffing/i },
  ],
})
  .select({ questionId: 1, text: 1, status: 1, topic: 1 })
  .limit(5)
  .lean();
console.log('matching questions:', rows.length);
rows.forEach((r) => console.log(' -', r.questionId, '|', r.status, '|', r.text.slice(0, 110)));

const dup = await findDuplicateText(TEXT, { topic: 'password-security' });
console.log(
  'duplicate result:',
  dup ? `${dup.type} -> ${dup.question.questionId} | ${dup.question.text.slice(0, 90)}` : 'none'
);

await closeDatabase();
