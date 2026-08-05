import mongoose from "mongoose";

const legalDocumentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["terms-of-service", "privacy-policy"],
      required: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100000,
    },
    version: {
      type: Number,
      default: 0,
      min: 0,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

export const LegalDocument = mongoose.model(
  "LegalDocument",
  legalDocumentSchema,
);
