import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { Conversation } from "../model/conversation.model.js";
import { Message } from "../model/message.model.js";
import { io } from "../server.js";
import AppError from "../errors/AppError.js";
import { sendNotifications } from "../utils/notification.js";

export const listMessages = catchAsync(async (req, res, next) => {
  const { conversationId } = req.params;
  const convo = await Conversation.findById(conversationId);

  if (!convo) return next(new AppError(404, "Conversation not found"));

  if (!convo.participants.some((p) => String(p) === String(req.user._id)))
    return next(new AppError(403, "Forbidden"));

  const messages = await Message.find({ conversationId }).sort({
    createdAt: 1,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Messages fetched",
    data: messages,
  });
});

export const sendMessage = catchAsync(async (req, res, next) => {
  const { conversationId } = req.params;
  const { text = "", attachments = [] } = req.body;

  const convo = await Conversation.findById(conversationId);

  if (!convo) return next(new AppError(404, "Conversation not found"));
  if (!convo.participants.some((p) => String(p) === String(req.user._id)))
    return next(new AppError(403, "Forbidden"));

  const msg = await Message.create({
    conversationId,
    senderId: req.user._id,
    text,
    attachments,
    readBy: [req.user._id],
  });

  convo.lastMessageAt = new Date();
  convo.lastMessageText =
    text?.slice(0, 120) || (attachments.length ? "📎 Attachment" : "");
  await convo.save();

  // realtime emit
  io.to(`conv_${conversationId}`).emit("newMessage", {
    conversationId,
    message: msg,
  });

  // also push to each user room (your existing style)
  for (const p of convo.participants) {
    io.to(`chat_${p}`).emit("message:notify", { conversationId, message: msg });
    io.to(`user_${p}`).emit("message:notify", { conversationId, message: msg });
  }
  await sendNotifications(
    convo.participants.filter((p) => String(p) !== String(req.user._id)),
    {
      title: "New message",
      message: text?.slice(0, 120) || "You received a new attachment.",
      type: "message",
      data: {
        conversationId,
        messageId: msg._id,
        senderId: req.user._id,
      },
    },
  );

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Message sent",
    data: msg,
  });
});

export const markRead = catchAsync(async (req, res, next) => {
  const { conversationId } = req.params;
  const convo = await Conversation.findById(conversationId);
  if (!convo) return next(new AppError(404, "Conversation not found"));
  if (!convo.participants.some((p) => String(p) === String(req.user._id)))
    return next(new AppError(403, "Forbidden"));

  await Message.updateMany(
    { conversationId, readBy: { $ne: req.user._id } },
    { $push: { readBy: req.user._id } }
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Marked read",
    data: {},
  });
});
