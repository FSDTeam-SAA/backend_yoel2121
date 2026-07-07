import { Router } from "express";
import {
  allApplications,
  approveEditRejectReview,
  approveRejectUser,
  createCarouselItem,
  createCategory,
  deleteCarouselItem,
  deleteCategory,
  deleteUser,
  getAdminOverview,
  getApplicationDetailsAdmin,
  getReviewDetailsAdmin,
  listCarouselsAdmin,
  listCategories,
  listReviews,
  listUsers,
  moderateJob,
  updateCarouselItem,
  updateCategory,
} from "../controller/admin.controller.js";
import { protect, requireAdmin } from "../middleware/auth.middleware.js";
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

router.get("/carousels", protect, requireAdmin, listCarouselsAdmin);
router.post(
  "/carousels",
  protect,
  requireAdmin,
  upload.single("image"),
  createCarouselItem,
);
router.patch(
  "/carousels/:carouselId",
  protect,
  requireAdmin,
  upload.single("image"),
  updateCarouselItem,
);
router.delete("/carousels/:carouselId", protect, requireAdmin, deleteCarouselItem);

export default router;
