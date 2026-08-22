const mongoose = require("mongoose");

const donationSchema = new mongoose.Schema({
  campaign: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "DonationCampaign",
    index: true,
  },
  donor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    index: true,
  },
  donorName: {
    type: String,
    trim: true,
  },
  donorEmail: {
    type: String,
    trim: true,
    lowercase: true,
  },
  donorPhone: String,
  amount: {
    type: Number,
    required: true,
    min: 1,
  },
  currency: {
    type: String,
    default: "INR",
  },
  status: {
    type: String,
    enum: ["PENDING", "SUCCESS", "FAILED", "REFUNDED"],
    default: "PENDING",
    index: true,
  },
  anonymous: {
    type: Boolean,
    default: false,
  },
  note: String,
  razorpayOrderId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  razorpayPaymentId: {
    type: String,
    index: true,
  },
  razorpaySignature: String,
  receiptNumber: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  paidAt: Date,
  failedAt: Date,
  refundedAt: Date,
  refundReason: String,
}, { timestamps: true });

donationSchema.index({ donor: 1, createdAt: -1 });
donationSchema.index({ campaign: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("Donation", donationSchema);
