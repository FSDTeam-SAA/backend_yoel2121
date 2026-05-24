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

    stars: { type: Number, min: 1, max: 5, required: true },
    text: { type: String, default: "" },
    completedMedia: [
      {
        public_id: { type: String, default: "" },
        url: { type: String, default: "" },
      },
    ],
    adminEditedText: { type: String, default: "" },
    adminNote: { type: String, default: "" },
  },
  { timestamps: true },
);

schema.index({ jobId: 1, userId: 1 }, { unique: true });

export const Review = mongoose.model("Review", schema);
