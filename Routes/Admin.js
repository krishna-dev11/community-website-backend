const express = require("express");
const {
  createAdminInvite,
  validateAdminInvite,
  acceptAdminInvite,
  resendAdminInvite,
  listAdminInvites,
  revokeAdminInvite,
  updateUserRoles,
  listUsers,
  updateUserStatus,
  anonymizeUserAccount,
} = require("../Controllers/Admin");
const { auth, authorize } = require("../Middlewares/auth");

const router = express.Router();

router.get("/invites/validate/:token", validateAdminInvite);
router.post("/invites/accept", acceptAdminInvite);
router.post("/invites", auth, authorize("admin:invite"), createAdminInvite);
router.post("/invites/:inviteId/resend", auth, authorize("admin:invite"), resendAdminInvite);
router.get("/invites", auth, authorize("admin:invite"), listAdminInvites);
router.patch("/invites/:inviteId/revoke", auth, authorize("admin:invite"), revokeAdminInvite);
router.patch("/users/:userId/roles", auth, authorize("admin:roles"), updateUserRoles);
router.get("/users", auth, authorize("admin:users"), listUsers);
router.patch("/users/:userId/status", auth, authorize("admin:users"), updateUserStatus);
router.patch("/users/:userId/anonymize", auth, authorize("admin:users"), anonymizeUserAccount);

module.exports = router;
