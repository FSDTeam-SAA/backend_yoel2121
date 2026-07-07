import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["ad", "coupon"],
      required: true,
    },
    title: { type: String, required: true },
    subtitle: { type: String, required: true },
    image: {
      public_id: { type: String, default: "" },
      url: { type: String, default: "" },
    },
    link: { type: String, default: "" },

    // coupon-only field
    discountPercentage: { type: Number, default: null },

    order: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export const Carousel = mongoose.model("Carousel", schema);
