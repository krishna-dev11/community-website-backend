const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const otpGenerator = require("otp-generator");
const cloudinary = require("cloudinary").v2;
const User = require("../Models/user");
const OTP = require("../Models/otpSchema");
const Profile = require("../Models/profile");
const Family = require("../Models/family");
const FamilyMembership = require("../Models/familyMembership");
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
const {
  normalizeIdentity,
  hashIdentity,
  createUniqueMemberId,
  checkDuplicateIdentity,
} = require("../Utilities/identityHelper");
const {
  sendContactOtp,
  verifyContactOtp,
} = require("../Utilities/contactVerificationService");
require("dotenv").config();

const ACCESS_TOKEN_TTL = "7d";
const REFRESH_TOKEN_DAYS = 7;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

function normalizeEmail(email) {
  return email ? String(email).trim().toLowerCase() : "";
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
  delete output.identityHash;
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

function generateFamilyCode() {
  return `FAM-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

async function createUniqueFamilyCode() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const familyCode = generateFamilyCode();
    const existing = await Family.exists({ familyCode });
    if (!existing) return familyCode;
  }
  return `FAM-${Date.now().toString(36).toUpperCase()}`;
}

function signAccessToken(user) {
  return jwt.sign(
    {
      userId: user._id,
      id: user._id,
      memberId: user.memberId,
      email: user.email,
      roles: user.roles,
      accountType: user.accountType,
      tokenVersion: user.tokenVersion,
      mustChangePassword: Boolean(user.mustChangePassword),
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

  user.sessions = user.sessions || [];
  user.sessions.push({
    tokenHash: hashToken(refreshToken),
    device: req.header("user-agent") || "unknown",
    ip: req.ip,
    expiresAt,
  });
  await user.save();

  res.cookie("refreshToken", refreshToken, refreshCookieOptions());
  res.cookie("token", accessToken, {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });

  return accessToken;
}

/**
 * Send OTP (supports email & future phone, with memberKey & sessionToken binding)
 */
exports.sendOTP = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const phone = req.body.phone ? String(req.body.phone).trim() : null;
  const channel = req.body.channel || (email ? "EMAIL" : "PHONE");
  const purpose = req.body.purpose || "REGISTRATION_CONTACT_VERIFICATION";
  const memberKey = req.body.memberKey || "head";
  const sessionToken = req.body.sessionToken || null;

  const contact = channel === "EMAIL" ? email : phone;
  if (!contact) {
    throw new ApiError(400, "CONTACT_REQUIRED", "Enter valid email or phone for verification");
  }

  // Legacy check: if checkUserPresent is true and single-user registration check requested
  if (req.body.checkUserPresent && !sessionToken && memberKey === "head") {
    // Only check if requested for single unlinked user
    const existing = await User.findOne({ email, family: { $exists: false } });
    if (existing) {
      throw new ApiError(409, "EMAIL_ALREADY_REGISTERED", "This email is already registered");
    }
  }

  const result = await sendContactOtp({
    contact,
    channel,
    purpose,
    memberKey,
    sessionToken,
  });

  return res.status(200).json(new ApiResponse(result.message, result));
});

/**
 * Verify OTP for a specific member draft and session
 */
exports.verifyOTP = asyncHandler(async (req, res) => {
  const { contact, email, phone, otp, purpose, memberKey, sessionToken } = req.body;
  const channel = req.body.channel || (email ? "EMAIL" : "PHONE");
  const contactAddress = contact || (channel === "EMAIL" ? email : phone);

  if (!contactAddress || !otp) {
    throw new ApiError(400, "OTP_FIELDS_REQUIRED", "Contact address and OTP are required");
  }

  const result = await verifyContactOtp({
    contact: contactAddress,
    channel,
    otp,
    purpose: purpose || "REGISTRATION_CONTACT_VERIFICATION",
    memberKey: memberKey || "head",
    sessionToken,
  });

  return res.status(200).json(new ApiResponse("Contact verified successfully", result));
});

/**
 * Family-Centric Member Registration
 * Allows registering a Family Head + Family Details + Multiple Family Members atomically
 */
exports.signUP = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    password,
    confirmPassword,
    otp,
    contactNumber,
    identityNumber,
    familyName,
    sssmId,
    state,
    currentCity,
    nativePlace,
    nomineeIndex,
    members: membersRaw,
    sessionToken,
  } = req.body;

  const email = normalizeEmail(req.body.email);

  // 1. Validate Family Head Basic Fields
  if (!firstName || !lastName || !email || !password || !confirmPassword || !otp) {
    throw new ApiError(400, "REGISTRATION_FIELDS_REQUIRED", "Enter all required Family Head details");
  }

  if (password !== confirmPassword) {
    throw new ApiError(400, "PASSWORD_MISMATCH", "Password and confirm password do not match");
  }

  // 2. Validate Family Head OTP
  const headOtpRecord = await OTP.findOne({
    $or: [{ email }, { sessionToken, memberKey: "head" }],
    otp: String(otp).trim(),
  }).sort({ createdAt: -1 });

  if (!headOtpRecord) {
    throw new ApiError(400, "OTP_INVALID", "Invalid or expired OTP for Family Head");
  }

  // 3. Duplicate Identity Check for Family Head
  if (identityNumber) {
    const isDuplicateHead = await checkDuplicateIdentity(identityNumber);
    if (isDuplicateHead) {
      throw new ApiError(
        409,
        "DUPLICATE_IDENTITY_DETECTED",
        "An existing membership record is associated with the submitted identity. Please use the existing member access/claim flow or contact the Samaj administration."
      );
    }
  }

  // 4. Parse Family Members if provided
  let membersList = [];
  if (membersRaw) {
    try {
      membersList = typeof membersRaw === "string" ? JSON.parse(membersRaw) : membersRaw;
    } catch {
      membersList = [];
    }
  }

  // 5. Pre-validate All Family Members (Identity Uniqueness, Temporary Passwords, Documents)
  const memberIdentityHashes = new Set();
  if (identityNumber) {
    memberIdentityHashes.add(hashIdentity(identityNumber));
  }

  for (let i = 0; i < membersList.length; i += 1) {
    const member = membersList[i];
    if (!member.firstName || !member.lastName) {
      throw new ApiError(400, "MEMBER_NAME_REQUIRED", `First and last name are required for member #${i + 1}`);
    }

    if (!member.temporaryPassword) {
      throw new ApiError(400, "MEMBER_PASSWORD_REQUIRED", `Temporary password is required for member #${i + 1}`);
    }

    // Check member identity
    if (member.identityNumber) {
      const memberHash = hashIdentity(member.identityNumber);
      if (memberIdentityHashes.has(memberHash)) {
        throw new ApiError(400, "DUPLICATE_IDENTITY_IN_APPLICATION", `Duplicate identity detected within family application for member #${i + 1}`);
      }
      memberIdentityHashes.add(memberHash);

      const isDuplicate = await checkDuplicateIdentity(member.identityNumber);
      if (isDuplicate) {
        throw new ApiError(
          409,
          "DUPLICATE_IDENTITY_DETECTED",
          "An existing membership record is associated with the submitted identity. Please use the existing member access/claim flow or contact the Samaj administration."
        );
      }
    }

    // Member Document verification: check if file exists
    const memberDocFile = req.files?.[`member_doc_${i}`];
    if (!memberDocFile) {
      throw new ApiError(400, "MEMBER_DOCUMENT_REQUIRED", `Verification document is required for family member #${i + 1} (${member.firstName})`);
    }
  }

  // 6. Handle Family Head Files
  const headDocFile = req.files?.identityDocument || req.files?.document || req.files?.verificationDocument;
  if (!headDocFile) {
    throw new ApiError(400, "HEAD_DOCUMENT_REQUIRED", "Family Head verification document is required");
  }

  const headDocUpload = await uploadDocumentToCloudinary(headDocFile, "samaj/documents", true);
  const headDocMeta = assetMetadata(headDocUpload, headDocFile.name);

  let headPhotoMeta = undefined;
  let uploadedHeadPhotoUrl = null;
  const headPhotoFile = req.files?.photo || req.files?.profilePhoto || req.files?.displayPicture;
  if (headPhotoFile) {
    const photoUpload = await uploadImageToCloudinary(headPhotoFile, "samaj/profile", 1000, 1000);
    headPhotoMeta = assetMetadata(photoUpload, headPhotoFile.name);
    uploadedHeadPhotoUrl = photoUpload.secure_url;
  }

  // 7. Hash Family Head Password
  const hashedHeadPassword = await bcrypt.hash(password, 12);
  const headMemberId = await createUniqueMemberId();
  const headIdentityHash = identityNumber ? hashIdentity(identityNumber) : null;

  // 8. Create Family Head Profile
  const headProfilePayload = buildProfilePayload(req.body);
  headProfilePayload.identityDocument = headDocMeta;
  if (headPhotoMeta) headProfilePayload.photo = headPhotoMeta;

  const headProfile = await Profile.create(headProfilePayload);

  // 9. Create Family Head User
  const headUser = await User.create({
    memberId: headMemberId,
    identityHash: headIdentityHash,
    firstName,
    lastName,
    email,
    password: hashedHeadPassword,
    accountType: "Member",
    roles: ["MEMBER"],
    accountStatus: "PENDING",
    approved: false,
    contactVerified: true,
    mustChangePassword: false,
    familyRole: "FAMILY_HEAD",
    imageUrl: uploadedHeadPhotoUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(`${firstName}-${lastName}`)}`,
    additionalDetails: headProfile._id,
    reviewHistory: [
      {
        action: "SUBMITTED",
        reason: "Family Head application submitted with verification documents",
      },
    ],
    documentVersions: [
      {
        ...headDocMeta,
        status: "PENDING",
      },
    ],
  });

  // 10. Create Family Record
  const createdFamily = await Family.create({
    familyName: familyName ? familyName.trim() : `${lastName} Family`,
    familyCode: await createUniqueFamilyCode(),
    sssmId: sssmId ? sssmId.trim() : `SSSM-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
    state: state ? state.trim().toUpperCase() : "MADHYA PRADESH",
    currentCity: currentCity || req.body.city || headProfilePayload.currentCity,
    nativePlace: nativePlace || headProfilePayload.nativePlace,
    createdBy: headUser._id,
    currentFamilyAdmin: headUser._id,
    currentHeadMemberId: headUser._id,
    verificationStatus: "UNDER_REVIEW",
    status: "ACTIVE",
    visibility: "PUBLIC",
    headHistory: [
      {
        head: headUser._id,
        from: new Date(),
        reason: "Family founded by Family Head",
      },
    ],
  });

  // Link family to Head User
  headUser.family = createdFamily._id;
  await headUser.save();

  // 11. Create FamilyMembership for Head
  await FamilyMembership.create({
    family: createdFamily._id,
    member: headUser._id,
    role: "FAMILY_ADMIN",
    relationship: "SELF",
    verificationStatus: "PENDING",
    status: "ACTIVE",
    verificationHistory: [
      {
        action: "SUBMITTED",
        reason: "Registered as Family Head",
        document: headDocMeta,
      },
    ],
  });

  // 12. Create Each Family Member
  const createdMembers = [];
  for (let i = 0; i < membersList.length; i += 1) {
    const memData = membersList[i];
    const memberDocFile = req.files[`member_doc_${i}`];
    const memberPhotoFile = req.files?.[`member_photo_${i}`];

    const memDocUpload = await uploadDocumentToCloudinary(memberDocFile, "samaj/documents", true);
    const memDocMeta = assetMetadata(memDocUpload, memberDocFile.name);

    let memPhotoMeta = undefined;
    let memPhotoUrl = null;
    if (memberPhotoFile) {
      const memPhotoUpload = await uploadImageToCloudinary(memberPhotoFile, "samaj/profile", 1000, 1000);
      memPhotoMeta = assetMetadata(memPhotoUpload, memberPhotoFile.name);
      memPhotoUrl = memPhotoUpload.secure_url;
    }

    const hashedMemberPassword = await bcrypt.hash(memData.temporaryPassword, 12);
    const memberId = await createUniqueMemberId();
    const memIdentityHash = memData.identityNumber ? hashIdentity(memData.identityNumber) : null;
    const memEmail = memData.email ? normalizeEmail(memData.email) : email;

    const memProfile = await Profile.create({
      gender: memData.gender || "MALE",
      dateOfBirth: memData.dateOfBirth || null,
      contactNumber: memData.contactNumber || contactNumber || null,
      nativePlace: memData.nativePlace || createdFamily.nativePlace,
      currentCity: memData.currentCity || createdFamily.currentCity,
      gotra: memData.gotra || headProfilePayload.gotra,
      education: memData.education || null,
      profession: memData.profession || null,
      address: memData.address || headProfilePayload.address,
      identityDocument: memDocMeta,
      photo: memPhotoMeta,
    });

    const memberUser = await User.create({
      memberId,
      identityHash: memIdentityHash,
      firstName: memData.firstName.trim(),
      lastName: memData.lastName.trim(),
      email: memEmail,
      password: hashedMemberPassword,
      accountType: "Member",
      roles: ["MEMBER"],
      accountStatus: "PENDING",
      approved: false,
      contactVerified: true,
      mustChangePassword: true, // Forces password change on first login!
      family: createdFamily._id,
      familyRole: "MEMBER",
      imageUrl: memPhotoUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(`${memData.firstName}-${memData.lastName}`)}`,
      additionalDetails: memProfile._id,
      reviewHistory: [
        {
          action: "SUBMITTED",
          reason: `Added as ${memData.relationship || "family member"} during family registration`,
        },
      ],
      documentVersions: [
        {
          ...memDocMeta,
          status: "PENDING",
        },
      ],
    });

    await FamilyMembership.create({
      family: createdFamily._id,
      member: memberUser._id,
      role: "FAMILY_MEMBER",
      relationship: (memData.relationship || "OTHER").toUpperCase(),
      verificationStatus: "PENDING",
      status: "ACTIVE",
      verificationHistory: [
        {
          action: "SUBMITTED",
          reason: `Added as ${memData.relationship} during registration`,
          document: memDocMeta,
        },
      ],
    });

    createdMembers.push({
      memberId: memberUser.memberId,
      name: `${memberUser.firstName} ${memberUser.lastName}`,
      relationship: memData.relationship,
      _id: memberUser._id,
    });

    // Check if this member was nominated as successor
    if (nomineeIndex !== undefined && Number(nomineeIndex) === i) {
      createdFamily.successorMemberId = memberUser._id;
      await createdFamily.save();
    }
  }

  // 13. Audit Log
  await logAudit({
    actor: headUser._id,
    action: "family.application_submitted",
    targetType: "family",
    target: createdFamily._id,
    newValue: {
      familyName: createdFamily.familyName,
      familyCode: createdFamily.familyCode,
      totalMembers: 1 + createdMembers.length,
      headMemberId: headUser.memberId,
    },
    req,
  });

  return res.status(201).json(
    new ApiResponse("Family registration application submitted successfully", {
      family: createdFamily,
      head: {
        memberId: headUser.memberId,
        firstName: headUser.firstName,
        lastName: headUser.lastName,
        email: headUser.email,
        accountStatus: headUser.accountStatus,
      },
      members: createdMembers,
      totalMembers: 1 + createdMembers.length,
      status: createdFamily.verificationStatus,
    })
  );
});

/**
 * Login - Supports both Email and permanent Member ID (SMJ-XXXXXX)
 * Detects multiple accounts sharing an email and prompts for Member ID
 * Enforces forced password change when mustChangePassword === true
 */
exports.login = asyncHandler(async (req, res) => {
  const identifier = req.body.email || req.body.memberId || req.body.identifier;
  const { password } = req.body;

  if (!identifier || !password) {
    throw new ApiError(400, "LOGIN_FIELDS_REQUIRED", "Enter Member ID or Email and password");
  }

  const trimmedIdentifier = String(identifier).trim();
  let user = null;

  // 1. Check if identifier is a Member ID (starts with SMJ-)
  if (/^SMJ-[A-Z0-9]+$/i.test(trimmedIdentifier)) {
    user = await User.findOne({
      memberId: trimmedIdentifier.toUpperCase(),
    }).populate("additionalDetails family");
  } else {
    // 2. Lookup by email
    const normalizedEmail = normalizeEmail(trimmedIdentifier);
    const matchingUsers = await User.find({ email: normalizedEmail }).populate("additionalDetails family");

    if (matchingUsers.length === 1) {
      user = matchingUsers[0];
    } else if (matchingUsers.length > 1) {
      // Ambiguous email shared by multiple family members
      throw new ApiError(
        400,
        "AMBIGUOUS_EMAIL_LOGIN",
        "Multiple accounts share this email address. Please log in using your unique Member ID (e.g. SMJ-XXXXXX)."
      );
    }
  }

  if (!user) {
    throw new ApiError(404, "USER_NOT_FOUND", "No account found matching the given identifier");
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new ApiError(423, "ACCOUNT_LOCKED", "Too many failed attempts. Try again later");
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= MAX_FAILED_LOGINS) {
      user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
    }
    await user.save();
    throw new ApiError(401, "PASSWORD_INCORRECT", "Password is incorrect");
  }

  if (!user.active || ["SUSPENDED", "DEACTIVATED"].includes(user.accountStatus)) {
    throw new ApiError(403, "ACCOUNT_INACTIVE", "This account is not active");
  }

  // If user has not changed their temporary password, issue session but flag mustChangePassword
  const mustChangePassword = Boolean(user.mustChangePassword);

  // If account is under review and not forced password change, inform the applicant
  if (["PENDING", "CORRECTION_REQUESTED", "REJECTED"].includes(user.accountStatus) && !mustChangePassword) {
    throw new ApiError(403, `ACCOUNT_${user.accountStatus}`, "Your registration application is under committee review", {
      accountStatus: user.accountStatus,
      memberId: user.memberId,
      latestReview: user.reviewHistory?.[user.reviewHistory.length - 1] || null,
    });
  }

  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  const accessToken = await issueSession(user, req, res);

  return res.status(200).json(
    new ApiResponse("User logged in successfully", {
      token: accessToken,
      accessToken,
      user: {
        ...publicUser(user),
        mustChangePassword,
      },
      mustChangePassword,
    })
  );
});

/**
 * Change Password - Clears mustChangePassword upon successful change
 */
exports.changePassword = asyncHandler(async (req, res) => {
  const userDetails = await User.findById(req.user.id);
  const { oldPassword, newPassword, confirmNewPassword } = req.body;

  if (!oldPassword || !newPassword || !confirmNewPassword) {
    throw new ApiError(400, "FIELDS_REQUIRED", "Enter current password and new password");
  }

  const isPasswordMatch = await bcrypt.compare(oldPassword, userDetails.password);
  if (!isPasswordMatch) {
    throw new ApiError(401, "OLD_PASSWORD_INCORRECT", "The current password is incorrect");
  }

  if (newPassword !== confirmNewPassword) {
    throw new ApiError(400, "PASSWORD_MISMATCH", "The new password and confirm password do not match");
  }

  userDetails.password = await bcrypt.hash(newPassword, 12);
  userDetails.mustChangePassword = false;
  userDetails.tokenVersion = (userDetails.tokenVersion || 0) + 1;
  userDetails.sessions = [];
  await userDetails.save();

  await logAudit({
    actor: userDetails._id,
    action: "user.password_changed",
    targetType: "user",
    target: userDetails._id,
    req,
  });

  try {
    if (userDetails.email) {
      await mailSender(
        userDetails.email,
        "Password changed successfully",
        passwordUpdate(userDetails.email, userDetails.firstName)
      );
    }
  } catch (error) {
    console.error("Password change email failed:", error.message);
  }

  return res.status(200).json(new ApiResponse("Password updated successfully. Please continue."));
});

/**
 * Claim Profile: Step 1 - Request OTP using Member ID or Identity Number
 */
exports.claimProfileRequestOtp = asyncHandler(async (req, res) => {
  const { memberId, identityNumber } = req.body;

  if (!memberId && !identityNumber) {
    throw new ApiError(400, "IDENTIFIER_REQUIRED", "Member ID or Identity Number is required");
  }

  const query = {};
  if (memberId) {
    query.memberId = String(memberId).trim().toUpperCase();
  } else {
    query.identityHash = hashIdentity(identityNumber);
  }

  const user = await User.findOne(query).populate("additionalDetails");
  if (!user) {
    // Return generic safe response without leaking whether record exists
    return res.status(200).json(
      new ApiResponse(
        "If a matching membership record is found, a verification code will be sent to the registered contact."
      )
    );
  }

  const contact = user.email || user.additionalDetails?.contactNumber;
  if (!contact) {
    throw new ApiError(400, "NO_REGISTERED_CONTACT", "No contact details on file. Please contact Samaj administration.");
  }

  const channel = user.email ? "EMAIL" : "PHONE";
  const sessionToken = crypto.randomUUID();

  await sendContactOtp({
    contact,
    channel,
    purpose: "ACCOUNT_CLAIM",
    memberKey: String(user._id),
    sessionToken,
  });

  // Mask contact for security
  const maskedContact =
    channel === "EMAIL"
      ? contact.replace(/^(.{2})(.*)(@.*)$/, (_, a, b, c) => `${a}***${c}`)
      : contact.slice(-4).padStart(contact.length, "*");

  return res.status(200).json(
    new ApiResponse(`Verification code sent to registered contact (${maskedContact})`, {
      sessionToken,
      memberKey: String(user._id),
      channel,
      maskedContact,
    })
  );
});

/**
 * Claim Profile: Step 2 - Verify OTP and Set Private Password
 */
exports.claimProfileVerify = asyncHandler(async (req, res) => {
  const { memberKey, sessionToken, otp, newPassword, confirmNewPassword } = req.body;

  if (!memberKey || !sessionToken || !otp || !newPassword || !confirmNewPassword) {
    throw new ApiError(400, "CLAIM_FIELDS_REQUIRED", "Enter all required verification details");
  }

  if (newPassword !== confirmNewPassword) {
    throw new ApiError(400, "PASSWORD_MISMATCH", "New password and confirm password do not match");
  }

  const user = await User.findById(memberKey).populate("additionalDetails");
  if (!user) {
    throw new ApiError(404, "USER_NOT_FOUND", "Member record was not found");
  }

  const contact = user.email || user.additionalDetails?.contactNumber;
  const channel = user.email ? "EMAIL" : "PHONE";

  await verifyContactOtp({
    contact,
    channel,
    otp,
    purpose: "ACCOUNT_CLAIM",
    memberKey,
    sessionToken,
  });

  // Update password & mark claimed
  user.password = await bcrypt.hash(newPassword, 12);
  user.mustChangePassword = false;
  user.contactVerified = true;
  user.accountStatus = "ACTIVE";
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.sessions = [];
  await user.save();

  await logAudit({
    actor: user._id,
    action: "user.profile_claimed",
    targetType: "user",
    target: user._id,
    req,
  });

  const accessToken = await issueSession(user, req, res);

  return res.status(200).json(
    new ApiResponse("Profile successfully claimed! You are now logged in.", {
      token: accessToken,
      accessToken,
      user: publicUser(user),
    })
  );
});

/**
 * Admin: List Pending Registrations with Family Grouping
 */
exports.listPendingRegistrations = asyncHandler(async (req, res) => {
  const users = await User.find({
    accountStatus: { $in: ["PENDING", "CORRECTION_REQUESTED"] },
  })
    .populate("additionalDetails")
    .populate("family")
    .sort({ createdAt: -1 });

  // Also fetch families under review
  const pendingFamilies = await Family.find({
    verificationStatus: { $in: ["UNDER_REVIEW", "PARTIALLY_VERIFIED", "ACTION_REQUIRED"] },
    isArchived: false,
  })
    .populate("currentHeadMemberId", "firstName lastName email imageUrl memberId")
    .populate("currentFamilyAdmin", "firstName lastName email imageUrl memberId")
    .sort({ createdAt: -1 });

  // Map memberships for each family
  const familyApplications = [];
  for (const fam of pendingFamilies) {
    const memberships = await FamilyMembership.find({ family: fam._id, status: "ACTIVE" })
      .populate({
        path: "member",
        populate: { path: "additionalDetails" },
      })
      .sort({ role: 1, createdAt: 1 });

    const total = memberships.length;
    const approved = memberships.filter((m) => m.verificationStatus === "APPROVED").length;
    const rejected = memberships.filter((m) => m.verificationStatus === "REJECTED").length;
    const pending = total - approved - rejected;

    familyApplications.push({
      family: fam,
      memberships,
      stats: { total, approved, rejected, pending },
    });
  }

  return res.status(200).json(
    new ApiResponse("Registration queue fetched", {
      users: users.map(publicUser),
      familyApplications,
    })
  );
});

/**
 * Admin: Review Registration / Family Member
 * Supports Partial Family Approval: individual approval/rejection with mandatory rejection reason
 */
exports.reviewRegistration = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { action, reason, category, affectedField, correctionRequired } = req.body;

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

  if ((action === "REJECT" || action === "REQUEST_CORRECTION") && (!reason || !String(reason).trim())) {
    throw new ApiError(400, "REJECTION_REASON_REQUIRED", "A detailed reason is mandatory when rejecting or requesting correction");
  }

  const user = await User.findOne({
    _id: userId,
    accountStatus: { $in: ["PENDING", "CORRECTION_REQUESTED", "REJECTED"] },
  }).populate("family");

  if (!user) {
    throw new ApiError(404, "REGISTRATION_NOT_REVIEWABLE", "Registration was not found or is not reviewable");
  }

  const previousStatus = user.accountStatus;
  user.accountStatus = statusByAction[action];
  user.approved = action === "APPROVE";
  if (action === "APPROVE") {
    user.membershipStatus = "ACTIVE";
    if (!user.roles || user.roles.length === 0) {
      user.roles = ["MEMBER"];
    }
  }

  user.reviewHistory = user.reviewHistory || [];
  user.reviewHistory.push({
    action: historyActionByAction[action],
    reason: String(reason || "").trim(),
    reviewedBy: req.user.id,
    reviewedAt: new Date(),
  });

  // Update latest document version status
  if (user.documentVersions && user.documentVersions.length > 0) {
    const latestDoc = user.documentVersions[user.documentVersions.length - 1];
    latestDoc.status = historyActionByAction[action];
    latestDoc.rejectionReason = reason || undefined;
    latestDoc.reviewedBy = req.user.id;
    latestDoc.reviewedAt = new Date();
  }

  await user.save();

  // Update FamilyMembership if user is linked to a family
  let familyRecord = null;
  if (user.family) {
    const famId = user.family._id || user.family;
    familyRecord = await Family.findById(famId);
    const membership = await FamilyMembership.findOne({ family: famId, member: user._id });

    if (membership) {
      membership.verificationStatus =
        action === "APPROVE"
          ? "APPROVED"
          : action === "REJECT"
          ? "REJECTED"
          : "REQUIRES_CORRECTION";
      membership.rejectionReason = reason || null;
      membership.rejectionCategory = category || (action === "APPROVE" ? null : "Document/Verification Issue");
      membership.affectedField = affectedField || null;
      membership.correctionRequired = correctionRequired || null;

      membership.verificationHistory = membership.verificationHistory || [];
      membership.verificationHistory.push({
        action: historyActionByAction[action],
        reason,
        category,
        affectedField,
        correctionRequired,
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
      });
      await membership.save();
    }

    // Recalculate Family verification status
    const allMemberships = await FamilyMembership.find({ family: famId, status: "ACTIVE" });
    const hasRejected = allMemberships.some((m) => ["REJECTED", "REQUIRES_CORRECTION"].includes(m.verificationStatus));
    const hasPending = allMemberships.some((m) => ["PENDING", "RESUBMISSION_PENDING", "UNDER_REVIEW"].includes(m.verificationStatus));
    const allApproved = allMemberships.every((m) => ["APPROVED", "VERIFIED"].includes(m.verificationStatus));

    let newFamilyStatus = "UNDER_REVIEW";
    if (allApproved) {
      newFamilyStatus = "VERIFIED";
    } else if (hasRejected) {
      newFamilyStatus = "ACTION_REQUIRED";
    } else if (hasPending) {
      newFamilyStatus = "UNDER_REVIEW";
    }

    await Family.findByIdAndUpdate(famId, { verificationStatus: newFamilyStatus });
  }

  await logAudit({
    actor: req.user.id,
    action: `registration.${historyActionByAction[action].toLowerCase()}`,
    targetType: "user",
    target: user._id,
    oldValue: { accountStatus: previousStatus },
    newValue: { accountStatus: user.accountStatus },
    reason,
    metadata: { category, affectedField, correctionRequired },
    req,
  });

  // Notify member
  await notifyUser({
    recipient: user._id,
    title: action === "APPROVE" ? "Membership Verified" : "Registration Review Update",
    message: action === "APPROVE"
      ? "Congratulations! Your Samaj membership has been verified and activated."
      : `Your registration review status is ${user.accountStatus}. Reason: ${reason || "Action required"}`,
    metadata: { accountStatus: user.accountStatus, reason, category },
    email: false,
  });

  // Notify Family Head if different person
  if (familyRecord) {
    const headId = familyRecord.currentHeadMemberId || familyRecord.currentFamilyAdmin;
    if (headId && String(headId) !== String(user._id)) {
      await notifyUser({
        recipient: headId,
        title: action === "APPROVE" ? "Family Member Verified" : "Family Member Requires Correction",
        message: action === "APPROVE"
          ? `${user.firstName} ${user.lastName}'s membership has been verified.`
          : `${user.firstName} ${user.lastName}'s verification requires correction: ${reason}. Please review and resubmit.`,
        link: "/dashboard/family-hub",
        metadata: { memberId: user._id, memberName: `${user.firstName} ${user.lastName}`, reason, category },
        email: false,
      });
    }
  }

  return res.status(200).json(
    new ApiResponse("Registration reviewed successfully", {
      user: publicUser(user),
    })
  );
});

/**
 * Admin: Get signed document URL for verification
 */
exports.getRegistrationDocument = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await User.findById(userId).populate("additionalDetails");
  if (!user) {
    throw new ApiError(404, "USER_NOT_FOUND", "Member was not found");
  }

  const identityDocument = user.additionalDetails?.identityDocument;
  if (!identityDocument?.publicId) {
    // Check if directly on documentVersions
    if (user.documentVersions && user.documentVersions.length > 0) {
      const doc = user.documentVersions[user.documentVersions.length - 1];
      if (doc.url) {
        return res.status(200).json(
          new ApiResponse("Document URL generated", {
            signedUrl: doc.url,
            expiresIn: 300,
            documentMeta: {
              name: doc.name || "Identity Document",
              mimeType: doc.mimeType,
              size: doc.size,
              uploadedAt: doc.uploadedAt,
            },
          })
        );
      }
    }
    throw new ApiError(404, "DOCUMENT_NOT_FOUND", "No verification document was uploaded for this member");
  }

  const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 minutes
  const signedUrl = cloudinary.url(identityDocument.publicId, {
    type: "authenticated",
    sign_url: true,
    expires_at: expiresAt,
    resource_type: "image",
    secure: true,
  });

  return res.status(200).json(
    new ApiResponse("Document URL generated", {
      signedUrl: signedUrl || identityDocument.url,
      expiresIn: 300,
      documentMeta: {
        name: identityDocument.name || "Identity Document",
        mimeType: identityDocument.mimeType,
        size: identityDocument.size,
        uploadedAt: identityDocument.uploadedAt,
      },
    })
  );
});

/**
 * Resubmit Registration with Replacement Document
 */
exports.resubmitRegistration = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const identifier = req.body.memberId || email;

  if (!identifier || !req.body.password) {
    throw new ApiError(400, "RESUBMIT_CREDENTIALS_REQUIRED", "Member ID/Email and password are required to resubmit");
  }

  const query = /^SMJ-[A-Z0-9]+$/i.test(identifier)
    ? { memberId: identifier.toUpperCase() }
    : { email: normalizeEmail(identifier) };

  const user = await User.findOne(query);

  if (!user || !["REJECTED", "CORRECTION_REQUESTED"].includes(user.accountStatus)) {
    throw new ApiError(400, "REGISTRATION_NOT_RESUBMITTABLE", "This registration cannot be resubmitted");
  }

  const passwordMatches = await bcrypt.compare(req.body.password, user.password);
  if (!passwordMatches) {
    throw new ApiError(401, "PASSWORD_INCORRECT", "Password is incorrect");
  }

  const profilePayload = buildProfilePayload(req.body);

  const docFile = req.files?.identityDocument || req.files?.document || req.files?.verificationDocument;
  let newDocMeta = null;
  if (docFile) {
    const docUpload = await uploadDocumentToCloudinary(docFile, "samaj/documents", true);
    newDocMeta = assetMetadata(docUpload, docFile.name);
    profilePayload.identityDocument = newDocMeta;
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
  user.reviewHistory = user.reviewHistory || [];
  user.reviewHistory.push({
    action: "RESUBMITTED",
    reason: req.body.reason || "Applicant resubmitted registration with updated document",
  });

  if (newDocMeta) {
    user.documentVersions = user.documentVersions || [];
    user.documentVersions.push({
      ...newDocMeta,
      status: "RESUBMITTED",
    });
  }

  await user.save();

  if (user.family) {
    await FamilyMembership.findOneAndUpdate(
      { family: user.family, member: user._id },
      { verificationStatus: "RESUBMISSION_PENDING", rejectionReason: null }
    );
    await Family.findByIdAndUpdate(user.family, { verificationStatus: "UNDER_REVIEW" });
  }

  return res.status(200).json(
    new ApiResponse("Registration resubmitted successfully. Awaiting committee review.", {
      user: publicUser(user),
    })
  );
});

/**
 * Token Refresh
 */
exports.refreshAccessToken = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) {
    throw new ApiError(401, "REFRESH_TOKEN_MISSING", "Refresh token is missing");
  }

  let payload;
  try {
    payload = jwt.verify(refreshToken, getRefreshSecret());
  } catch {
    throw new ApiError(401, "REFRESH_TOKEN_INVALID", "Refresh token is invalid");
  }

  const user = await User.findById(payload.userId);
  if (!user || user.tokenVersion !== payload.tokenVersion || user.accountStatus !== "ACTIVE") {
    throw new ApiError(401, "REFRESH_TOKEN_REVOKED", "Refresh token is no longer valid");
  }

  const tokenHash = hashToken(refreshToken);
  const sessionIndex = user.sessions.findIndex(
    (session) => session.tokenHash === tokenHash && session.expiresAt && session.expiresAt > new Date()
  );

  if (sessionIndex === -1) {
    user.sessions = [];
    await user.save();
    throw new ApiError(401, "REFRESH_TOKEN_REPLAYED", "Refresh token was reused or expired");
  }

  user.sessions.splice(sessionIndex, 1);
  const accessToken = await issueSession(user, req, res);

  return res.status(200).json(new ApiResponse("Access token refreshed", { accessToken, token: accessToken }));
});

/**
 * Logout
 */
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
