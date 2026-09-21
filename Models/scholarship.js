const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema({
  name: String,
  instructions: String,
  url: String,
  publicId: String,
  fileName: String,
  mimeType: String,
  size: Number,
  uploadedAt: Date,
}, { _id: false });

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
  requiredDocument: {
    enabled: { type: Boolean, default: false },
    name: { type: String, trim: true },
    instructions: { type: String, trim: true },
    file: fileSchema,
  },
  requiredDocumentName: { type: String, trim: true },
  requiredDocumentDescription: { type: String, trim: true },
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
