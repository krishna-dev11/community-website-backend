const mongoose = require("mongoose");

const issueResponseSchema = new mongoose.Schema({
  issue: { type: mongoose.Schema.Types.ObjectId, ref: "Issue", required: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  type: {
    type: String,
    enum: ["COMMITTEE_UPDATE", "PROPOSED_SOLUTION", "MEMBER_FEEDBACK", "STATUS_NOTE"],
    default: "STATUS_NOTE",
  },
  message: { type: String, required: true, trim: true },
  previousStatus: String,
  nextStatus: String,
}, { timestamps: true });

issueResponseSchema.index({ issue: 1, createdAt: 1 });

module.exports = mongoose.model("IssueResponse", issueResponseSchema);
