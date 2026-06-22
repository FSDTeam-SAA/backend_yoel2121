import { Router } from "express";
import {
  confirmJobPayment,
  getMyPayments,
  initiateJobPayment,
  listAllPayments,
} from "../controller/payment.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = Router();

// User: initiate payment → get clientSecret → confirm payment with Stripe.js → call confirm
router.post("/initiate", protect, initiateJobPayment);
router.post("/confirm", protect, confirmJobPayment);

// User: own payment history
router.get("/my", protect, getMyPayments);

// Admin: all payments
router.get("/", protect, listAllPayments);

export default router;
