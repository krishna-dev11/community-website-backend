const mongoose = require("mongoose");

const coverSchema = new mongoose.Schema({
  url: String,
  publicId: String,
  size: Number,
  mimeType: String,
}, { _id: false });

const galleryAlbumSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: String,
  eventDate: Date,
  coverImage: coverSchema,
  status: {
    type: String,
    enum: ["DRAFT", "PUBLISHED", "ARCHIVED"],
    default: "DRAFT",
    index: true,
  },
  displayOrder: {
    type: Number,
    default: 0,
  },
  photoCount: {
    type: Number,
    default: 0,
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
  archivedAt: Date,
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  archiveReason: String,
}, { timestamps: true });

galleryAlbumSchema.index({ title: "text", description: "text" });
galleryAlbumSchema.index({ status: 1, eventDate: -1, displayOrder: 1 });

module.exports = mongoose.model("GalleryAlbum", galleryAlbumSchema);
