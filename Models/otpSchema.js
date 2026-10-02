const mongoose = require("mongoose");
const emailTemplate = require("../mail/templates/emailVerificationEmail");
const { mailSender } = require("../Utilities/mailSender");

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    channel: {
      type: String,
      enum: ["EMAIL", "PHONE"],
      default: "EMAIL",
    },
    purpose: {
      type: String,
      enum: [
        "REGISTRATION_CONTACT_VERIFICATION",
        "MEMBER_CONTACT_VERIFICATION",
        "PASSWORD_RESET",
        "ACCOUNT_CLAIM",
        "PHONE_CHANGE",
        "EMAIL_CHANGE",
      ],
      default: "REGISTRATION_CONTACT_VERIFICATION",
    },
    memberKey: {
      type: String,
      default: "head",
      index: true,
    },
    sessionToken: {
      type: String,
      index: true,
    },
    otp: {
      type: String,
      required: true,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    consumedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 600, // 10 minutes
    },
  },
  { timestamps: true }
);

otpSchema.index({ sessionToken: 1, memberKey: 1, purpose: 1 });

const sendVerificationEmail = async (email, otp) => {
  try {
    const response = await mailSender(
      email,
      "Verification Mail - Adivasi Halba/Halbi Samaj",
      emailTemplate(otp)
    );
    return response;
  } catch (error) {
    console.error(`[OTP Schema] Error sending verification email to ${email}:`, error.message);
    throw error;
  }
};

otpSchema.pre("save", async function (next) {
  // Only dispatch email automatically if this is a legacy save without contactVerificationService handling
  if (this.isNew && this.email && this.channel === "EMAIL" && !this.sessionToken) {
    try {
      await sendVerificationEmail(this.email, this.otp);
    } catch (error) {
      console.error("[OTP Schema] Failed to dispatch verification email in pre-save hook:", error.message);
    }
  }
  next();
});

module.exports = mongoose.model("OTP", otpSchema);
