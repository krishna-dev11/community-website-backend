const mongoose = require("mongoose");

const youtubeVideoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    youtubeUrl: {
      type: String,
      required: true,
      trim: true,
    },
    videoId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    embedUrl: {
      type: String,
      required: true,
      trim: true,
    },
    thumbnailUrl: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    eventName: {
      type: String,
      trim: true,
      default: "",
    },
    eventDate: {
      type: Date,
    },
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    archivedAt: {
      type: Date,
    },
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    archiveReason: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

youtubeVideoSchema.index({ title: "text", description: "text", eventName: "text" });
youtubeVideoSchema.index({ status: 1, displayOrder: 1, createdAt: -1 });

module.exports = mongoose.model("YouTubeVideo", youtubeVideoSchema);
