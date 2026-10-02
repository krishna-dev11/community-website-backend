const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const Family = require("../Models/family");
const FamilyMembership = require("../Models/familyMembership");
const FamilyJoinRequest = require("../Models/familyJoinRequest");
const FamilyMemberNode = require("../Models/familyMemberNode");
const FamilyLifecycleRequest = require("../Models/familyLifecycleRequest");
const User = require("../Models/user");
const Profile = require("../Models/profile");
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

function generateFamilyCode() {
  return `FAM-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

async function createUniqueFamilyCode() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const familyCode = generateFamilyCode();
    const existing = await Family.exists({ familyCode });
    if (!existing) return familyCode;
  }

  throw new ApiError(500, "FAMILY_CODE_GENERATION_FAILED", "Could not generate a unique family code");
}

async function requireFamilyAdmin(userId, familyId) {
  const membership = await FamilyMembership.findOne({
    family: familyId,
    member: userId,
    role: "FAMILY_ADMIN",
    status: "ACTIVE",
  });

  if (!membership) {
    throw new ApiError(403, "FAMILY_ADMIN_REQUIRED", "Only the family admin can perform this action");
  }

  return membership;
}

exports.createFamily = asyncHandler(async (req, res) => {
  const { familyName, sssmId, state, currentCity, nativePlace, visibility } = req.body;
  const userId = req.user.id;

  if (!familyName || !sssmId || !state) {
    throw new ApiError(400, "FAMILY_FIELDS_REQUIRED", "Family name, SSSM ID, and state are required");
  }

  const existingMembership = await FamilyMembership.findOne({
    member: userId,
    status: "ACTIVE",
  });

  if (existingMembership) {
    throw new ApiError(409, "ALREADY_IN_FAMILY", "You already belong to an active family");
  }

  const familyCode = await createUniqueFamilyCode();
  const family = await Family.create({
    familyName,
    familyCode,
    sssmId,
    state,
    currentCity,
    nativePlace,
    visibility,
    createdBy: userId,
    currentFamilyAdmin: userId,
    currentHeadMemberId: userId,
    verificationStatus: "UNDER_REVIEW",
  });

  await FamilyMembership.create({
    family: family._id,
    member: userId,
    role: "FAMILY_ADMIN",
    relationship: "SELF",
    verificationStatus: "PENDING",
  });

  await User.findByIdAndUpdate(userId, { family: family._id, familyRole: "FAMILY_HEAD" });

  await logAudit({
    actor: userId,
    action: "family.created",
    targetType: "family",
    target: family._id,
    newValue: {
      familyName: family.familyName,
      familyCode: family.familyCode,
      sssmId: family.sssmId,
      state: family.state,
    },
    req,
  });

  return res.status(201).json(new ApiResponse("Family created successfully", { family }));
});

exports.getMyFamily = asyncHandler(async (req, res) => {
  const membership = await FamilyMembership.findOne({
    member: req.user.id,
    status: "ACTIVE",
  }).populate({
    path: "family",
    populate: [
      { path: "currentHeadMemberId", select: "firstName lastName email imageUrl memberId" },
      { path: "successorMemberId", select: "firstName lastName email imageUrl memberId" },
    ],
  });

  if (!membership || !membership.family) {
    return res.status(200).json(
      new ApiResponse("No active family found", {
        family: null,
        membership: null,
        members: [],
        stats: null,
      })
    );
  }

  const members = await FamilyMembership.find({
    family: membership.family._id,
    status: "ACTIVE",
  })
    .populate({
      path: "member",
      select: "firstName lastName email imageUrl accountStatus memberId familyRole documentVersions additionalDetails isDeceased",
      populate: { path: "additionalDetails" },
    })
    .sort({ role: 1, joinedAt: 1 });

  const totalMembers = members.length;
  const verifiedMembers = members.filter((m) => m.verificationStatus === "APPROVED").length;
  const pendingMembers = members.filter((m) =>
    ["PENDING", "RESUBMISSION_PENDING"].includes(m.verificationStatus)
  ).length;
  const rejectedMembers = members.filter((m) => m.verificationStatus === "REJECTED").length;

  return res.status(200).json(
    new ApiResponse("Family fetched successfully", {
      family: membership.family,
      membership,
      members,
      stats: {
        totalMembers,
        verifiedMembers,
        pendingMembers,
        rejectedMembers,
      },
    })
  );
});

exports.searchFamilies = asyncHandler(async (req, res) => {
  const { familyCode, sssmId, state, q } = req.query;
  const filter = {
    isArchived: false,
    status: { $ne: "ARCHIVED" },
  };

  if (familyCode) filter.familyCode = String(familyCode).trim().toUpperCase();
  if (sssmId) filter.sssmId = String(sssmId).trim();
  if (state) filter.state = String(state).trim().toUpperCase();
  if (q) filter.$text = { $search: String(q).trim() };

  if (!familyCode && !sssmId && !q) {
    throw new ApiError(400, "SEARCH_TERM_REQUIRED", "Search by family code, SSSM ID, or text query");
  }

  const families = await Family.find(filter)
    .select("familyName familyCode sssmId state currentCity nativePlace currentFamilyAdmin currentHeadMemberId visibility verificationStatus")
    .populate("currentFamilyAdmin", "firstName lastName imageUrl memberId")
    .limit(20)
    .sort({ createdAt: -1 });

  return res.status(200).json(new ApiResponse("Families fetched successfully", { families }));
});

exports.requestToJoinFamily = asyncHandler(async (req, res) => {
  const { familyId } = req.params;
  const { message } = req.body;
  const userId = req.user.id;

  const family = await Family.findOne({
    _id: familyId,
    isArchived: false,
    status: { $ne: "ARCHIVED" },
  });

  if (!family) {
    throw new ApiError(404, "FAMILY_NOT_FOUND", "Family was not found or is no longer active");
  }

  const activeMembership = await FamilyMembership.findOne({
    member: userId,
    status: "ACTIVE",
  });

  if (activeMembership) {
    throw new ApiError(409, "ALREADY_IN_FAMILY", "You already belong to an active family");
  }

  const joinRequest = await FamilyJoinRequest.create({
    family: familyId,
    requestedBy: userId,
    message,
  });

  await notifyUser({
    recipient: family.currentFamilyAdmin,
    title: "New family join request",
    message: "A member has requested to join your family.",
    metadata: { family: familyId, joinRequest: joinRequest._id },
  });

  await logAudit({
    actor: userId,
    action: "family.join_request.created",
    targetType: "familyJoinRequest",
    target: joinRequest._id,
    newValue: { family: familyId, requestedBy: userId },
    req,
  });

  return res.status(201).json(new ApiResponse("Family join request submitted", { joinRequest }));
});

exports.listFamilyJoinRequests = asyncHandler(async (req, res) => {
  const { familyId } = req.params;

  await requireFamilyAdmin(req.user.id, familyId);

  const joinRequests = await FamilyJoinRequest.find({
    family: familyId,
    status: "PENDING",
  })
    .populate({
      path: "requestedBy",
      select: "firstName lastName email imageUrl additionalDetails memberId",
      populate: { path: "additionalDetails" },
    })
    .sort({ createdAt: 1 });

  return res.status(200).json(new ApiResponse("Join requests fetched successfully", { joinRequests }));
});

exports.reviewFamilyJoinRequest = asyncHandler(async (req, res) => {
  const { familyId, requestId } = req.params;
  const { action, reviewMessage } = req.body;

  await requireFamilyAdmin(req.user.id, familyId);

  if (!["APPROVE", "REJECT"].includes(action)) {
    throw new ApiError(400, "INVALID_JOIN_REVIEW_ACTION", "Action must be APPROVE or REJECT");
  }

  const joinRequest = await FamilyJoinRequest.findOneAndUpdate(
    {
      _id: requestId,
      family: familyId,
      status: "PENDING",
    },
    {
      status: action === "APPROVE" ? "APPROVED" : "REJECTED",
      reviewedBy: req.user.id,
      reviewedAt: new Date(),
      reviewMessage,
    },
    { new: true }
  );

  if (!joinRequest) {
    throw new ApiError(404, "JOIN_REQUEST_NOT_REVIEWABLE", "Join request was not found or was already reviewed");
  }

  if (action === "APPROVE") {
    const activeMembership = await FamilyMembership.findOne({
      member: joinRequest.requestedBy,
      status: "ACTIVE",
    });

    if (activeMembership) {
      joinRequest.status = "REJECTED";
      joinRequest.reviewMessage = "Member already belongs to another active family";
      await joinRequest.save();
      throw new ApiError(409, "REQUESTER_ALREADY_IN_FAMILY", "Member already belongs to another active family");
    }

    await FamilyMembership.create({
      family: familyId,
      member: joinRequest.requestedBy,
      role: "FAMILY_MEMBER",
      relationship: "OTHER",
      verificationStatus: "PENDING",
    });

    await User.findByIdAndUpdate(joinRequest.requestedBy, { family: familyId });
  }

  await notifyUser({
    recipient: joinRequest.requestedBy,
    title: "Family join request reviewed",
    message: `Your family join request was ${joinRequest.status.toLowerCase()}.`,
    metadata: { family: familyId, joinRequest: joinRequest._id, status: joinRequest.status },
  });

  await logAudit({
    actor: req.user.id,
    action: `family.join_request.${joinRequest.status.toLowerCase()}`,
    targetType: "familyJoinRequest",
    target: joinRequest._id,
    newValue: { status: joinRequest.status, family: familyId },
    reason: reviewMessage,
    req,
  });

  return res.status(200).json(new ApiResponse("Join request reviewed successfully", { joinRequest }));
});

exports.transferFamilyAdmin = asyncHandler(async (req, res) => {
  const { familyId } = req.params;
  const { memberId } = req.body;

  if (!memberId) {
    throw new ApiError(400, "MEMBER_REQUIRED", "Member id is required");
  }

  await requireFamilyAdmin(req.user.id, familyId);

  const targetMembership = await FamilyMembership.findOne({
    family: familyId,
    member: memberId,
    status: "ACTIVE",
  });

  if (!targetMembership) {
    throw new ApiError(404, "FAMILY_MEMBER_NOT_FOUND", "Target member is not active in this family");
  }

  await FamilyMembership.updateOne(
    { family: familyId, member: req.user.id, status: "ACTIVE" },
    { role: "FAMILY_MEMBER" }
  );
  targetMembership.role = "FAMILY_ADMIN";
  await targetMembership.save();

  await Family.findByIdAndUpdate(familyId, {
    currentFamilyAdmin: memberId,
    currentHeadMemberId: memberId,
    status: "ACTIVE",
  });

  await notifyUser({
    recipient: memberId,
    title: "Family admin role assigned",
    message: "You are now the family admin.",
    metadata: { family: familyId },
  });

  await logAudit({
    actor: req.user.id,
    action: "family.admin.transferred",
    targetType: "family",
    target: familyId,
    oldValue: { currentFamilyAdmin: req.user.id },
    newValue: { currentFamilyAdmin: memberId },
    req,
  });

  return res.status(200).json(new ApiResponse("Family admin transferred successfully"));
});

/**
 * Add an individual family member to an existing verified family
 * (Must be submitted by Family Admin, goes into PENDING for Admin verification)
 */
exports.addFamilyMemberToExistingFamily = asyncHandler(async (req, res) => {
  const { familyId } = req.params;
  const {
    firstName,
    lastName,
    relationship,
    dateOfBirth,
    gender,
    contactNumber,
    email,
    temporaryPassword,
    identityNumber,
    profession,
    education,
    gotra,
    address,
    nativePlace,
    currentCity,
    isMinor: isMinorInput,
    guardianRelationship,
  } = req.body;

  await requireFamilyAdmin(req.user.id, familyId);

  const isMinor = isMinorInput === "true" || isMinorInput === true;

  if (!firstName || !lastName || !relationship) {
    throw new ApiError(400, "FIELDS_REQUIRED", "First name, last name, and relationship are required");
  }

  let finalTemporaryPassword = temporaryPassword;
  if (!finalTemporaryPassword) {
    if (isMinor) {
      finalTemporaryPassword = `Minor@${crypto.randomBytes(3).toString("hex")}`;
    } else {
      throw new ApiError(400, "PASSWORD_REQUIRED", "Temporary password is required for member account setup");
    }
  }

  // Duplicate identity check
  if (identityNumber) {
    const isDuplicate = await checkDuplicateIdentity(identityNumber);
    if (isDuplicate) {
      throw new ApiError(
        409,
        "DUPLICATE_IDENTITY_DETECTED",
        "An existing membership record is associated with the submitted identity. Please use the existing member access/claim flow or contact the Samaj administration."
      );
    }
  }

  // File attachments
  const docFile = req.files?.identityDocument || req.files?.document;
  if (!docFile) {
    throw new ApiError(400, "DOCUMENT_REQUIRED", "Verification document (Aadhaar or Birth Certificate) is required for this member");
  }

  const docUpload = await uploadDocumentToCloudinary(docFile, "samaj/documents", true);
  const docMeta = assetMetadata(docUpload, docFile.name);

  let photoMeta = undefined;
  let photoUrl = null;
  const photoFile = req.files?.photo || req.files?.profilePhoto;
  if (photoFile) {
    const photoUpload = await uploadImageToCloudinary(photoFile, "samaj/profile", 1000, 1000);
    photoMeta = assetMetadata(photoUpload, photoFile.name);
    photoUrl = photoUpload.secure_url;
  }

  const memberId = await createUniqueMemberId();
  const memIdentityHash = identityNumber ? hashIdentity(identityNumber) : null;
  const hashedPassword = await bcrypt.hash(finalTemporaryPassword, 12);

  const memProfile = await Profile.create({
    gender: gender || "MALE",
    dateOfBirth: dateOfBirth || null,
    contactNumber: contactNumber || (isMinor ? req.user.contactNumber : null),
    nativePlace: nativePlace || null,
    currentCity: currentCity || null,
    gotra: gotra || null,
    education: education || null,
    profession: profession || null,
    address: address || null,
    identityDocument: docMeta,
    photo: photoMeta,
  });

  const memberUser = await User.create({
    memberId,
    identityHash: memIdentityHash,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email ? String(email).trim().toLowerCase() : req.user.email,
    password: hashedPassword,
    accountType: "Member",
    roles: ["MEMBER"],
    accountStatus: "PENDING",
    membershipStatus: "ACTIVE",
    isMinor,
    guardianMemberId: isMinor ? req.user.id : undefined,
    guardianRelationship: isMinor ? (guardianRelationship || relationship || "PARENT") : undefined,
    approved: false,
    contactVerified: true,
    mustChangePassword: !isMinor,
    family: familyId,
    familyRole: "MEMBER",
    imageUrl: photoUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(`${firstName}-${lastName}`)}`,
    additionalDetails: memProfile._id,
    reviewHistory: [
      {
        action: "SUBMITTED",
        reason: isMinor ? "Minor/Newborn added by Family Head" : "Added to family by Family Head",
      },
    ],
    documentVersions: [
      {
        ...docMeta,
        status: "PENDING",
      },
    ],
  });

  const membership = await FamilyMembership.create({
    family: familyId,
    member: memberUser._id,
    role: "FAMILY_MEMBER",
    relationship: relationship.toUpperCase(),
    verificationStatus: "PENDING",
    status: "ACTIVE",
    verificationHistory: [
      {
        action: "SUBMITTED",
        reason: `Added to family by Family Head`,
        document: docMeta,
      },
    ],
  });

  await Family.findByIdAndUpdate(familyId, { verificationStatus: "UNDER_REVIEW" });

  await logAudit({
    actor: req.user.id,
    action: "family.member_added",
    targetType: "family",
    target: familyId,
    newValue: { memberId: memberUser.memberId, name: `${firstName} ${lastName}`, relationship, isMinor },
    req,
  });

  return res.status(201).json(
    new ApiResponse("Family member added and submitted for committee verification", {
      member: {
        _id: memberUser._id,
        memberId: memberUser.memberId,
        firstName: memberUser.firstName,
        lastName: memberUser.lastName,
        relationship: membership.relationship,
        verificationStatus: membership.verificationStatus,
        isMinor,
      },
    })
  );
});

/**
 * Fix & Resubmit for a Family Member with targeted corrections
 */
exports.fixAndResubmitFamilyMember = asyncHandler(async (req, res) => {
  const { familyId, memberId } = req.params;

  await requireFamilyAdmin(req.user.id, familyId);

  const membership = await FamilyMembership.findOne({
    family: familyId,
    member: memberId,
    status: "ACTIVE",
  });

  if (!membership) {
    throw new ApiError(404, "FAMILY_MEMBER_NOT_FOUND", "Member does not belong to this family");
  }

  const user = await User.findById(memberId);
  if (!user) {
    throw new ApiError(404, "USER_NOT_FOUND", "Member record not found");
  }

  // Handle document replacement if provided
  const docFile = req.files?.identityDocument || req.files?.document || req.files?.file;
  let docMeta = null;
  if (docFile) {
    const docUpload = await uploadDocumentToCloudinary(docFile, "samaj/documents", true);
    docMeta = assetMetadata(docUpload, docFile.name);
    await Profile.findByIdAndUpdate(user.additionalDetails, {
      identityDocument: docMeta,
    });
    user.documentVersions = user.documentVersions || [];
    user.documentVersions.push({
      ...docMeta,
      status: "RESUBMITTED",
    });
  }

  // Handle photo replacement if provided
  const photoFile = req.files?.photo || req.files?.profilePhoto;
  if (photoFile) {
    const photoUpload = await uploadImageToCloudinary(photoFile, "samaj/profile", 1000, 1000);
    const photoMeta = assetMetadata(photoUpload, photoFile.name);
    await Profile.findByIdAndUpdate(user.additionalDetails, { photo: photoMeta });
    user.imageUrl = photoUpload.secure_url;
  }

  // Handle text field corrections
  const {
    firstName,
    lastName,
    relationship,
    dateOfBirth,
    gender,
    gotra,
    nativePlace,
    currentCity,
    profession,
    education,
    identityNumber,
    resubmissionNotes,
  } = req.body;

  if (firstName) user.firstName = firstName.trim();
  if (lastName) user.lastName = lastName.trim();

  if (identityNumber) {
    const isDup = await checkDuplicateIdentity(identityNumber, user._id);
    if (isDup) {
      throw new ApiError(409, "DUPLICATE_IDENTITY_DETECTED", "An existing membership record is associated with the submitted identity.");
    }
    user.identityHash = hashIdentity(identityNumber);
  }

  const profileUpdates = {};
  if (dateOfBirth) profileUpdates.dateOfBirth = dateOfBirth;
  if (gender) profileUpdates.gender = gender;
  if (gotra) profileUpdates.gotra = gotra;
  if (nativePlace) profileUpdates.nativePlace = nativePlace;
  if (currentCity) profileUpdates.currentCity = currentCity;
  if (profession) profileUpdates.profession = profession;
  if (education) profileUpdates.education = education;

  if (Object.keys(profileUpdates).length > 0) {
    await Profile.findByIdAndUpdate(user.additionalDetails, profileUpdates);
  }

  if (relationship && relationship !== membership.relationship) {
    membership.relationship = relationship;
  }

  user.accountStatus = "PENDING";
  user.approved = false;
  user.reviewHistory = user.reviewHistory || [];
  user.reviewHistory.push({
    action: "RESUBMITTED",
    reason: resubmissionNotes || "Family Head applied corrections and resubmitted",
    reviewedAt: new Date(),
  });
  await user.save();

  membership.verificationStatus = "RESUBMISSION_PENDING";
  membership.resubmissionCount = (membership.resubmissionCount || 0) + 1;
  membership.rejectionReason = null;
  membership.rejectionCategory = null;
  membership.affectedField = null;
  membership.correctionRequired = null;
  membership.verificationHistory = membership.verificationHistory || [];
  membership.verificationHistory.push({
    action: "RESUBMITTED",
    reason: resubmissionNotes || "Corrections applied and resubmitted by Family Head",
    document: docMeta || undefined,
  });
  await membership.save();

  await Family.findByIdAndUpdate(familyId, { verificationStatus: "UNDER_REVIEW" });

  await logAudit({
    actor: req.user.id,
    action: "family.member_resubmitted",
    targetType: "user",
    target: user._id,
    newValue: { memberId: user.memberId, resubmissionCount: membership.resubmissionCount },
    reason: resubmissionNotes,
    req,
  });

  return res.status(200).json(
    new ApiResponse("Family member corrections submitted for committee verification", {
      memberId: user.memberId,
      verificationStatus: membership.verificationStatus,
    })
  );
});

// Legacy alias for resubmitFamilyMemberDocument
exports.resubmitFamilyMemberDocument = exports.fixAndResubmitFamilyMember;

/**
 * Submit Family Lifecycle Request (Death, Succession, Transfer, Split, Correction, Marital)
 */
exports.submitLifecycleRequest = asyncHandler(async (req, res) => {
  const { familyId } = req.params;
  const { type, memberId, reason, data: rawData } = req.body;

  const requesterMembership = await FamilyMembership.findOne({
    family: familyId,
    member: req.user.id,
    status: "ACTIVE",
  });
  if (!requesterMembership) {
    throw new ApiError(403, "NOT_IN_FAMILY", "You must belong to this family to submit a lifecycle request");
  }

  const validTypes = [
    "REPORT_DEATH",
    "HEAD_SUCCESSION",
    "HEAD_TRANSFER",
    "MEMBER_TRANSFER",
    "FAMILY_SPLIT",
    "PROFILE_CORRECTION",
    "MARITAL_STATUS_CHANGE",
    "ADDRESS_CHANGE",
  ];
  if (!validTypes.includes(type)) {
    throw new ApiError(400, "INVALID_REQUEST_TYPE", `Request type must be one of: ${validTypes.join(", ")}`);
  }

  let parsedData = {};
  if (rawData) {
    try {
      parsedData = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
    } catch {
      parsedData = {};
    }
  }

  const docFile = req.files?.document || req.files?.deathCertificate || req.files?.evidence;
  const documents = [];
  if (docFile) {
    const uploadResult = await uploadDocumentToCloudinary(docFile, "samaj/lifecycle_proofs", true);
    documents.push(assetMetadata(uploadResult, docFile.name));
  }

  const request = await FamilyLifecycleRequest.create({
    family: familyId,
    member: memberId || undefined,
    type,
    requestedBy: req.user.id,
    reason: reason?.trim() || "Lifecycle event reported",
    data: parsedData,
    documents,
    status: "PENDING",
  });

  await logAudit({
    actor: req.user.id,
    action: `family.lifecycle.${type.toLowerCase()}_requested`,
    targetType: "familyLifecycleRequest",
    target: request._id,
    newValue: { type, requestId: request.requestId, familyId },
    req,
  });

  return res.status(201).json(
    new ApiResponse("Lifecycle event request submitted for committee review", {
      request,
    })
  );
});

/**
 * Get all lifecycle requests for a family
 */
exports.getFamilyLifecycleRequests = asyncHandler(async (req, res) => {
  const { familyId } = req.params;
  const requests = await FamilyLifecycleRequest.find({ family: familyId })
    .populate("member", "firstName lastName memberId imageUrl")
    .populate("requestedBy", "firstName lastName memberId")
    .populate("reviewedBy", "firstName lastName memberId")
    .sort({ createdAt: -1 });

  return res.status(200).json(new ApiResponse("Family lifecycle requests fetched", { requests }));
});

/**
 * Admin: List all lifecycle requests
 */
exports.listAllLifecycleRequests = asyncHandler(async (req, res) => {
  const { status, type } = req.query;
  const query = {};
  if (status) query.status = status;
  if (type) query.type = type;

  const requests = await FamilyLifecycleRequest.find(query)
    .populate("family", "familyName familyCode sssmId currentHeadMemberId")
    .populate("member", "firstName lastName memberId imageUrl")
    .populate("requestedBy", "firstName lastName memberId email")
    .populate("reviewedBy", "firstName lastName memberId")
    .sort({ createdAt: -1 });

  return res.status(200).json(new ApiResponse("Lifecycle requests queue fetched", { requests }));
});

/**
 * Admin: Review lifecycle request (Approve / Reject with mandatory reason)
 */
exports.reviewLifecycleRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const { action, adminReason, rejectionCategory, correctionRequired, approvedData } = req.body;

  if (!["APPROVE", "REJECT", "REQUEST_CORRECTION"].includes(action)) {
    throw new ApiError(400, "INVALID_ACTION", "Action must be APPROVE, REJECT, or REQUEST_CORRECTION");
  }

  if ((action === "REJECT" || action === "REQUEST_CORRECTION") && (!adminReason || !String(adminReason).trim())) {
    throw new ApiError(400, "REASON_REQUIRED", "Admin reason is mandatory when rejecting or requesting correction");
  }

  const request = await FamilyLifecycleRequest.findById(requestId).populate("family");
  if (!request || request.status === "APPROVED") {
    throw new ApiError(404, "REQUEST_NOT_REVIEWABLE", "Request not found or already approved");
  }

  const family = request.family;
  const familyId = family._id;

  if (action === "REJECT" || action === "REQUEST_CORRECTION") {
    request.status = action === "REJECT" ? "REJECTED" : "REQUIRES_CORRECTION";
    request.adminReason = adminReason;
    request.rejectionCategory = rejectionCategory || "Verification Issue";
    request.correctionRequired = correctionRequired || null;
    request.reviewedBy = req.user.id;
    request.reviewedAt = new Date();
    await request.save();

    await notifyUser({
      recipient: request.requestedBy,
      title: `Lifecycle Request ${action === "REJECT" ? "Rejected" : "Requires Correction"}`,
      message: `Your request (${request.type}) requires attention: ${adminReason}`,
      link: "/dashboard/family-hub",
      metadata: { requestId: request.requestId, type: request.type, adminReason },
    });

    return res.status(200).json(new ApiResponse(`Lifecycle request ${action.toLowerCase()}ed`, { request }));
  }

  // --- ACTION === "APPROVE" ---
  request.status = "APPROVED";
  request.adminReason = adminReason || "Approved by administration";
  request.reviewedBy = req.user.id;
  request.reviewedAt = new Date();

  // 1. REPORT_DEATH
  if (request.type === "REPORT_DEATH") {
    const targetMemberId = request.member;
    if (targetMemberId) {
      await User.findByIdAndUpdate(targetMemberId, {
        membershipStatus: "DECEASED",
        isDeceased: true,
        dateOfDeath: request.data?.dateOfDeath || new Date(),
        deathReportedBy: request.requestedBy,
        deathVerifiedAt: new Date(),
        deathVerifiedBy: req.user.id,
        deathEvidence: request.documents?.[0],
        deathNotes: request.reason,
      });

      await FamilyMembership.findOneAndUpdate(
        { family: familyId, member: targetMemberId },
        { status: "DECEASED" }
      );

      const isHead = String(family.currentHeadMemberId || family.currentFamilyAdmin) === String(targetMemberId);
      if (isHead) {
        family.lifecycleStatus = "HEAD_SUCCESSION_REQUIRED";
        family.headHistory = family.headHistory || [];
        family.headHistory.push({
          head: targetMemberId,
          role: "FAMILY_HEAD",
          to: new Date(),
          reason: "Family Head deceased - administrative succession required",
          changedBy: req.user.id,
        });
        await family.save();
      }
    }
  }

  // 2. HEAD_SUCCESSION or HEAD_TRANSFER
  else if (request.type === "HEAD_SUCCESSION" || request.type === "HEAD_TRANSFER") {
    const newHeadId = approvedData?.newHeadId || request.data?.proposedSuccessor || request.data?.newHeadId || family.successorMemberId;
    if (!newHeadId) {
      throw new ApiError(400, "NEW_HEAD_REQUIRED", "An approved successor member ID must be designated");
    }

    const successorMembership = await FamilyMembership.findOne({
      family: familyId,
      member: newHeadId,
      status: "ACTIVE",
    });
    if (!successorMembership) {
      throw new ApiError(400, "INVALID_SUCCESSOR", "New Head must be an active member of this family");
    }

    const oldHeadId = family.currentHeadMemberId || family.currentFamilyAdmin;
    if (oldHeadId && String(oldHeadId) !== String(newHeadId)) {
      await FamilyMembership.findOneAndUpdate(
        { family: familyId, member: oldHeadId },
        { role: "FORMER_FAMILY_HEAD" }
      );
      await User.findByIdAndUpdate(oldHeadId, { familyRole: "FORMER_FAMILY_HEAD" });
    }

    successorMembership.role = "FAMILY_ADMIN";
    await successorMembership.save();
    await User.findByIdAndUpdate(newHeadId, { familyRole: "FAMILY_HEAD" });

    family.headHistory = family.headHistory || [];
    family.headHistory.push({
      head: newHeadId,
      role: "FAMILY_HEAD",
      from: new Date(),
      reason: request.reason || "Administrative succession approved",
      changedBy: req.user.id,
    });
    family.currentHeadMemberId = newHeadId;
    family.currentFamilyAdmin = newHeadId;
    family.lifecycleStatus = "ACTIVE";
    await family.save();
  }

  // 3. MEMBER_TRANSFER
  else if (request.type === "MEMBER_TRANSFER") {
    const targetMemberId = request.member;
    const targetFamilyId = approvedData?.targetFamilyId || request.data?.targetFamilyId;
    if (!targetMemberId || !targetFamilyId) {
      throw new ApiError(400, "TRANSFER_FIELDS_REQUIRED", "Member and target family are required");
    }

    await FamilyMembership.findOneAndUpdate(
      { family: familyId, member: targetMemberId },
      { status: "TRANSFERRED", removedAt: new Date(), removedBy: req.user.id, removalReason: request.reason }
    );

    await FamilyMembership.create({
      family: targetFamilyId,
      member: targetMemberId,
      role: "FAMILY_MEMBER",
      relationship: request.data?.newRelationship || "OTHER",
      verificationStatus: "APPROVED",
      status: "ACTIVE",
    });

    await User.findByIdAndUpdate(targetMemberId, {
      family: targetFamilyId,
      membershipStatus: "TRANSFERRED",
      $push: {
        transferHistory: {
          previousFamily: familyId,
          newFamily: targetFamilyId,
          transferredAt: new Date(),
          reason: request.reason,
          approvedBy: req.user.id,
        },
      },
    });
  }

  // 4. PROFILE_CORRECTION
  else if (request.type === "PROFILE_CORRECTION") {
    const targetMemberId = request.member;
    const corrections = request.data?.corrections || {};
    const userUpdates = {};
    const profileUpdates = {};

    if (corrections.firstName) userUpdates.firstName = corrections.firstName.trim();
    if (corrections.lastName) userUpdates.lastName = corrections.lastName.trim();

    if (corrections.dateOfBirth) profileUpdates.dateOfBirth = corrections.dateOfBirth;
    if (corrections.gotra) profileUpdates.gotra = corrections.gotra;
    if (corrections.nativePlace) profileUpdates.nativePlace = corrections.nativePlace;
    if (corrections.currentCity) profileUpdates.currentCity = corrections.currentCity;
    if (corrections.profession) profileUpdates.profession = corrections.profession;
    if (corrections.education) profileUpdates.education = corrections.education;

    if (Object.keys(userUpdates).length > 0) {
      await User.findByIdAndUpdate(targetMemberId, userUpdates);
    }
    const targetUser = await User.findById(targetMemberId);
    if (targetUser?.additionalDetails && Object.keys(profileUpdates).length > 0) {
      await Profile.findByIdAndUpdate(targetUser.additionalDetails, profileUpdates);
    }
  }

  await request.save();

  await logAudit({
    actor: req.user.id,
    action: `family.lifecycle.${request.type.toLowerCase()}_approved`,
    targetType: "familyLifecycleRequest",
    target: request._id,
    newValue: { type: request.type, requestId: request.requestId, familyId },
    req,
  });

  await notifyUser({
    recipient: request.requestedBy,
    title: "Lifecycle Request Approved",
    message: `Your request (${request.type}) has been approved by the administration.`,
    link: "/dashboard/family-hub",
    metadata: { requestId: request.requestId, type: request.type },
  });

  return res.status(200).json(
    new ApiResponse("Lifecycle request approved successfully", {
      request,
    })
  );
});

/**
 * Admin: Merge duplicate family into canonical family
 */
exports.mergeFamilies = asyncHandler(async (req, res) => {
  const { canonicalFamilyId, duplicateFamilyId, reason } = req.body;

  if (!canonicalFamilyId || !duplicateFamilyId) {
    throw new ApiError(400, "FAMILIES_REQUIRED", "Canonical family ID and duplicate family ID are required");
  }

  const canonicalFamily = await Family.findById(canonicalFamilyId);
  const duplicateFamily = await Family.findById(duplicateFamilyId);

  if (!canonicalFamily || !duplicateFamily) {
    throw new ApiError(404, "FAMILY_NOT_FOUND", "One or both families were not found");
  }

  const dupMemberships = await FamilyMembership.find({
    family: duplicateFamilyId,
    status: "ACTIVE",
  });

  let mergedCount = 0;
  for (const m of dupMemberships) {
    const existingInCanonical = await FamilyMembership.findOne({
      family: canonicalFamilyId,
      member: m.member,
      status: "ACTIVE",
    });

    if (!existingInCanonical) {
      await FamilyMembership.create({
        family: canonicalFamilyId,
        member: m.member,
        role: m.role === "FAMILY_ADMIN" ? "FAMILY_MEMBER" : m.role,
        relationship: m.relationship,
        verificationStatus: m.verificationStatus,
        status: "ACTIVE",
      });
      await User.findByIdAndUpdate(m.member, { family: canonicalFamilyId });
      mergedCount += 1;
    }

    m.status = "TRANSFERRED";
    m.removalReason = `Family merged into canonical family ${canonicalFamily.familyCode}`;
    m.removedAt = new Date();
    await m.save();
  }

  duplicateFamily.status = "ARCHIVED";
  duplicateFamily.lifecycleStatus = "MERGED";
  duplicateFamily.isArchived = true;
  duplicateFamily.archivedAt = new Date();
  duplicateFamily.archivedBy = req.user.id;
  duplicateFamily.archiveReason = reason || `Merged into canonical family ${canonicalFamily.familyCode}`;
  await duplicateFamily.save();

  await logAudit({
    actor: req.user.id,
    action: "family.merged",
    targetType: "family",
    target: canonicalFamilyId,
    newValue: {
      canonicalFamilyCode: canonicalFamily.familyCode,
      duplicateFamilyCode: duplicateFamily.familyCode,
      mergedCount,
    },
    reason,
    req,
  });

  return res.status(200).json(
    new ApiResponse(`Successfully merged ${mergedCount} members into family ${canonicalFamily.familyCode}`, {
      canonicalFamily,
      mergedCount,
    })
  );
});

/**
 * Report Family Head Death & Submit Succession Request
 */
exports.reportFamilyHeadDeath = asyncHandler(async (req, res) => {
  const { familyId } = req.params;
  const { proposedSuccessorId, reason } = req.body;

  const family = await Family.findById(familyId);
  if (!family || family.isArchived) {
    throw new ApiError(404, "FAMILY_NOT_FOUND", "Family was not found");
  }

  // Must belong to family
  const requesterMembership = await FamilyMembership.findOne({
    family: familyId,
    member: req.user.id,
    status: "ACTIVE",
  });

  if (!requesterMembership) {
    throw new ApiError(403, "NOT_IN_FAMILY", "You must belong to this family to submit a succession request");
  }

  const deathProofFile = req.files?.deathCertificate || req.files?.document || req.files?.proof;
  if (!deathProofFile) {
    throw new ApiError(400, "DEATH_PROOF_REQUIRED", "Death certificate or official proof is required");
  }

  const uploadResult = await uploadDocumentToCloudinary(deathProofFile, "samaj/succession_proofs", true);
  const proofMeta = assetMetadata(uploadResult, deathProofFile.name);

  // Validate proposed successor belongs to family
  let successorUser = null;
  if (proposedSuccessorId) {
    const successorMembership = await FamilyMembership.findOne({
      family: familyId,
      member: proposedSuccessorId,
      status: "ACTIVE",
    });
    if (!successorMembership) {
      throw new ApiError(400, "INVALID_SUCCESSOR", "Proposed successor must be an active family member");
    }
    successorUser = proposedSuccessorId;
  } else if (family.successorMemberId) {
    successorUser = family.successorMemberId;
  }

  const successionRequest = {
    requestedBy: req.user.id,
    proposedSuccessor: successorUser,
    deathCertificate: proofMeta,
    status: "PENDING",
    reason: reason || "Family Head demise reported by family member",
    submittedAt: new Date(),
  };

  family.successionRequests = family.successionRequests || [];
  family.successionRequests.push(successionRequest);
  await family.save();

  await logAudit({
    actor: req.user.id,
    action: "family.succession_requested",
    targetType: "family",
    target: familyId,
    newValue: { proposedSuccessor: successorUser, reason },
    req,
  });

  return res.status(201).json(
    new ApiResponse("Succession request submitted for administration verification", {
      successionRequest,
    })
  );
});

/**
 * Admin: Review Family Head Succession Request
 */
exports.reviewFamilyHeadSuccession = asyncHandler(async (req, res) => {
  const { familyId, requestId } = req.params;
  const { action, reviewNotes, approvedSuccessorId } = req.body;

  if (!["APPROVE", "REJECT"].includes(action)) {
    throw new ApiError(400, "INVALID_ACTION", "Action must be APPROVE or REJECT");
  }

  const family = await Family.findById(familyId);
  if (!family) {
    throw new ApiError(404, "FAMILY_NOT_FOUND", "Family was not found");
  }

  const request = family.successionRequests?.id(requestId);
  if (!request || request.status !== "PENDING") {
    throw new ApiError(404, "REQUEST_NOT_FOUND", "Succession request was not found or is already reviewed");
  }

  request.status = action === "APPROVE" ? "APPROVED" : "REJECTED";
  request.reviewNotes = reviewNotes || "";
  request.reviewedBy = req.user.id;
  request.reviewedAt = new Date();

  if (action === "APPROVE") {
    const newHeadId = approvedSuccessorId || request.proposedSuccessor || family.successorMemberId;
    if (!newHeadId) {
      throw new ApiError(400, "SUCCESSOR_REQUIRED", "An approved successor member must be designated");
    }

    const successorMembership = await FamilyMembership.findOne({
      family: familyId,
      member: newHeadId,
      status: "ACTIVE",
    });

    if (!successorMembership) {
      throw new ApiError(400, "SUCCESSOR_NOT_IN_FAMILY", "Successor does not belong to this family");
    }

    const oldHeadId = family.currentHeadMemberId || family.currentFamilyAdmin;

    // 1. Mark Old Head as Deceased / Former Head
    if (oldHeadId) {
      await User.findByIdAndUpdate(oldHeadId, {
        isDeceased: true,
        familyRole: "FORMER_FAMILY_HEAD",
      });
      await FamilyMembership.findOneAndUpdate(
        { family: familyId, member: oldHeadId },
        { role: "FORMER_FAMILY_HEAD" }
      );
    }

    // 2. Assign New Head
    successorMembership.role = "FAMILY_ADMIN";
    await successorMembership.save();

    await User.findByIdAndUpdate(newHeadId, { familyRole: "FAMILY_HEAD" });

    // 3. Record in Family Head History
    family.headHistory = family.headHistory || [];
    family.headHistory.push({
      head: oldHeadId,
      to: new Date(),
      reason: "Family Head deceased - administrative succession approved",
    });

    family.currentHeadMemberId = newHeadId;
    family.currentFamilyAdmin = newHeadId;
  }

  await family.save();

  await logAudit({
    actor: req.user.id,
    action: `family.succession_${action.toLowerCase()}`,
    targetType: "family",
    target: familyId,
    newValue: { status: request.status, newHead: family.currentHeadMemberId },
    req,
  });

  return res.status(200).json(
    new ApiResponse(`Succession request ${action.toLowerCase()}d successfully`, {
      family,
    })
  );
});

/**
 * Nominate or update successor preference
 */
exports.updateNomineeSuccessor = asyncHandler(async (req, res) => {
  const { familyId } = req.params;
  const { memberId } = req.body;

  await requireFamilyAdmin(req.user.id, familyId);

  if (memberId) {
    const membership = await FamilyMembership.findOne({
      family: familyId,
      member: memberId,
      status: "ACTIVE",
    });

    if (!membership) {
      throw new ApiError(400, "MEMBER_NOT_FOUND", "Nominated member must be an active family member");
    }
  }

  const family = await Family.findByIdAndUpdate(
    familyId,
    { successorMemberId: memberId || null },
    { new: true }
  );

  await logAudit({
    actor: req.user.id,
    action: "family.nominee_updated",
    targetType: "family",
    target: familyId,
    newValue: { successorMemberId: memberId },
    req,
  });

  return res.status(200).json(new ApiResponse("Family successor nomination updated", { family }));
});

// ----------------------------------------------------
// Family Tree Genealogy Graph methods
// ----------------------------------------------------
exports.getFamilyTree = asyncHandler(async (req, res) => {
  const { familyId } = req.params;

  const family = await Family.findById(familyId).populate(
    "currentFamilyAdmin",
    "firstName lastName email imageUrl memberId"
  );

  if (!family || family.isArchived) {
    throw new ApiError(404, "FAMILY_NOT_FOUND", "Family was not found or has been archived");
  }

  let nodes = await FamilyMemberNode.find({ family: familyId })
    .populate("linkedUser", "firstName lastName email imageUrl additionalDetails memberId")
    .populate("parents", "name relation gender photo")
    .populate("spouse", "name relation gender photo")
    .sort({ generation: 1, createdAt: 1 });

  if (nodes.length === 0) {
    const activeMemberships = await FamilyMembership.find({
      family: familyId,
      status: "ACTIVE",
    }).populate({
      path: "member",
      select: "firstName lastName email imageUrl additionalDetails memberId",
      populate: { path: "additionalDetails" },
    });

    const bootstrapNodes = [];
    for (const membership of activeMemberships) {
      const u = membership.member;
      if (!u) continue;
      const isAdmin = String(family.currentFamilyAdmin?._id || family.currentFamilyAdmin) === String(u._id);
      bootstrapNodes.push({
        family: familyId,
        name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || "Family Member",
        gender: u.additionalDetails?.gender || "MALE",
        relation: isAdmin ? "SELF" : "OTHER",
        generation: 0,
        linkedUser: u._id,
        photo: u.imageUrl ? { url: u.imageUrl, name: `${u.firstName} photo` } : undefined,
        currentCity: u.additionalDetails?.currentCity,
        nativePlace: u.additionalDetails?.nativePlace,
        profession: u.additionalDetails?.profession,
        createdBy: req.user.id,
      });
    }

    if (bootstrapNodes.length > 0) {
      await FamilyMemberNode.insertMany(bootstrapNodes);
      nodes = await FamilyMemberNode.find({ family: familyId })
        .populate("linkedUser", "firstName lastName email imageUrl additionalDetails memberId")
        .sort({ generation: 1, createdAt: 1 });
    }
  }

  const generationMap = {
    "-2": { title: "Grandparents Generation", nodes: [] },
    "-1": { title: "Parents Generation", nodes: [] },
    "0": { title: "Self & Siblings Generation", nodes: [] },
    "1": { title: "Children Generation", nodes: [] },
    "2": { title: "Grandchildren Generation", nodes: [] },
  };

  nodes.forEach((node) => {
    const genKey = String(node.generation ?? 0);
    if (!generationMap[genKey]) {
      generationMap[genKey] = { title: `Generation ${genKey}`, nodes: [] };
    }
    generationMap[genKey].nodes.push(node);
  });

  return res.status(200).json(
    new ApiResponse("Family tree fetched successfully", {
      family,
      nodes,
      generationMap,
      totalMembersInTree: nodes.length,
    })
  );
});

exports.addFamilyTreeNode = asyncHandler(async (req, res) => {
  const { familyId } = req.params;
  const {
    name,
    gender,
    relation,
    generation,
    linkedUser,
    birthYear,
    passedAwayYear,
    isDeceased,
    profession,
    currentCity,
    nativePlace,
    about,
    parents,
    spouse,
  } = req.body;

  if (!name) {
    throw new ApiError(400, "NAME_REQUIRED", "Relative name is required");
  }

  const family = await Family.findById(familyId);
  if (!family || family.isArchived) {
    throw new ApiError(404, "FAMILY_NOT_FOUND", "Family was not found");
  }

  const membership = await FamilyMembership.findOne({
    family: familyId,
    member: req.user.id,
    status: "ACTIVE",
  });

  if (!membership) {
    throw new ApiError(403, "FAMILY_MEMBER_REQUIRED", "You must belong to this family to modify the tree");
  }

  const nodeData = {
    family: familyId,
    name: name.trim(),
    gender: gender || "MALE",
    relation: relation || "OTHER",
    generation: Number(generation !== undefined ? generation : 0),
    linkedUser: linkedUser || undefined,
    birthYear: birthYear ? Number(birthYear) : undefined,
    passedAwayYear: passedAwayYear ? Number(passedAwayYear) : undefined,
    isDeceased: Boolean(isDeceased === "true" || isDeceased === true),
    profession: profession?.trim() || undefined,
    currentCity: currentCity?.trim() || undefined,
    nativePlace: nativePlace?.trim() || undefined,
    about: about?.trim() || undefined,
    spouse: spouse || undefined,
    createdBy: req.user.id,
  };

  if (parents) {
    nodeData.parents = Array.isArray(parents) ? parents : [parents];
  }

  const photoFile = req.files?.photo || req.files?.image;
  if (photoFile) {
    const uploadResult = await uploadImageToCloudinary(photoFile, "samaj/family_tree", 800, 80);
    nodeData.photo = assetMetadata(uploadResult, photoFile.name);
  }

  const node = await FamilyMemberNode.create(nodeData);

  if (spouse) {
    await FamilyMemberNode.findByIdAndUpdate(spouse, { spouse: node._id });
  }

  await logAudit({
    actor: req.user.id,
    action: "family.tree.node_created",
    targetType: "familyMemberNode",
    target: node._id,
    newValue: { name: node.name, relation: node.relation, family: familyId },
    req,
  });

  return res.status(201).json(new ApiResponse("Family member added to tree", { node }));
});

exports.updateFamilyTreeNode = asyncHandler(async (req, res) => {
  const { familyId, nodeId } = req.params;

  const node = await FamilyMemberNode.findOne({ _id: nodeId, family: familyId });
  if (!node) {
    throw new ApiError(404, "NODE_NOT_FOUND", "Tree member node was not found");
  }

  const membership = await FamilyMembership.findOne({
    family: familyId,
    member: req.user.id,
    status: "ACTIVE",
  });
  if (!membership) {
    throw new ApiError(403, "FAMILY_MEMBER_REQUIRED", "Access denied");
  }

  const updateFields = [
    "name",
    "gender",
    "relation",
    "generation",
    "birthYear",
    "passedAwayYear",
    "isDeceased",
    "profession",
    "currentCity",
    "nativePlace",
    "about",
    "spouse",
  ];

  updateFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      if (field === "generation" || field === "birthYear" || field === "passedAwayYear") {
        node[field] = req.body[field] ? Number(req.body[field]) : undefined;
      } else if (field === "isDeceased") {
        node.isDeceased = Boolean(req.body.isDeceased === "true" || req.body.isDeceased === true);
      } else {
        node[field] = req.body[field];
      }
    }
  });

  if (req.body.parents) {
    node.parents = Array.isArray(req.body.parents) ? req.body.parents : [req.body.parents];
  }

  const photoFile = req.files?.photo || req.files?.image;
  if (photoFile) {
    const uploadResult = await uploadImageToCloudinary(photoFile, "samaj/family_tree", 800, 80);
    node.photo = assetMetadata(uploadResult, photoFile.name);
  }

  await node.save();

  return res.status(200).json(new ApiResponse("Family tree member updated", { node }));
});

exports.deleteFamilyTreeNode = asyncHandler(async (req, res) => {
  const { familyId, nodeId } = req.params;

  await requireFamilyAdmin(req.user.id, familyId);

  const node = await FamilyMemberNode.findOneAndDelete({ _id: nodeId, family: familyId });
  if (!node) {
    throw new ApiError(404, "NODE_NOT_FOUND", "Tree member node was not found");
  }

  await FamilyMemberNode.updateMany({ family: familyId, spouse: nodeId }, { $unset: { spouse: 1 } });
  await FamilyMemberNode.updateMany({ family: familyId, parents: nodeId }, { $pull: { parents: nodeId } });

  await logAudit({
    actor: req.user.id,
    action: "family.tree.node_deleted",
    targetType: "familyMemberNode",
    target: nodeId,
    oldValue: { name: node.name, family: familyId },
    req,
  });

  return res.status(200).json(new ApiResponse("Family tree member removed"));
});
