const mongoose = require("mongoose");

const adminInviteSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true,
  },
  roles: [{
    type: String,
    required: true,
  }],
  tokenHash: {
    type: String,
    required: true,
    unique: true,
  },
  status: {
    type: String,
    enum: ["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"],
    default: "PENDING",
    index: true,
  },
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },
  acceptedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  acceptedAt: Date,
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },
}, { timestamps: true });

adminInviteSchema.index(
  { email: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "PENDING" },
  }
);

module.exports = mongoose.model("AdminInvite", adminInviteSchema);
