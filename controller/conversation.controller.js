import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { Conversation } from "../model/conversation.model.js";
import { Job } from "../model/job.model.js";
import AppError from "../errors/AppError.js";

export const createOrGetConversation = catchAsync(async (req, res, next) => {
  const { otherUserId, jobId } = req.body;
  if (!otherUserId) return next(new AppError(400, "otherUserId required"));

  const participants = [req.user._id, otherUserId];

  // if (jobId) {
  //   const job = await Job.findById(jobId);
  //   if (!job) return next(new AppError(404, "Job not found"));
  //   const ok =
  //     String(job.userId) === String(req.user._id) ||
  //     String(job.invitedTradespersonId) === String(req.user._id);
  //   if (!ok) return next(new AppError(403, "Forbidden"));
  // }

  let convo = null;
  if (jobId) {
    convo = await Conversation.findOne({
      jobId,
      participants: { $all: participants },
    });
  }

  if (!convo) {
    convo = await Conversation.findOne({
      jobId: null,
      participants: { $all: participants },
    });
  }

  if (!convo) {
    convo = await Conversation.create({ participants, jobId: jobId || null });
  }

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Conversation ready",
    data: convo,
  });
});

export const listMyConversations = catchAsync(async (req, res) => {
  const convos = await Conversation.find({
    participants: req.user._id,
    hiddenFor: { $ne: req.user._id },
  })
    .sort({ lastMessageAt: -1 })
    .populate("participants", "name profileImage role");

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Conversations fetched",
    data: convos,
  });
});

export const hideConversation = catchAsync(async (req, res, next) => {
  const convo = await Conversation.findById(req.params.conversationId);
  if (!convo) return next(new AppError(404, "Conversation not found"));
  if (!convo.participants.some((p) => String(p) === String(req.user._id)))
    return next(new AppError(403, "Forbidden"));

  if (!convo.hiddenFor.includes(req.user._id))
    convo.hiddenFor.push(req.user._id);
  await convo.save();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Conversation hidden",
    data: {},
  });
});
