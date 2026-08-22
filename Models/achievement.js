const mongoose = require("mongoose");

const achievementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  achieverName: { type: String, required: true, trim: true },
  achiever: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  category: { type: String, trim: true, index: true },
  image: {
    url: String,
    publicId: String,
    size: Number,
    mimeType: String,
    name: String,
  },
  status: { type: String, enum: ["PENDING", "PUBLISHED", "REJECTED", "ARCHIVED"], default: "PENDING", index: true },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  reviewedAt: Date,
  reviewReason: String,
}, { timestamps: true });

achievementSchema.index({ title: "text", description: "text", achieverName: "text" });

module.exports = mongoose.model("Achievement", achievementSchema);
