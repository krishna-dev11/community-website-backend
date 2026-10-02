const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const User = require("../Models/user");
const Profile = require("../Models/profile");
const AdminInvite = require("../Models/adminInvite");
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

  // Validate that all roles are legitimate admin roles
  const invalidRoles = roles.filter((role) => !ADMIN_ROLES.includes(role));
  if (invalidRoles.length > 0) {
    throw new ApiError(400, "INVALID_ADMIN_ROLE", `Invalid admin role(s): ${invalidRoles.join(", ")}`);
  }

  // Role escalation protection: Only SUPER_ADMIN can invite another SUPER_ADMIN
  if (roles.includes("SUPER_ADMIN") && !req.user.roles?.includes("SUPER_ADMIN")) {
    throw new ApiError(403, "FORBIDDEN", "Only Super Admins are authorized to grant Super Admin privileges");
  }

  // Self-invitation check
  if (req.user.email && req.user.email.toLowerCase() === email) {
    throw new ApiError(400, "SELF_INVITE_NOT_ALLOWED", "You cannot send an admin invitation to your own email address.");
  }

  // Check if target user already exists and already has these admin roles
  const existingUser = await User.findOne({ email });
  if (existingUser && existingUser.accountType === "Admin" && existingUser.accountStatus === "ACTIVE") {
    const alreadyHasRoles = roles.every((r) => existingUser.roles?.includes(r));
    if (alreadyHasRoles) {
      throw new ApiError(409, "USER_ALREADY_ADMIN", "This user is already an active administrator with these assigned roles.");
    }
  }

  // Duplicate active invitation protection
  const existingPending = await AdminInvite.findOne({
    email,
    status: "PENDING",
    expiresAt: { $gt: new Date() },
  });

  if (existingPending) {
    throw new ApiError(409, "ACTIVE_INVITATION_EXISTS", "An active invitation already exists for this email. You can resend or revoke it from the invitation list.", {
      existingInviteId: existingPending._id,
      roles: existingPending.roles,
      expiresAt: existingPending.expiresAt,
    });
  }

  // Clean up any stale/expired pending invites for this email
  await AdminInvite.updateMany(
    { email, status: "PENDING" },
    { status: "EXPIRED" }
  );

  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invite = await AdminInvite.create({
    email,
    roles,
    tokenHash: hashToken(rawToken),
    invitedBy: req.user.id,
    expiresAt,
  });

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const url = `${frontendUrl}/admin/invite/accept/${rawToken}`;

  try {
    await mailSender(
      email,
      "You're invited to join Samaj Administration | Adivasi Halba/Halbi Samaj Kalyan Samiti",
      adminInviteEmail({ email, roles, url })
    );
  } catch (mailError) {
    console.error(`[Admin.js] Invitation created (ID: ${invite._id}) but email sending failed:`, mailError.message);
  }

  await logAudit({
    actor: req.user.id,
    action: "admin.invite.created",
    targetType: "adminInvite",
    target: invite._id,
    newValue: { email, roles, expiresAt },
    req,
  });

  return res.status(201).json(new ApiResponse("Admin invite created successfully", {
    invite: {
      _id: invite._id,
      email: invite.email,
      roles: invite.roles,
      status: invite.status,
      expiresAt: invite.expiresAt,
      isExistingUser: !!existingUser,
    },
  }));
});

exports.validateAdminInvite = asyncHandler(async (req, res) => {
  const { token } = req.params;
  if (!token) {
    throw new ApiError(400, "TOKEN_REQUIRED", "Invitation token is required");
  }

  const tokenHash = hashToken(token);
  const invite = await AdminInvite.findOne({ tokenHash });

  if (!invite) {
    return res.status(200).json(new ApiResponse("Invitation validated", {
      state: "INVALID",
      message: "This invitation link is not valid.",
    }));
  }

  if (invite.status === "REVOKED") {
    return res.status(200).json(new ApiResponse("Invitation validated", {
      state: "REVOKED",
      message: "This invitation is no longer active.",
    }));
  }

  if (invite.status === "ACCEPTED") {
    return res.status(200).json(new ApiResponse("Invitation validated", {
      state: "ALREADY_USED",
      message: "This invitation has already been accepted. If you already have an account, please sign in.",
    }));
  }

  if (invite.status === "EXPIRED" || invite.expiresAt <= new Date()) {
    if (invite.status === "PENDING") {
      invite.status = "EXPIRED";
      await invite.save();
    }
    return res.status(200).json(new ApiResponse("Invitation validated", {
      state: "EXPIRED",
      message: "This invitation has expired. Please ask an authorized administrator to send a new invitation.",
    }));
  }

  // Token is valid and pending
  const existingUser = await User.findOne({ email: invite.email });

  return res.status(200).json(new ApiResponse("Invitation validated", {
    state: "VALID",
    email: invite.email,
    roles: invite.roles,
    expiresAt: invite.expiresAt,
    isExistingUser: !!existingUser,
    existingUserName: existingUser ? `${existingUser.firstName} ${existingUser.lastName}` : null,
  }));
});

exports.acceptAdminInvite = asyncHandler(async (req, res) => {
  const { token, firstName, lastName, password, confirmPassword } = req.body;

  if (!token) {
    throw new ApiError(400, "TOKEN_REQUIRED", "Invitation token is required");
  }

  const tokenHash = hashToken(token);
  const invite = await AdminInvite.findOne({
    tokenHash,
    status: "PENDING",
    expiresAt: { $gt: new Date() },
  });

  if (!invite) {
    const anyInvite = await AdminInvite.findOne({ tokenHash });
    if (!anyInvite) {
      throw new ApiError(400, "ADMIN_INVITE_INVALID", "This invitation link is not valid.");
    }
    if (anyInvite.status === "ACCEPTED") {
      throw new ApiError(400, "ADMIN_INVITE_ALREADY_USED", "This invitation has already been accepted.");
    }
    if (anyInvite.status === "REVOKED") {
      throw new ApiError(400, "ADMIN_INVITE_REVOKED", "This invitation is no longer active.");
    }
    throw new ApiError(400, "ADMIN_INVITE_EXPIRED", "This invitation has expired.");
  }

  const existingUser = await User.findOne({ email: invite.email });

  if (existingUser) {
    // Existing user flow: verify credentials if password provided
    if (password) {
      const isPasswordMatch = await bcrypt.compare(password, existingUser.password);
      if (!isPasswordMatch) {
        throw new ApiError(401, "INVALID_CREDENTIALS", "Incorrect password for your existing account.");
      }
    }

    // Activate/merge admin roles on existing user without duplicating account or member records
    const updatedRoles = Array.from(new Set([...(existingUser.roles || []), ...invite.roles]));
    existingUser.roles = updatedRoles;
    existingUser.accountType = "Admin";
    existingUser.accountStatus = "ACTIVE";
    existingUser.approved = true;
    if (!existingUser.reviewHistory) existingUser.reviewHistory = [];
    existingUser.reviewHistory.push({
      action: "APPROVED",
      reason: "Admin invitation accepted (existing user linked)",
      reviewedBy: invite.invitedBy,
    });
    await existingUser.save();

    invite.status = "ACCEPTED";
    invite.acceptedBy = existingUser._id;
    invite.acceptedAt = new Date();
    await invite.save();

    await logAudit({
      actor: existingUser._id,
      action: "admin.invite.accepted",
      targetType: "user",
      target: existingUser._id,
      newValue: { email: invite.email, roles: invite.roles, linkedExisting: true },
      req,
    });

    await logAudit({
      actor: existingUser._id,
      action: "admin.role.assigned",
      targetType: "user",
      target: existingUser._id,
      newValue: { roles: updatedRoles },
      req,
    });

    return res.status(200).json(new ApiResponse("Admin privileges activated on existing account successfully", {
      user: sanitizeUser(existingUser),
      isExistingUser: true,
    }));
  }

  // New user flow: validate inputs and create new admin account
  if (!firstName || !lastName || !password || !confirmPassword) {
    throw new ApiError(400, "ADMIN_INVITE_ACCEPT_FIELDS_REQUIRED", "First name, last name, and matching passwords are required");
  }

  if (password !== confirmPassword) {
    throw new ApiError(400, "PASSWORD_MISMATCH", "Password and confirm password do not match");
  }

  if (password.length < 8) {
    throw new ApiError(400, "PASSWORD_TOO_SHORT", "Password must be at least 8 characters long");
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
    imageUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(`${firstName} ${lastName}`)}`,
    additionalDetails: profile._id,
    reviewHistory: [{
      action: "APPROVED",
      reason: "Admin invite accepted (new admin account)",
      reviewedBy: invite.invitedBy,
    }],
  });

  invite.status = "ACCEPTED";
  invite.acceptedBy = adminUser._id;
  invite.acceptedAt = new Date();
  await invite.save();

  await logAudit({
    actor: adminUser._id,
    action: "admin.invite.accepted",
    targetType: "user",
    target: adminUser._id,
    newValue: { email: invite.email, roles: invite.roles, linkedExisting: false },
    req,
  });

  return res.status(201).json(new ApiResponse("Admin account activated successfully", {
    user: sanitizeUser(adminUser),
    isExistingUser: false,
  }));
});

exports.resendAdminInvite = asyncHandler(async (req, res) => {
  const { inviteId } = req.params;
  const invite = await AdminInvite.findById(inviteId);

  if (!invite) {
    throw new ApiError(404, "INVITE_NOT_FOUND", "Invitation was not found");
  }

  if (invite.status === "ACCEPTED") {
    throw new ApiError(400, "INVITE_ALREADY_ACCEPTED", "Cannot resend an invitation that has already been accepted.");
  }

  // Token rotation: generate new raw token & hash, invalidate old token
  const rawToken = crypto.randomBytes(32).toString("hex");
  invite.tokenHash = hashToken(rawToken);
  invite.status = "PENDING";
  invite.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  invite.resentAt = new Date();
  invite.resendCount = (invite.resendCount || 0) + 1;
  await invite.save();

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const url = `${frontendUrl}/admin/invite/accept/${rawToken}`;

  try {
    await mailSender(
      invite.email,
      "Reminder: You're invited to join Samaj Administration | Adivasi Halba/Halbi Samaj Kalyan Samiti",
      adminInviteEmail({ email: invite.email, roles: invite.roles, url })
    );
  } catch (mailError) {
    console.error(`[Admin.js] Invitation resent (ID: ${invite._id}) but email sending failed:`, mailError.message);
  }

  await logAudit({
    actor: req.user.id,
    action: "admin.invite.resent",
    targetType: "adminInvite",
    target: invite._id,
    newValue: { email: invite.email, roles: invite.roles, resendCount: invite.resendCount },
    req,
  });

  return res.status(200).json(new ApiResponse("Invitation resent successfully", { invite }));
});

exports.listAdminInvites = asyncHandler(async (req, res) => {
  // Auto-expire past pending invites
  await AdminInvite.updateMany(
    { status: "PENDING", expiresAt: { $lte: new Date() } },
    { status: "EXPIRED" }
  );

  const [invites, activeAdmins] = await Promise.all([
    AdminInvite.find()
      .populate("invitedBy", "firstName lastName email")
      .populate("acceptedBy", "firstName lastName email")
      .populate("revokedBy", "firstName lastName email")
      .sort({ createdAt: -1 })
      .limit(200),
    User.find({ accountType: "Admin", accountStatus: "ACTIVE" })
      .select("firstName lastName email roles createdAt imageUrl approved")
      .sort({ createdAt: -1 }),
  ]);

  return res.status(200).json(new ApiResponse("Admin invites fetched successfully", {
    invites,
    activeAdmins,
  }));
});

exports.revokeAdminInvite = asyncHandler(async (req, res) => {
  const invite = await AdminInvite.findById(req.params.inviteId);

  if (!invite) {
    throw new ApiError(404, "ADMIN_INVITE_NOT_FOUND", "Invite was not found");
  }

  if (invite.status === "ACCEPTED") {
    throw new ApiError(400, "CANNOT_REVOKE_ACCEPTED_INVITE", "Accepted invitations cannot be revoked. To remove admin privileges, use Admin Role Management on the active administrator.");
  }

  if (invite.status !== "PENDING") {
    throw new ApiError(400, "ADMIN_INVITE_NOT_REVOKABLE", `Invite is already ${invite.status.toLowerCase()}`);
  }

  invite.status = "REVOKED";
  invite.revokedAt = new Date();
  invite.revokedBy = req.user.id;
  invite.revocationReason = req.body.reason || "Revoked by admin";
  await invite.save();

  await logAudit({
    actor: req.user.id,
    action: "admin.invite.revoked",
    targetType: "adminInvite",
    target: invite._id,
    oldValue: { status: "PENDING" },
    newValue: { status: "REVOKED", reason: invite.revocationReason },
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

