const mongoose = require("mongoose");

const voteSchema = new mongoose.Schema({
  poll: { type: mongoose.Schema.Types.ObjectId, ref: "Poll", required: true, index: true },
  option: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
}, { timestamps: true });

voteSchema.index({ poll: 1, option: 1 });

module.exports = mongoose.model("Vote", voteSchema);
