import { Router } from "express";
import {
  createJobPublic,
  updateJob,
  getJobDetails,
  listApplicantsForJob,
  listJobsNearYou,
  listMyJobsuser,
  updateJobStatususer,
  getCurrentJobs,
  getTradespersonJobFeed,
  updateJobProgress,
} from "../controller/job.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = Router();

// Tradesperson feed
router.get("/feed", protect, getTradespersonJobFeed);
router.patch("/:jobId", protect, upload.array("files", 10), updateJob);

router.get("/current-jobs", protect, getCurrentJobs);
// Tradesperson feed
router.get("/near-you", protect, listJobsNearYou);

// Public details
router.get("/:jobId", getJobDetails);

// user
router.post("/", protect, upload.array("files", 10), createJobPublic);
router.get("/me/user", protect, listMyJobsuser);
router.get("/:jobId/applicants", protect, listApplicantsForJob);
router.patch("/:jobId/status", protect, updateJobStatususer);
router.patch("/:jobId/progress", protect, updateJobProgress);

export default router;
