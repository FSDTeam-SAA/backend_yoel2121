import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { Job } from "../model/job.model.js";
import { Application } from "../model/application.model.js";
import AppError from "../errors/AppError.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";

export const createJobPublic = catchAsync(async (req, res, next) => {
  const { title, description, locationText, categoryId, lng, lat } = req.body;
  if (!title) return next(new AppError(400, "title required"));

  const job = await Job.create({
    userId: req.user._id,
    title,
    description: description || "",
    locationText: locationText || "",
    categoryId: categoryId || null,
    visibility: "public",
    status: "open_to_quotes",
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

  const { title, description, locationText, lat, lng } = req.body;

  if (title) job.title = title;
  if (description) job.description = description;
  if (locationText) job.locationText = locationText;

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

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Job updated successfully",
    data: job,
  });
});

// Request a Quote => creates private job for a specific tradesperson
export const createPrivateJobRequestQuote = catchAsync(
  async (req, res, next) => {
    const {
      tradespersonId,
      title,
      description,
      locationText,
      categoryId,
      lng,
      lat,
    } = req.body;
    if (!tradespersonId || !title)
      return next(new AppError(400, "tradespersonId and title required"));

    const job = await Job.create({
      invitedTradespersonId: tradespersonId,
      title,
      description: description || "",
      locationText: locationText || "",
      categoryId: categoryId || null,
      visibility: "private",
      status: "awarded",
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

    sendResponse(res, {
      statusCode: 201,
      success: true,
      message: "Private job created",
      data: job,
    });
  },
);

export const listJobsNearYou = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, categoryId, q, lng, lat, radiusKm } = req.query;

  const pageNum = Number(page);
  const limitNum = Number(limit);

  const baseFilter = {
    userId: { $ne: req.user._id },
    visibility: "public",
    status: "open_to_quotes",
  };

  if (categoryId) {
    baseFilter.categoryId = new mongoose.Types.ObjectId(categoryId);
  }

  if (q) {
    if (q) {
      baseFilter.$or = [
        { title: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
      ];
    }
  }

  const hasGeo =
    lng !== undefined &&
    lat !== undefined &&
    !isNaN(Number(lng)) &&
    !isNaN(Number(lat));

  const pipeline = [];

  if (hasGeo) {
    pipeline.push({
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [Number(lng), Number(lat)],
        },
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

export const getJobDetails = catchAsync(async (req, res, next) => {
  const job = await Job.findById(req.params.jobId)
    .populate("userId", "name")
    .populate("categoryId", "name");
  if (!job) return next(new AppError(404, "Job not found"));
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Job details fetched",
    data: job,
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
    "name profileImage ratingSummary bio externalRatings externalReviewLinks title",
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
    .populate("jobId", "title locationText status visibility relatedFiles")
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

  const privateFilter = {
    visibility: "private",
    status: "awarded",
    invitedTradespersonId: tradespersonId,
  };

  const privateJobs = await Job.find(privateFilter)
    .sort({ createdAt: -1 })
    .populate("categoryId", "name")
    .populate("userId", "name email phone");

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Tradesperson job feed fetched successfully",
    data: {
      recentJobs,
      privateJobs,
    },
  });
});
