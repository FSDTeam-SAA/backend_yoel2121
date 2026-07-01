import AppError from "../errors/AppError.js";
import { DeviceToken } from "../model/deviceToken.model.js";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";

export const registerDeviceToken = catchAsync(async (req, res, next) => {
  const { token, platform } = req.body;

  if (!token || !platform) {
    return next(new AppError(400, "token and platform are required"));
  }
  if (!["ios", "android", "web"].includes(platform)) {
    return next(new AppError(400, "platform must be ios, android, or web"));
  }

  const deviceToken = await DeviceToken.findOneAndUpdate(
    { token },
    { token, platform, user: req.user._id },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Device token registered",
    data: deviceToken,
  });
});

export const unregisterDeviceToken = catchAsync(async (req, res, next) => {
  const { token } = req.body;

  if (!token) {
    return next(new AppError(400, "token is required"));
  }

  await DeviceToken.deleteOne({ token, user: req.user._id });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Device token unregistered",
    data: {},
  });
});
