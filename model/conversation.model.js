import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    participants: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ],
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job", default: null },
    lastMessageAt: { type: Date, default: null },
    lastMessageText: { type: String, default: "" },

    hiddenFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

schema.index({ participants: 1 });

export const Conversation = mongoose.model("Conversation", schema);
