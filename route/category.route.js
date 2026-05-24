import { Router } from "express";
import {
  listApprovedCategories,
  proposeCategory,
  listJobByCategory,
} from "../controller/category.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", listApprovedCategories);
router.get("/:categoryId", listJobByCategory);
router.post("/propose", protect, proposeCategory);

export default router;
