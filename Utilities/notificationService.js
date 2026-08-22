const Notification = require("../Models/notification");
const User = require("../Models/user");
const { mailSender } = require("./mailSender");

async function createNotification({ recipient, title, message, link, metadata }) {
  return Notification.create({
    recipient,
    title,
    message,
    link,
    metadata,
  });
}

async function notifyUser({ recipient, title, message, link, metadata, email = false }) {
  const notification = await createNotification({ recipient, title, message, link, metadata });

  if (!email) return notification;

  const user = await User.findById(recipient).select("email");
  if (!user?.email) return notification;

  try {
    await mailSender(user.email, title, `<p>${message}</p>${link ? `<p><a href="${link}">Open</a></p>` : ""}`);
    await Notification.create({
      recipient,
      channel: "EMAIL",
      title,
      message,
      link,
      status: "SENT",
      metadata,
    });
  } catch (error) {
    await Notification.create({
      recipient,
      channel: "EMAIL",
      title,
      message,
      link,
      status: "FAILED",
      metadata: {
        ...metadata,
        error: error.message,
      },
    });
  }

  return notification;
}

module.exports = {
  createNotification,
  notifyUser,
};
