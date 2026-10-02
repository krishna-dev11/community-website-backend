const mongoose = require("mongoose");
const crypto = require("node:crypto");

const familyLifecycleRequestSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    family: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Family",
      required: true,
      index: true,
    },
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      index: true,
    },
    type: {
      type: String,
      enum: [
        "ADD_MEMBER",
        "REPORT_DEATH",
        "HEAD_SUCCESSION",
        "HEAD_TRANSFER",
        "MEMBER_TRANSFER",
        "FAMILY_SPLIT",
        "PROFILE_CORRECTION",
        "MARITAL_STATUS_CHANGE",
        "ADDRESS_CHANGE",
      ],
      required: true,
      index: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED", "REQUIRES_CORRECTION"],
      default: "PENDING",
      index: true,
    },
    reason: {
      type: String,
      trim: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    documents: [
      {
        url: String,
        publicId: String,
        name: String,
        mimeType: String,
        size: Number,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    reviewedAt: Date,
    adminReason: {
      type: String,
      trim: true,
    },
    rejectionCategory: {
      type: String,
      trim: true,
    },
    correctionRequired: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

familyLifecycleRequestSchema.pre("validate", function (next) {
  if (!this.requestId) {
    const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
    this.requestId = `REQ-${rand}`;
  }
  next();
});

familyLifecycleRequestSchema.index({ family: 1, type: 1, status: 1 });
familyLifecycleRequestSchema.index({ requestedBy: 1, createdAt: -1 });

module.exports = mongoose.model("FamilyLifecycleRequest", familyLifecycleRequestSchema);
