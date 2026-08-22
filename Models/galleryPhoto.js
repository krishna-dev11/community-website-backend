const mongoose = require("mongoose");

const galleryPhotoSchema = new mongoose.Schema({
  album: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "GalleryAlbum",
    required: true,
    index: true,
  },
  title: String,
  caption: String,
  image: {
    url: {
      type: String,
      required: true,
    },
    publicId: String,
    size: Number,
    mimeType: String,
  },
  displayOrder: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ["PUBLISHED", "ARCHIVED"],
    default: "PUBLISHED",
    index: true,
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },
  archivedAt: Date,
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  archiveReason: String,
}, { timestamps: true });

galleryPhotoSchema.index({ album: 1, status: 1, displayOrder: 1, createdAt: -1 });

module.exports = mongoose.model("GalleryPhoto", galleryPhotoSchema);
