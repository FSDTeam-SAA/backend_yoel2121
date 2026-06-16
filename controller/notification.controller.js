import AppError from "../errors/AppError.js";
import { Notification } from "../model/notification.model.js";
import catchAsync from "../utils/catchAsync.js";
import { emitUnreadNotificationCount } from "../utils/notification.js";
import sendResponse from "../utils/sendResponse.js";

export const listMyNotifications = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, isRead } = req.query;
  const pageNum = Number(page);
  const limitNum = Number(limit);

  const filter = { user: req.user._id };
  if (isRead !== undefined) filter.isRead = isRead === "true";

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: req.user._id, isRead: false }),
  ]);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Notifications fetched",
    data: notifications,
    meta: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
      unreadCount,
    },
  });
});

export const getUnreadNotificationCount = catchAsync(async (req, res) => {
  const count = await Notification.countDocuments({
    user: req.user._id,
    isRead: false,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Unread notification count",
    data: { count },
  });
});

export const markNotificationRead = catchAsync(async (req, res, next) => {
  const notification = await Notification.findOne({
    _id: req.params.notificationId,
    user: req.user._id,
  });

  if (!notification) return next(new AppError(404, "Notification not found"));

  notification.isRead = true;
  await notification.save();
  await emitUnreadNotificationCount(req.user._id);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Notification marked as read",
    data: notification,
  });
});

export const markAllNotificationsRead = catchAsync(async (req, res) => {
  await Notification.updateMany(
    { user: req.user._id, isRead: false },
    { $set: { isRead: true } },
  );
  await emitUnreadNotificationCount(req.user._id);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "All notifications marked as read",
    data: {},
  });
});
