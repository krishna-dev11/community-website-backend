const mongoose = require("mongoose");

const communityCommentSchema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: "CommunityPost", required: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  body: { type: String, required: true, trim: true },
  status: { type: String, enum: ["PUBLISHED", "HIDDEN", "ARCHIVED"], default: "PUBLISHED", index: true },
  moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  moderationReason: String,
}, { timestamps: true });

communityCommentSchema.index({ post: 1, createdAt: 1 });

module.exports = mongoose.model("CommunityComment", communityCommentSchema);
