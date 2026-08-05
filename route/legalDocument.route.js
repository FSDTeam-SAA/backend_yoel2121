import { Router } from "express";
import { getPublishedLegalDocument } from "../controller/legalDocument.controller.js";

const router = Router();

router.get("/:type", getPublishedLegalDocument);

export default router;
