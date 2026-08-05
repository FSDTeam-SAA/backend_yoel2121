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
  getUserDetails,
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

router.use(protect, requireAdmin);

router.get("/users", listUsers);
router.get("/users/:userId", getUserDetails);
router.patch("/users/:userId/status", approveRejectUser);
router.delete("/users/:userId", deleteUser);

router.get("/overview", getAdminOverview);

router.patch("/jobs/:jobId/moderate", moderateJob);

router.get("/reviews", listReviews);
router.get("/reviews/:reviewId", getReviewDetailsAdmin);
router.patch("/reviews/:reviewId", approveEditRejectReview);

router.get("/categories", listCategories);
router.post("/categories", upload.single("image"), createCategory);
router.patch(
  "/categories/:categoryId",
  upload.single("image"),
  updateCategory,
);
router.delete("/categories/:categoryId", deleteCategory);

router.get("/applications", allApplications);
router.get("/applications/:applicationId", getApplicationDetailsAdmin);

router.get("/carousels", listCarouselsAdmin);
router.post(
  "/carousels",
  upload.single("image"),
  createCarouselItem,
);
router.patch(
  "/carousels/:carouselId",
  upload.single("image"),
  updateCarouselItem,
);
router.delete("/carousels/:carouselId", deleteCarouselItem);

export default router;
