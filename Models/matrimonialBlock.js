const mongoose = require("mongoose");

const matrimonialBlockSchema = new mongoose.Schema({
  blocker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
    index: true,
  },
  blockedProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MatrimonialProfile",
    required: true,
    index: true,
  },
  reason: String,
}, { timestamps: true });

matrimonialBlockSchema.index({ blocker: 1, blockedProfile: 1 }, { unique: true });

module.exports = mongoose.model("MatrimonialBlock", matrimonialBlockSchema);
