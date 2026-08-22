const mongoose = require("mongoose");

const assetSchema = new mongoose.Schema({
  url: String,
  publicId: String,
  size: Number,
  mimeType: String,
  name: String,
}, { _id: false });

const publicationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: String,
  month: {
    type: Number,
    min: 1,
    max: 12,
    index: true,
  },
  year: {
    type: Number,
    index: true,
  },
  edition: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ["DRAFT", "PUBLISHED", "UPDATED", "ARCHIVED"],
    default: "DRAFT",
    index: true,
  },
  file: assetSchema,
  coverImage: assetSchema,
  version: {
    type: Number,
    default: 1,
  },
  versionHistory: [{
    file: assetSchema,
    coverImage: assetSchema,
    version: Number,
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
  }],
  downloadCount: {
    type: Number,
    default: 0,
  },
  publishedAt: Date,
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

publicationSchema.index({ title: "text", description: "text", edition: "text" });
publicationSchema.index({ status: 1, year: -1, month: -1, publishedAt: -1 });

module.exports = mongoose.model("Publication", publicationSchema);
