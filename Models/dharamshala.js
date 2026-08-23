const mongoose = require("mongoose");

const roomTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  capacity: { type: Number, required: true, default: 2 },
  totalRooms: { type: Number, required: true, default: 5 },
  memberPricePerNight: { type: Number, required: true, default: 500 },
  nonMemberPricePerNight: { type: Number, required: true, default: 1200 },
  amenities: [{ type: String, trim: true }],
  image: { type: String, trim: true },
});

const dharamshalaSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, trim: true },
  tagline: { type: String, trim: true },
  description: { type: String, required: true, trim: true },
  location: {
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, trim: true },
    landmark: { type: String, trim: true },
    mapUrl: { type: String, trim: true },
  },
  mainImage: { type: String, trim: true },
  images: [{
    url: { type: String, required: true },
    caption: { type: String },
    isFeatured: { type: Boolean, default: false },
  }],
  roomTypes: [roomTypeSchema],
  facilities: [{ type: String, trim: true }],
  rules: [{ type: String, trim: true }],
  checkInTime: { type: String, default: "12:00 PM" },
  checkOutTime: { type: String, default: "10:00 AM" },
  cancellationPolicy: { type: String, default: "Cancellations made 48 hours before check-in receive a full refund." },
  contactPhone: { type: String, trim: true },
  contactEmail: { type: String, trim: true },
  status: {
    type: String,
    enum: ["ACTIVE", "INACTIVE", "MAINTENANCE"],
    default: "ACTIVE",
    index: true,
  },
  totalCapacity: { type: Number, default: 50 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
}, { timestamps: true });

dharamshalaSchema.index({ "location.city": 1, status: 1 });

module.exports = mongoose.model("Dharamshala", dharamshalaSchema);
