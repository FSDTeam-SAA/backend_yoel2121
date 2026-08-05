import mongoose from "mongoose";
import AppError from "../errors/AppError.js";
import { Application } from "../model/application.model.js";
import { Job } from "../model/job.model.js";
import { User } from "../model/user.model.js";
import catchAsync from "../utils/catchAsync.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import {
  sendNotification,
  sendNotifications,
} from "../utils/notification.js";
import sendResponse from "../utils/sendResponse.js";
import { containsPersonalContactInfo } from "../utils/contentFilter.js";
import { maskEmail, maskPhone } from "../utils/maskContact.js";

const CONTACT_ERROR =
  "Sharing personal contact details (phone, email, WhatsApp, social handles, etc.) violates platform policy. Please keep all communication on the platform.";

export const createJobPublic = catchAsync(async (req, res, next) => {
  const { title, description, budget, locationText, categoryId, lng, lat } =
    req.body;
  if (!title) return next(new AppError(400, "title required"));

  if (containsPersonalContactInfo(title) || containsPersonalContactInfo(description))
    return next(new AppError(400, CONTACT_ERROR));

  const job = await Job.create({
    userId: req.user._id,
    title,
    description: description || "",
    budget: budget || null,
    locationText: locationText || "",
    categoryId: categoryId || null,
    visibility: "public",
    status: "pending",
    progressStage: 0,
    locationGeo:
      lng && lat
        ? { type: "Point", coordinates: [Number(lng), Number(lat)] }
        : undefined,
  });

  if (req.files && req.files.length > 0) {
    const mediaUrls = [];
    for (const file of req.files) {
      const upload = await uploadOnCloudinary(file.buffer);
      mediaUrls.push(upload.secure_url);
    }
    job.media = mediaUrls;
    await job.save();
  }
  if (categoryId) {
    const tradespeople = await User.find({
      role: "tradesperson",
      accountStatus: "approved",
      isEmailVerified: true,
      operatingTrades: categoryId,
      _id: { $ne: req.user._id },
    })
      .select("_id")
      .limit(100)
      .lean();

    await sendNotifications(
      tradespeople.map((tradesperson) => tradesperson._id),
      {
        title: "New job available",
        message: `A new job "${job.title}" was posted in your trade.`,
        type: "job_created",
        data: {
          jobId: job._id,
          categoryId,
        },
      },
    );
  }

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Job created",
    data: job,
  });
});

export const updateJob = catchAsync(async (req, res, next) => {
  const { jobId } = req.params;

  const job = await Job.findById(jobId);
  if (!job) return next(new AppError(404, "Job not found"));

  const userId = String(req.user._id);

  const isuser = String(job.userId) === userId;

  const isInvitedTradesperson =
    job.invitedTradespersonId && String(job.invitedTradespersonId) === userId;

  const isAwardedTradesperson =
    job.tradePerson && String(job.tradePerson) === userId;

  if (!isuser && !isInvitedTradesperson && !isAwardedTradesperson) {
    return next(new AppError(403, "You are not allowed to update this job"));
  }

  const { title, description, locationText, budget, lat, lng, status } =
    req.body;
  const previousStatus = job.status;

  if (containsPersonalContactInfo(title) || containsPersonalContactInfo(description))
    return next(new AppError(400, CONTACT_ERROR));

  if (title) job.title = title;
  if (description) job.description = description;
  if (locationText) job.locationText = locationText;
  if (budget !== undefined) job.budget = budget;
  if (status !== undefined) {
    if (!isuser) return next(new AppError(403, "Home owner only"));
    job.status = status;
  }

  if (lat && lng) {
    job.locationGeo = {
      type: "Point",
      coordinates: [Number(lng), Number(lat)],
    };
  }

  if (req.files?.length) {
    const mediaUrls = [];

    for (const file of req.files) {
      const upload = await uploadOnCloudinary(file.buffer);
      mediaUrls.push(upload.secure_url);
    }

    job.media = mediaUrls;
  }

  await job.save();
  if (status !== undefined && previousStatus !== job.status) {
    await sendNotifications([job.tradePerson, job.invitedTradespersonId], {
      title: "Job status updated",
      message: `The job "${job.title}" is now ${job.status}.`,
      type: "job_status",
      data: {
        jobId: job._id,
        status: job.status,
      },
    });
  }

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Job updated successfully",
    data: job,
  });
});

export const listJobsNearYou = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, categoryId, q, lng, lat, radiusKm } = req.query;

  const pageNum = Number(page);
  const limitNum = Number(limit);

  const savedCoords = req.user.userLocation?.coordinates;
  const resolvedLng = lng !== undefined ? Number(lng) : savedCoords?.[0];
  const resolvedLat = lat !== undefined ? Number(lat) : savedCoords?.[1];
  const resolvedRadius =
    radiusKm !== undefined
      ? Number(radiusKm)
      : req.user.preferredRadiusKm ?? 25;

  const baseFilter = {
    userId: { $ne: req.user._id },
    visibility: "public",
    status: "pending",
  };

  if (categoryId) {
    baseFilter.categoryId = new mongoose.Types.ObjectId(categoryId);
  }

  if (q) {
    baseFilter.$or = [
      { title: { $regex: q, $options: "i" } },
      { description: { $regex: q, $options: "i" } },
    ];
  }

  const hasGeo =
    resolvedLng !== undefined &&
    resolvedLat !== undefined &&
    !isNaN(resolvedLng) &&
    !isNaN(resolvedLat);

  const pipeline = [];

  if (hasGeo) {
    pipeline.push({
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [resolvedLng, resolvedLat],
        },
        distanceField: "distanceMeters",
        spherical: true,
        maxDistance: resolvedRadius * 1000,
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
  } else {
    pipeline.push({ $match: baseFilter });
  }

  pipeline.push({ $sort: { createdAt: -1 } });

  pipeline.push({ $skip: (pageNum - 1) * limitNum }, { $limit: limitNum });

  pipeline.push(
    {
      $lookup: {
        from: "categories",
        localField: "categoryId",
        foreignField: "_id",
        as: "category",
      },
    },
    {
      $unwind: {
        path: "$category",
        preserveNullAndEmptyArrays: true,
      },
    },
  );

  const jobs = await Job.aggregate(pipeline);

  const total = hasGeo
    ? await Job.countDocuments(baseFilter)
    : await Job.countDocuments(baseFilter);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Jobs fetched successfully",
    data: jobs,
    meta: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

export const listPublicJobs = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 10, categoryId, q, lng, lat, radiusKm } = req.query;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(50, Math.max(1, Number(limit) || 10));
  const resolvedLng = lng !== undefined ? Number(lng) : undefined;
  const resolvedLat = lat !== undefined ? Number(lat) : undefined;
  const resolvedRadius = radiusKm !== undefined ? Number(radiusKm) : 25;

  const baseFilter = {
    visibility: "public",
    status: "pending",
  };

  if (categoryId) {
    if (!mongoose.isValidObjectId(categoryId)) {
      return next(new AppError(400, "Invalid categoryId"));
    }
    baseFilter.categoryId = new mongoose.Types.ObjectId(categoryId);
  }

  if (q) {
    baseFilter.$or = [
      { title: { $regex: q, $options: "i" } },
      { description: { $regex: q, $options: "i" } },
    ];
  }

  const hasGeo =
    resolvedLng !== undefined &&
    resolvedLat !== undefined &&
    !isNaN(resolvedLng) &&
    !isNaN(resolvedLat);

  const pipeline = [];

  if (hasGeo) {
    pipeline.push({
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [resolvedLng, resolvedLat],
        },
        distanceField: "distanceMeters",
        spherical: true,
        maxDistance: resolvedRadius * 1000,
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
  } else {
    pipeline.push({ $match: baseFilter });
  }

  pipeline.push({ $sort: { createdAt: -1 } });
  pipeline.push({ $skip: (pageNum - 1) * limitNum }, { $limit: limitNum });
  pipeline.push(
    {
      $lookup: {
        from: "categories",
        localField: "categoryId",
        foreignField: "_id",
        as: "category",
      },
    },
    {
      $unwind: {
        path: "$category",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        userId: 0,
        tradePerson: 0,
        invitedTradespersonId: 0,
        paymentId: 0,
      },
    },
  );

  const jobs = await Job.aggregate(pipeline);
  const total = await Job.countDocuments(baseFilter);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Public jobs fetched successfully",
    data: jobs,
    meta: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

export const getJobDetails = catchAsync(async (req, res, next) => {
  const job = await Job.findById(req.params.jobId)
    .populate("userId", "name  name email phone profileImage location")
    .populate("tradePerson", "name email phone profileImage")
    .populate("categoryId", "name");
  if (!job) return next(new AppError(404, "Job not found"));
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Job details fetched",
    data: job,
  });
});

// GET /jobs/:jobId/contact-status?tradespersonId=<id>
// Tells the caller (tradesperson or job owner) whether the job is awarded
// + paid, and returns the counterparty's phone/email, masked unless so.
// - tradesperson caller: checked against job.tradePerson (must be them);
//   counterparty is the job owner.
// - job owner caller: must pass tradespersonId (which profile they're
//   viewing — may not be job.tradePerson if the applicant isn't awarded
//   yet), checked against job.tradePerson; counterparty is that tradesperson.
export const getJobContactStatus = catchAsync(async (req, res, next) => {
  const { jobId } = req.params;
  const { tradespersonId } = req.query;

  const job = await Job.findById(jobId).populate(
    "userId",
    "name email phone profileImage",
  );
  if (!job) return next(new AppError(404, "Job not found"));

  const isTradesperson = req.user.role === "tradesperson";
  let isAwarded = false;
  let counterparty = null;

  if (isTradesperson) {
    isAwarded =
      !!job.tradePerson && String(job.tradePerson) === String(req.user._id);
    counterparty = job.userId;
  } else {
    if (String(job.userId._id) !== String(req.user._id))
      return next(new AppError(403, "Home owner only"));

    if (!tradespersonId)
      return next(new AppError(400, "tradespersonId is required"));

    const tradesperson = await User.findOne({
      _id: tradespersonId,
      role: "tradesperson",
    }).select("name email phone profileImage");
    if (!tradesperson)
      return next(new AppError(404, "Tradesperson not found"));

    isAwarded =
      !!job.tradePerson && String(job.tradePerson) === String(tradespersonId);
    counterparty = tradesperson;
  }

  const isPaid = job.paymentStatus === "paid";
  const canViewContact = isAwarded && isPaid;

  const contact = counterparty
    ? {
        _id: counterparty._id,
        name: counterparty.name,
        profileImage: counterparty.profileImage,
        phone: canViewContact
          ? counterparty.phone
          : maskPhone(counterparty.phone),
        email: canViewContact
          ? counterparty.email
          : maskEmail(counterparty.email),
      }
    : null;

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Job contact status fetched",
    data: {
      jobId: job._id,
      isAwarded,
      isPaid,
      canViewContact,
      contact,
    },
  });
});

// user sees only own jobs
export const listMyJobsuser = catchAsync(async (req, res) => {
  const jobs = await Job.find({ userId: req.user._id }).sort({
    createdAt: -1,
  });
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "My jobs",
    data: jobs,
  });
});

// user: view applicants list for a job
export const listApplicantsForJob = catchAsync(async (req, res, next) => {
  const job = await Job.findById(req.params.jobId);
  if (!job) return next(new AppError(404, "Job not found"));

  if (String(job.userId) !== String(req.user._id))
    return next(new AppError(403, "Home owner only"));

  const apps = await Application.find({ jobId: job._id }).populate(
    "tradespersonId  jobId",
    "name profileImage ratingSummary bio externalRatings externalReviewLinks title budget progressStage status",
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Applicants fetched",
    data: apps,
  });
});

// user: Update job status (e.g., cancel)
export const updateJobStatususer = catchAsync(async (req, res, next) => {
  const { jobId } = req.params;
  const { status } = req.body;
  const job = await Job.findById(jobId);
  if (!job) return next(new AppError(404, "Job not found"));

  if (String(job.userId) !== String(req.user._id))
    return next(new AppError(403, "Home owner only"));

  job.status = status;
  await job.save();
  await sendNotifications([job.tradePerson, job.invitedTradespersonId], {
    title: "Job status updated",
    message: `The job "${job.title}" is now ${job.status}.`,
    type: "job_status",
    data: {
      jobId: job._id,
      status: job.status,
    },
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Job status updated",
    data: job,
  });
});

export const getCurrentJobs = catchAsync(async (req, res) => {
  const applicaitons = await Application.find({
    tradespersonId: req.user._id,
    status: "active",
  })
    .populate(
      "jobId",
      "title locationText status visibility media budget progressStage",
    )
    .sort({ createdAt: -1 });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Current jobs",
    data: applicaitons,
  });
});

export const getTradespersonJobFeed = catchAsync(async (req, res) => {
  const tradespersonId = req.user._id;

  const { page = 1, limit = 10 } = req.query;

  const skip = (Number(page) - 1) * Number(limit);

  const recentFilter = {
    visibility: "public",
    status: "completed",
    userId: { $ne: tradespersonId },
  };

  const recentJobs = await Job.find(recentFilter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .populate("categoryId", "name")
    .populate("userId", "name");

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Tradesperson job feed fetched successfully",
    data: {
      recentJobs,
    },
  });
});

// Public: recent 5 completed jobs for a given tradesperson
export const getRecentJobs = catchAsync(async (req, res, next) => {
  const { tradespersonId } = req.params;

  const tradesperson = await User.findById(tradespersonId).select("role");
  if (!tradesperson || tradesperson.role !== "tradesperson")
    return next(new AppError(404, "Tradesperson not found"));

  const recentJobs = await Job.find({
    tradePerson: tradespersonId,
    status: "completed",
  })
    .sort({ completedAt: -1 })
    .limit(5)
    .select(
      "title description budget locationText media completedAt categoryId",
    )
    .populate("categoryId", "name");

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Recent completed jobs fetched successfully",
    data: recentJobs,
  });
});

export const deleteJob = catchAsync(async (req, res, next) => {
  const { jobId } = req.params;

  const job = await Job.findById(jobId);
  if (!job) return next(new AppError(404, "Job not found"));

  if (String(job.userId) !== String(req.user._id))
    return next(new AppError(403, "Only the job owner can delete this job"));

  const nonDeletableStatuses = ["started", "in_progress", "completed"];
  if (nonDeletableStatuses.includes(job.status))
    return next(
      new AppError(400, `Cannot delete a job with status "${job.status}"`),
    );

  await Application.deleteMany({ jobId: job._id });
  await job.deleteOne();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Job deleted successfully",
    data: null,
  });
});

export const updateJobProgress = catchAsync(async (req, res, next) => {
  const { progressStage } = req.body;

  const job = await Job.findById(req.params.jobId);
  if (!job) return next(new AppError(404, "Job not found"));

  if (job.tradePerson?.toString() !== req.user._id.toString()) {
    return next(
      new AppError(403, "Only the assigned tradesperson can update progress"),
    );
  }

  if (Number(progressStage) === 1 && job.paymentStatus !== "paid") {
    return next(
      new AppError(402, "Payment of $10 is required before starting this job"),
    );
  }

  job.progressStage = Number(progressStage);

  if (Number(progressStage) === 1) {
    job.startedAt = new Date();
    job.status = "started";
  } else if (Number(progressStage) === 2) {
    job.status = "in_progress";
  } else if (Number(progressStage) === 3) {
    job.completedAt = new Date();
    job.status = "completed";
  }

  await job.save();
  await sendNotification({
    userId: job.userId,
    title: "Job progress updated",
    message: `Progress was updated for "${job.title}".`,
    type: "job_progress",
    data: {
      jobId: job._id,
      progressStage: job.progressStage,
      status: job.status,
    },
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Job progress updated",
    data: job,
  });
});
