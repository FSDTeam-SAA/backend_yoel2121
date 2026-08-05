import { Router } from "express";
import { getActiveCarousels } from "../controller/carousel.controller.js";

const router = Router();

router.get("/", getActiveCarousels);

export default router;
