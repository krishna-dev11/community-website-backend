const MatrimonialProfile = require("../Models/matrimonialProfile");
const MatrimonialInterest = require("../Models/matrimonialInterest");
const MatrimonialContactRequest = require("../Models/matrimonialContactRequest");
const MatrimonialReport = require("../Models/matrimonialReport");
const MatrimonialBlock = require("../Models/matrimonialBlock");
const ApiError = require("../Utilities/ApiError");
const ApiResponse = require("../Utilities/ApiResponse");
const asyncHandler = require("../Utilities/asyncHandler");
const { logAudit } = require("../Utilities/auditService");
const { notifyUser } = require("../Utilities/notificationService");

function pageOptions(query) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
}

function textFilter(q) {
  return q ? { $text: { $search: String(q).trim() } } : {};
}

function assetFromBody(asset) {
  if (!asset?.url) return undefined;
  return {
    url: asset.url,
    publicId: asset.publicId,
    size: asset.size,
    mimeType: asset.mimeType,
  };
}

function profilePayload(body) {
  const payload = {};
  [
    "displayName",
    "gender",
    "dateOfBirth",
    "height",
    "maritalStatus",
    "education",
    "profession",
    "annualIncome",
    "currentCity",
    "nativePlace",
    "gotra",
    "about",
    "expectations",
    "familyDetails",
    "protectedContact",
    "guardian",
    "visibility",
  ].forEach((field) => {
    if (body[field] !== undefined) payload[field] = body[field];
  });

  if (Array.isArray(body.photos)) {
    payload.photos = body.photos.map(assetFromBody).filter(Boolean);
  }

  return payload;
}

function sanitizeProfile(profile, includeProtected = false) {
  if (!profile) return profile;
  const output = profile.toObject ? profile.toObject() : { ...profile };
  if (!includeProtected) {
    delete output.protectedContact;
    if (output.guardian) {
      output.guardian = {
        name: output.guardian.name,
        relation: output.guardian.relation,
      };
    }
  }
  return output;
}

function isAdmin(req) {
  return (req.user?.roles || []).some((role) => ["SUPER_ADMIN", "MATRIMONIAL_ADMIN", "Admin"].includes(role));
}

async function getOwnProfile(userId) {
  return MatrimonialProfile.findOne({ owner: userId, status: { $ne: "ARCHIVED" } });
}

async function canViewProtected(viewerProfileId, targetProfileId) {
  if (!viewerProfileId || !targetProfileId) return false;
  if (String(viewerProfileId) === String(targetProfileId)) return true;
  const approved = await MatrimonialContactRequest.exists({
    requesterProfile: viewerProfileId,
    targetProfile: targetProfileId,
    status: "APPROVED",
  });
  return Boolean(approved);
}

exports.createOrUpdateMyMatrimonialProfile = asyncHandler(async (req, res) => {
  const payload = profilePayload(req.body);
  if (!payload.displayName || !payload.gender || !payload.dateOfBirth) {
    throw new ApiError(400, "MATRIMONIAL_PROFILE_FIELDS_REQUIRED", "Display name, gender, and date of birth are required");
  }

  const existing = await MatrimonialProfile.findOne({ owner: req.user.id });
  let profile;
  let statusCode = 200;

  if (existing) {
    if (existing.status === "ARCHIVED") {
      throw new ApiError(409, "MATRIMONIAL_PROFILE_ARCHIVED", "Archived matrimonial profile cannot be edited");
    }
    Object.assign(existing, payload);
    if (["REJECTED", "DRAFT"].includes(existing.status) || req.body.submitForReview === true) {
      existing.status = "PENDING_REVIEW";
      existing.reviewReason = undefined;
    }
    profile = await existing.save();
  } else {
    profile = await MatrimonialProfile.create({
      ...payload,
      owner: req.user.id,
      status: req.body.status === "DRAFT" ? "DRAFT" : "PENDING_REVIEW",
    });
    statusCode = 201;
  }

  await logAudit({
    actor: req.user.id,
    action: existing ? "matrimonial.profile.updated" : "matrimonial.profile.created",
    targetType: "matrimonialProfile",
    target: profile._id,
    newValue: { status: profile.status, displayName: profile.displayName },
    req,
  });

  return res.status(statusCode).json(new ApiResponse("Matrimonial profile saved successfully", {
    profile: sanitizeProfile(profile, true),
  }));
});

exports.getMyMatrimonialProfile = asyncHandler(async (req, res) => {
  const profile = await getOwnProfile(req.user.id);
  return res.status(200).json(new ApiResponse("My matrimonial profile fetched", {
    profile: profile ? sanitizeProfile(profile, true) : null,
  }));
});

exports.listMatrimonialProfiles = asyncHandler(async (req, res) => {
  const viewerProfile = await getOwnProfile(req.user.id);
  const blocked = await MatrimonialBlock.find({ blocker: req.user.id }).distinct("blockedProfile");
  const filter = {
    status: "APPROVED",
    visibility: "MEMBERS_ONLY",
    _id: { $nin: blocked },
    ...textFilter(req.query.q),
  };
  if (viewerProfile) filter._id.$ne = viewerProfile._id;
  if (req.query.gender) filter.gender = req.query.gender;
  if (req.query.city) filter.currentCity = String(req.query.city).trim();
  if (req.query.gotra) filter.gotra = String(req.query.gotra).trim();
  if (req.query.profession) filter.profession = new RegExp(String(req.query.profession).trim(), "i");

  const { page, limit, skip } = pageOptions(req.query);
  const [profiles, total] = await Promise.all([
    MatrimonialProfile.find(filter)
      .select("-protectedContact")
      .populate("owner", "firstName lastName imageUrl")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    MatrimonialProfile.countDocuments(filter),
  ]);

  return res.status(200).json(new ApiResponse("Matrimonial profiles fetched successfully", {
    profiles: profiles.map((profile) => sanitizeProfile(profile, false)),
  }, {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  }));
});

exports.getMatrimonialProfile = asyncHandler(async (req, res) => {
  const viewerProfile = await getOwnProfile(req.user.id);
  const profile = await MatrimonialProfile.findOne({
    _id: req.params.profileId,
    status: isAdmin(req) ? { $ne: "ARCHIVED" } : "APPROVED",
  }).populate("owner", "firstName lastName imageUrl");
  if (!profile) throw new ApiError(404, "MATRIMONIAL_PROFILE_NOT_FOUND", "Matrimonial profile was not found");

  const blocked = await MatrimonialBlock.exists({ blocker: req.user.id, blockedProfile: profile._id });
  if (blocked && !isAdmin(req)) {
    throw new ApiError(404, "MATRIMONIAL_PROFILE_NOT_FOUND", "Matrimonial profile was not found");
  }

  const includeProtected = isAdmin(req) || await canViewProtected(viewerProfile?._id, profile._id);
  return res.status(200).json(new ApiResponse("Matrimonial profile fetched successfully", {
    profile: sanitizeProfile(profile, includeProtected),
    protectedContactUnlocked: includeProtected,
  }));
});

exports.listMatrimonialProfilesAdmin = asyncHandler(async (req, res) => {
  const filter = { ...textFilter(req.query.q) };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.gender) filter.gender = req.query.gender;
  const { page, limit, skip } = pageOptions(req.query);
  const [profiles, total] = await Promise.all([
    MatrimonialProfile.find(filter)
      .populate("owner", "firstName lastName email imageUrl")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    MatrimonialProfile.countDocuments(filter),
  ]);

  return res.status(200).json(new ApiResponse("Admin matrimonial profiles fetched", { profiles }, {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  }));
});

exports.reviewMatrimonialProfile = asyncHandler(async (req, res) => {
  if (!["APPROVE", "REJECT", "INVESTIGATE", "ARCHIVE"].includes(req.body.action)) {
    throw new ApiError(400, "INVALID_MATRIMONIAL_REVIEW_ACTION", "Action must be APPROVE, REJECT, INVESTIGATE, or ARCHIVE");
  }

  const statusByAction = {
    APPROVE: "APPROVED",
    REJECT: "REJECTED",
    INVESTIGATE: "UNDER_INVESTIGATION",
    ARCHIVE: "ARCHIVED",
  };
  const profile = await MatrimonialProfile.findById(req.params.profileId);
  if (!profile) throw new ApiError(404, "MATRIMONIAL_PROFILE_NOT_FOUND", "Matrimonial profile was not found");

  const previousStatus = profile.status;
  profile.status = statusByAction[req.body.action];
  profile.reviewedBy = req.user.id;
  profile.reviewedAt = new Date();
  profile.reviewReason = req.body.reason;
  if (profile.status === "ARCHIVED") {
    profile.archivedAt = new Date();
    profile.archivedBy = req.user.id;
    profile.archiveReason = req.body.reason;
  }
  await profile.save();

  await logAudit({
    actor: req.user.id,
    action: "matrimonial.profile.reviewed",
    targetType: "matrimonialProfile",
    target: profile._id,
    oldValue: { status: previousStatus },
    newValue: { status: profile.status },
    reason: req.body.reason,
    req,
  });

  await notifyUser({
    recipient: profile.owner,
    title: "Matrimonial profile review updated",
    message: `Your matrimonial profile is now ${profile.status}.`,
    metadata: { profile: profile._id, status: profile.status },
  });

  return res.status(200).json(new ApiResponse("Matrimonial profile reviewed successfully", { profile }));
});

exports.pauseOrResumeMyMatrimonialProfile = asyncHandler(async (req, res) => {
  const profile = await getOwnProfile(req.user.id);
  if (!profile) throw new ApiError(404, "MATRIMONIAL_PROFILE_NOT_FOUND", "Matrimonial profile was not found");

  if (req.body.pause === true) {
    profile.status = "PAUSED";
    profile.pausedAt = new Date();
  } else if (profile.status === "PAUSED") {
    profile.status = "APPROVED";
    profile.pausedAt = undefined;
  }
  await profile.save();

  return res.status(200).json(new ApiResponse("Matrimonial profile visibility updated", {
    profile: sanitizeProfile(profile, true),
  }));
});

exports.removeMyMatrimonialProfile = asyncHandler(async (req, res) => {
  const profile = await getOwnProfile(req.user.id);
  if (!profile) throw new ApiError(404, "MATRIMONIAL_PROFILE_NOT_FOUND", "Matrimonial profile was not found");

  profile.status = "ARCHIVED";
  profile.archivedAt = new Date();
  profile.archivedBy = req.user.id;
  profile.archiveReason = req.body.reason || "Removed by owner";
  await profile.save();

  return res.status(200).json(new ApiResponse("Matrimonial profile removed successfully"));
});

exports.expressInterest = asyncHandler(async (req, res) => {
  const fromProfile = await getOwnProfile(req.user.id);
  if (!fromProfile || fromProfile.status !== "APPROVED") {
    throw new ApiError(409, "OWN_MATRIMONIAL_PROFILE_NOT_APPROVED", "Create and approve your profile before expressing interest");
  }

  const toProfile = await MatrimonialProfile.findOne({
    _id: req.params.profileId,
    status: "APPROVED",
    visibility: "MEMBERS_ONLY",
  });
  if (!toProfile) throw new ApiError(404, "MATRIMONIAL_PROFILE_NOT_FOUND", "Matrimonial profile was not found");
  if (String(toProfile._id) === String(fromProfile._id)) {
    throw new ApiError(400, "SELF_INTEREST_NOT_ALLOWED", "You cannot express interest in your own profile");
  }

  const blocked = await MatrimonialBlock.exists({ blocker: req.user.id, blockedProfile: toProfile._id });
  if (blocked) throw new ApiError(409, "MATRIMONIAL_PROFILE_BLOCKED", "You have blocked this profile");

  let interest;
  try {
    interest = await MatrimonialInterest.create({
      fromProfile: fromProfile._id,
      toProfile: toProfile._id,
      message: req.body.message,
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(409, "INTEREST_ALREADY_EXISTS", "Interest already exists for this profile");
    }
    throw error;
  }

  await notifyUser({
    recipient: toProfile.owner,
    title: "New matrimonial interest",
    message: "Someone has expressed interest in your matrimonial profile.",
    metadata: { interest: interest._id, fromProfile: fromProfile._id },
  });

  return res.status(201).json(new ApiResponse("Interest sent successfully", { interest }));
});

exports.listMyMatrimonialInterests = asyncHandler(async (req, res) => {
  const profile = await getOwnProfile(req.user.id);
  if (!profile) {
    return res.status(200).json(new ApiResponse("Matrimonial interests fetched", { sent: [], received: [] }));
  }

  const [sent, received] = await Promise.all([
    MatrimonialInterest.find({ fromProfile: profile._id })
      .populate("toProfile", "displayName gender dateOfBirth currentCity profession photos status")
      .sort({ createdAt: -1 }),
    MatrimonialInterest.find({ toProfile: profile._id })
      .populate("fromProfile", "displayName gender dateOfBirth currentCity profession photos status")
      .sort({ createdAt: -1 }),
  ]);

  return res.status(200).json(new ApiResponse("Matrimonial interests fetched", { sent, received }));
});

exports.respondToInterest = asyncHandler(async (req, res) => {
  if (!["ACCEPT", "REJECT", "WITHDRAW"].includes(req.body.action)) {
    throw new ApiError(400, "INVALID_INTEREST_ACTION", "Action must be ACCEPT, REJECT, or WITHDRAW");
  }

  const myProfile = await getOwnProfile(req.user.id);
  if (!myProfile) throw new ApiError(404, "MATRIMONIAL_PROFILE_NOT_FOUND", "Your matrimonial profile was not found");

  const filter = { _id: req.params.interestId };
  if (req.body.action === "WITHDRAW") filter.fromProfile = myProfile._id;
  else filter.toProfile = myProfile._id;

  const interest = await MatrimonialInterest.findOne(filter);
  if (!interest) throw new ApiError(404, "INTEREST_NOT_FOUND", "Interest was not found");
  if (!["PENDING", "ACCEPTED"].includes(interest.status)) {
    throw new ApiError(409, "INTEREST_ALREADY_CLOSED", "Interest is already closed");
  }

  const statusByAction = {
    ACCEPT: "ACCEPTED",
    REJECT: "REJECTED",
    WITHDRAW: "WITHDRAWN",
  };
  interest.status = statusByAction[req.body.action];
  interest.respondedAt = new Date();
  interest.responseMessage = req.body.message;
  await interest.save();

  if (interest.status === "WITHDRAWN") {
    await MatrimonialContactRequest.updateMany(
      { interest: interest._id, status: "PENDING" },
      { status: "REVOKED", reviewedAt: new Date(), reviewMessage: "Interest withdrawn" }
    );
  }

  return res.status(200).json(new ApiResponse("Interest updated successfully", { interest }));
});

exports.requestContactAccess = asyncHandler(async (req, res) => {
  const requesterProfile = await getOwnProfile(req.user.id);
  if (!requesterProfile) throw new ApiError(404, "MATRIMONIAL_PROFILE_NOT_FOUND", "Your matrimonial profile was not found");

  const interest = await MatrimonialInterest.findOne({
    _id: req.params.interestId,
    fromProfile: requesterProfile._id,
    status: "ACCEPTED",
  });
  if (!interest) {
    throw new ApiError(409, "ACCEPTED_INTEREST_REQUIRED", "Contact access requires an accepted interest");
  }

  let contactRequest;
  try {
    contactRequest = await MatrimonialContactRequest.create({
      interest: interest._id,
      requesterProfile: interest.fromProfile,
      targetProfile: interest.toProfile,
      message: req.body.message,
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(409, "CONTACT_REQUEST_ALREADY_EXISTS", "Contact request already exists");
    }
    throw error;
  }

  const target = await MatrimonialProfile.findById(interest.toProfile).select("owner");
  await notifyUser({
    recipient: target.owner,
    title: "Matrimonial contact access requested",
    message: "A matched profile has requested access to protected contact details.",
    metadata: { contactRequest: contactRequest._id },
  });

  return res.status(201).json(new ApiResponse("Contact access requested", { contactRequest }));
});

exports.listMyContactRequests = asyncHandler(async (req, res) => {
  const profile = await getOwnProfile(req.user.id);
  if (!profile) {
    return res.status(200).json(new ApiResponse("Contact requests fetched", { sent: [], received: [] }));
  }

  const [sent, received] = await Promise.all([
    MatrimonialContactRequest.find({ requesterProfile: profile._id })
      .populate("targetProfile", "displayName photos currentCity profession")
      .sort({ createdAt: -1 }),
    MatrimonialContactRequest.find({ targetProfile: profile._id })
      .populate("requesterProfile", "displayName photos currentCity profession")
      .sort({ createdAt: -1 }),
  ]);

  return res.status(200).json(new ApiResponse("Contact requests fetched", { sent, received }));
});

exports.reviewContactRequest = asyncHandler(async (req, res) => {
  if (!["APPROVE", "REJECT", "REVOKE"].includes(req.body.action)) {
    throw new ApiError(400, "INVALID_CONTACT_REVIEW_ACTION", "Action must be APPROVE, REJECT, or REVOKE");
  }
  const myProfile = await getOwnProfile(req.user.id);
  if (!myProfile) throw new ApiError(404, "MATRIMONIAL_PROFILE_NOT_FOUND", "Your matrimonial profile was not found");

  const request = await MatrimonialContactRequest.findOne({
    _id: req.params.requestId,
    targetProfile: myProfile._id,
    status: "PENDING",
  });
  if (!request) throw new ApiError(404, "CONTACT_REQUEST_NOT_REVIEWABLE", "Contact request was not found or already reviewed");

  request.status = req.body.action === "APPROVE" ? "APPROVED" : req.body.action === "REVOKE" ? "REVOKED" : "REJECTED";
  request.reviewedAt = new Date();
  request.reviewMessage = req.body.message;
  await request.save();

  return res.status(200).json(new ApiResponse("Contact request reviewed successfully", { contactRequest: request }));
});

exports.reportMatrimonialProfile = asyncHandler(async (req, res) => {
  if (!req.body.reason) throw new ApiError(400, "REPORT_REASON_REQUIRED", "Report reason is required");
  const profile = await MatrimonialProfile.findById(req.params.profileId);
  if (!profile || profile.status === "ARCHIVED") {
    throw new ApiError(404, "MATRIMONIAL_PROFILE_NOT_FOUND", "Matrimonial profile was not found");
  }

  const report = await MatrimonialReport.create({
    profile: profile._id,
    reportedBy: req.user.id,
    reason: req.body.reason,
    details: req.body.details,
  });

  const openReports = await MatrimonialReport.countDocuments({ profile: profile._id, status: { $in: ["OPEN", "UNDER_REVIEW"] } });
  if (openReports >= 1 && profile.status === "APPROVED") {
    profile.status = "UNDER_INVESTIGATION";
    await profile.save();
  }

  return res.status(201).json(new ApiResponse("Matrimonial profile reported", { report }));
});

exports.listMatrimonialReports = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.profile) filter.profile = req.query.profile;
  const { page, limit, skip } = pageOptions(req.query);
  const [reports, total] = await Promise.all([
    MatrimonialReport.find(filter)
      .populate("profile", "displayName status")
      .populate("reportedBy", "firstName lastName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    MatrimonialReport.countDocuments(filter),
  ]);
  return res.status(200).json(new ApiResponse("Matrimonial reports fetched", { reports }, {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  }));
});

exports.reviewMatrimonialReport = asyncHandler(async (req, res) => {
  if (!["UNDER_REVIEW", "RESOLVED", "DISMISSED"].includes(req.body.status)) {
    throw new ApiError(400, "INVALID_REPORT_STATUS", "Status must be UNDER_REVIEW, RESOLVED, or DISMISSED");
  }

  const report = await MatrimonialReport.findByIdAndUpdate(
    req.params.reportId,
    {
      status: req.body.status,
      reviewedBy: req.user.id,
      reviewedAt: new Date(),
      resolution: req.body.resolution,
    },
    { new: true, runValidators: true }
  );
  if (!report) throw new ApiError(404, "REPORT_NOT_FOUND", "Report was not found");
  return res.status(200).json(new ApiResponse("Matrimonial report reviewed", { report }));
});

exports.blockMatrimonialProfile = asyncHandler(async (req, res) => {
  const profile = await MatrimonialProfile.findById(req.params.profileId);
  if (!profile) throw new ApiError(404, "MATRIMONIAL_PROFILE_NOT_FOUND", "Matrimonial profile was not found");
  await MatrimonialBlock.findOneAndUpdate(
    { blocker: req.user.id, blockedProfile: profile._id },
    { reason: req.body.reason },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return res.status(200).json(new ApiResponse("Matrimonial profile blocked"));
});

exports.unblockMatrimonialProfile = asyncHandler(async (req, res) => {
  await MatrimonialBlock.deleteOne({ blocker: req.user.id, blockedProfile: req.params.profileId });
  return res.status(200).json(new ApiResponse("Matrimonial profile unblocked"));
});
