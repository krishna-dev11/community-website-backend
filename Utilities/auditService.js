/**
 * Audit service — DISABLED.
 * Audit Logs feature has been removed from the application.
 * logAudit is a no-op to avoid breaking existing call sites during migration.
 * Callers can be cleaned up incrementally.
 */
async function logAudit() {
  // No-op: audit logging is disabled
  return null;
}

module.exports = {
  logAudit,
};
