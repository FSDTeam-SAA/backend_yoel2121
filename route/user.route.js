import express from "express";
import {
  changePassword,
  getProfile,
  updateProfile,
  userLocationUpdate,
  servicesNearYou,
  getTradespersonProfile,
} from "../controller/user.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

router.get("/", protect, getProfile);
router.get("/tradesperson/:tradespersonId", getTradespersonProfile);
router.put("/location", protect, userLocationUpdate);
router.get("/services/near-you", protect, servicesNearYou);
router.put("/update-profile", protect, upload.single("avatar"), updateProfile);
router.put("/change-password", protect, changePassword);

export default router;
