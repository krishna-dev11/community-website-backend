const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  companyName: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  location: {
    type: String,
    trim: true,
    index: true,
  },
  employmentType: {
    type: String,
    enum: ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "REMOTE", "OTHER"],
    default: "FULL_TIME",
  },
  salaryRange: String,
  experienceRequired: String,
  skills: [String],
  contactEmail: String,
  contactPhone: String,
  status: {
    type: String,
    enum: ["PENDING_MODERATION", "PUBLISHED", "REJECTED", "EXPIRED", "ARCHIVED"],
    default: "PENDING_MODERATION",
    index: true,
  },
  expiresAt: {
    type: Date,
    index: true,
  },
  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
    index: true,
  },
  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  moderatedAt: Date,
  moderationReason: String,
  publishedAt: Date,
  archivedAt: Date,
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  archiveReason: String,
}, { timestamps: true });

jobSchema.index({ title: "text", companyName: "text", description: "text", location: "text", skills: "text" });
jobSchema.index({ status: 1, expiresAt: 1, publishedAt: -1 });

module.exports = mongoose.model("Job", jobSchema);
