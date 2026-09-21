const mongoose = require("mongoose");

const dharamshalaReservationHoldSchema = new mongoose.Schema({
  booking: { type: mongoose.Schema.Types.ObjectId, ref: "DharamshalaBooking", required: true, index: true },
  dharamshala: { type: mongoose.Schema.Types.ObjectId, ref: "Dharamshala", required: true },
  roomType: { type: String, required: true, trim: true },
  date: { type: String, required: true },
  slot: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ["ACTIVE", "RELEASED"], default: "ACTIVE", index: true },
  releasedAt: Date,
}, { timestamps: true });

dharamshalaReservationHoldSchema.index({ dharamshala: 1, roomType: 1, date: 1, slot: 1 }, { unique: true });

module.exports = mongoose.model("DharamshalaReservationHold", dharamshalaReservationHoldSchema);
