const Notification = require("../Models/notification");
const ApiError = require("../Utilities/ApiError");
const ApiResponse = require("../Utilities/ApiResponse");
const asyncHandler = require("../Utilities/asyncHandler");

exports.listMyNotifications = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  const skip = (page - 1) * limit;

  const filter = {
    recipient: req.user.id,
    channel: "IN_APP",
  };

  if (req.query.status) filter.status = req.query.status;

  const [notifications, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments({ recipient: req.user.id, channel: "IN_APP", status: "UNREAD" }),
  ]);

  return res.status(200).json(new ApiResponse("Notifications fetched successfully", {
    notifications,
    unreadCount,
  }, {
    page,
    limit,
    count: notifications.length,
  }));
});

exports.markNotificationRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    {
      _id: req.params.notificationId,
      recipient: req.user.id,
      channel: "IN_APP",
    },
    {
      status: "READ",
      readAt: new Date(),
    },
    { new: true }
  );

  if (!notification) {
    throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "Notification was not found");
  }

  return res.status(200).json(new ApiResponse("Notification marked as read", { notification }));
});

exports.markAllNotificationsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    {
      recipient: req.user.id,
      channel: "IN_APP",
      status: "UNREAD",
    },
    {
      status: "READ",
      readAt: new Date(),
    }
  );

  return res.status(200).json(new ApiResponse("All notifications marked as read"));
});
