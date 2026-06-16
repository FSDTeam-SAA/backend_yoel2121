import { Notification } from "../model/notification.model.js";
import { User } from "../model/user.model.js";
import { io } from "../server.js";

const uniqueIds = (ids) => [
  ...new Set(ids.filter(Boolean).map((id) => String(id))),
];

export const emitUnreadNotificationCount = async (userId) => {
  const unreadCount = await Notification.countDocuments({
    user: userId,
    isRead: false,
  });

  io.to(`user_${userId}`).emit("notification:unreadCount", {
    count: unreadCount,
  });
};

export const sendNotification = async ({
  userId,
  title,
  message,
  type,
  data = {},
}) => {
  if (!userId) return null;

  try {
    const notification = await Notification.create({
      user: userId,
      title,
      message,
      type,
      data,
    });

    await emitNotification(String(userId), notification.toObject());
    return notification;
  } catch (error) {
    console.error("Notification error:", error);
    return null;
  }
};

export const sendNotifications = async (userIds, payload) => {
  const ids = uniqueIds(userIds);
  return Promise.all(ids.map((userId) => sendNotification({ userId, ...payload })));
};

export const notifyAdmins = async (payload) => {
  try {
    const admins = await User.find({ role: "admin" }).select("_id").lean();
    return sendNotifications(
      admins.map((admin) => admin._id),
      payload,
    );
  } catch (error) {
    console.error("Admin notification error:", error);
    return null;
  }
};

const emitNotification = async (userId, notification) => {
  io.to(`user_${userId}`).emit("notification:new", notification);
  await emitUnreadNotificationCount(userId);
};
