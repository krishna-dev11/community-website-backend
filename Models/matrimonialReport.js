const mongoose = require("mongoose");

const matrimonialReportSchema = new mongoose.Schema({
  profile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MatrimonialProfile",
    required: true,
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
  },
  details: String,
  status: {
    type: String,
    enum: ["OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED"],
    default: "OPEN",
    index: true,
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  reviewedAt: Date,
  resolution: String,
}, { timestamps: true });

matrimonialReportSchema.index({ profile: 1, reportedBy: 1, status: 1 });

module.exports = mongoose.model("MatrimonialReport", matrimonialReportSchema);
