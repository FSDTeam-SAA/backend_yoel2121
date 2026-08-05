import { Router } from "express";
import {
  createJobPublic,
  updateJob,
  deleteJob,
  getJobDetails,
  getJobContactStatus,
  listApplicantsForJob,
  listJobsNearYou,
  listPublicJobs,
  listMyJobsuser,
  updateJobStatususer,
  getCurrentJobs,
  getTradespersonJobFeed,
  updateJobProgress,
  getRecentJobs,
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

// Public: recent completed jobs for a tradesperson
router.get("/tradesperson/:tradespersonId/recent", getRecentJobs);

// Public: browse jobs without logging in
router.get("/public", listPublicJobs);

// Public details
router.get("/:jobId", getJobDetails);

// user
router.post("/", protect, upload.array("files", 10), createJobPublic);
router.get("/me/user", protect, listMyJobsuser);
router.get("/:jobId/applicants", protect, listApplicantsForJob);
router.get("/:jobId/contact-status", protect, getJobContactStatus);
router.patch("/:jobId/status", protect, updateJobStatususer);
router.patch("/:jobId/progress", protect, updateJobProgress);
router.delete("/:jobId", protect, deleteJob);

export default router;
