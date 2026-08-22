const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    index: true,
  },
  action: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  targetType: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  target: {
    type: mongoose.Schema.Types.ObjectId,
    index: true,
  },
  oldValue: mongoose.Schema.Types.Mixed,
  newValue: mongoose.Schema.Types.Mixed,
  reason: String,
  metadata: mongoose.Schema.Types.Mixed,
  requestId: String,
  ip: String,
  userAgent: String,
}, { timestamps: true });

auditLogSchema.index({ targetType: 1, target: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
