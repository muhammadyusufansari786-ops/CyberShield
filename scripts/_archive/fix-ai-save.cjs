"use strict";
const fs = require("fs");
const s = fs.readFileSync("server/routes/ai.js", "utf8");
// We query with .lean() so doc has no save() method. The fix: don't use .lean()
// on the doc we intend to save. Re-query WITHOUT lean for the save path.
const bad = `let doc = await TutorConversation.findOne({ userId }).sort({ lastMessageAt: -1, createdAt: -1 }).lean();\n    if (!doc) {\n      doc = await TutorConversation.create({ userId });\n    }\n    doc.difficulty = difficulty;\n    if (!doc.title || doc.title === 'New conversation') {\n      doc.title = clean.slice(0, 80) || 'New conversation';\n    }\n\n    const userMessage = {\n      role: 'user', text: clean, difficulty, safety: 'ok',\n      topic: result.topic, keyTakeaways: [], followUps: [],\n    };\n    doc.messages.push(userMessage);\n\n    const modelMessage = {\n      role: 'model', text: result.reply.slice(0, 8000), difficulty,\n      generatedBy: result.generatedBy, safety: result.safety,\n      topic: result.topic,\n      keyTakeaways: result.keyTakeaways.slice(0, 5),\n      followUps: result.followUps.slice(0, 3),\n    };\n    doc.messages.push(modelMessage);\n\n    if (doc.messages.length > MAX_STORED_MESSAGES + 2) {\n      doc.messages = doc.messages.slice(-MAX_STORED_MESSAGES);\n    }\n    doc.lastMessageAt = new Date();\n    await doc.save();\n\n    const saved = await TutorConversation.findById(doc._id).lean();`;

if (!s.includes(bad)) {
  console.log("exact bad block not found - searching for doc.save context");
  const idx = s.indexOf("await doc.save();");
  console.log("doc.save() at index:", idx);
  console.log("context:", s.slice(idx - 200, idx + 30));
  process.exit(1);
}

const good = `let doc = await TutorConversation.findOne({ userId }).sort({ lastMessageAt: -1, createdAt: -1 });\n    if (!doc) {\n      doc = await TutorConversation.create({ userId });\n    }\n    doc.difficulty = difficulty;\n    if (!doc.title || doc.title === 'New conversation') {\n      doc.title = clean.slice(0, 80) || 'New conversation';\n    }\n\n    const userMessage = {\n      role: 'user', text: clean, difficulty, safety: 'ok',\n      topic: result.topic, keyTakeaways: [], followUps: [],\n    };\n    doc.messages.push(userMessage);\n\n    const modelMessage = {\n      role: 'model', text: result.reply.slice(0, 8000), difficulty,\n      generatedBy: result.generatedBy, safety: result.safety,\n      topic: result.topic,\n      keyTakeaways: result.keyTakeaways.slice(0, 5),\n      followUps: result.followUps.slice(0, 3),\n    };\n    doc.messages.push(modelMessage);\n\n    if (doc.messages.length > MAX_STORED_MESSAGES + 2) {\n      doc.messages = doc.messages.slice(-MAX_STORED_MESSAGES);\n    }\n    doc.lastMessageAt = new Date();\n    await doc.save();\n\n    const saved = await TutorConversation.findById(doc._id).lean();`;

const t = s.split(bad).join(good);
fs.writeFileSync("server/routes/ai.js", t);
console.log("fixed save path; new length:", t.length);
console.log("verify: lean() on save path removed:", !t.includes("let doc = await TutorConversation.findOne({ userId }).sort({ lastMessageAt: -1, createdAt: -1 }).lean();"));
console.log("verify: non-lean findOne on save path present:", t.includes("let doc = await TutorConversation.findOne({ userId }).sort({ lastMessageAt: -1, createdAt: -1 });"));
try {
  require("child_process").execSync("node --check server/routes/ai.js", { stdio: "pipe" });
  console.log("node --check OK");
} catch (e) {
  console.log("check FAIL:", e.stderr?.toString()?.slice(0, 200));
}
