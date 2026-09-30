const mongoose = require("mongoose");
const emailTemplate = require("../mail/templates/emailVerificationEmail");
const { mailSender } = require("../Utilities/mailSender");

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
    },
    otp: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 600, // 10 minutes
    },
  },
  { timestamps: true }
);

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
  // Only send email for new documents
  if (this.isNew) {
    try {
      await sendVerificationEmail(this.email, this.otp);
    } catch (error) {
      console.error("[OTP Schema] Failed to dispatch verification email in pre-save hook:", error.message);
    }
  }
  next();
});

module.exports = mongoose.model("OTP", otpSchema);
