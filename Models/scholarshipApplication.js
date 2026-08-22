const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema({
  url: String,
  publicId: String,
  size: Number,
  mimeType: String,
  name: String,
}, { _id: false });

const scholarshipApplicationSchema = new mongoose.Schema({
  scholarship: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Scholarship",
    required: true,
    index: true,
  },
  applicant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
    index: true,
  },
  applicantName: String,
  educationDetails: String,
  incomeDetails: String,
  statement: String,
  documents: [fileSchema],
  status: {
    type: String,
    enum: ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "APPROVED", "REJECTED", "REOPENED"],
    default: "SUBMITTED",
    index: true,
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  reviewedAt: Date,
  reviewReason: String,
}, { timestamps: true });

scholarshipApplicationSchema.index({ scholarship: 1, applicant: 1 }, { unique: true });
scholarshipApplicationSchema.index({ applicant: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("ScholarshipApplication", scholarshipApplicationSchema);
