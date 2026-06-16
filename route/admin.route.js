import { Router } from "express";
import {
  allApplications,
  approveEditRejectReview,
  approveRejectUser,
  createCategory,
  deleteCategory,
  deleteUser,
  getAdminOverview,
  getApplicationDetailsAdmin,
  getReviewDetailsAdmin,
  listCategories,
  listReviews,
  listUsers,
  moderateJob,
  updateCategory,
} from "../controller/admin.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

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
router.post("/categories", protect, upload.single("image"), createCategory);
router.patch(
  "/categories/:categoryId",
  protect,
  upload.single("image"),
  updateCategory,
);
router.delete("/categories/:categoryId", protect, deleteCategory);

router.get("/applications", protect, allApplications);
router.get("/applications/:applicationId", protect, getApplicationDetailsAdmin);

export default router;
