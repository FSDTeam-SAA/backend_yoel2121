import { Router } from "express";

import {
  listMessages,
  markRead,
  sendMessage,
} from "../controller/message.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/:conversationId", protect, listMessages);
router.post("/:conversationId", protect, sendMessage);
router.patch("/:conversationId/read", protect, markRead);

export default router;
