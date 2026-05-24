import crypto from "crypto";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { v2 as cloudinary } from "cloudinary";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const SMTP_HOST = process.env.SMTP_HOST || "smtp-relay.brevo.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const EMAIL_FROM = process.env.EMAIL_FROM || process.env.EMAIL_USER;

// Generate a random OTP
export const generateOTP = () => {
  const OTP_LENGTH = 4;
  const otp = Array.from({ length: OTP_LENGTH }, () =>
    crypto.randomInt(0, 9)
  ).join("");
  return otp;
};

//Generate unique ID
export const generateUniqueId = () => {
  const timestamp = Date.now().toString(36); // Convert current timestamp to base36 string
  const randomPart = Math.random().toString(36).substr(2, 6); // Get 6 random characters

  const uniquePart = timestamp + randomPart;
  const uniqueId = uniquePart.substring(0, 8);

  return `BK${uniqueId}`;
};

//password hashing
export const hashPassword = async (newPassword) => {
  const salt = await bcrypt.genSalt(Number.parseInt(10));
  const hashedPassword = await bcrypt.hash(newPassword, salt);
  return Promise.resolve(hashedPassword);
};

export const uniqueTransactionId = () => {
  return uuidv4().replace(/-/g, "").substr(0, 12).toUpperCase();
};

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendOTP = async (email, code) => {
  const mailOptions = {
    from: EMAIL_FROM,
    to: email,
    subject: "Verification Code",
    text: `Your verification code is: ${code}`,
  };

  const info = await transporter.sendMail(mailOptions);
  if (!info?.accepted?.length || info?.rejected?.length) {
    throw new Error(
      `OTP email rejected by SMTP relay. accepted=${info?.accepted?.length || 0}, rejected=${info?.rejected?.length || 0}`
    );
  }

  return info;
};

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadOnCloudinary = (fileBuffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { ...options },
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          return reject(error);
        }
        resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
};
