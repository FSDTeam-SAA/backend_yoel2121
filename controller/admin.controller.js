import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { User } from "../model/user.model.js";
import { Job } from "../model/job.model.js";
import { Review } from "../model/review.model.js";
import { Category } from "../model/category.model.js";
import { Carousel } from "../model/carousel.model.js";
import AppError from "../errors/AppError.js";
import { Application } from "../model/application.model.js";
import { Payment } from "../model/payment.model.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import {
  sendNotification,
  sendNotifications,
} from "../utils/notification.js";

const ADMIN_USER_FIELDS =
  "name email role accountStatus createdAt updatedAt profileImage bio externalRatings externalReviewLinks operatingTrades serviceArea phone address nationality ratingSummary userLocation isKycVerified isEmailVerified preferredRadiusKm";
const ACCOUNT_STATUSES = ["pending", "approved", "rejected", "suspended"];
const CATEGORY_STATUSES = ["pending", "approved", "rejected"];
const USER_ROLES = ["admin", "user", "homeowner", "tradesperson"];

const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseRoleFilter = (role) => {
  if (!role) return undefined;

  const requestedRoles = String(role)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (
    requestedRoles.length === 0 ||
    requestedRoles.some((value) => !USER_ROLES.includes(value))
  ) {
    throw new AppError(400, "Invalid role filter");
  }

  const expandedRoles = new Set(requestedRoles);
  if (expandedRoles.has("user")) expandedRoles.add("homeowner");
  return [...expandedRoles];
};

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

const parseOptionalNumber = (value, fallback = 0) => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseOptionalBoolean = (value, fallback = true) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
};

const uploadCarouselImage = async (fileBuffer) => {
  try {
    return await uploadOnCloudinary(fileBuffer);
  } catch (error) {
    console.error("Carousel image upload failed:", error);
    throw new AppError(502, "Carousel image upload failed");
  }
};

export const listUsers = catchAsync(async (req, res) => {
  const { role, status, q } = req.query;
  const filter = {};
  const roles = parseRoleFilter(role);
  if (roles) filter.role = { $in: roles };

  if (status) {
    if (!ACCOUNT_STATUSES.includes(status)) {
      throw new AppError(400, "Invalid account status filter");
    }
    filter.accountStatus = status;
  }

  if (q) {
    const search = escapeRegExp(String(q).trim());
    if (search) {
      filter.$or = [
        { name: new RegExp(search, "i") },
        { email: new RegExp(search, "i") },
      ];
    }
  }

  const users = await User.find(filter)
    .sort({ createdAt: -1 })
    .select(ADMIN_USER_FIELDS)
    .populate("operatingTrades", "name status image");
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Users fetched",
    data: users,
  });
});

export const getUserDetails = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.userId)
    .select(ADMIN_USER_FIELDS)
    .populate("operatingTrades", "name status image");

  if (!user) return next(new AppError(404, "User not found"));

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User fetched",
    data: user,
  });
});

export const approveRejectUser = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { action } = req.body; // "approve" | "reject" | "suspend"

  const user = await User.findById(userId);

  if (!user) return next(new AppError(404, "User not found"));
  if (user.role === "admin") {
    return next(new AppError(403, "Admin accounts cannot be moderated"));
  }

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

  const user = await User.findById(userId);

  if (!user) return next(new AppError(404, "User not found"));
  if (user.role === "admin") {
    return next(new AppError(403, "Admin accounts cannot be deleted"));
  }

  await user.deleteOne();

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
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date(startOfToday);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);

  const fiveDaysAgo = new Date(startOfToday);
  fiveDaysAgo.setUTCDate(fiveDaysAgo.getUTCDate() - 4);

  const twelveMonthsAgo = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1),
  );

  const [
    tradespeople,
    users,
    jobs,
    todayTradespeople,
    todayUsers,
    todayJobs,
    jobsByDayRaw,
    userGrowthRaw,
    earningsRaw,
    todayEarningsRaw,
    monthlyRevenueRaw,
    topServicesRaw,
  ] = await Promise.all([
    User.countDocuments({ role: "tradesperson" }),
    User.countDocuments({ role: { $in: ["user", "homeowner"] } }),
    Job.countDocuments(),
    User.countDocuments({
      role: "tradesperson",
      createdAt: { $gte: startOfToday },
    }),
    User.countDocuments({
      role: { $in: ["user", "homeowner"] },
      createdAt: { $gte: startOfToday },
    }),
    Job.countDocuments({ createdAt: { $gte: startOfToday } }),
    Job.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
    ]),
    User.aggregate([
      {
        $match: {
          createdAt: { $gte: fiveDaysAgo },
          role: { $in: ["tradesperson", "user", "homeowner"] },
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            role: "$role",
          },
          count: { $sum: 1 },
        },
      },
    ]),
    Payment.aggregate([
      { $match: { status: "succeeded" } },
      { $group: { _id: null, amountCents: { $sum: "$amount" } } },
    ]),
    Payment.aggregate([
      { $match: { status: "succeeded", paidAt: { $gte: startOfToday } } },
      { $group: { _id: null, amountCents: { $sum: "$amount" } } },
    ]),
    Payment.aggregate([
      {
        $match: {
          status: "succeeded",
          paidAt: { $gte: twelveMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$paidAt" },
            month: { $month: "$paidAt" },
          },
          amountCents: { $sum: "$amount" },
        },
      },
    ]),
    Payment.aggregate([
      { $match: { status: "succeeded" } },
      {
        $lookup: {
          from: "jobs",
          localField: "jobId",
          foreignField: "_id",
          as: "job",
        },
      },
      { $unwind: "$job" },
      {
        $lookup: {
          from: "categories",
          localField: "job.categoryId",
          foreignField: "_id",
          as: "category",
        },
      },
      {
        $group: {
          _id: {
            $ifNull: [
              { $arrayElemAt: ["$category.name", 0] },
              "Uncategorized",
            ],
          },
          count: { $sum: 1 },
          amountCents: { $sum: "$amount" },
        },
      },
      { $sort: { count: -1, amountCents: -1 } },
      { $limit: 5 },
    ]),
  ]);

  const buildRange = (start, days) => {
    const arr = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-US", {
        weekday: "short",
        timeZone: "UTC",
      });
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
    if (role === "tradesperson") acc[date].tradies += item.count;
    if (role === "user" || role === "homeowner") {
      acc[date].users += item.count;
    }
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

  const monthlyRevenueMap = monthlyRevenueRaw.reduce((acc, item) => {
    const key = `${item._id.year}-${String(item._id.month).padStart(2, "0")}`;
    acc[key] = item.amountCents;
    return acc;
  }, {});

  const monthlyRevenue = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + index, 1),
    );
    const month = date.toISOString().slice(0, 7);
    const revenue = Number(((monthlyRevenueMap[month] || 0) / 100).toFixed(2));
    return {
      month,
      label: date
        .toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
        .toUpperCase(),
      revenue,
      value: revenue,
    };
  });

  const topServices = topServicesRaw.map((item) => ({
    name: item._id,
    count: item.count,
    value: item.count,
    earnings: Number((item.amountCents / 100).toFixed(2)),
  }));

  const earnings = Number(
    ((earningsRaw[0]?.amountCents || 0) / 100).toFixed(2),
  );
  const todayEarnings = Number(
    ((todayEarningsRaw[0]?.amountCents || 0) / 100).toFixed(2),
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Overview stats",
    data: {
      stats: { tradespeople, users, jobs, earnings },
      today: {
        tradespeople: todayTradespeople,
        users: todayUsers,
        jobs: todayJobs,
        earnings: todayEarnings,
      },
      jobsByDay,
      userGrowth,
      monthlyRevenue,
      topServices,
    },
  });
});

export const listCategories = catchAsync(async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status) {
    if (!CATEGORY_STATUSES.includes(status)) {
      throw new AppError(400, "Invalid category status filter");
    }
    filter.status = status;
  }
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

  if (typeof name !== "string" || !name.trim()) {
    return next(new AppError(400, "Name required"));
  }
  if (!CATEGORY_STATUSES.includes(status)) {
    return next(new AppError(400, "Invalid category status"));
  }
  if (!req.file) return next(new AppError(400, "Category image required"));

  const categoryName = name.trim();
  const exists = await Category.findOne({
    name: new RegExp(`^${escapeRegExp(categoryName)}$`, "i"),
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

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return next(new AppError(400, "Name cannot be empty"));
    }
    const categoryName = name.trim();
    const exists = await Category.findOne({
      _id: { $ne: cat._id },
      name: new RegExp(`^${escapeRegExp(categoryName)}$`, "i"),
    });

    if (exists) return next(new AppError(400, "Category already exists"));
    cat.name = categoryName;
  }

  if (status !== undefined) {
    if (!CATEGORY_STATUSES.includes(status)) {
      return next(new AppError(400, "Invalid category status"));
    }
    cat.status = status;
  }
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
    .populate(
      "jobId",
      "title locationText status visibility media budget categoryId",
    )
    .populate("userId", "name email profileImage role accountStatus")
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
    .populate(
      "jobId",
      "title locationText status visibility media budget categoryId",
    )
    .populate("userId", "name email profileImage role accountStatus phone")
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

export const listCarouselsAdmin = catchAsync(async (req, res) => {
  const { type, isActive } = req.query;
  const filter = {};
  if (type) filter.type = type;
  if (isActive !== undefined) filter.isActive = isActive === "true";

  const items = await Carousel.find(filter).sort({ order: 1, createdAt: -1 });
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Carousel items fetched",
    data: items,
  });
});

export const createCarouselItem = catchAsync(async (req, res, next) => {
  const { type, title, subtitle, link, discountPercentage, order, isActive } =
    req.body;
  const parsedDiscountPercentage = parseOptionalNumber(
    discountPercentage,
    null,
  );
  const parsedOrder = parseOptionalNumber(order, 0);
  const parsedIsActive = parseOptionalBoolean(isActive, true);

  if (!type || !["ad", "coupon"].includes(type)) {
    return next(new AppError(400, "Type must be 'ad' or 'coupon'"));
  }
  if (!title) return next(new AppError(400, "Title required"));
  if (!subtitle) return next(new AppError(400, "Subtitle required"));
  if (!req.file) return next(new AppError(400, "Image required"));

  if (type === "coupon") {
    if (parsedDiscountPercentage === null) {
      return next(new AppError(400, "discountPercentage required"));
    }
    if (parsedDiscountPercentage < 0 || parsedDiscountPercentage > 100) {
      return next(
        new AppError(400, "discountPercentage must be between 0 and 100"),
      );
    }
  }

  const upload = await uploadCarouselImage(req.file.buffer);

  const item = await Carousel.create({
    type,
    title: title.trim(),
    subtitle: subtitle.trim(),
    link: link?.trim() || "",
    image: {
      public_id: upload.public_id,
      url: upload.secure_url,
    },
    discountPercentage: type === "coupon" ? parsedDiscountPercentage : null,
    order: parsedOrder,
    isActive: parsedIsActive,
  });

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Carousel item created",
    data: item,
  });
});

export const updateCarouselItem = catchAsync(async (req, res, next) => {
  const { carouselId } = req.params;
  const { type, title, subtitle, link, discountPercentage, order, isActive } =
    req.body;
  const parsedDiscountPercentage =
    discountPercentage !== undefined
      ? parseOptionalNumber(discountPercentage, null)
      : undefined;

  const item = await Carousel.findById(carouselId);
  if (!item) return next(new AppError(404, "Carousel item not found"));

  if (type && !["ad", "coupon"].includes(type)) {
    return next(new AppError(400, "Type must be 'ad' or 'coupon'"));
  }
  const nextType = type || item.type;

  if (nextType === "coupon") {
    const nextDiscountPercentage =
      discountPercentage !== undefined
        ? parsedDiscountPercentage
        : item.discountPercentage;

    if (nextDiscountPercentage === undefined || nextDiscountPercentage === null) {
      return next(new AppError(400, "discountPercentage required"));
    }
    if (nextDiscountPercentage < 0 || nextDiscountPercentage > 100) {
      return next(
        new AppError(400, "discountPercentage must be between 0 and 100"),
      );
    }
    item.discountPercentage = nextDiscountPercentage;
  } else if (nextType === "ad") {
    item.discountPercentage = null;
  }

  item.type = nextType;
  if (title) item.title = title.trim();
  if (subtitle) item.subtitle = subtitle.trim();
  if (link !== undefined) item.link = link.trim();
  if (order !== undefined) item.order = parseOptionalNumber(order, 0);
  if (isActive !== undefined) {
    item.isActive = parseOptionalBoolean(isActive, item.isActive);
  }

  if (req.file) {
    const upload = await uploadCarouselImage(req.file.buffer);
    item.image = {
      public_id: upload.public_id,
      url: upload.secure_url,
    };
  }

  await item.save();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Carousel item updated",
    data: item,
  });
});

export const deleteCarouselItem = catchAsync(async (req, res, next) => {
  const { carouselId } = req.params;
  const item = await Carousel.findByIdAndDelete(carouselId);
  if (!item) return next(new AppError(404, "Carousel item not found"));

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Carousel item deleted",
    data: {},
  });
});
