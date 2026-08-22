const User = require("../Models/user");
const Profile = require("../Models/profile");
const FamilyMembership = require("../Models/familyMembership");
const { uploadImageToCloudinary } = require("../Utilities/uploadImageToCloudinary");
const ApiError = require("../Utilities/ApiError");
const ApiResponse = require("../Utilities/ApiResponse");
const asyncHandler = require("../Utilities/asyncHandler");
const { logAudit } = require("../Utilities/auditService");
const { removeUserFromActiveFamilyMemberships } = require("../Utilities/familyAdminService");

function sanitizeUser(user) {
  const output = user.toObject ? user.toObject() : { ...user };
  delete output.password;
  delete output.sessions;
  delete output.token;
  delete output.resetPasswordExpires;
  return output;
}

function isMemberViewer(viewer) {
  return viewer && viewer.accountStatus === "ACTIVE";
}

function canSeeField(visibility, viewer) {
  if (visibility === "PUBLIC") return true;
  if (visibility === "MEMBERS_ONLY") return isMemberViewer(viewer);
  return false;
}

function projectDirectoryUser(user, viewer) {
  const profile = user.additionalDetails || {};
  const privacy = profile.privacySettings || {};
  const projectedProfile = {
    gender: profile.gender,
    dateOfBirth: profile.dateOfBirth,
    about: profile.about,
    currentCity: profile.currentCity,
    nativePlace: profile.nativePlace,
    education: profile.education,
    gotra: profile.gotra,
  };

  if (canSeeField(privacy.phone || "MEMBERS_ONLY", viewer)) {
    projectedProfile.contactNumber = profile.contactNumber;
  }
  if (canSeeField(privacy.email || "PRIVATE", viewer)) {
    projectedProfile.email = user.email;
  }
  if (canSeeField(privacy.address || "MEMBERS_ONLY", viewer)) {
    projectedProfile.address = profile.address;
  }
  if (canSeeField(privacy.profession || "PUBLIC", viewer)) {
    projectedProfile.profession = profile.profession;
  }

  return {
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    imageUrl: user.imageUrl,
    family: user.family,
    profile: projectedProfile,
  };
}

function buildProfileUpdate(body) {
  const allowedFields = [
    "gender",
    "dateOfBirth",
    "about",
    "contactNumber",
    "address",
    "preferredTiming",
    "middleName",
    "nativePlace",
    "currentCity",
    "education",
    "profession",
    "gotra",
    "identityDocument",
    "photo",
    "privacySettings",
  ];

  return allowedFields.reduce((payload, field) => {
    if (body[field] !== undefined) payload[field] = body[field];
    return payload;
  }, {});
}

exports.updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { FirstName, LastName, firstName, lastName } = req.body;

  const existingUser = await User.findById(userId);
  if (!existingUser) {
    throw new ApiError(404, "USER_NOT_FOUND", "User was not found");
  }

  if (firstName || FirstName) existingUser.firstName = firstName || FirstName;
  if (lastName || LastName) existingUser.lastName = lastName || LastName;
  await existingUser.save();

  const updatedProfile = await Profile.findByIdAndUpdate(
    existingUser.additionalDetails,
    buildProfileUpdate(req.body),
    { new: true, runValidators: true }
  );

  const updatedUser = await User.findById(userId)
    .populate("additionalDetails")
    .populate("family");

  return res.status(200).json(new ApiResponse("Profile updated successfully", {
    profile: updatedProfile,
    data: sanitizeUser(updatedUser),
  }));
});

exports.getAllUserDetails = asyncHandler(async (req, res) => {
  const details = await User.findById(req.user.id)
    .populate("additionalDetails")
    .populate("family");

  if (!details) {
    throw new ApiError(404, "USER_NOT_FOUND", "User was not found");
  }

  const familyMembership = await FamilyMembership.findOne({
    member: req.user.id,
    status: "ACTIVE",
  }).populate("family");

  return res.status(200).json(new ApiResponse("User details fetched successfully", {
    data: sanitizeUser(details),
    familyMembership,
  }));
});

exports.searchMemberDirectory = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  const skip = (page - 1) * limit;
  const userFilter = {
    active: true,
    accountStatus: "ACTIVE",
  };
  const profileFilter = {};
  const nameQuery = req.query.q ? String(req.query.q).trim() : null;

  if (req.query.family) userFilter.family = req.query.family;
  if (req.query.city) profileFilter.currentCity = new RegExp(String(req.query.city).trim(), "i");
  if (req.query.profession) profileFilter.profession = new RegExp(String(req.query.profession).trim(), "i");
  if (req.query.education) profileFilter.education = new RegExp(String(req.query.education).trim(), "i");
  if (req.query.nativePlace) profileFilter.nativePlace = new RegExp(String(req.query.nativePlace).trim(), "i");

  const baseProfileIds = Object.keys(profileFilter).length > 0
    ? (await Profile.find(profileFilter).select("_id")).map((profile) => profile._id)
    : null;

  if (baseProfileIds && baseProfileIds.length === 0) {
    return res.status(200).json(new ApiResponse("Member directory fetched successfully", {
      members: [],
    }, {
      page,
      limit,
      total: 0,
      pages: 0,
    }));
  }

  if (baseProfileIds) {
    userFilter.additionalDetails = { $in: baseProfileIds };
  }

  if (nameQuery) {
    const profileSearchFilter = {
      ...(baseProfileIds ? { _id: { $in: baseProfileIds } } : {}),
      $or: [
        { profession: new RegExp(nameQuery, "i") },
        { currentCity: new RegExp(nameQuery, "i") },
        { education: new RegExp(nameQuery, "i") },
        { nativePlace: new RegExp(nameQuery, "i") },
      ],
    };
    const qProfileIds = (await Profile.find(profileSearchFilter).select("_id")).map((profile) => profile._id);
    const nameConditions = [
      { firstName: new RegExp(nameQuery, "i") },
      { lastName: new RegExp(nameQuery, "i") },
    ];
    const searchConditions = qProfileIds.length > 0
      ? [...nameConditions, { additionalDetails: { $in: qProfileIds } }]
      : nameConditions;

    userFilter.$and = [
      ...(userFilter.additionalDetails ? [{ additionalDetails: userFilter.additionalDetails }] : []),
      { $or: searchConditions },
    ];
    delete userFilter.additionalDetails;
  }

  const [users, total] = await Promise.all([
    User.find(userFilter)
      .populate("additionalDetails")
      .populate("family", "familyName familyCode currentCity nativePlace")
      .sort({ firstName: 1, lastName: 1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(userFilter),
  ]);

  return res.status(200).json(new ApiResponse("Member directory fetched successfully", {
    members: users.map((directoryUser) => projectDirectoryUser(directoryUser, req.user)),
  }, {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  }));
});

exports.updateDisplayPicture = asyncHandler(async (req, res) => {
  if (!req.files?.displayPicture) {
    throw new ApiError(400, "DISPLAY_PICTURE_REQUIRED", "Display picture is required");
  }

  const image = await uploadImageToCloudinary(
    req.files.displayPicture,
    process.env.CLOUDINARY_FOLDER || "samaj/profile",
    1000,
    1000
  );

  const updatedUser = await User.findByIdAndUpdate(
    req.user.id,
    { imageUrl: image.secure_url },
    { new: true }
  ).populate("additionalDetails");

  return res.status(200).json(new ApiResponse("Image updated successfully", {
    data: sanitizeUser(updatedUser),
  }));
});

exports.deleteAccount = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const existingUser = await User.findById(userId);

  if (!existingUser) {
    throw new ApiError(404, "USER_NOT_FOUND", "User was not found");
  }

  if (existingUser.roles?.includes("SUPER_ADMIN")) {
    const otherActiveSuperAdmins = await User.countDocuments({
      _id: { $ne: existingUser._id },
      roles: "SUPER_ADMIN",
      accountStatus: "ACTIVE",
      active: true,
    });

    if (otherActiveSuperAdmins === 0) {
      throw new ApiError(409, "LAST_SUPER_ADMIN_REQUIRED", "At least one active Super Admin is required");
    }
  }

  existingUser.firstName = "Deleted";
  existingUser.lastName = `Member ${String(existingUser._id).slice(-6)}`;
  existingUser.email = `deleted-${existingUser._id}@deleted.local`;
  existingUser.active = false;
  existingUser.accountStatus = "DEACTIVATED";
  existingUser.tokenVersion += 1;
  existingUser.sessions = [];
  await existingUser.save();

  await removeUserFromActiveFamilyMemberships(userId, userId, "Account deactivated by member");

  await logAudit({
    actor: userId,
    action: "user.account.deactivated",
    targetType: "user",
    target: userId,
    oldValue: { accountStatus: "ACTIVE" },
    newValue: { accountStatus: "DEACTIVATED" },
    reason: "Self-service account deactivation",
    req,
  });

  return res.status(200).json(new ApiResponse("Account deactivated successfully"));
});
