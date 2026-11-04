/**
 * CyberShield - MongoDB Atlas connection (single shared connection)
 *
 * - Reads MONGODB_URI from process.env (never hardcoded credentials).
 * - Uses the project's existing Mongoose dependency.
 * - One module-level promise so repeated imports never create multiple
 *   connections ("Avoid creating multiple database connections").
 * - Logs success WITHOUT revealing the connection string.
 * - Clear, credential-free errors on failure.
 */

import mongoose from 'mongoose';

const DEFAULT_DB_NAME = 'cybershield';
const SERVER_SELECTION_TIMEOUT_MS = 20_000; // 20s for Atlas cold start / DNS

// NOTE: dbName below overrides any db name in the URI - CyberShield always
// uses the "cybershield" database on the Atlas cluster, per project spec.

let connectionPromise = null;

/** Human-readable failure summary with no credentials. */
function describeConnectError(err) {
  const code = err?.code || err?.cause?.code;
  if (err?.name === 'MongooseServerSelectionError' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') {
    return 'Could not reach the MongoDB Atlas cluster. Check your internet connection, the Atlas cluster status, and that your IP is allowed in Atlas Network Access.';
  }
  if (code === 8000 || code === 18 || /authentication/i.test(err?.message || '')) {
    return 'MongoDB Atlas rejected the database credentials. Check the database username/password in the connection URI.';
  }
  if (/malformed|uri/i.test(err?.message || '')) {
    return 'The MONGODB_URI looks malformed. Expected an Atlas URI like mongodb+srv://<user>:<password>@<cluster>...(no angle brackets, URL-encode special characters in the password).';
  }
  return err?.message || 'Unknown MongoDB connection error.';
}

/**
 * Connect to Atlas exactly once. Returns a promise that resolves when the
 * connection is ready (or rejects with a friendly, credential-free Error).
 */
export function connectDatabase() {
  if (connectionPromise) return connectionPromise;

  const uri = process.env.MONGODB_URI?.trim();

  if (!uri) {
    const err = new Error(
      'MONGODB_URI is missing from the environment. Add it to .env as:\n' +
        '  MONGODB_URI=mongodb+srv://<dbUser>:<dbPassword>@Yusuf-projects.xxxxx.mongodb.net/?retryWrites=true&w=majority\n' +
        '(The "cybershield" database name is applied automatically.)'
    );
    err.code = 'CONFIG_MISSING';
    throw err;
  }

  connectionPromise = mongoose
    .connect(uri, {
      dbName: DEFAULT_DB_NAME,
      serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
      autoIndex: true,
    })
    .then(() => {
      console.log(`[db] ✅ Connected to MongoDB Atlas (db: ${mongoose.connection.name})`);
      return mongoose.connection;
    })
    .catch((err) => {
      connectionPromise = null; // allow a clean retry on next start
      const wrapped = new Error(`[db] MongoDB connection failed: ${describeConnectError(err)}`);
      wrapped.cause = err;
      throw wrapped;
    });

  return connectionPromise;
}

/** Attach runtime event handlers for disconnect / reconnect / errors. */
export function watchDatabase() {
  const conn = mongoose.connection;

  conn.on('disconnected', () => console.warn('[db] ⚠️ MongoDB disconnected - attempting automatic reconnect.'));
  conn.on('reconnected', () => console.log('[db] ✅ MongoDB reconnected.'));
  conn.on('error', (err) => console.error('[db] MongoDB error:', describeConnectError(err)));
}

/** Used by the graceful-shutdown path in server.js. */
export async function closeDatabase() {
  await mongoose.connection.close();
  console.log('[db] MongoDB connection closed.');
}
