import mongoose, { mongo } from "mongoose";

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

    locationText: { type: String, default: "" },
    locationGeo: {
      type: {
        type: String,
        enum: ["Point"],
        required: true,
      },
      coordinates: {
        type: [Number], // [lng, lat]
        required: true,
        default: undefined,
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

    visibility: {
      type: String,
      enum: ["public", "private"],
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
        "open_to_quotes",
        "awarded",
        "in_progress",
        "completed",
        "inactive",
        "cancelled",
        "moderated_by_admin",
      ],
      default: "open_to_quotes",
      index: true,
    },

    moderatedByAdmin: { type: Boolean, default: false },
  },
  { timestamps: true },
);

schema.index({ locationGeo: "2dsphere" });

schema.index({ title: "text", description: "text" });

export const Job = mongoose.model("Job", schema);
