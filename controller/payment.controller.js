import Stripe from "stripe";
import AppError from "../errors/AppError.js";
import { Job } from "../model/job.model.js";
import { Payment } from "../model/payment.model.js";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";

const JOB_FEE_CENTS = 1000; // 1000 cents = $10.00 USD
const JOB_FEE_CURRENCY = "usd";

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY);

// POST /payments/initiate   body: { jobId }
// Creates a Stripe PaymentIntent. Only the awarded tradesperson can pay for a job.
export const initiateJobPayment = catchAsync(async (req, res, next) => {
  const { jobId } = req.body;
  if (!jobId) return next(new AppError(400, "jobId is required"));

  const job = await Job.findById(jobId);
  if (!job) return next(new AppError(404, "Job not found"));

  if (job.status !== "awarded")
    return next(new AppError(400, "Payment is only required for awarded jobs"));

  if (!job.tradePerson || String(job.tradePerson) !== String(req.user._id))
    return next(new AppError(403, "Only the awarded tradesperson can pay for this job"));

  if (job.paymentStatus === "paid")
    return next(new AppError(400, "Payment already completed for this job"));

  const stripe = getStripe();

  const paymentIntent = await stripe.paymentIntents.create({
    amount: JOB_FEE_CENTS,
    currency: JOB_FEE_CURRENCY,
    metadata: {
      jobId: jobId.toString(),
      userId: req.user._id.toString(),
    },
  });

  await Payment.create({
    userId: req.user._id,
    jobId,
    stripePaymentIntentId: paymentIntent.id,
    amount: JOB_FEE_CENTS,
    currency: JOB_FEE_CURRENCY,
    status: "pending",
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Payment initiated",
    data: {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: 10,
      currency: "USD",
    },
  });
});

// POST /payments/confirm   body: { paymentIntentId }
// Verifies payment with Stripe and marks the job as paid.
export const confirmJobPayment = catchAsync(async (req, res, next) => {
  const { paymentIntentId } = req.body;
  if (!paymentIntentId) return next(new AppError(400, "paymentIntentId is required"));

  const payment = await Payment.findOne({
    stripePaymentIntentId: paymentIntentId,
    userId: req.user._id,
  });
  if (!payment) return next(new AppError(404, "Payment record not found"));

  // Idempotency: already confirmed
  if (payment.status === "succeeded") {
    const job = await Job.findById(payment.jobId);
    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Payment already confirmed",
      data: { payment, job },
    });
  }

  const stripe = getStripe();
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (paymentIntent.status !== "succeeded") {
    payment.status = "failed";
    await payment.save();
    return next(
      new AppError(400, `Payment not completed. Stripe status: ${paymentIntent.status}`),
    );
  }

  payment.status = "succeeded";
  payment.paidAt = new Date();
  await payment.save();

  const job = await Job.findByIdAndUpdate(
    payment.jobId,
    { paymentStatus: "paid", paymentId: payment._id },
    { new: true },
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Payment confirmed. Job is now active.",
    data: { payment, job },
  });
});

// GET /payments/my
export const getMyPayments = catchAsync(async (req, res) => {
  const payments = await Payment.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .populate("jobId", "title status paymentStatus locationText");

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Payment history fetched",
    data: payments,
  });
});

// GET /payments   (admin)
export const listAllPayments = catchAsync(async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status) filter.status = status;

  const payments = await Payment.find(filter)
    .sort({ createdAt: -1 })
    .populate("userId", "name email role")
    .populate("jobId", "title status paymentStatus locationText");

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Payments fetched",
    data: payments,
  });
});
