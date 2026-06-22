import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    title: { type: String, required: true },
    description: { type: String, default: "" },

    budget: {
      type: Number,
      min: 0,
      default: null,
    },

    locationText: { type: String, default: "" },
    locationGeo: {
      type: {
        type: String,
        enum: ["Point"],
        required: true,
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },

    media: [{ type: String }],

    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },

    tradePerson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    progressStage: {
      type: Number,
      enum: [0, 1, 2, 3],
      default: 0,
    },

    startedAt: { type: Date },
    completedAt: { type: Date },

    finishedWorkPhotos: [
      {
        type: String,
      },
    ],

    visibility: {
      type: String,
      enum: ["public"],
      default: "public",
      index: true,
    },

    invitedTradespersonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "started",
        "open_to_quotes",
        "ongoing",
        "in_progress",
        "completed",
        "cancelled",
        "inactive",
        "moderated_by_admin",
        "awarded",
      ],
      default: "pending",
      index: true,
    },

    moderatedByAdmin: { type: Boolean, default: false },

    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid"],
      default: "unpaid",
      index: true,
    },

    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },
  },
  { timestamps: true },
);

schema.index({ locationGeo: "2dsphere" });
schema.index({ title: "text", description: "text" });

export const Job = mongoose.model("Job", schema);
