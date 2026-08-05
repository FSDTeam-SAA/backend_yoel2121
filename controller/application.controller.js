import AppError from "../errors/AppError.js";
import { Application } from "../model/application.model.js";
import { Job } from "../model/job.model.js";
import catchAsync from "../utils/catchAsync.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import {
  sendNotification,
  sendNotifications,
} from "../utils/notification.js";
import sendResponse from "../utils/sendResponse.js";
import { containsPersonalContactInfo } from "../utils/contentFilter.js";

const CONTACT_ERROR =
  "Sharing personal contact details (phone, email, WhatsApp, social handles, etc.) violates platform policy. Please keep all communication on the platform.";

export const applyToJob = catchAsync(async (req, res, next) => {
  const { jobId } = req.params;
  const { price, estimatedStartDate, additionalInfo } = req.body;

  if (containsPersonalContactInfo(additionalInfo))
    return next(new AppError(400, CONTACT_ERROR));

  const job = await Job.findById(jobId);
  if (!job) return next(new AppError(404, "Job not found"));
  const appliedBefore = await Application.findOne({
    jobId,
    tradespersonId: req.user._id,
  });
  if (appliedBefore)
    return next(new AppError(400, "You have already applied to this job"));

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
  await sendNotification({
    userId: job.userId,
    title: "New job application",
    message: `${req.user.name || "A tradesperson"} applied to "${job.title}".`,
    type: "job_application",
    data: {
      applicationId: app._id,
      jobId: job._id,
      tradespersonId: req.user._id,
    },
  });

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

  if (containsPersonalContactInfo(additionalInfo))
    return next(new AppError(400, CONTACT_ERROR));

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
  await sendNotification({
    userId: app.userId,
    title: "Application updated",
    message: `${req.user.name || "A tradesperson"} updated an application.`,
    type: "application_updated",
    data: {
      applicationId: app._id,
      jobId: app.jobId,
      tradespersonId: app.tradespersonId,
    },
  });

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
      "title locationText status visibility media budget progressStage",
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
    await sendNotification({
      userId: app.tradespersonId,
      title: "Application declined",
      message: `Your application for "${job.title}" was declined.`,
      type: "application_declined",
      data: {
        applicationId: app._id,
        jobId: job._id,
      },
    });

    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Declined",
      data: app,
    });
  }

  if (action === "accept") {
    const otherPendingApplications = await Application.find({
      jobId: job._id,
      _id: { $ne: app._id },
      status: "pending",
    }).select("_id tradespersonId");

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
    await sendNotification({
      userId: app.tradespersonId,
      title: "Application accepted",
      message: `Your application for "${job.title}" was accepted.`,
      type: "application_accepted",
      data: {
        applicationId: app._id,
        jobId: job._id,
      },
    });
    await sendNotifications(
      otherPendingApplications.map((item) => item.tradespersonId),
      {
        title: "Application closed",
        message: `The job "${job.title}" was awarded to another tradesperson.`,
        type: "application_lost",
        data: {
          jobId: job._id,
        },
      },
    );

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
