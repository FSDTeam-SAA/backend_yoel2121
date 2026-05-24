import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { Application } from "../model/application.model.js";
import { Job } from "../model/job.model.js";
import AppError from "../errors/AppError.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";

export const applyToJob = catchAsync(async (req, res, next) => {
  const { jobId } = req.params;
  const { price, estimatedStartDate, additionalInfo } = req.body;

  const job = await Job.findById(jobId);
  if (!job) return next(new AppError(404, "Job not found"));

  const app = await Application.create({
    jobId: job._id,
    userId: job.userId,
    tradespersonId: req.user._id,
    price: Number(price || 0),
    estimatedStartDate: estimatedStartDate
      ? new Date(estimatedStartDate)
      : null,
    additionalInfo: additionalInfo || "",
    status: "pending",
  });

  if (req.files && req.files.length > 0) {
    const relatedFiles = [];
    for (const file of req.files) {
      const upload = await uploadOnCloudinary(file.buffer);
      relatedFiles.push(upload.secure_url);
    }
    app.relatedFiles = relatedFiles;
    await app.save();
  }

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Applied successfully",
    data: app,
  });
});

export const updateApplicationPending = catchAsync(async (req, res, next) => {
  const { applicationId } = req.params;

  const app = await Application.findById(applicationId);

  if (!app) return next(new AppError(404, "Application not found"));

  if (String(app.tradespersonId) !== String(req.user._id))
    return next(new AppError(403, "Forbidden"));

  if (app.status !== "pending")
    return next(new AppError(400, "Only pending application can be edited"));

  const { price, estimatedStartDate, additionalInfo } = req.body;

  if (price !== undefined) app.price = Number(price);

  if (estimatedStartDate !== undefined)
    app.estimatedStartDate = estimatedStartDate
      ? new Date(estimatedStartDate)
      : null;
  if (additionalInfo !== undefined) app.additionalInfo = additionalInfo;

  app.editedAt = new Date();
  await app.save();

  if (req.files && req.files.length > 0) {
    const relatedFiles = [];
    for (const file of req.files) {
      const upload = await uploadOnCloudinary(file.buffer);
      relatedFiles.push(upload.secure_url);
    }
    app.relatedFiles = relatedFiles;
    await app.save();
  }

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Application updated",
    data: app,
  });
});

export const listMyApplications = catchAsync(async (req, res) => {
  const { status } = req.query; // pending|active|lost
  const filter = { tradespersonId: req.user._id };

  if (status) filter.status = status;

  const apps = await Application.find(filter)
    .sort({ createdAt: -1 })
    .populate(
      "jobId",
      "title locationText status visibility relatedFiles budget progressStage status ",
    );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "My applications",
    data: apps,
  });
});

// User Accept/Decline
export const userDecision = catchAsync(async (req, res, next) => {
  const { applicationId } = req.params;
  const { action } = req.body; // accept|decline

  const app = await Application.findById(applicationId);

  if (!app) return next(new AppError(404, "Application not found"));

  if (String(app.userId) !== String(req.user._id))
    return next(new AppError(403, "Forbidden"));

  const job = await Job.findById(app.jobId);
  if (!job) return next(new AppError(404, "Job not found"));

  if (action === "decline") {
    app.status = "lost";
    await app.save();
    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Declined",
      data: app,
    });
  }

  if (action === "accept") {
    // set this application active, others lost, job awarded
    await Application.updateMany(
      { jobId: job._id, _id: { $ne: app._id }, status: "pending" },
      { $set: { status: "lost" } },
    );
    app.status = "active";
    await app.save();

    job.status = "awarded";
    job.tradePerson = app.tradespersonId;
    await job.save();

    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Accepted and awarded",
      data: { application: app, job },
    });
  }

  next(new AppError(400, "Invalid action"));
});

export const getApplication = catchAsync(async (req, res, next) => {
  const { applicationId } = req.params;

  const app = await Application.findById(applicationId);

  if (!app) return next(new AppError(404, "Application not found"));

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Application retrieved successfully",
    data: app,
  });
});
