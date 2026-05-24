import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      strictPopulate: false,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tradespersonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    price: { type: Number, default: 0 },
    estimatedStartDate: { type: Date, default: null },
    additionalInfo: { type: String, default: "" },
    relatedFiles: [{ type: String }],

    status: {
      type: String,
      enum: ["pending", "active", "lost", "withdrawn"],
      default: "pending",
    },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

schema.index({ jobId: 1, tradespersonId: 1 }, { unique: true });

export const Application = mongoose.model("Application", schema);
