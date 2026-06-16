import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tradespersonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    revieweeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reviewerRole: {
      type: String,
      enum: ["user", "tradesperson"],
      required: true,
    },

    stars: { type: Number, min: 1, max: 5, required: true },
    text: { type: String, default: "" },
    completedMedia: [
      {
        public_id: { type: String, default: "" },
        url: { type: String, default: "" },
      },
    ],
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "edited"],
      default: "pending",
      index: true,
    },
    adminEditedText: { type: String, default: "" },
    adminNote: { type: String, default: "" },
  },
  { timestamps: true },
);

schema.index({ jobId: 1, userId: 1 }, { unique: true });

export const Review = mongoose.model("Review", schema);
