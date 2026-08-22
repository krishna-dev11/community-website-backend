const AuditLog = require("../Models/auditLog");

async function logAudit({
  actor,
  action,
  targetType,
  target,
  oldValue,
  newValue,
  reason,
  metadata,
  req,
}) {
  return AuditLog.create({
    actor,
    action,
    targetType,
    target,
    oldValue,
    newValue,
    reason,
    metadata,
    requestId: req?.id,
    ip: req?.ip,
    userAgent: req?.header?.("user-agent"),
  });
}

module.exports = {
  logAudit,
};
