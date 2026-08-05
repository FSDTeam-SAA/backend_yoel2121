import AppError from "../errors/AppError.js";
import { LegalDocument } from "../model/legalDocument.model.js";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";

const LEGAL_DOCUMENTS = {
  "terms-of-service": "Terms of Service",
  "privacy-policy": "Privacy Policy",
};

const getDocumentType = (req) => {
  const type = String(req.params.type || "").trim().toLowerCase();
  if (!Object.hasOwn(LEGAL_DOCUMENTS, type)) {
    throw new AppError(400, "Invalid legal document type");
  }
  return type;
};

const publicDocument = (document) => ({
  type: document.type,
  title: document.title,
  content: document.content,
  version: document.version,
  publishedAt: document.publishedAt,
  updatedAt: document.updatedAt,
});

export const getPublishedLegalDocument = catchAsync(async (req, res, next) => {
  const type = getDocumentType(req);
  const document = await LegalDocument.findOne({ type }).lean();

  if (!document) {
    return next(new AppError(404, `${LEGAL_DOCUMENTS[type]} has not been published`));
  }

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `${LEGAL_DOCUMENTS[type]} fetched`,
    data: publicDocument(document),
  });
});

export const getLegalDocumentForAdmin = catchAsync(async (req, res) => {
  const type = getDocumentType(req);
  const document = await LegalDocument.findOne({ type }).lean();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: document
      ? `${LEGAL_DOCUMENTS[type]} fetched`
      : `${LEGAL_DOCUMENTS[type]} has not been published yet`,
    data: document
      ? publicDocument(document)
      : {
          type,
          title: LEGAL_DOCUMENTS[type],
          content: "",
          version: 0,
          publishedAt: null,
          updatedAt: null,
        },
  });
});

export const updateLegalDocument = catchAsync(async (req, res, next) => {
  const type = getDocumentType(req);
  const title = String(req.body.title || "").trim();
  const content = String(req.body.content || "").trim();

  if (!title || !content) {
    return next(new AppError(400, "Title and content are required"));
  }
  if (title.length > 120) {
    return next(new AppError(400, "Title cannot exceed 120 characters"));
  }
  if (content.length > 100000) {
    return next(new AppError(400, "Content cannot exceed 100,000 characters"));
  }

  const now = new Date();
  const document = await LegalDocument.findOneAndUpdate(
    { type },
    {
      $set: {
        title,
        content,
        publishedAt: now,
        updatedBy: req.user._id,
      },
      $inc: { version: 1 },
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    },
  ).lean();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `${LEGAL_DOCUMENTS[type]} published successfully`,
    data: publicDocument(document),
  });
});
