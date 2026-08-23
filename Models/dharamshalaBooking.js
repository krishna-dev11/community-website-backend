const mongoose = require("mongoose");

const dharamshalaBookingSchema = new mongoose.Schema({
  dharamshala: { type: mongoose.Schema.Types.ObjectId, ref: "Dharamshala", index: true },
  dharamshalaName: { type: String, trim: true },
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
  pricePerNight: { type: Number, default: 0 },
  numberOfNights: { type: Number, default: 1 },
  totalAmount: { type: Number, default: 0 },
  paymentStatus: {
    type: String,
    enum: ["PENDING", "PAID", "WAIVED", "REFUNDED"],
    default: "PENDING",
  },
  status: {
    type: String,
    enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED", "ARCHIVED"],
    default: "PENDING",
    index: true,
  },
  specialRequests: { type: String, trim: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  reviewedAt: Date,
  reviewMessage: String,
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  cancelledAt: Date,
  cancellationReason: String,
}, { timestamps: true });

dharamshalaBookingSchema.index({ dharamshala: 1, status: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model("DharamshalaBooking", dharamshalaBookingSchema);
