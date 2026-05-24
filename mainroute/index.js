import { Router } from "express";

import authRoutes from "../route/auth.route.js";
import adminRoutes from "../route/admin.route.js";
import categoryRoutes from "../route/category.route.js";
import jobRoutes from "../route/job.route.js";
import applicationRoutes from "../route/application.route.js";
import conversationRoutes from "../route/conversation.route.js";
import messageRoutes from "../route/message.route.js";
import reviewRoutes from "../route/review.route.js";
import userRoutes from "../route/user.route.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/admin", adminRoutes);
router.use("/categories", categoryRoutes);
router.use("/jobs", jobRoutes);
router.use("/applications", applicationRoutes);
router.use("/conversations", conversationRoutes);
router.use("/messages", messageRoutes);
router.use("/reviews", reviewRoutes);

export default router;
