const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema({
  url: String,
  publicId: String,
  size: Number,
  mimeType: String,
  name: String,
}, { _id: false });

const noticeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
  category: {
    type: String,
    trim: true,
    default: "GENERAL",
    index: true,
  },
  status: {
    type: String,
    enum: ["DRAFT", "PUBLISHED", "EXPIRED", "ARCHIVED"],
    default: "DRAFT",
    index: true,
  },
  attachments: [fileSchema],
  publishedAt: Date,
  expiresAt: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  archivedAt: Date,
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  archiveReason: String,
}, { timestamps: true });

noticeSchema.index({ title: "text", description: "text", category: "text" });
noticeSchema.index({ status: 1, publishedAt: -1, expiresAt: 1 });

module.exports = mongoose.model("Notice", noticeSchema);
