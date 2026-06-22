import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      default: null,
      index: true,
    },

    stripePaymentIntentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    amount: { type: Number, default: 1000 }, // 1000 cents = $10.00 USD
    currency: { type: String, default: "usd" },

    status: {
      type: String,
      enum: ["pending", "succeeded", "failed"],
      default: "pending",
      index: true,
    },

    paidAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Payment = mongoose.model("Payment", paymentSchema);
