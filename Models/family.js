const mongoose = require("mongoose");

const familySchema = new mongoose.Schema(
  {
    familyName: {
      type: String,
      required: true,
      trim: true,
    },
    familyCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    sssmId: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    currentCity: {
      type: String,
      trim: true,
      index: true,
    },
    nativePlace: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    currentFamilyAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    currentHeadMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      index: true,
    },
    successorMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      index: true,
    },
    headHistory: [
      {
        head: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "user",
        },
        role: {
          type: String,
          default: "FAMILY_HEAD",
        },
        from: {
          type: Date,
          default: Date.now,
        },
        to: Date,
        reason: String,
        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "user",
        },
        evidence: {
          url: String,
          name: String,
        },
      },
    ],
    lifecycleStatus: {
      type: String,
      enum: ["ACTIVE", "HEAD_SUCCESSION_REQUIRED", "MERGED", "ARCHIVED"],
      default: "ACTIVE",
      index: true,
    },
    verificationStatus: {
      type: String,
      enum: [
        "DRAFT",
        "UNDER_REVIEW",
        "PARTIALLY_VERIFIED",
        "VERIFIED",
        "ACTION_REQUIRED",
        "ARCHIVED",
      ],
      default: "UNDER_REVIEW",
      index: true,
    },
    successionRequests: [
      {
        requestedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "user",
        },
        proposedSuccessor: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "user",
        },
        deathCertificate: {
          url: String,
          publicId: String,
          name: String,
        },
        status: {
          type: String,
          enum: ["PENDING", "APPROVED", "REJECTED"],
          default: "PENDING",
        },
        reason: String,
        reviewNotes: String,
        reviewedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "user",
        },
        reviewedAt: Date,
        submittedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    status: {
      type: String,
      enum: ["ACTIVE", "NEEDS_ADMIN", "ARCHIVED"],
      default: "ACTIVE",
      index: true,
    },
    visibility: {
      type: String,
      enum: ["PUBLIC", "MEMBERS_ONLY", "PRIVATE"],
      default: "PUBLIC",
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
    archivedAt: Date,
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    archiveReason: String,
  },
  { timestamps: true }
);

familySchema.pre("save", function (next) {
  if (!this.currentHeadMemberId && this.currentFamilyAdmin) {
    this.currentHeadMemberId = this.currentFamilyAdmin;
  }
  if (!this.currentFamilyAdmin && this.currentHeadMemberId) {
    this.currentFamilyAdmin = this.currentHeadMemberId;
  }
  next();
});

familySchema.index({ sssmId: 1, state: 1 }, { unique: true });
familySchema.index({ familyName: "text", familyCode: "text", sssmId: "text" });

module.exports = mongoose.model("Family", familySchema);
