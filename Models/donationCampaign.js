const mongoose = require("mongoose");

const donationCampaignSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  goalAmount: {
    type: Number,
    min: 0,
  },
  raisedAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  startDate: Date,
  endDate: {
    type: Date,
    index: true,
  },
  status: {
    type: String,
    enum: ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "EXPIRED", "CANCELLED", "ARCHIVED"],
    default: "DRAFT",
    index: true,
  },
  coverImage: {
    url: String,
    publicId: String,
    size: Number,
    mimeType: String,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  archivedAt: Date,
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  archiveReason: String,
}, { timestamps: true });

donationCampaignSchema.index({ title: "text", description: "text" });
donationCampaignSchema.index({ status: 1, endDate: 1, createdAt: -1 });

module.exports = mongoose.model("DonationCampaign", donationCampaignSchema);
