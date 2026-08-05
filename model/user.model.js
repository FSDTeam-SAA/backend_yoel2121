import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["admin", "user", "homeowner", "tradesperson"],
      required: true,
      default: "user",
    },

    name: { type: String, default: "" },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },

    password: { type: String, default: null, select: false },

    phone: { type: String, default: "" },
    address: { type: String, default: "" },

    isEmailVerified: { type: Boolean, default: false },
    isKycVerified: { type: Boolean, default: false },
    emailVerificationOTP: { type: String, default: null, select: false },
    emailVerificationOTPExpiry: { type: Date, default: null, select: false },

    accountStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "suspended"],
      default: "approved",
      index: true,
    },

    profileImage: {
      public_id: { type: String, default: "" },
      url: { type: String, default: "" },
    },

    bio: { type: String, default: "" },

    operatingTrades: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    ],

    userLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: undefined,
      },
    },

    serviceArea: { type: String, default: "" },

    preferredRadiusKm: { type: Number, default: 25 },

    password_reset_token: { type: String, default: "", select: false },

    nationality: { type: String, default: "" },

    externalReviewLinks: {
      google: { type: String, default: "" },
      trustTrader: { type: String, default: "" },
    },

    externalRatings: {
      google: { type: Number, default: 0 },
      trustTrader: { type: Number, default: 0 },
    },

    ratingSummary: {
      avg: { type: Number, default: 0 },
      count: { type: Number, default: 0 },
    },

    googleId: String,
    appleId: String,
    facebookId: String,
    provider: {
      type: String,
      enum: ["email", "google", "apple", "facebook"],
      default: "email",
    },

    refreshToken: { type: String, default: "", select: false },
  },
  { timestamps: true },
);

userSchema.index({ userLocation: "2dsphere" });

userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    const saltRounds = Number(process.env.bcrypt_salt_round) || 10;
    this.password = await bcrypt.hash(this.password, saltRounds);
  }
  next();
});

userSchema.pre("save", function (next) {
  if (
    this.userLocation &&
    (!this.userLocation.coordinates ||
      this.userLocation.coordinates.length !== 2)
  ) {
    this.userLocation = undefined;
  }

  // Only tradesperson can have location
  if (this.role !== "tradesperson") {
    this.userLocation = undefined;
  }

  next();
});

userSchema.statics.isUserExistsByEmail = function (email) {
  return this.findOne({ email });
};

userSchema.statics.isPasswordMatched = async function (
  plainTextPassword,
  hashPassword,
) {
  return bcrypt.compare(plainTextPassword, hashPassword);
};

export const User = mongoose.model("User", userSchema);
