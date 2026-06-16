import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { User } from "../model/user.model.js";
import { Job } from "../model/job.model.js";
import { Review } from "../model/review.model.js";
import { Category } from "../model/category.model.js";
import AppError from "../errors/AppError.js";
import { Application } from "../model/application.model.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import {
  sendNotification,
  sendNotifications,
} from "../utils/notification.js";

const updateUserRatingSummary = async (revieweeId) => {
  const stats = await Review.aggregate([
    {
      $match: {
        revieweeId,
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

  await User.findByIdAndUpdate(revieweeId, {
    ratingSummary: stats.length
      ? {
          avg: Number(stats[0].avg.toFixed(2)),
          count: stats[0].count,
        }
      : { avg: 0, count: 0 },
  });
};

export const listUsers = catchAsync(async (req, res) => {
  const { role, status, q } = req.query;
  const filter = {};
  if (role) filter.role = role;
  if (status) filter.accountStatus = status;
  if (q)
    filter.$or = [{ name: new RegExp(q, "i") }, { email: new RegExp(q, "i") }];

  const users = await User.find(filter)
    .sort({ createdAt: -1 })
    .select(
      "name email role accountStatus createdAt profileImage bio externalRatings externalReviewLinks operatingTrades serviceArea",
    );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Users fetched",
    data: users,
  });
});

export const approveRejectUser = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { action } = req.body; // "approve" | "reject" | "suspend"

  const user = await User.findById(userId);

  if (!user) return next(new AppError(404, "User not found"));

  if (action === "approve") user.accountStatus = "approved";
  else if (action === "reject") user.accountStatus = "rejected";
  else if (action === "suspend") user.accountStatus = "suspended";
  else return next(new AppError(400, "Invalid action"));

  await user.save();
  await sendNotification({
    userId: user._id,
    title: "Account status updated",
    message: `Your account has been ${user.accountStatus}.`,
    type: "account_status",
    data: {
      action,
      accountStatus: user.accountStatus,
      userId: user._id,
    },
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User status updated",
    data: user,
  });
});

export const deleteUser = catchAsync(async (req, res, next) => {
  const { userId } = req.params;

  const u = await User.findByIdAndDelete(userId);

  if (!u) return next(new AppError(404, "User not found"));

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User deleted",
    data: {},
  });
});

export const moderateJob = catchAsync(async (req, res, next) => {
  const { jobId } = req.params;
  const { action } = req.body; // delete

  const job = await Job.findById(jobId);
  if (!job) return next(new AppError(404, "Job not found"));

  if (action === "delete") {
    await Job.findByIdAndDelete(jobId);
    await sendNotifications(
      [job.userId, job.tradePerson, job.invitedTradespersonId],
      {
        title: "Job removed by admin",
        message: `The job "${job.title}" was removed by admin moderation.`,
        type: "job_moderated",
        data: { jobId: job._id, action },
      },
    );

    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Job deleted",
      data: {},
    });
  }

  next(new AppError(400, "Invalid action"));
});

export const listReviews = catchAsync(async (req, res) => {
  const { status, reviewerRole } = req.query;
  const filter = {};

  if (status) filter.status = status;
  if (reviewerRole) filter.reviewerRole = reviewerRole;
  const reviews = await Review.find(filter)
    .sort({ createdAt: -1 })
    .populate("userId", "name email profileImage")
    .populate("tradespersonId", "name email profileImage")
    .populate("revieweeId", "name email profileImage");

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Reviews fetched",
    data: reviews,
  });
});

export const approveEditRejectReview = catchAsync(async (req, res, next) => {
  const { reviewId } = req.params;
  const { action, editedText, adminNote } = req.body; // approve | reject | edit

  const review = await Review.findById(reviewId);

  if (!review) return next(new AppError(404, "Review not found"));

  if (action === "approve") review.status = "approved";
  else if (action === "reject") review.status = "rejected";
  else if (action === "edit") {
    review.status = "edited";
    review.adminEditedText = editedText || review.adminEditedText;
  } else return next(new AppError(400, "Invalid action"));

  if (adminNote) review.adminNote = adminNote;
  await review.save();
  await updateUserRatingSummary(review.revieweeId);
  await sendNotifications([review.userId, review.revieweeId], {
    title: "Review status updated",
    message: `A review has been ${review.status}.`,
    type: "review_moderated",
    data: {
      reviewId: review._id,
      jobId: review.jobId,
      action,
      status: review.status,
    },
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Review updated",
    data: review,
  });
});

export const getReviewDetailsAdmin = catchAsync(async (req, res, next) => {
  const { reviewId } = req.params;

  const review = await Review.findById(reviewId)
    .populate("jobId", "title locationText status visibility")
    .populate("userId", "name email role")
    .populate("tradespersonId", "name email role profileImage")
    .populate("revieweeId", "name email role profileImage");

  if (!review) return next(new AppError(404, "Review not found"));

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Review fetched",
    data: review,
  });
});

export const getAdminOverview = catchAsync(async (_req, res) => {
  const [tradespeople, users, jobs] = await Promise.all([
    User.countDocuments({ role: "tradesperson" }),
    User.countDocuments({ role: "user" }),
    Job.countDocuments(),
  ]);

  const today = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 6);

  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(today.getDate() - 4);

  const jobsByDayRaw = await Job.aggregate([
    { $match: { createdAt: { $gte: sevenDaysAgo } } },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
        },
        count: { $sum: 1 },
      },
    },
  ]);

  const userGrowthRaw = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: fiveDaysAgo },
        role: { $in: ["tradesperson", "user"] },
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          role: "$role",
        },
        count: { $sum: 1 },
      },
    },
  ]);

  const buildRange = (start, days) => {
    const arr = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-US", { weekday: "short" });
      arr.push({ key, label });
    }
    return arr;
  };

  const jobsByDayMap = jobsByDayRaw.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  const userGrowthMap = userGrowthRaw.reduce((acc, item) => {
    const { date, role } = item._id;
    if (!acc[date]) acc[date] = { tradies: 0, users: 0 };
    if (role === "tradesperson") acc[date].tradies = item.count;
    if (role === "user") acc[date].users = item.count;
    return acc;
  }, {});

  const jobsByDay = buildRange(sevenDaysAgo, 7).map(({ key, label }) => ({
    label,
    count: jobsByDayMap[key] || 0,
  }));

  const userGrowth = buildRange(fiveDaysAgo, 5).map(({ key, label }) => ({
    label,
    tradies: userGrowthMap[key]?.tradies || 0,
    users: userGrowthMap[key]?.users || 0,
  }));

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Overview stats",
    data: {
      stats: { tradespeople, users, jobs },
      jobsByDay,
      userGrowth,
    },
  });
});

export const listCategories = catchAsync(async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status) filter.status = status;
  const cats = await Category.find(filter).sort({ createdAt: -1 });
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Categories fetched",
    data: cats,
  });
});

export const createCategory = catchAsync(async (req, res, next) => {
  const { name, status = "approved" } = req.body;

  if (!name) return next(new AppError(400, "Name required"));
  if (!req.file) return next(new AppError(400, "Category image required"));

  const categoryName = name.trim();
  const exists = await Category.findOne({
    name: new RegExp(`^${categoryName}$`, "i"),
  });

  if (exists) return next(new AppError(400, "Category already exists"));

  const upload = await uploadOnCloudinary(req.file.buffer);
  const cat = await Category.create({
    name: categoryName,
    status,
    image: {
      public_id: upload.public_id,
      url: upload.secure_url,
    },
  });

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Category created",
    data: cat,
  });
});

export const updateCategory = catchAsync(async (req, res, next) => {
  const { categoryId } = req.params;
  const { name, status } = req.body;

  const cat = await Category.findById(categoryId);
  if (!cat) return next(new AppError(404, "Category not found"));

  const previousStatus = cat.status;

  if (name) {
    const categoryName = name.trim();
    const exists = await Category.findOne({
      _id: { $ne: cat._id },
      name: new RegExp(`^${categoryName}$`, "i"),
    });

    if (exists) return next(new AppError(400, "Category already exists"));
    cat.name = categoryName;
  }

  if (status) cat.status = status;
  if (req.file) {
    const upload = await uploadOnCloudinary(req.file.buffer);
    cat.image = {
      public_id: upload.public_id,
      url: upload.secure_url,
    };
  }

  if (cat.status === "approved" && !cat.image?.url) {
    return next(new AppError(400, "Category image is required when approving"));
  }

  await cat.save();
  if (
    status &&
    previousStatus !== cat.status &&
    cat.createdByTradespersonId
  ) {
    await sendNotification({
      userId: cat.createdByTradespersonId,
      title: "Category status updated",
      message: `Your proposed category "${cat.name}" has been ${cat.status}.`,
      type: "category_status",
      data: {
        categoryId: cat._id,
        status: cat.status,
      },
    });
  }

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Category updated",
    data: cat,
  });
});

export const deleteCategory = catchAsync(async (req, res, next) => {
  const { categoryId } = req.params;
  const cat = await Category.findByIdAndDelete(categoryId);
  if (!cat) return next(new AppError(404, "Category not found"));
  if (cat.createdByTradespersonId) {
    await sendNotification({
      userId: cat.createdByTradespersonId,
      title: "Category deleted",
      message: `Your proposed category "${cat.name}" was deleted by admin.`,
      type: "category_deleted",
      data: { categoryId: cat._id },
    });
  }

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Category deleted",
    data: {},
  });
});

export const allApplications = catchAsync(async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status) filter.status = status;
  const applications = await Application.find(filter)
    .sort({ createdAt: -1 })
    .populate("jobId", "title locationText status visibility relatedFiles ")
    .populate("tradespersonId", "name email profileImage role accountStatus");
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Applications fetched",
    data: applications,
  });
});

export const getApplicationDetailsAdmin = catchAsync(async (req, res, next) => {
  const { applicationId } = req.params;

  const application = await Application.findById(applicationId)
    .populate("jobId", "title locationText status visibility relatedFiles")
    .populate(
      "tradespersonId",
      "name email profileImage role accountStatus phone",
    );

  if (!application) return next(new AppError(404, "Application not found"));

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Application fetched",
    data: application,
  });
});
