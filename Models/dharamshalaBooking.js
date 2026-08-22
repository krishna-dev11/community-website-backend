const mongoose = require("mongoose");

const dharamshalaBookingSchema = new mongoose.Schema({
  requester: { type: mongoose.Schema.Types.ObjectId, ref: "user", index: true },
  guestName: { type: String, trim: true },
  guestPhone: { type: String, trim: true },
  purpose: { type: String, required: true, trim: true },
  startDate: { type: Date, required: true, index: true },
  endDate: { type: Date, required: true, index: true },
  roomsRequested: { type: Number, default: 1, min: 1 },
  status: {
    type: String,
    enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED", "ARCHIVED"],
    default: "PENDING",
    index: true,
  },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  reviewedAt: Date,
  reviewMessage: String,
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  cancelledAt: Date,
  cancellationReason: String,
}, { timestamps: true });

dharamshalaBookingSchema.index({ status: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model("DharamshalaBooking", dharamshalaBookingSchema);
