import { Router } from "express";
import { getActiveCarousels } from "../controller/carousel.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", protect, getActiveCarousels);

export default router;
