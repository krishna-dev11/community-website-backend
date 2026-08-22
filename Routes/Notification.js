const express = require("express");
const {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require("../Controllers/Notification");
const { auth } = require("../Middlewares/auth");

const router = express.Router();

router.get("/", auth, listMyNotifications);
router.patch("/read-all", auth, markAllNotificationsRead);
router.patch("/:notificationId/read", auth, markNotificationRead);

module.exports = router;
