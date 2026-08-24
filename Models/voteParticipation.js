const mongoose = require("mongoose");

const voteParticipationSchema = new mongoose.Schema({
  poll: { type: mongoose.Schema.Types.ObjectId, ref: "Poll", required: true },
  member: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  selectedOptions: [{ type: mongoose.Schema.Types.ObjectId }],
}, { timestamps: true });

voteParticipationSchema.index({ poll: 1, member: 1 }, { unique: true });

module.exports = mongoose.model("VoteParticipation", voteParticipationSchema);
