const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema({
  url: String,
  publicId: String,
  size: Number,
  mimeType: String,
  name: String,
}, { _id: false });

const jobApplicationSchema = new mongoose.Schema({
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Job",
    required: true,
    index: true,
  },
  applicant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
    index: true,
  },
  coverLetter: String,
  resume: fileSchema,
  applicantSnapshot: {
    fullName: String,
    email: String,
    phone: String,
    currentCity: String,
    education: String,
    profession: String,
    skills: [String],
    experience: String,
    expectedSalary: String,
    portfolioUrl: String,
    linkedInUrl: String,
    githubUrl: String,
  },
  status: {
    type: String,
    enum: ["APPLIED", "SHORTLISTED", "INTERVIEW", "SELECTED", "REJECTED", "WITHDRAWN"],
    default: "APPLIED",
    index: true,
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  reviewedAt: Date,
  reviewMessage: String,
}, { timestamps: true });

jobApplicationSchema.index({ job: 1, applicant: 1 }, { unique: true });
jobApplicationSchema.index({ applicant: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("JobApplication", jobApplicationSchema);
