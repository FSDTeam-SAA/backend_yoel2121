import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { Review } from "../model/review.model.js";
import { Job } from "../model/job.model.js";
import { User } from "../model/user.model.js";
import AppError from "../errors/AppError.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import { notifyAdmins, sendNotification } from "../utils/notification.js";
import { containsPersonalContactInfo } from "../utils/contentFilter.js";

const CONTACT_ERROR =
  "Sharing personal contact details (phone, email, WhatsApp, social handles, etc.) violates platform policy. Please keep all communication on the platform.";

export const submitJobReview = catchAsync(async (req, res, next) => {
  const { jobId } = req.params;
  const { stars, text } = req.body;

  if (containsPersonalContactInfo(text))
    return next(new AppError(400, CONTACT_ERROR));

  const job = await Job.findById(jobId);
  if (!job) return next(new AppError(404, "Job not found"));

  const isHomeowner = String(job.userId) === String(req.user._id);
  const isTradesperson =
    job.tradePerson && String(job.tradePerson) === String(req.user._id);

  if (!isHomeowner && !isTradesperson)
    return next(
      new AppError(403, "Only the job owner or assigned tradesperson can review"),
    );

  const reviewerRole = isHomeowner ? "user" : "tradesperson";
  const tradespersonId = isHomeowner
    ? req.body.tradespersonId || job.tradePerson
    : req.user._id;

  if (!tradespersonId)
    return next(new AppError(400, "tradespersonId required"));

  const revieweeId = isHomeowner ? tradespersonId : job.userId;

  const review = await Review.create({
    jobId: job._id,
    userId: req.user._id,
    tradespersonId,
    revieweeId,
    reviewerRole,
    stars,
    text: text || "",
  });

  job.status = "completed";
  await job.save();

  if (req.files && req.files.length > 0) {
    const mediaUrls = [];
    for (const file of req.files) {
      const upload = await uploadOnCloudinary(file.buffer);
      mediaUrls.push({ public_id: upload.public_id, url: upload.secure_url });
    }
    review.completedMedia = mediaUrls;
  }

  await review.save();

  const stats = await Review.aggregate([
    {
      $match: {
        revieweeId: review.revieweeId,
        status: { $in: ["approved", "edited"] },
      },
    },
    {
      $group: {
        _id: "$revieweeId",
        avg: { $avg: "$stars" },
        count: { $sum: 1 },
      },
    },
  ]);

  if (stats.length > 0) {
    await User.findByIdAndUpdate(review.revieweeId, {
      ratingSummary: {
        avg: Number(stats[0].avg.toFixed(2)),
        count: stats[0].count,
      },
    });
  }
  await sendNotification({
    userId: revieweeId,
    title: "New review received",
    message: `You received a ${stars}-star review.`,
    type: "review_submitted",
    data: {
      reviewId: review._id,
      jobId: job._id,
      userId: req.user._id,
    },
  });
  await notifyAdmins({
    title: "New review submitted",
    message: `${req.user.name || "A user"} submitted a review for moderation.`,
    type: "review_submitted_admin",
    data: {
      reviewId: review._id,
      jobId: job._id,
      revieweeId,
    },
  });

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Review submitted (pending admin)",
    data: review,
  });
});

export const listTradespersonReviewsPublic = catchAsync(async (req, res) => {
  const { tradespersonId } = req.params;
  const reviews = await Review.find({
    revieweeId: tradespersonId,
    status: { $in: ["approved", "edited"] },
  })
    .sort({ createdAt: -1 })
    .limit(50);

  sendResponse(res, {
    statusCode: 200,
    message: "Reviews fetched",
    data: reviews,
  });
});

export const listReviews = catchAsync(async (req, res) => {
  const { status, reviewerRole, jobId } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (reviewerRole) filter.reviewerRole = reviewerRole;
  if (jobId) filter.jobId = jobId;
  const reviews = await Review.find(filter).sort({ createdAt: -1 });
  sendResponse(res, {
    statusCode: 200,
    message: "Reviews fetched",
    data: reviews,
  });
});
