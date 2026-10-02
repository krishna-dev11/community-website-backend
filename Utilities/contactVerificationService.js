const crypto = require("node:crypto");
const otpGenerator = require("otp-generator");
const OTP = require("../Models/otpSchema");
const { mailSender } = require("./mailSender");
const emailTemplate = require("../mail/templates/emailVerificationEmail");
const ApiError = require("./ApiError");

const MAX_OTP_ATTEMPTS = 5;
const OTP_EXPIRY_MINUTES = 10;

/**
 * Normalizes email address.
 */
function normalizeContact(contact, channel = "EMAIL") {
  if (!contact) return "";
  if (channel === "EMAIL") {
    return String(contact).trim().toLowerCase();
  }
  // Phone normalization: keep digits, strip non-digits
  return String(contact).replace(/\D/g, "").trim();
}

/**
 * Dispatches the OTP via the configured channel (EMAIL currently, ready for PHONE/SMS).
 */
async function dispatchOtp({ channel, contact, otp }) {
  if (channel === "EMAIL") {
    await mailSender(
      contact,
      "Verification Code - Adivasi Halba/Halbi Samaj",
      emailTemplate(otp)
    );
    return true;
  }

  if (channel === "PHONE") {
    // In production, integrate SMS gateway (e.g. Twilio / Fast2SMS)
    console.log(`[SMS Gateway Simulated] Sent OTP ${otp} to phone ${contact}`);
    return true;
  }

  throw new ApiError(400, "INVALID_OTP_CHANNEL", `Unsupported OTP channel: ${channel}`);
}

/**
 * Sends an OTP for a specific member draft and session.
 */
async function sendContactOtp({
  contact,
  channel = process.env.OTP_CHANNEL || "EMAIL",
  purpose = "REGISTRATION_CONTACT_VERIFICATION",
  memberKey = "head",
  sessionToken = null,
}) {
  const normalized = normalizeContact(contact, channel);
  if (!normalized) {
    throw new ApiError(400, "CONTACT_REQUIRED", "Contact address is required for verification");
  }

  const generatedSessionToken = sessionToken || crypto.randomUUID();

  // Generate 6 digit numeric OTP
  let otp = otpGenerator.generate(6, {
    lowerCaseAlphabets: false,
    upperCaseAlphabets: false,
    specialChars: false,
  });

  // Ensure unique OTP if necessary
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Remove existing unconsumed OTP for this memberKey and sessionToken if any
  await OTP.deleteMany({
    memberKey,
    sessionToken: generatedSessionToken,
    purpose,
  });

  // Create new OTP document
  const otpDoc = new OTP({
    email: channel === "EMAIL" ? normalized : undefined,
    phone: channel === "PHONE" ? normalized : undefined,
    channel,
    purpose,
    memberKey,
    sessionToken: generatedSessionToken,
    otp,
    verified: false,
    attempts: 0,
    expiresAt,
  });

  // Save (disable pre-save hook side-effect if already handling dispatch here)
  await otpDoc.save();

  // Send the OTP
  try {
    await dispatchOtp({ channel, contact: normalized, otp });
  } catch (error) {
    console.error("[ContactVerificationService] Dispatch error:", error.message);
    throw new ApiError(500, "OTP_DISPATCH_FAILED", "Unable to send verification code. Please try again.");
  }

  return {
    success: true,
    channel,
    sessionToken: generatedSessionToken,
    memberKey,
    message: `Verification code sent to ${normalized}`,
  };
}

/**
 * Verifies an OTP for a specific member draft and session.
 */
async function verifyContactOtp({
  contact,
  channel = process.env.OTP_CHANNEL || "EMAIL",
  otp,
  purpose = "REGISTRATION_CONTACT_VERIFICATION",
  memberKey = "head",
  sessionToken,
}) {
  const normalized = normalizeContact(contact, channel);
  if (!normalized || !otp) {
    throw new ApiError(400, "OTP_VERIFICATION_FIELDS_REQUIRED", "Contact and OTP are required");
  }

  const query = {
    purpose,
    memberKey,
    verified: false,
  };

  if (sessionToken) {
    query.sessionToken = sessionToken;
  }

  if (channel === "EMAIL") {
    query.email = normalized;
  } else {
    query.phone = normalized;
  }

  const record = await OTP.findOne(query).sort({ createdAt: -1 });

  if (!record) {
    throw new ApiError(400, "OTP_NOT_FOUND", "No active verification code found for this member");
  }

  // Check if expired
  if (record.expiresAt && new Date() > new Date(record.expiresAt)) {
    throw new ApiError(400, "OTP_EXPIRED", "Verification code has expired. Please request a new one.");
  }

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    throw new ApiError(429, "OTP_ATTEMPTS_EXCEEDED", "Too many incorrect attempts. Please request a new code.");
  }

  if (String(record.otp).trim() !== String(otp).trim()) {
    record.attempts += 1;
    await record.save();
    throw new ApiError(400, "OTP_INVALID", "Invalid verification code");
  }

  record.verified = true;
  record.consumedAt = new Date();
  await record.save();

  return {
    success: true,
    verified: true,
    memberKey,
    sessionToken: record.sessionToken,
    contact: normalized,
  };
}

module.exports = {
  normalizeContact,
  sendContactOtp,
  verifyContactOtp,
};
