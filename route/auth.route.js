import express from "express";
import {
  changePassword,
  forgetPassword,
  googleLogin,
  login,
  logout,
  refreshToken,
  register,
  resetPassword,
  resetPasswordOTP,
  verifyOTP,
  resendVerificationOTP,
} from "../controller/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/google", googleLogin);
router.post("/register", register);
router.post("/login", login);
router.post("/verify", verifyOTP);
router.post("/verify-otp", resetPasswordOTP);
router.post("/forget", forgetPassword);
router.post("/reset-password", resetPassword);
router.post("/change-password", protect, changePassword);
router.post("/refresh-token", refreshToken);
router.post("/logout", protect, logout);

router.post("/resend-otp", resendVerificationOTP);

export default router;
