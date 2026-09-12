import crypto from 'node:crypto';

/**
 * Generate a single-use token. Returns the RAW token (to be emailed to the
 * user) and its SHA-256 hash (the only thing persisted in the DB), so a DB
 * leak cannot be replayed.
 */
export const generateToken = () => {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = hashToken(raw);
  return { raw, hash };
};

export const hashToken = (raw) =>
  crypto.createHash('sha256').update(String(raw)).digest('hex');
