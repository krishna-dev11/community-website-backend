const mongoose = require("mongoose");

const statusHistorySchema = new mongoose.Schema({
  status: { type: String, required: true },
  paymentStatus: { type: String },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  note: { type: String, trim: true },
  changedAt: { type: Date, default: Date.now },
}, { _id: false });

const dharamshalaBookingSchema = new mongoose.Schema({
  dharamshala: { type: mongoose.Schema.Types.ObjectId, ref: "Dharamshala", index: true },
  dharamshalaName: { type: String, trim: true },
  bookingReference: { type: String, unique: true, sparse: true, index: true },
  idempotencyKey: { type: String, sparse: true, index: true },
  roomType: { type: String, required: true, trim: true },
  requester: { type: mongoose.Schema.Types.ObjectId, ref: "user", index: true },
  isMember: { type: Boolean, default: false },
  guestName: { type: String, trim: true },
  guestEmail: { type: String, trim: true },
  guestPhone: { type: String, trim: true },
  guestAddress: { type: String, trim: true },
  numberOfGuests: { type: Number, default: 1, min: 1 },
  purpose: { type: String, required: true, trim: true },
  startDate: { type: Date, required: true, index: true },
  endDate: { type: Date, required: true, index: true },
  roomsRequested: { type: Number, default: 1, min: 1 },
  pricePerNight: { type: Number, default: null },
  numberOfNights: { type: Number, default: 1 },
  totalAmount: { type: Number, default: null },
  paymentStatus: {
    type: String,
    enum: ["NOT_REQUIRED", "NOT_APPLICABLE", "PENDING", "SUCCESS", "FAILED", "REFUND_PENDING", "REFUNDED", "PAID", "WAIVED"],
    default: "NOT_REQUIRED",
  },
  status: {
    type: String,
    enum: ["PENDING", "APPROVED", "PAYMENT_PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED", "REJECTED", "CANCELLED", "PAYMENT_EXPIRED", "ARCHIVED"],
    default: "PENDING",
    index: true,
  },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "DharamshalaPayment" },
  gatewayOrderId: { type: String, index: true },
  gatewayPaymentId: { type: String, index: true },
  amountPaid: { type: Number, min: 0 },
  approvedAt: Date,
  paymentDeadline: Date,
  confirmedAt: Date,
  checkedInAt: Date,
  completedAt: Date,
  specialRequests: { type: String, trim: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  reviewedAt: Date,
  reviewMessage: { type: String, trim: true },
  reviewNote: { type: String, trim: true },
  rejectionReason: { type: String, trim: true },
  statusHistory: { type: [statusHistorySchema], default: [] },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  cancelledAt: Date,
  cancellationReason: { type: String, trim: true },
}, { timestamps: true });

dharamshalaBookingSchema.index({ dharamshala: 1, status: 1, startDate: 1, endDate: 1 });
dharamshalaBookingSchema.index({ requester: 1, createdAt: -1 });
dharamshalaBookingSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("DharamshalaBooking", dharamshalaBookingSchema);
