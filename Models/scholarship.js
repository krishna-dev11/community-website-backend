const mongoose = require("mongoose");

const scholarshipSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  eligibility: String,
  amount: Number,
  seats: {
    type: Number,
    min: 1,
  },
  approvedCount: {
    type: Number,
    default: 0,
  },
  applicationDeadline: {
    type: Date,
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ["DRAFT", "OPEN", "CLOSED", "ARCHIVED"],
    default: "DRAFT",
    index: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  publishedAt: Date,
  archivedAt: Date,
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  archiveReason: String,
}, { timestamps: true });

scholarshipSchema.index({ title: "text", description: "text", eligibility: "text" });
scholarshipSchema.index({ status: 1, applicationDeadline: 1 });

module.exports = mongoose.model("Scholarship", scholarshipSchema);
