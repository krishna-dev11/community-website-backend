const mongoose = require("mongoose");

const pollOptionSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true },
  voteCount: { type: Number, default: 0 },
}, { _id: true });

const pollSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  options: {
    type: [pollOptionSchema],
    validate: [(options) => options.length >= 2, "At least two poll options are required"],
  },
  status: { type: String, enum: ["DRAFT", "ACTIVE", "CLOSED", "ARCHIVED"], default: "DRAFT", index: true },
  startsAt: Date,
  endsAt: { type: Date, required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  totalVotes: { type: Number, default: 0 },
  isAnonymous: { type: Boolean, default: true },
}, { timestamps: true });

pollSchema.index({ status: 1, endsAt: 1 });

module.exports = mongoose.model("Poll", pollSchema);
