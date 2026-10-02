const mongoose = require("mongoose");

const familyMembershipSchema = new mongoose.Schema(
  {
    family: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Family",
      required: true,
      index: true,
    },
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["FAMILY_ADMIN", "FAMILY_MEMBER", "FORMER_FAMILY_HEAD"],
      default: "FAMILY_MEMBER",
      index: true,
    },
    relationship: {
      type: String,
      enum: [
        "SELF",
        "SPOUSE",
        "SON",
        "DAUGHTER",
        "FATHER",
        "MOTHER",
        "BROTHER",
        "SISTER",
        "GRANDFATHER",
        "GRANDMOTHER",
        "UNCLE",
        "AUNT",
        "OTHER",
      ],
      default: "SELF",
    },
    verificationStatus: {
      type: String,
      enum: [
        "PENDING",
        "UNDER_REVIEW",
        "VERIFIED",
        "APPROVED",
        "REQUIRES_CORRECTION",
        "REJECTED",
        "RESUBMISSION_PENDING",
      ],
      default: "PENDING",
      index: true,
    },
    rejectionCategory: {
      type: String,
      trim: true,
    },
    rejectionReason: String,
    affectedField: {
      type: String,
      trim: true,
    },
    correctionRequired: {
      type: String,
      trim: true,
    },
    resubmissionCount: {
      type: Number,
      default: 0,
    },
    verificationHistory: [
      {
        action: String,
        reason: String,
        category: String,
        affectedField: String,
        correctionRequired: String,
        reviewedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "user",
        },
        reviewedAt: {
          type: Date,
          default: Date.now,
        },
        document: Object,
      },
    ],
    status: {
      type: String,
      enum: [
        "ACTIVE",
        "DECEASED",
        "TRANSFERRED",
        "LEFT_FAMILY",
        "SUSPENDED",
        "REMOVED",
      ],
      default: "ACTIVE",
      index: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    removedAt: Date,
    removedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    removalReason: String,
  },
  { timestamps: true }
);

familyMembershipSchema.index({ family: 1, member: 1 }, { unique: true });
familyMembershipSchema.index(
  { member: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "ACTIVE" },
  }
);
familyMembershipSchema.index({ family: 1, verificationStatus: 1 });

module.exports = mongoose.model("FamilyMembership", familyMembershipSchema);
