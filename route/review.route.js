import { Router } from "express";

import {
  listTradespersonReviewsPublic,
  listReviews,
  submitJobReview,
} from "../controller/review.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = Router();

router.get(
  "/tradesperson/:tradespersonId",
  protect,
  listTradespersonReviewsPublic
);

router.get("/", protect, listReviews);

router.post(
  "/jobs/:jobId",
  protect,
  upload.array("files", 10),
  submitJobReview
);

export default router;
