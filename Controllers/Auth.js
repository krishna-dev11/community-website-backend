const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const otpGenerator = require("otp-generator");
const cloudinary = require("cloudinary").v2;
const User = require("../Models/user");
const OTP = require("../Models/otpSchema");
const Profile = require("../Models/profile");
const passwordUpdate = require("../mail/templates/passwordUpdate");
const { mailSender } = require("../Utilities/mailSender");
const ApiError = require("../Utilities/ApiError");
const ApiResponse = require("../Utilities/ApiResponse");
const asyncHandler = require("../Utilities/asyncHandler");
const { logAudit } = require("../Utilities/auditService");
const { notifyUser } = require("../Utilities/notificationService");
const {
  uploadImageToCloudinary,
  uploadDocumentToCloudinary,
  assetMetadata,
} = require("../Utilities/uploadImageToCloudinary");
require("dotenv").config();

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_DAYS = 30;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

function normalizeEmail(email) {
  return email?.trim().toLowerCase();
}

function getAccessSecret() {
  return process.env.JWT_ACCESS_SECRET || process.env.SECRET_KEY;
}

function getRefreshSecret() {
  return process.env.JWT_REFRESH_SECRET || process.env.SECRET_KEY;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function refreshCookieOptions() {
  return {
    maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  };
}

function publicUser(user) {
  const output = user.toObject ? user.toObject() : { ...user };
  delete output.password;
  delete output.sessions;
  delete output.token;
  delete output.resetPasswordExpires;
  return output;
}

function buildProfilePayload(body) {
  return {
    gender: body.gender || null,
    dateOfBirth: body.dateOfBirth || null,
    about: body.about || null,
    contactNumber: body.contactNumber || body.phone || null,
    address: body.address || null,
    middleName: body.middleName || null,
    nativePlace: body.nativePlace || null,
    currentCity: body.currentCity || body.city || null,
    education: body.education || null,
    profession: body.profession || null,
    gotra: body.gotra || null,
    identityDocument: body.identityDocument || undefined,
    photo: body.photo || undefined,
  };
}

function signAccessToken(user) {
  return jwt.sign(
    {
      userId: user._id,
      id: user._id,
      email: user.email,
      roles: user.roles,
      accountType: user.accountType,
      tokenVersion: user.tokenVersion,
    },
    getAccessSecret(),
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    {
      userId: user._id,
      tokenVersion: user.tokenVersion,
      nonce: crypto.randomUUID(),
    },
    getRefreshSecret(),
    { expiresIn: `${REFRESH_TOKEN_DAYS}d` }
  );
}

async function issueSession(user, req, res) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  user.sessions.push({
    tokenHash: hashToken(refreshToken),
    device: req.header("user-agent") || "unknown",
    ip: req.ip,
    expiresAt,
  });
  await user.save();

  res.cookie("refreshToken", refreshToken, refreshCookieOptions());
  res.cookie("token", accessToken, {
    maxAge: 15 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });

  return accessToken;
}

exports.sendOTP = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!email) {
    throw new ApiError(400, "EMAIL_REQUIRED", "Enter the email");
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError(409, "EMAIL_ALREADY_REGISTERED", "This email is already registered");
  }

  let otp = otpGenerator.generate(6, {
    lowerCaseAlphabets: false,
    upperCaseAlphabets: false,
    specialChars: false,
  });

  while (await OTP.findOne({ otp })) {
    otp = otpGenerator.generate(6, {
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false,
    });
  }

  await OTP.create({ email, otp });

  return res.status(200).json(new ApiResponse("OTP sent successfully"));
});

exports.signUP = asyncHandler(async (req, res) => {
  const { firstName, lastName, password, confirmPassword, otp } = req.body;
  const email = normalizeEmail(req.body.email);

  if (!firstName || !lastName || !email || !password || !confirmPassword || !otp) {
    throw new ApiError(400, "REGISTRATION_FIELDS_REQUIRED", "Enter all required registration details");
  }

  if (password !== confirmPassword) {
    throw new ApiError(400, "PASSWORD_MISMATCH", "Password and confirm password do not match");
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError(409, "EMAIL_ALREADY_REGISTERED", "This email is already registered");
  }

  const recentOtp = await OTP.find({ email }).sort({ createdAt: -1 }).limit(1);
  if (recentOtp.length === 0 || !recentOtp[0]) {
    throw new ApiError(400, "OTP_NOT_FOUND", "OTP is not found");
  }

  if (String(otp) !== String(recentOtp[0].otp)) {
    throw new ApiError(400, "OTP_INVALID", "OTP is invalid");
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const profilePayload = buildProfilePayload(req.body);

  let uploadedPhotoUrl = null;

  // Handle actual document file upload (e.g. Aadhar / Samaj ID)
  const docFile = req.files?.identityDocument || req.files?.document || req.files?.verificationDocument;
  if (docFile) {
    const docUpload = await uploadDocumentToCloudinary(docFile, "samaj/documents", true);
    profilePayload.identityDocument = assetMetadata(docUpload, docFile.name);
  }

  // Handle actual profile photo file upload
  const photoFile = req.files?.photo || req.files?.profilePhoto || req.files?.displayPicture;
  if (photoFile) {
    const photoUpload = await uploadImageToCloudinary(photoFile, "samaj/profile", 1000, 1000);
    profilePayload.photo = assetMetadata(photoUpload, photoFile.name);
    uploadedPhotoUrl = photoUpload.secure_url;
  }

  const profileDetails = await Profile.create(profilePayload);
  const createdUser = await User.create({
    firstName,
    lastName,
    email,
    accountType: "Member",
    roles: ["MEMBER"],
    accountStatus: "PENDING",
    approved: false,
    password: hashedPassword,
    imageUrl: uploadedPhotoUrl || `https://api.dicebear.com/5.x/initials/svg?seed=${firstName}-${lastName}`,
    additionalDetails: profileDetails._id,
    reviewHistory: [{
      action: "SUBMITTED",
      reason: "Registration submitted with verification document",
    }],
  });

  return res.status(201).json(new ApiResponse("Registration submitted successfully", {
    user: publicUser(createdUser),
    accountStatus: createdUser.accountStatus,
  }));
});

exports.login = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "LOGIN_FIELDS_REQUIRED", "Fill all required login details");
  }

  const user = await User.findOne({ email }).populate("additionalDetails");
  if (!user) {
    throw new ApiError(404, "USER_NOT_FOUND", "No account exists for this email");
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new ApiError(423, "ACCOUNT_LOCKED", "Too many failed attempts. Try again later");
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= MAX_FAILED_LOGINS) {
      user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
    }
    await user.save();
    throw new ApiError(401, "PASSWORD_INCORRECT", "Password is incorrect");
  }

  if (!user.active || ["SUSPENDED", "DEACTIVATED"].includes(user.accountStatus)) {
    throw new ApiError(403, "ACCOUNT_INACTIVE", "This account is not active");
  }

  if (["PENDING", "CORRECTION_REQUESTED", "REJECTED"].includes(user.accountStatus)) {
    throw new ApiError(403, `ACCOUNT_${user.accountStatus}`, "Your application is not active yet", {
      accountStatus: user.accountStatus,
      latestReview: user.reviewHistory?.[user.reviewHistory.length - 1] || null,
    });
  }

  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  const accessToken = await issueSession(user, req, res);

  return res.status(200).json(new ApiResponse("User logged in successfully", {
    token: accessToken,
    accessToken,
    user: publicUser(user),
  }));
});

exports.refreshAccessToken = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) {
    throw new ApiError(401, "REFRESH_TOKEN_MISSING", "Refresh token is missing");
  }

  let payload;
  try {
    payload = jwt.verify(refreshToken, getRefreshSecret());
  } catch (error) {
    throw new ApiError(401, "REFRESH_TOKEN_INVALID", "Refresh token is invalid");
  }

  const user = await User.findById(payload.userId);
  if (!user || user.tokenVersion !== payload.tokenVersion || user.accountStatus !== "ACTIVE") {
    throw new ApiError(401, "REFRESH_TOKEN_REVOKED", "Refresh token is no longer valid");
  }

  const tokenHash = hashToken(refreshToken);
  const sessionIndex = user.sessions.findIndex((session) => (
    session.tokenHash === tokenHash && session.expiresAt && session.expiresAt > new Date()
  ));

  if (sessionIndex === -1) {
    user.sessions = [];
    await user.save();
    throw new ApiError(401, "REFRESH_TOKEN_REPLAYED", "Refresh token was reused or expired");
  }

  user.sessions.splice(sessionIndex, 1);
  const accessToken = await issueSession(user, req, res);

  return res.status(200).json(new ApiResponse("Access token refreshed", { accessToken, token: accessToken }));
});

exports.logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (refreshToken && req.user?.id) {
    await User.findByIdAndUpdate(req.user.id, {
      $pull: {
        sessions: {
          tokenHash: hashToken(refreshToken),
        },
      },
    });
  }

  res.clearCookie("refreshToken", refreshCookieOptions());
  res.clearCookie("token");
  return res.status(200).json(new ApiResponse("Logged out successfully"));
});

exports.changePassword = asyncHandler(async (req, res) => {
  const userDetails = await User.findById(req.user.id);
  const { oldPassword, newPassword, confirmNewPassword } = req.body;

  const isPasswordMatch = await bcrypt.compare(oldPassword, userDetails.password);
  if (!isPasswordMatch) {
    throw new ApiError(401, "OLD_PASSWORD_INCORRECT", "The old password is incorrect");
  }

  if (newPassword !== confirmNewPassword) {
    throw new ApiError(400, "PASSWORD_MISMATCH", "The password and confirm password do not match");
  }

  userDetails.password = await bcrypt.hash(newPassword, 12);
  userDetails.tokenVersion += 1;
  userDetails.sessions = [];
  await userDetails.save();

  try {
    await mailSender(
      userDetails.email,
      "Password changed successfully",
      passwordUpdate(userDetails.email, userDetails.firstName)
    );
  } catch (error) {
    console.error("Password change email failed", error);
  }

  return res.status(200).json(new ApiResponse("Password updated successfully"));
});

exports.listPendingRegistrations = asyncHandler(async (req, res) => {
  const users = await User.find({
    accountStatus: { $in: ["PENDING", "CORRECTION_REQUESTED"] },
  })
    .populate("additionalDetails")
    .sort({ createdAt: -1 });

  return res.status(200).json(new ApiResponse("Registration queue fetched", {
    users: users.map(publicUser),
  }));
});

exports.reviewRegistration = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { action, reason } = req.body;

  const statusByAction = {
    APPROVE: "ACTIVE",
    REJECT: "REJECTED",
    REQUEST_CORRECTION: "CORRECTION_REQUESTED",
  };
  const historyActionByAction = {
    APPROVE: "APPROVED",
    REJECT: "REJECTED",
    REQUEST_CORRECTION: "CORRECTION_REQUESTED",
  };

  if (!statusByAction[action]) {
    throw new ApiError(400, "INVALID_REVIEW_ACTION", "Review action must be APPROVE, REJECT, or REQUEST_CORRECTION");
  }

  const user = await User.findOne({
    _id: userId,
    accountStatus: { $in: ["PENDING", "CORRECTION_REQUESTED"] },
  });

  if (!user) {
    throw new ApiError(404, "REGISTRATION_NOT_REVIEWABLE", "Registration was not found or is not reviewable");
  }

  const previousStatus = user.accountStatus;
  user.accountStatus = statusByAction[action];
  user.approved = action === "APPROVE";
  if (action === "APPROVE" && (!user.roles || user.roles.length === 0)) {
    user.roles = ["MEMBER"];
  }
  user.reviewHistory.push({
    action: historyActionByAction[action],
    reason,
    reviewedBy: req.user.id,
  });
  await user.save();

  await logAudit({
    actor: req.user.id,
    action: `registration.${historyActionByAction[action].toLowerCase()}`,
    targetType: "user",
    target: user._id,
    oldValue: { accountStatus: previousStatus },
    newValue: { accountStatus: user.accountStatus },
    reason,
    req,
  });

  await notifyUser({
    recipient: user._id,
    title: "Registration review updated",
    message: `Your registration status is now ${user.accountStatus}.`,
    metadata: { accountStatus: user.accountStatus, reason },
    email: false,
  });

  return res.status(200).json(new ApiResponse("Registration reviewed successfully", {
    user: publicUser(user),
  }));
});

exports.getRegistrationDocument = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await User.findById(userId).populate("additionalDetails");
  if (!user) {
    throw new ApiError(404, "USER_NOT_FOUND", "Member was not found");
  }

  const identityDocument = user.additionalDetails?.identityDocument;
  if (!identityDocument?.publicId) {
    throw new ApiError(404, "DOCUMENT_NOT_FOUND", "No verification document was uploaded for this member");
  }

  // Generate a short-lived signed URL (5 minutes) for the private/authenticated Cloudinary asset
  const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 minutes
  const signedUrl = cloudinary.url(identityDocument.publicId, {
    type: "authenticated",
    sign_url: true,
    expires_at: expiresAt,
    resource_type: "image",
    secure: true,
  });

  return res.status(200).json(new ApiResponse("Document URL generated", {
    signedUrl,
    expiresIn: 300,
    documentMeta: {
      name: identityDocument.name || "Identity Document",
      mimeType: identityDocument.mimeType,
      size: identityDocument.size,
      uploadedAt: identityDocument.uploadedAt,
    },
  }));
});

exports.resubmitRegistration = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!email || !req.body.password) {
    throw new ApiError(400, "RESUBMIT_CREDENTIALS_REQUIRED", "Email and password are required to resubmit");
  }

  const user = await User.findOne({ email });

  if (!user || !["REJECTED", "CORRECTION_REQUESTED"].includes(user.accountStatus)) {
    throw new ApiError(400, "REGISTRATION_NOT_RESUBMITTABLE", "This registration cannot be resubmitted");
  }

  const passwordMatches = await bcrypt.compare(req.body.password, user.password);
  if (!passwordMatches) {
    throw new ApiError(401, "PASSWORD_INCORRECT", "Password is incorrect");
  }

  const profilePayload = buildProfilePayload(req.body);

  const docFile = req.files?.identityDocument || req.files?.document || req.files?.verificationDocument;
  if (docFile) {
    const docUpload = await uploadDocumentToCloudinary(docFile, "samaj/documents", true);
    profilePayload.identityDocument = assetMetadata(docUpload, docFile.name);
  }

  const photoFile = req.files?.photo || req.files?.profilePhoto || req.files?.displayPicture;
  if (photoFile) {
    const photoUpload = await uploadImageToCloudinary(photoFile, "samaj/profile", 1000, 1000);
    profilePayload.photo = assetMetadata(photoUpload, photoFile.name);
    user.imageUrl = photoUpload.secure_url;
  }

  await Profile.findByIdAndUpdate(user.additionalDetails, profilePayload, {
    new: true,
    runValidators: true,
  });

  user.accountStatus = "PENDING";
  user.approved = false;
  user.reviewHistory.push({
    action: "RESUBMITTED",
    reason: req.body.reason || "Applicant resubmitted registration with updated document",
  });
  await user.save();

  return res.status(200).json(new ApiResponse("Registration resubmitted successfully", {
    user: publicUser(user),
  }));
});
