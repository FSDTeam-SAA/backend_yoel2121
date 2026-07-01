import mongoose, { Schema } from "mongoose";

const deviceTokenSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    token: { type: String, required: true, unique: true },
    platform: {
      type: String,
      enum: ["ios", "android", "web"],
      required: true,
    },
  },
  { timestamps: true }
);

export const DeviceToken = mongoose.model("DeviceToken", deviceTokenSchema);
