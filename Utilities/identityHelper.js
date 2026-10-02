const crypto = require("node:crypto");
const User = require("../Models/user");

/**
 * Normalizes an identity string (e.g. Aadhaar number) by stripping all whitespace and non-alphanumeric characters
 * and converting to uppercase.
 */
function normalizeIdentity(identity) {
  if (!identity) return "";
  return String(identity).replace(/[\s\-_]/g, "").trim().toUpperCase();
}

/**
 * Computes a deterministic SHA-256 cryptographic hash of the normalized identity string.
 * Plaintext identity is never stored.
 */
function hashIdentity(identity) {
  const normalized = normalizeIdentity(identity);
  if (!normalized) return null;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Generates a unique, server-side permanent Member ID (e.g. SMJ-7A9B1C).
 */
function generateMemberId() {
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `SMJ-${rand}`;
}

/**
 * Ensures generated Member ID is unique in database.
 */
async function createUniqueMemberId() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const memberId = generateMemberId();
    const existing = await User.exists({ memberId });
    if (!existing) return memberId;
  }
  return `SMJ-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Checks whether an identity hash already exists in the system.
 */
async function checkDuplicateIdentity(identity, excludeUserId = null) {
  const identityHash = hashIdentity(identity);
  if (!identityHash) return false;

  const query = { identityHash };
  if (excludeUserId) {
    query._id = { $ne: excludeUserId };
  }

  const existing = await User.findOne(query).select("_id");
  return Boolean(existing);
}

module.exports = {
  normalizeIdentity,
  hashIdentity,
  generateMemberId,
  createUniqueMemberId,
  checkDuplicateIdentity,
};
