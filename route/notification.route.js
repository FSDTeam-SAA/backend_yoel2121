import { Router } from "express";
import {
  getUnreadNotificationCount,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../controller/notification.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", protect, listMyNotifications);
router.get("/unread-count", protect, getUnreadNotificationCount);
router.patch("/read-all", protect, markAllNotificationsRead);
router.patch("/:notificationId/read", protect, markNotificationRead);

export default router;
