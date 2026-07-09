import express from "express";
import {
  changePassword,
  getCurrentLocation,
  getProfile,
  updateProfile,
  userLocationUpdate,
  servicesNearYou,
  getTradespersonProfile,
  createKycSession,
  requestAccountDeletion,
  confirmAccountDeletion,
} from "../controller/user.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

router.get("/", protect, getProfile);
router.get("/tradesperson/:tradespersonId", getTradespersonProfile);
router.get("/location", protect, getCurrentLocation);
router.put("/location", protect, userLocationUpdate);
router.get("/services/near-you", protect, servicesNearYou);
router.put("/update-profile", protect, upload.single("avatar"), updateProfile);
router.put("/change-password", protect, changePassword);
router.post("/kyc/session", protect, createKycSession);
router.post("/delete-account/request", protect, requestAccountDeletion);
router.post("/delete-account/confirm", protect, confirmAccountDeletion);

export default router;
