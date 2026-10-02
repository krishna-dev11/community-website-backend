const mongoose = require("mongoose");
const crypto = require("node:crypto");

const userSchema = new mongoose.Schema(
  {
    memberId: {
      type: String,
      uppercase: true,
      trim: true,
      unique: true,
      sparse: true,
      index: true,
    },
    verificationToken: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      select: false, // Never returned in default queries for security
    },
    identityHash: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      index: true,
    },
    mustChangePassword: {
      type: Boolean,
      default: false,
    },
    contactVerified: {
      type: Boolean,
      default: false,
    },
    familyRole: {
      type: String,
      enum: ["FAMILY_HEAD", "MEMBER", "FORMER_FAMILY_HEAD"],
      default: "MEMBER",
      index: true,
    },
    membershipStatus: {
      type: String,
      enum: [
        "ACTIVE",
        "SUSPENDED",
        "DECEASED",
        "MARRIED",
        "SEPARATED",
        "LEFT_FAMILY",
        "TRANSFERRED",
        "INACTIVE",
        "REMOVED_BY_ADMIN",
      ],
      default: "ACTIVE",
      index: true,
    },
    isMinor: {
      type: Boolean,
      default: false,
      index: true,
    },
    guardianMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    guardianRelationship: {
      type: String,
      trim: true,
    },
    isDeceased: {
      type: Boolean,
      default: false,
      index: true,
    },
    dateOfDeath: Date,
    deathReportedAt: Date,
    deathReportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    deathVerifiedAt: Date,
    deathVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    deathEvidence: {
      url: String,
      publicId: String,
      name: String,
    },
    deathNotes: String,
    transferHistory: [
      {
        previousFamily: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Family",
        },
        newFamily: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Family",
        },
        transferredAt: {
          type: Date,
          default: Date.now,
        },
        reason: String,
        approvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "user",
        },
      },
    ],
    documentVersions: [
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
        status: {
          type: String,
          enum: ["PENDING", "APPROVED", "REJECTED", "RESUBMITTED", "CORRECTION_REQUESTED"],
          default: "PENDING",
        },
        rejectionReason: String,
        reviewedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "user",
        },
        reviewedAt: Date,
      },
    ],
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
    },
    accountType: {
      type: String,
      required: true,
      enum: ["Admin", "Instructor", "Student", "Member"],
    },
    roles: [
      {
        type: String,
        enum: [
          "SUPER_ADMIN",
          "MEMBER",
          "MODERATOR",
          "TREASURER",
          "MATRIMONIAL_ADMIN",
          "SCHOLARSHIP_ADMIN",
          "JOB_ADMIN",
          "DHARAMSHALA_ADMIN",
          "CONTENT_ADMIN",
          "Admin",
          "Instructor",
          "Student",
        ],
      },
    ],
    accountStatus: {
      type: String,
      enum: [
        "PENDING",
        "ACTIVE",
        "REJECTED",
        "CORRECTION_REQUESTED",
        "SUSPENDED",
        "DEACTIVATED",
      ],
      default: function () {
        return this.approved ? "ACTIVE" : "PENDING";
      },
      index: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    approved: {
      type: Boolean,
      default: true,
    },
    additionalDetails: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "profile",
    },
    family: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Family",
      index: true,
    },
    imageUrl: {
      type: String,
      required: true,
    },

    // reset password code
    token: {
      type: String,
    },
    resetPasswordExpires: {
      type: Date,
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockedUntil: {
      type: Date,
    },
    sessions: [
      {
        tokenHash: String,
        device: String,
        ip: String,
        createdAt: {
          type: Date,
          default: Date.now,
        },
        expiresAt: Date,
      },
    ],
    reviewHistory: [
      {
        action: {
          type: String,
          enum: [
            "SUBMITTED",
            "APPROVED",
            "REJECTED",
            "CORRECTION_REQUESTED",
            "RESUBMITTED",
          ],
        },
        reason: String,
        reviewedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "user",
        },
        reviewedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    phoneVerified: {
      type: Boolean,
      default: false,
    },
    userRole: {
      type: String,
      enum: ["RegularStudent", "WalkInStudent", "Lead", "Enrolled"],
      default: "RegularStudent",
    },
    totalPaid: {
      type: Number,
      default: 0,
    },
    paymentStatus: {
      type: String,
      enum: ["NotPaid", "Partial", "Paid"],
      default: "NotPaid",
    },
  },
  { timestamps: true }
);

userSchema.pre("validate", function (next) {
  if (!this.memberId) {
    const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
    this.memberId = `SMJ-${rand}`;
  }

  if (!this.roles || this.roles.length === 0) {
    if (this.accountType === "Admin") this.roles = ["Admin"];
    else if (this.accountType === "Instructor") this.roles = ["Instructor"];
    else if (this.accountType === "Student") this.roles = ["Student"];
    else this.roles = ["MEMBER"];
  }

  if (!this.accountStatus) {
    this.accountStatus = this.approved ? "ACTIVE" : "PENDING";
  }

  next();
});

module.exports = mongoose.model("user", userSchema);
