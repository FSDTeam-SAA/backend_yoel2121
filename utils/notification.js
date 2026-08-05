import { Notification } from "../model/notification.model.js";
import { User } from "../model/user.model.js";
import { DeviceToken } from "../model/deviceToken.model.js";
import { getMessaging } from "./firebase.js";
import { getIo } from "./socket.js";

const uniqueIds = (ids) => [
  ...new Set(ids.filter(Boolean).map((id) => String(id))),
];

const INVALID_TOKEN_ERRORS = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

const sendPushToUser = async (userId, { title, message, type, data = {} }) => {
  try {
    const messaging = getMessaging();
    if (!messaging) return;

    const deviceTokens = await DeviceToken.find({ user: userId }).select("token");
    if (!deviceTokens.length) return;

    const tokens = deviceTokens.map((d) => d.token);
    const stringData = Object.fromEntries(
      Object.entries({ type, ...data }).map(([key, value]) => [key, String(value)])
    );

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body: message },
      data: stringData,
    });

    const invalidTokens = response.responses
      .map((r, i) => (!r.success && INVALID_TOKEN_ERRORS.has(r.error?.code) ? tokens[i] : null))
      .filter(Boolean);

    if (invalidTokens.length) {
      await DeviceToken.deleteMany({ token: { $in: invalidTokens } });
    }
  } catch (error) {
    console.error("Push notification error:", error);
  }
};

export const emitUnreadNotificationCount = async (userId) => {
  const unreadCount = await Notification.countDocuments({
    user: userId,
    isRead: false,
  });

  const io = getIo();
  if (!io) return;

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
    await sendPushToUser(userId, { title, message, type, data });
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
  const io = getIo();
  if (!io) return;

  io.to(`user_${userId}`).emit("notification:new", notification);
  await emitUnreadNotificationCount(userId);
};
