const mongoose = require("mongoose");

const webhookEventSchema = new mongoose.Schema({
  provider: {
    type: String,
    enum: ["RAZORPAY"],
    default: "RAZORPAY",
  },
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  eventType: {
    type: String,
    required: true,
    index: true,
  },
  processedAt: Date,
  status: {
    type: String,
    enum: ["PROCESSED", "IGNORED", "FAILED"],
    default: "PROCESSED",
  },
  payload: mongoose.Schema.Types.Mixed,
  error: String,
}, { timestamps: true });

module.exports = mongoose.model("WebhookEvent", webhookEventSchema);
