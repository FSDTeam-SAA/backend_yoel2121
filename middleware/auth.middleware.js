import jwt from "jsonwebtoken";
import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import { User } from "./../model/user.model.js";

export const protect = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return next(new AppError(httpStatus.UNAUTHORIZED, "Bearer token required"));
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    return next(new AppError(httpStatus.UNAUTHORIZED, "Bearer token required"));
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch {
    return next(new AppError(httpStatus.UNAUTHORIZED, "Invalid token"));
  }

  const user = await User.findById(decoded._id);
  if (!user) {
    return next(new AppError(httpStatus.UNAUTHORIZED, "User no longer exists"));
  }

  req.user = user;
  next();
};

export const requireApprovedAccount = () => (req, res, next) => {
  if (req.user?.accountStatus !== "approved") {
    return next(new AppError(403, "Account not approved"));
  }
  next();
};

export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return next(new AppError(403, "Admin access required"));
  }
  if (req.user.accountStatus !== "approved") {
    return next(new AppError(403, "Admin account is not approved"));
  }
  next();
};
