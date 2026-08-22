const mongoose = require("mongoose");

const issueSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  category: { type: String, trim: true, index: true },
  location: { type: String, trim: true },
  priority: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "URGENT"], default: "MEDIUM", index: true },
  status: {
    type: String,
    enum: [
      "SUBMITTED",
      "UNDER_REVIEW",
      "APPROVED",
      "PUBLISHED",
      "IN_PROGRESS",
      "SOLUTION_PROPOSED",
      "AWAITING_MEMBER_CONFIRMATION",
      "RESOLVED",
      "REOPENED",
      "REJECTED",
      "ARCHIVED",
    ],
    default: "SUBMITTED",
    index: true,
  },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  moderationReason: String,
  reopenCount: { type: Number, default: 0 },
  isArchived: { type: Boolean, default: false, index: true },
  archivedAt: Date,
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  archiveReason: String,
}, { timestamps: true });

issueSchema.index({ title: "text", description: "text", category: "text", location: "text" });
issueSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Issue", issueSchema);
