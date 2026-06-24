import express from "express";
import { diditWebhook } from "../controller/didit.controller.js";

const router = express.Router();

router.post("/webhook", diditWebhook);

export default router;
