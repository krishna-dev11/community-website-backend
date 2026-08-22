const mongoose = require("mongoose");

const matrimonialContactRequestSchema = new mongoose.Schema({
  interest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MatrimonialInterest",
    required: true,
    index: true,
  },
  requesterProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MatrimonialProfile",
    required: true,
    index: true,
  },
  targetProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MatrimonialProfile",
    required: true,
    index: true,
  },
  message: String,
  status: {
    type: String,
    enum: ["PENDING", "APPROVED", "REJECTED", "REVOKED"],
    default: "PENDING",
    index: true,
  },
  reviewedAt: Date,
  reviewMessage: String,
}, { timestamps: true });

matrimonialContactRequestSchema.index(
  { requesterProfile: 1, targetProfile: 1 },
  { unique: true }
);

module.exports = mongoose.model("MatrimonialContactRequest", matrimonialContactRequestSchema);
