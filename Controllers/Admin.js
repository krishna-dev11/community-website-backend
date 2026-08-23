const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const User = require("../Models/user");
const Profile = require("../Models/profile");
const AdminInvite = require("../Models/adminInvite");
const AuditLog = require("../Models/auditLog");
const ApiError = require("../Utilities/ApiError");
const ApiResponse = require("../Utilities/ApiResponse");
const asyncHandler = require("../Utilities/asyncHandler");
const { mailSender } = require("../Utilities/mailSender");
const { logAudit } = require("../Utilities/auditService");
const adminInviteEmail = require("../mail/templates/adminInviteEmail");
const { ROLE_PERMISSIONS } = require("../constants/permissions");
const { removeUserFromActiveFamilyMemberships } = require("../Utilities/familyAdminService");

const ADMIN_ROLES = Object.keys(ROLE_PERMISSIONS).filter((role) => (
  !["MEMBER", "Admin", "Instructor", "Student"].includes(role)
));

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(email) {
  return email?.trim().toLowerCase();
}

function sanitizeUser(user) {
  const output = user.toObject ? user.toObject() : { ...user };
  delete output.password;
  delete output.sessions;
  delete output.token;
  delete output.resetPasswordExpires;
  return output;
}

async function assertNotLastActiveSuperAdmin(targetUser, nextStatus = null, nextActive = null, nextRoles = null) {
  const roles = nextRoles || targetUser.roles || [];
  const willRemainSuperAdmin = roles.includes("SUPER_ADMIN");
  const willRemainActive = (nextActive ?? targetUser.active) && (nextStatus || targetUser.accountStatus) === "ACTIVE";

  if (!targetUser.roles?.includes("SUPER_ADMIN") || (willRemainSuperAdmin && willRemainActive)) return;

  const activeSuperAdmins = await User.countDocuments({
    _id: { $ne: targetUser._id },
    roles: "SUPER_ADMIN",
    accountStatus: "ACTIVE",
    active: true,
  });

  if (activeSuperAdmins === 0) {
    throw new ApiError(409, "LAST_SUPER_ADMIN_REQUIRED", "At least one active Super Admin is required");
  }
}

exports.createAdminInvite = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const roles = Array.isArray(req.body.roles) ? req.body.roles : [req.body.role].filter(Boolean);

  if (!email || roles.length === 0) {
    throw new ApiError(400, "ADMIN_INVITE_FIELDS_REQUIRED", "Email and at least one role are required");
  }

  const invalidRoles = roles.filter((role) => !ADMIN_ROLES.includes(role));
  if (invalidRoles.length > 0) {
    throw new ApiError(400, "INVALID_ADMIN_ROLE", `Invalid admin role(s): ${invalidRoles.join(", ")}`);
  }

  // Only SUPER_ADMIN can invite another SUPER_ADMIN
  if (roles.includes("SUPER_ADMIN") && !req.user.roles?.includes("SUPER_ADMIN")) {
    throw new ApiError(403, "FORBIDDEN", "Only Super Admins are authorized to grant Super Admin privileges");
  }

  const existingUser = await User.findOne({ email });
  if (existingUser?.accountStatus === "ACTIVE") {
    throw new ApiError(409, "ADMIN_EMAIL_ALREADY_ACTIVE", "An active user already exists with this email");
  }

  // Revoke any previous pending invites for this email to prevent duplicates
  await AdminInvite.updateMany({ email, status: "PENDING" }, { status: "REVOKED" });

  const rawToken = crypto.randomBytes(32).toString("hex");
  const invite = await AdminInvite.create({
    email,
    roles,
    tokenHash: hashToken(rawToken),
    invitedBy: req.user.id,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const url = `${frontendUrl}/admin-invite/${rawToken}`;

  try {
    await mailSender(
      email,
      "Samaj Community Platform — Administrator Invitation",
      adminInviteEmail({ email, roles, url })
    );
  } catch (mailError) {
    console.error(`[Admin.js] Invitation created (ID: ${invite._id}) but email sending failed:`, mailError.message);
    // Keep invite valid so admin can share URL manually or retry, but inform in response
  }

  await logAudit({
    actor: req.user.id,
    action: "admin.invite.created",
    targetType: "adminInvite",
    target: invite._id,
    newValue: { email, roles },
    req,
  });

  return res.status(201).json(new ApiResponse("Admin invite created successfully", {
    invite: {
      _id: invite._id,
      email: invite.email,
      roles: invite.roles,
      status: invite.status,
      expiresAt: invite.expiresAt,
    },
  }));
});

exports.acceptAdminInvite = asyncHandler(async (req, res) => {
  const { token, firstName, lastName, password, confirmPassword } = req.body;

  if (!token || !firstName || !lastName || !password || !confirmPassword) {
    throw new ApiError(400, "ADMIN_INVITE_ACCEPT_FIELDS_REQUIRED", "Token, name, and password are required");
  }

  if (password !== confirmPassword) {
    throw new ApiError(400, "PASSWORD_MISMATCH", "Password and confirm password do not match");
  }

  const invite = await AdminInvite.findOne({
    tokenHash: hashToken(token),
    status: "PENDING",
  });

  if (!invite || invite.expiresAt <= new Date()) {
    if (invite && invite.status === "PENDING") {
      invite.status = "EXPIRED";
      await invite.save();
    }
    throw new ApiError(400, "ADMIN_INVITE_INVALID", "Invite is invalid or expired");
  }

  const existingUser = await User.findOne({ email: invite.email });
  if (existingUser?.accountStatus === "ACTIVE") {
    throw new ApiError(409, "ADMIN_EMAIL_ALREADY_ACTIVE", "An active user already exists with this email");
  }

  const profile = await Profile.create({});
  const adminUser = await User.create({
    firstName,
    lastName,
    email: invite.email,
    password: await bcrypt.hash(password, 12),
    accountType: "Admin",
    roles: invite.roles,
    accountStatus: "ACTIVE",
    approved: true,
    imageUrl: `https://api.dicebear.com/5.x/initials/svg?seed=${firstName}-${lastName}`,
    additionalDetails: profile._id,
    reviewHistory: [{
      action: "APPROVED",
      reason: "Admin invite accepted",
      reviewedBy: invite.invitedBy,
    }],
  });

  invite.status = "ACCEPTED";
  invite.acceptedBy = adminUser._id;
  invite.acceptedAt = new Date();
  await invite.save();

  await logAudit({
    actor: invite.invitedBy,
    action: "admin.invite.accepted",
    targetType: "user",
    target: adminUser._id,
    newValue: { email: invite.email, roles: invite.roles },
    req,
  });

  return res.status(201).json(new ApiResponse("Admin account activated successfully", {
    user: sanitizeUser(adminUser),
  }));
});

exports.listAdminInvites = asyncHandler(async (req, res) => {
  const invites = await AdminInvite.find()
    .populate("invitedBy", "firstName lastName email")
    .populate("acceptedBy", "firstName lastName email")
    .sort({ createdAt: -1 })
    .limit(100);

  return res.status(200).json(new ApiResponse("Admin invites fetched successfully", { invites }));
});

exports.revokeAdminInvite = asyncHandler(async (req, res) => {
  const invite = await AdminInvite.findOneAndUpdate(
    { _id: req.params.inviteId, status: "PENDING" },
    { status: "REVOKED" },
    { new: true }
  );

  if (!invite) {
    throw new ApiError(404, "ADMIN_INVITE_NOT_REVOKABLE", "Invite was not found or is no longer pending");
  }

  await logAudit({
    actor: req.user.id,
    action: "admin.invite.revoked",
    targetType: "adminInvite",
    target: invite._id,
    oldValue: { status: "PENDING" },
    newValue: { status: "REVOKED" },
    req,
  });

  return res.status(200).json(new ApiResponse("Admin invite revoked successfully", { invite }));
});

exports.updateUserRoles = asyncHandler(async (req, res) => {
  const { roles } = req.body;

  if (!Array.isArray(roles) || roles.length === 0) {
    throw new ApiError(400, "ROLES_REQUIRED", "At least one role is required");
  }

  const invalidRoles = roles.filter((role) => !ROLE_PERMISSIONS[role]);
  if (invalidRoles.length > 0) {
    throw new ApiError(400, "INVALID_ROLE", `Invalid role(s): ${invalidRoles.join(", ")}`);
  }

  const targetUser = await User.findById(req.params.userId);
  if (!targetUser) {
    throw new ApiError(404, "USER_NOT_FOUND", "User was not found");
  }

  const oldRoles = targetUser.roles;
  await assertNotLastActiveSuperAdmin(targetUser, targetUser.accountStatus, targetUser.active, roles);

  targetUser.roles = roles;
  targetUser.accountType = roles.some((role) => role !== "MEMBER") ? "Admin" : "Member";
  targetUser.tokenVersion += 1;
  targetUser.sessions = [];
  await targetUser.save();

  await logAudit({
    actor: req.user.id,
    action: "user.roles.updated",
    targetType: "user",
    target: targetUser._id,
    oldValue: { roles: oldRoles },
    newValue: { roles },
    reason: req.body.reason,
    req,
  });

  return res.status(200).json(new ApiResponse("User roles updated successfully", {
    user: sanitizeUser(targetUser),
  }));
});

exports.listUsers = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  const filter = {};

  if (req.query.accountStatus) filter.accountStatus = req.query.accountStatus;
  if (req.query.role) filter.roles = req.query.role;
  if (req.query.family) filter.family = req.query.family;
  if (req.query.active !== undefined) filter.active = req.query.active === "true";
  if (req.query.q) {
    const q = String(req.query.q).trim();
    filter.$or = [
      { firstName: new RegExp(q, "i") },
      { lastName: new RegExp(q, "i") },
      { email: new RegExp(q, "i") },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .populate("additionalDetails")
      .populate("family", "familyName familyCode status")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  return res.status(200).json(new ApiResponse("Users fetched successfully", {
    users: users.map(sanitizeUser),
  }, {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  }));
});

exports.updateUserStatus = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;
  const allowedStatuses = ["ACTIVE", "SUSPENDED", "DEACTIVATED"];
  if (!allowedStatuses.includes(status)) {
    throw new ApiError(400, "INVALID_ACCOUNT_STATUS", "Status must be ACTIVE, SUSPENDED, or DEACTIVATED");
  }

  const targetUser = await User.findById(req.params.userId);
  if (!targetUser) throw new ApiError(404, "USER_NOT_FOUND", "User was not found");

  const nextActive = status === "ACTIVE";
  await assertNotLastActiveSuperAdmin(targetUser, status, nextActive);

  const previous = {
    accountStatus: targetUser.accountStatus,
    active: targetUser.active,
  };

  targetUser.accountStatus = status;
  targetUser.active = nextActive;
  targetUser.approved = status === "ACTIVE";
  targetUser.tokenVersion += 1;
  targetUser.sessions = [];
  targetUser.reviewHistory.push({
    action: status === "ACTIVE" ? "APPROVED" : "REJECTED",
    reason: reason || `Admin changed account status to ${status}`,
    reviewedBy: req.user.id,
  });
  await targetUser.save();

  if (["SUSPENDED", "DEACTIVATED"].includes(status)) {
    await removeUserFromActiveFamilyMemberships(targetUser._id, req.user.id, reason || `Account ${status.toLowerCase()} by admin`);
  }

  await logAudit({
    actor: req.user.id,
    action: "user.status.updated",
    targetType: "user",
    target: targetUser._id,
    oldValue: previous,
    newValue: { accountStatus: targetUser.accountStatus, active: targetUser.active },
    reason,
    req,
  });

  return res.status(200).json(new ApiResponse("User status updated successfully", {
    user: sanitizeUser(targetUser),
  }));
});

exports.anonymizeUserAccount = asyncHandler(async (req, res) => {
  const targetUser = await User.findById(req.params.userId);
  if (!targetUser) throw new ApiError(404, "USER_NOT_FOUND", "User was not found");

  await assertNotLastActiveSuperAdmin(targetUser, "DEACTIVATED", false);

  const oldValue = {
    email: targetUser.email,
    firstName: targetUser.firstName,
    lastName: targetUser.lastName,
    accountStatus: targetUser.accountStatus,
  };

  targetUser.firstName = "Deleted";
  targetUser.lastName = `Member ${String(targetUser._id).slice(-6)}`;
  targetUser.email = `deleted-${targetUser._id}@deleted.local`;
  targetUser.active = false;
  targetUser.accountStatus = "DEACTIVATED";
  targetUser.approved = false;
  targetUser.tokenVersion += 1;
  targetUser.sessions = [];
  await targetUser.save();

  await Profile.findByIdAndUpdate(targetUser.additionalDetails, {
    $unset: {
      contactNumber: "",
      address: "",
      about: "",
      identityDocument: "",
      photo: "",
    },
    $set: {
      privacySettings: {
        phone: "PRIVATE",
        email: "PRIVATE",
        address: "PRIVATE",
        profession: "PRIVATE",
      },
    },
  });

  await removeUserFromActiveFamilyMemberships(targetUser._id, req.user.id, req.body.reason || "Account anonymized by admin");

  await logAudit({
    actor: req.user.id,
    action: "user.account.anonymized",
    targetType: "user",
    target: targetUser._id,
    oldValue,
    newValue: { accountStatus: targetUser.accountStatus, email: targetUser.email },
    reason: req.body.reason,
    req,
  });

  return res.status(200).json(new ApiResponse("User account anonymized successfully", {
    user: sanitizeUser(targetUser),
  }));
});

exports.listAuditLogs = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  const filter = {};

  if (req.query.action) filter.action = req.query.action;
  if (req.query.actor) filter.actor = req.query.actor;
  if (req.query.targetType) filter.targetType = req.query.targetType;
  if (req.query.target) filter.target = req.query.target;

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .populate("actor", "firstName lastName email roles")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    AuditLog.countDocuments(filter),
  ]);

  return res.status(200).json(new ApiResponse("Audit logs fetched successfully", {
    logs,
  }, {
    page,
    limit,
    total,
  }));
});
