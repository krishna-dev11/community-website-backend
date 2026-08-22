const mongoose = require("mongoose");

const dharamshalaBlockedDateSchema = new mongoose.Schema({
  startDate: { type: Date, required: true, index: true },
  endDate: { type: Date, required: true, index: true },
  reason: { type: String, required: true, trim: true },
  status: {
    type: String,
    enum: ["ACTIVE", "ARCHIVED"],
    default: "ACTIVE",
    index: true,
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  archivedAt: Date,
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  archiveReason: String,
}, { timestamps: true });

dharamshalaBlockedDateSchema.index({ status: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model("DharamshalaBlockedDate", dharamshalaBlockedDateSchema);
