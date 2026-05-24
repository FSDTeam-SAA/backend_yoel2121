import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { Review } from "../model/review.model.js";
import { Job } from "../model/job.model.js";
import AppError from "../errors/AppError.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";

export const submitJobReview = catchAsync(async (req, res, next) => {
  const { jobId } = req.params;
  const { stars, text } = req.body;

  const job = await Job.findById(jobId);
  if (!job) return next(new AppError(404, "Job not found"));

  if (String(job.userId) !== String(req.user._id))
    return next(new AppError(403, "Home owner only"));

  const tradespersonId = req.body.tradespersonId;
  if (!tradespersonId)
    return next(new AppError(400, "tradespersonId required"));

  const review = await Review.create({
    jobId: job._id,
    userId: req.user._id,
    tradespersonId,
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
    { $match: { tradespersonId: review.tradespersonId } },
    {
      $group: {
        _id: "$tradespersonId",
        avg: { $avg: "$stars" },
        count: { $sum: 1 },
      },
    },
  ]);

  if (stats.length > 0) {
    await User.findByIdAndUpdate(review.tradespersonId, {
      ratingSummary: {
        avg: Number(stats[0].avg.toFixed(2)),
        count: stats[0].count,
      },
    });
  }

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
    tradespersonId,
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
  const { status } = req.query;
  const filter = {};
  if (status) filter.status = status;
  const reviews = await Review.find(filter).sort({ createdAt: -1 });
  sendResponse(res, {
    statusCode: 200,
    message: "Reviews fetched",
    data: reviews,
  });
});
