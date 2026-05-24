import { Router } from "express";
import {
  applyToJob,
  getApplication,
  userDecision,
  listMyApplications,
  updateApplicationPending,
} from "../controller/application.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";
import { allApplications } from "../controller/admin.controller.js";

const router = Router();

router.get("/me", protect, listMyApplications);
router.post(
  "/jobs/:jobId/apply",
  protect,
  upload.array("files", 10),
  applyToJob,
);
router.patch(
  "/:applicationId",
  protect,
  upload.array("files", 10),
  updateApplicationPending,
);

router.patch("/:applicationId/decision", protect, userDecision);

// all applications
router.get("/", protect, allApplications);

router.get("/:applicationId", protect, getApplication);

export default router;
