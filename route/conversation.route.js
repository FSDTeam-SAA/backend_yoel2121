import { Router } from "express";

import {
  createOrGetConversation,
  hideConversation,
  listMyConversations,
} from "../controller/conversation.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/", protect, createOrGetConversation);
router.get("/me", protect, listMyConversations);
router.patch("/:conversationId/hide", protect, hideConversation);

export default router;
