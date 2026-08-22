const mongoose = require("mongoose");

const communityReportSchema = new mongoose.Schema({
  targetType: {
    type: String,
    enum: ["POST", "COMMENT"],
    required: true,
    index: true,
  },
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CommunityPost",
    required: true,
    index: true,
  },
  comment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CommunityComment",
    index: true,
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
    index: true,
  },
  reason: {
    type: String,
    required: true,
    trim: true,
  },
  details: String,
  status: {
    type: String,
    enum: ["OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED"],
    default: "OPEN",
    index: true,
  },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  reviewedAt: Date,
  resolution: String,
}, { timestamps: true });

communityReportSchema.index(
  { targetType: 1, post: 1, comment: 1, reportedBy: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["OPEN", "UNDER_REVIEW"] } },
  }
);

module.exports = mongoose.model("CommunityReport", communityReportSchema);
