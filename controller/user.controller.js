import httpStatus from "http-status";
import mongoose from "mongoose";
import AppError from "../errors/AppError.js";
import { Category } from "../model/category.model.js";
import { Review } from "../model/review.model.js";
import { User } from "../model/user.model.js";
import catchAsync from "../utils/catchAsync.js";
import { generateOTP, uploadOnCloudinary } from "../utils/commonMethod.js";
import { sendEmail } from "../utils/sendEmail.js";
import sendResponse from "../utils/sendResponse.js";

const DIDIT_BASE_URL = "https://verification.didit.me";

const buildDeleteAccountOtpEmail = (otp) => `
  <p>Hello,</p>
  <p>We received a request to delete your ZENTROFIX account.</p>
  <p>Your confirmation code is <strong>${otp}</strong>.</p>
  <p>This code will expire in 10 minutes. Entering it will permanently delete your account and all associated data.</p>
  <p>If you did not request this, you can safely ignore this email.</p>
  <p>Regards,<br />ZENTROFIX Team</p>
`;

export const getProfile = catchAsync(async (req, res, next) => {
  const userId = req.user._id;

  const u = await User.findById(userId)
    .select(
      "name email profileImage bio serviceArea nationality address phone operatingTrades ratingSummary externalRatings externalReviewLinks role userLocation isKycVerified preferredRadiusKm",
    )
    .populate("operatingTrades", "name status");

  const tradiesReview = await Review.findOne({ revieweeId: userId })
    .sort({ createdAt: -1 })
    .populate("userId", "name profileImage")
    .lean();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Public profile",
    data: {
      u,
      tradiesReview,
    },
  });
});

export const getTradespersonProfile = catchAsync(async (req, res, next) => {
  const { tradespersonId } = req.params;
  const u = await User.findById(tradespersonId)
    .select(
      "name email phone profileImage bio serviceArea operatingTrades ratingSummary externalRatings externalReviewLinks role userLocation address",
    )
    .populate("operatingTrades", "name status");

  if (u.role !== "tradesperson")
    return next(new AppError(404, "User not found"));

  if (!u || u.role !== "tradesperson")
    return next(new AppError(404, "Tradesperson not found"));

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Public profile",
    data: u,
  });
});

export const getCurrentLocation = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id).select(
    "name role address serviceArea userLocation",
  );

  if (!user) return next(new AppError(404, "User not found"));

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Current location fetched successfully",
    data: {
      address: user.address,
      serviceArea: user.serviceArea,
      userLocation: user.userLocation,
    },
  });
});

export const userLocationUpdate = catchAsync(async (req, res, next) => {
  const { latitude, longitude,address } = req.body;

  const user = await User.findById(req.user._id);
  user.address = address || user.address;
  user.userLocation =
    longitude && latitude
      ? { type: "Point", coordinates: [Number(longitude), Number(latitude)] }
      : undefined;

  await user.save();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Location updated",
    data: user,
  });
});

export const updateProfile = catchAsync(async (req, res, next) => {
  const allowed = [
    "name",
    "phone",
    "address",
    "bio",
    "serviceArea",
    "nationality",
    "externalReviewLinks",
    "externalRatings",
    "preferredRadiusKm",
  ];

  const patch = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) {
      if (
        (k === "externalReviewLinks" || k === "externalRatings") &&
        typeof req.body[k] === "string"
      ) {
        patch[k] = JSON.parse(req.body[k]);
      } else {
        patch[k] = req.body[k];
      }
    }
  }

  if (req.body.operatingTrades) {
    const tradeName = req.body.operatingTrades.trim().toLowerCase();

    let category = await Category.findOne({
      name: new RegExp(`^${tradeName}$`, "i"),
    });

    if (!category) {
      category = await Category.create({
        name: tradeName,
        status: "pending",
        createdByTradespersonId: req.user._id,
      });

      patch.operatingTrades = category._id;
    }

    patch.operatingTrades = category._id;
  }

  const updatedUser = await User.findByIdAndUpdate(req.user._id, patch, {
    new: true,
    runValidators: true,
  }).populate("operatingTrades", "name status");

  if (req.file) {
    const upload = await uploadOnCloudinary(req.file.buffer);
    updatedUser.profileImage = {
      public_id: upload.public_id,
      url: upload.secure_url,
    };
    await updatedUser.save();
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile updated",
    data: updatedUser,
  });
});

export const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword)
    throw new AppError(httpStatus.BAD_REQUEST, "Passwords don't match");

  const user = await User.findById(req.user._id).select("+password");

  if (!(await User.isPasswordMatched(currentPassword, user.password))) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Current password wrong");
  }
  user.password = newPassword;

  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password changed",
  });
});

// Step 1 of account deletion: email the logged-in user a confirmation OTP.
export const requestAccountDeletion = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) throw new AppError(httpStatus.NOT_FOUND, "User not found");

  const otp = generateOTP();
  user.deleteAccountOTP = otp;
  user.deleteAccountOTPExpiry = Date.now() + 10 * 60 * 1000;
  await user.save();

  try {
    await sendEmail(
      user.email,
      "Confirm Account Deletion",
      buildDeleteAccountOtpEmail(otp),
    );
  } catch (err) {
    throw new AppError(500, "Failed to send OTP email");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "OTP sent to your email successfully",
  });
});

// Step 2 of account deletion: verify the OTP, then permanently delete the
// account (matches the existing admin.deleteUser behavior — no cascade of
// related jobs/applications).
export const confirmAccountDeletion = catchAsync(async (req, res) => {
  const { otp } = req.body;
  if (!otp) throw new AppError(httpStatus.BAD_REQUEST, "OTP is required");

  const user = await User.findById(req.user._id);
  if (!user) throw new AppError(httpStatus.NOT_FOUND, "User not found");

  if (
    !user.deleteAccountOTP ||
    !user.deleteAccountOTPExpiry ||
    user.deleteAccountOTP !== otp ||
    user.deleteAccountOTPExpiry < Date.now()
  ) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid or expired OTP");
  }

  await User.findByIdAndDelete(req.user._id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Account deleted successfully",
  });
});

export const servicesNearYou = catchAsync(async (req, res) => {
  const {
    lng,
    lat,
    radiusKm = 50,
    page = 1,
    limit = 10,
    categoryId,
    q,
  } = req.query;

  const pageNum = Number(page);
  const limitNum = Number(limit);

  const baseFilter = {
    role: "tradesperson",
    accountStatus: "approved",
    isEmailVerified: true,
  };

  if (categoryId) {
    baseFilter.operatingTrades = new mongoose.Types.ObjectId(categoryId);
  }

  if (q) {
    baseFilter.$or = [
      { name: new RegExp(q, "i") },
      { bio: new RegExp(q, "i") },
      { serviceArea: new RegExp(q, "i") },
    ];
  }

  const hasGeo =
    lng !== undefined &&
    lat !== undefined &&
    !isNaN(Number(lng)) &&
    !isNaN(Number(lat));

  if (!hasGeo) {
    return sendResponse(res, {
      statusCode: 400,
      success: false,
      message: "Latitude and longitude are required",
    });
  }

  const pipeline = [];

  pipeline.push({
    $geoNear: {
      near: {
        type: "Point",
        coordinates: [Number(lng), Number(lat)],
      },
      key: "userLocation",
      distanceField: "distanceMeters",
      spherical: true,
      maxDistance: Number(radiusKm) * 1000,
      query: baseFilter,
    },
  });

  pipeline.push({
    $addFields: {
      distanceKm: {
        $round: [{ $divide: ["$distanceMeters", 1000] }, 2],
      },
    },
  });

  pipeline.push({ $sort: { distanceMeters: 1 } });

  pipeline.push({ $skip: (pageNum - 1) * limitNum }, { $limit: limitNum });

  pipeline.push({
    $lookup: {
      from: "categories",
      localField: "operatingTrades",
      foreignField: "_id",
      as: "operatingTrades",
    },
  });

  pipeline.push({
    $project: {
      password: 0,
      refreshToken: 0,
      emailVerificationOTP: 0,
      emailVerificationOTPExpiry: 0,
      password_reset_token: 0,
      __v: 0,
    },
  });

  const services = await User.aggregate(pipeline);

  const countPipeline = [
    {
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [Number(lng), Number(lat)],
        },
        key: "userLocation",
        distanceField: "distanceMeters",
        spherical: true,
        maxDistance: Number(radiusKm) * 1000,
        query: baseFilter,
      },
    },
    { $count: "total" },
  ];

  const countResult = await User.aggregate(countPipeline);
  const total = countResult[0]?.total || 0;

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Services fetched successfully",
    data: services,
    meta: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

export const createKycSession = catchAsync(async (req, res, next) => {
  if (req.user.role !== "tradesperson") {
    return next(new AppError(httpStatus.FORBIDDEN, "Only tradespersons can submit KYC"));
  }

  const diditRes = await fetch(`${DIDIT_BASE_URL}/v3/session/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.DIDIT_API_KEY,
    },
    body: JSON.stringify({
      workflow_id: process.env.DIDIT_WORKFLOW_ID,
      vendor_data: String(req.user._id),
    }),
  });

  const data = await diditRes.json();

  if (!diditRes.ok) {
    return next(new AppError(httpStatus.BAD_GATEWAY, data?.detail || "Failed to create KYC session"));
  }

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "KYC session created",
    data: {
      session_id: data.session_id,
      url: data.url,
    },
  });
});
