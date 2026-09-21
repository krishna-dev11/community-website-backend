const mongoose = require("mongoose");

const dharamshalaPaymentSchema = new mongoose.Schema({
  booking: { type: mongoose.Schema.Types.ObjectId, ref: "DharamshalaBooking", required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
  amount: { type: Number, required: true, min: 1 },
  currency: { type: String, default: "INR" },
  gateway: { type: String, enum: ["RAZORPAY"], default: "RAZORPAY" },
  gatewayOrderId: { type: String, required: true, unique: true, index: true },
  gatewayPaymentId: { type: String, unique: true, sparse: true, index: true },
  gatewaySignature: String,
  gatewayEventId: { type: String, sparse: true, unique: true },
  status: {
    type: String,
    enum: ["CREATED", "PENDING", "SUCCESS", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"],
    default: "CREATED",
    index: true,
  },
  paidAt: Date,
  failedAt: Date,
  refundedAt: Date,
  refundId: String,
  refundAmount: Number,
  metadata: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

dharamshalaPaymentSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("DharamshalaPayment", dharamshalaPaymentSchema);