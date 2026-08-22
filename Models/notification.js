const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
    index: true,
  },
  channel: {
    type: String,
    enum: ["IN_APP", "EMAIL"],
    default: "IN_APP",
    index: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  message: {
    type: String,
    required: true,
    trim: true,
  },
  link: String,
  status: {
    type: String,
    enum: ["UNREAD", "READ", "SENT", "FAILED"],
    default: "UNREAD",
    index: true,
  },
  readAt: Date,
  metadata: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

notificationSchema.index({ recipient: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
