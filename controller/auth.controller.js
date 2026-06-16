import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import { createToken, verifyToken } from "../utils/authToken.js";
import catchAsync from "../utils/catchAsync.js";
import { generateOTP } from "../utils/commonMethod.js";
import { sendEmail } from "../utils/sendEmail.js";
import sendResponse from "../utils/sendResponse.js";
import { notifyAdmins } from "../utils/notification.js";
import { User } from "./../model/user.model.js";

const generateVerificationCode = () => {
  return Math.floor(1000 + Math.random() * 9000);
};

const buildVerificationOtpEmail = (otp) => `
  <p>Hello,</p>
  <p>Thank you for signing up in ZENTROFIX.</p>
  <p>Your email verification code is <strong>${otp}</strong>.</p>
  <p>This code will expire in 10 minutes.</p>
  <p>If you did not request this code, you can ignore this email.</p>
  <p>Regards,<br />ZENTROFIX Team</p>
`;

const buildResetPasswordOtpEmail = (otp) => `
  <p>Hello,</p>
  <p>We received a request to reset your account password.</p>
  <p>Your password reset code is <strong>${otp}</strong>.</p>
  <p>This code will expire soon. If you did not request a password reset, please ignore this email.</p>
  <p>Regards,<br />ZENTROFIX Team</p>
`;

export const register = catchAsync(async (req, res, next) => {
  const {
    email,
    name,
    phone,
    address,
    password,
    confirmPassword,
    role,
    longitude,
    latitude,
  } = req.body;

  if (!email || !password || !confirmPassword) {
    return next(
      new AppError(400, "Email, password, and confirm password are required"),
    );
  }

  if (password !== confirmPassword) {
    return next(new AppError(400, "Passwords do not match"));
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError(400, "Email already registered"));
  }

  const payload = {
    name,
    email,
    password,
    phone,
    address,
    role,
    isEmailVerified: false,
    status: role === "user" ? "pending" : undefined,
    userLocation:
      longitude && latitude
        ? { type: "Point", coordinates: [Number(longitude), Number(latitude)] }
        : undefined,
  };

  const user = await User.create(payload);

  const otp = generateVerificationCode().toString();
  const otpExpiry = Date.now() + 10 * 60 * 1000;

  user.emailVerificationOTP = otp;
  user.emailVerificationOTPExpiry = otpExpiry;
  await user.save();

  try {
    await sendEmail(
      email,
      "Email Verification OTP",
      buildVerificationOtpEmail(otp),
    );
  } catch (err) {
    console.log(err);
    return next(new AppError(500, "Failed to send OTP email"));
  }
  await notifyAdmins({
    title: "New account registered",
    message: `${user.name || user.email} registered as ${user.role}.`,
    type: "user_registered",
    data: {
      userId: user._id,
      role: user.role,
      accountStatus: user.accountStatus,
    },
  });

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message:
      role === "user"
        ? "Registration successful. Please verify your email with the OTP sent & wait for admin approval."
        : "Registration successful. Please verify your email with the OTP sent.",
    data: {
      email: user.email,
      role: user.role,
    },
  });
});

export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.isUserExistsByEmail(email);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }
  if (
    user?.password &&
    !(await User.isPasswordMatched(password, user.password))
  ) {
    throw new AppError(httpStatus.FORBIDDEN, "Password is not correct");
  }

  if (
    user.accountStatus === "suspended" ||
    user.accountStatus === "rejected" ||
    user.accountStatus === "pending"
  ) {
    return sendResponse(res, {
      statusCode: httpStatus.FORBIDDEN,
      success: false,
      message: "Account is suspended, rejected, or pending approval.",
      data: { email: user.email },
    });
  }

  if (!user.isEmailVerified) {
    const otp = generateVerificationCode().toString();
    const otpExpiry = Date.now() + 10 * 60 * 1000;

    user.emailVerificationOTP = otp;
    user.emailVerificationOTPExpiry = otpExpiry;
    await user.save();

    try {
      await sendEmail(
        user.email,
        "Email Verification OTP",
        buildVerificationOtpEmail(otp),
      );
    } catch (err) {
      throw new AppError(500, "Failed to send OTP email");
    }

    return sendResponse(res, {
      statusCode: httpStatus.FORBIDDEN,
      success: false,
      message: "Email is not verified, please verify your OTP",
      data: { email: user.email },
    });
  }

  const jwtPayload = {
    _id: user._id,
    email: user.email,
    role: user.role,
  };
  const accessToken = createToken(
    jwtPayload,
    process.env.JWT_ACCESS_SECRET,
    process.env.JWT_ACCESS_EXPIRES_IN,
  );

  const refreshToken = createToken(
    jwtPayload,
    process.env.JWT_REFRESH_SECRET,
    process.env.JWT_REFRESH_EXPIRES_IN,
  );

  user.refreshToken = refreshToken;
  let _user = await user.save();

  res.cookie("refreshToken", refreshToken, {
    secure: true,
    httpOnly: true,
    sameSite: "none",
    maxAge: 1000 * 60 * 60 * 24 * 365,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User Logged in successfully",
    data: {
      accessToken,
      refreshToken: refreshToken,
      role: user.role,
      _id: user._id,
      user: user,
    },
  });
});

// export const register = catchAsync(async (req, res) => {
//   const { name, email, role, password, confirmPassword } = req.body;

//   if (!email || !password) {
//     throw new AppError(httpStatus.FORBIDDEN, "Please fill in all fields");
//   }

//   if (password !== confirmPassword) {
//     throw new AppError(
//       httpStatus.FORBIDDEN,
//       "Password and confirm password do not match"
//     );
//   }
//   const checkUser = await User.findOne({ email: email });
//   if (checkUser)
//     throw new AppError(
//       httpStatus.BAD_REQUEST,
//       "Email already exists, please try another email"
//     );

//   const payload = {
//     name,
//     email,
//     password,
//     role,
//     verificationInfo: { token: "", verified: true },
//     vendorStatus: role === "berber" ? "pending" : undefined,
//   };

//   if (role === "berber" && req.body.lat && req.body.lng) {
//     payload.address = {
//       location: {
//         type: "Point",
//         coordinates: [
//           parseFloat(req.body.lng),
//           parseFloat(req.body.lat),
//         ],
//       },
//     };
//   }

//   const user = await User.create(payload);

//   const jwtPayload = {
//     _id: user._id,
//     email: user.email,
//     role: user.role,
//   };
//   const accessToken = createToken(
//     jwtPayload,
//     process.env.JWT_ACCESS_SECRET,
//     process.env.JWT_ACCESS_EXPIRES_IN
//   );

//   const refreshToken = createToken(
//     jwtPayload,
//     process.env.JWT_REFRESH_SECRET,
//     process.env.JWT_REFRESH_EXPIRES_IN
//   );
//   user.refreshToken = refreshToken;
//   await user.save();
//   user.accessToken = accessToken;

//   const userObj = user.toObject();
//   userObj.accessToken = accessToken;

//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: "User registered successfully",
//     data: userObj,
//   });
// });

// export const login = catchAsync(async (req, res) => {
//   const { email, password } = req.body;
//   const user = await User.isUserExistsByEmail(email);
//   if (!user) {
//     throw new AppError(httpStatus.NOT_FOUND, "User not found");
//   }
//   if (
//     user?.password &&
//     !(await User.isPasswordMatched(password, user.password))
//   ) {
//     throw new AppError(httpStatus.FORBIDDEN, "Password is not correct");
//   }
//   if (!(await User.isOTPVerified(user._id))) {
//     const otp = generateOTP();
//     const jwtPayloadOTP = {
//       otp: otp,
//     };

//     const otptoken = createToken(
//       jwtPayloadOTP,
//       process.env.OTP_SECRET,
//       process.env.OTP_EXPIRE
//     );
//     user.verificationInfo.token = otptoken;
//     await user.save();
//     await sendEmail(user.email, "Registerd Account", `Your OTP is ${otp}`);

//     return sendResponse(res, {
//       statusCode: httpStatus.FORBIDDEN,
//       success: false,
//       message: "OTP is not verified, please verify your OTP",
//       data: { email: user.email },
//     });
//   }
//   const jwtPayload = {
//     _id: user._id,
//     email: user.email,
//     role: user.role,
//   };
//   const accessToken = createToken(
//     jwtPayload,
//     process.env.JWT_ACCESS_SECRET,
//     process.env.JWT_ACCESS_EXPIRES_IN
//   );

//   const refreshToken = createToken(
//     jwtPayload,
//     process.env.JWT_REFRESH_SECRET,
//     process.env.JWT_REFRESH_EXPIRES_IN
//   );

//   user.refreshToken = refreshToken;
//   let _user = await user.save();

//   res.cookie("refreshToken", refreshToken, {
//     secure: true,
//     httpOnly: true,
//     sameSite: "none",
//     maxAge: 1000 * 60 * 60 * 24 * 365,
//   });

//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: "User Logged in successfully",
//     data: {
//       accessToken,
//       refreshToken: refreshToken,
//       role: user.role,
//       _id: user._id,
//       user: user,
//     },
//   });
// });

export const forgetPassword = catchAsync(async (req, res) => {
  const { email } = req.body;

  const user = await User.isUserExistsByEmail(email);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  const otp = generateOTP();
  const otpPayload = { otp };
  const otpToken = createToken(
    otpPayload,
    process.env.OTP_SECRET,
    process.env.OTP_EXPIRE,
  );

  user.password_reset_token = otpToken;
  await user.save();

  const emailInfo = await sendEmail(
    user.email,
    "Reset Password",
    buildResetPasswordOtpEmail(otp),
  );

  const debugData =
    process.env.NODE_ENV === "production"
      ? null
      : {
          otp,
          email: user.email,
          messageId: emailInfo?.messageId,
          response: emailInfo?.response,
          accepted: emailInfo?.accepted,
          rejected: emailInfo?.rejected,
        };

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "OTP sent to your email successfully",
    data: debugData,
  });
});

export const resetPassword = catchAsync(async (req, res) => {
  const { email, otp, password } = req.body;

  const user = await User.isUserExistsByEmail(email);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (!user.password_reset_token) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Password reset token is invalid or expired",
    );
  }

  let decoded;
  try {
    decoded = verifyToken(user.password_reset_token, process.env.OTP_SECRET);
  } catch (err) {
    throw new AppError(httpStatus.BAD_REQUEST, "OTP expired or invalid");
  }

  if (decoded.otp !== otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid OTP");
  }

  user.password = password;
  user.password_reset_token = undefined;
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password reset successfully",
    data: null,
  });
});
export const resetPasswordOTP = catchAsync(async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.isUserExistsByEmail(email);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (!user.password_reset_token) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Password reset token is invalid or expired",
    );
  }

  let decoded;
  try {
    decoded = verifyToken(user.password_reset_token, process.env.OTP_SECRET);
  } catch (err) {
    throw new AppError(httpStatus.BAD_REQUEST, "OTP expired or invalid");
  }

  if (decoded.otp !== otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid OTP");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "OTP Verified successfully",
    data: null,
  });
});
export const verifyOTP = catchAsync(async (req, res, next) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return next(new AppError(400, "Email and OTP are required"));
  }

  const user = await User.findOne({ email });
  if (!user) {
    return next(new AppError(404, "User not found"));
  }

  if (
    !user.emailVerificationOTP ||
    !user.emailVerificationOTPExpiry ||
    user.emailVerificationOTP != otp ||
    user.emailVerificationOTPExpiry < Date.now()
  ) {
    return next(new AppError(400, "Invalid or expired OTP"));
  }

  user.emailVerificationOTP = undefined;
  user.emailVerificationOTPExpiry = undefined;
  user.isEmailVerified = true;
  user.accountStatus = user.role === "user" ? "pending" : "approved";
  await user.save();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "OTP verified successfully",
    data: { email },
  });
});

export const resendVerificationOTP = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new AppError(400, "Email is required"));
  }

  const user = await User.isUserExistsByEmail(email);
  if (!user) {
    return next(new AppError(404, "User not found"));
  }

  const otp = generateOTP();
  const otpPayload = { otp };
  const otpToken = createToken(
    otpPayload,
    process.env.OTP_SECRET,
    process.env.OTP_EXPIRE,
  );

  user.password_reset_token = otpToken;
  await user.save();

  const emailInfo = await sendEmail(
    user.email,
    "Reset Password",
    buildResetPasswordOtpEmail(otp),
  );

  const debugData =
    process.env.NODE_ENV === "production"
      ? null
      : {
          otp,
          email: user.email,
          messageId: emailInfo?.messageId,
          response: emailInfo?.response,
          accepted: emailInfo?.accepted,
          rejected: emailInfo?.rejected,
        };

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "OTP sent to your email successfully",
    data: debugData,
  });
});

export const changePassword = catchAsync(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Old password and new password are required",
    );
  }
  if (oldPassword === newPassword) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Old password and new password cannot be same",
    );
  }
  const user = await User.findById({ _id: req.user?._id });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }
  user.password = newPassword;
  await user.save();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password changed",
    data:{
      status: "success"
    },
  });
});

export const refreshToken = catchAsync(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new AppError(400, "Refresh token is required");
  }

  const decoded = verifyToken(refreshToken, process.env.JWT_REFRESH_SECRET);
  const user = await User.findById(decoded._id);
  if (!user || user.refreshToken !== refreshToken) {
    throw new AppError(401, "Invalid refresh token");
  }
  const jwtPayload = {
    _id: user._id,
    email: user.email,
    role: user.role,
  };

  const accessToken = createToken(
    jwtPayload,
    process.env.JWT_ACCESS_SECRET,
    process.env.JWT_ACCESS_EXPIRES_IN,
  );

  const refreshToken1 = createToken(
    jwtPayload,
    process.env.JWT_REFRESH_SECRET,
    process.env.JWT_REFRESH_EXPIRES_IN,
  );
  user.refreshToken = refreshToken1;
  await user.save();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Token refreshed successfully",
    data: { accessToken: accessToken, refreshToken: refreshToken1 },
  });
});

export const logout = catchAsync(async (req, res) => {
  const user = req.user?._id;
  const user1 = await User.findByIdAndUpdate(
    user,
    { refreshToken: "" },
    { new: true },
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Logged out successfully",
    data: "",
  });
});
