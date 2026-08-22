const mongoose = require("mongoose");

const communityPostSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  body: { type: String, required: true, trim: true },
  category: { type: String, trim: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
  status: { type: String, enum: ["PUBLISHED", "UNDER_REVIEW", "HIDDEN", "ARCHIVED"], default: "PUBLISHED", index: true },
  reportCount: { type: Number, default: 0 },
  commentCount: { type: Number, default: 0 },
  moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  moderationReason: String,
}, { timestamps: true });

communityPostSchema.index({ title: "text", body: "text", category: "text" });

module.exports = mongoose.model("CommunityPost", communityPostSchema);
