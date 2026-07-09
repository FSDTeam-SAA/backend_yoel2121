import { Router } from "express";
import { getActiveCarousels } from "../controller/carousel.controller.js";

const router = Router();

// Public: banners don't depend on the logged-in user, and the guest home
// screen needs to show them before login.
router.get("/", getActiveCarousels);

export default router;
