const mongoose = require("mongoose");

const matrimonialInterestSchema = new mongoose.Schema({
  fromProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MatrimonialProfile",
    required: true,
    index: true,
  },
  toProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MatrimonialProfile",
    required: true,
    index: true,
  },
  message: String,
  status: {
    type: String,
    enum: ["PENDING", "ACCEPTED", "REJECTED", "WITHDRAWN"],
    default: "PENDING",
    index: true,
  },
  respondedAt: Date,
  responseMessage: String,
}, { timestamps: true });

matrimonialInterestSchema.index({ fromProfile: 1, toProfile: 1 }, { unique: true });
matrimonialInterestSchema.index({ toProfile: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("MatrimonialInterest", matrimonialInterestSchema);
