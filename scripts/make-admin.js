/**
 * One-time promotion helper (server-side, no public endpoint).
 *
 *   node scripts/make-admin.js someone@example.com
 *
 * There is no admin registration route and no hardcoded admin password: this
 * script simply flips the existing account's role in MongoDB. Run it yourself
 * after the account exists (register normally through the site first).
 */

import 'dotenv/config';
import { connectDatabase, closeDatabase } from '../server/config/database.js';
import { User } from '../server/models/index.js';

const email = String(process.argv[2] || '').trim().toLowerCase();

if (!email) {
  console.error('Usage: node scripts/make-admin.js <email>');
  process.exit(1);
}

try {
  await connectDatabase();
  const user = await User.findOneAndUpdate({ email }, { $set: { role: 'admin' } }, { new: true });
  if (!user) {
    console.error(`No account found for ${email}. Register it normally first.`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${user.email} is now an administrator.`);
  }
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await closeDatabase().catch(() => {});
}
