import { Router } from "express";
import {
  approveEditRejectReview,
  approveRejectUser,
  deleteCategory,
  deleteUser,
  getAdminOverview,
  listCategories,
  listReviews,
  listUsers,
  moderateJob,
  updateCategory,
  getReviewDetailsAdmin,
  allApplications,
  getApplicationDetailsAdmin,
} from "../controller/admin.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const router = Router();

router.get("/users", protect, listUsers);
router.patch("/users/:userId/status", protect, approveRejectUser);
router.delete("/users/:userId", protect, deleteUser);

router.get("/overview", protect, getAdminOverview);

router.patch("/jobs/:jobId/moderate", protect, moderateJob);

router.get("/reviews", protect, listReviews);
router.get("/reviews/:reviewId", protect, getReviewDetailsAdmin);
router.patch("/reviews/:reviewId", protect, approveEditRejectReview);


router.get("/categories", listCategories);
router.patch("/categories/:categoryId", protect, updateCategory);
router.delete("/categories/:categoryId", protect, deleteCategory);

router.get("/applications", protect, allApplications);
router.get("/applications/:applicationId", protect, getApplicationDetailsAdmin);

export default router;   
