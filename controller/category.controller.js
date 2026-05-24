import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { Category } from "../model/category.model.js";
import AppError from "../errors/AppError.js";
import { Job } from "../model/job.model.js";

export const listApprovedCategories = catchAsync(async (req, res) => {
  const cats = await Category.find({ status: "approved" }).sort({ name: 1 });
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Categories fetched",
    data: cats,
  });
});

// Tradesperson proposes a new category (admin can approve)
export const proposeCategory = catchAsync(async (req, res, next) => {
  const { name } = req.body;
  if (!name) return next(new AppError(400, "Name required"));
  const exists = await Category.findOne({ name: name.trim() });
  if (exists) return next(new AppError(400, "Category already exists"));

  const cat = await Category.create({
    name: name.trim(),
    status: "pending",
    createdByTradespersonId: req.user._id,
  });

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Category proposed",
    data: cat,
  });
});

export const listJobByCategory = catchAsync(async (req, res, next) => {
  const { categoryId } = req.params;
  const category = await Category.findById(categoryId);

  if (!category) return next(new AppError(404, "Category not found"));

  const jobs = await Job.find({ categoryId: category._id });

  if (jobs.length === 0)
    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "No jobs found for this category",
      data: [],
    });  

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Jobs fetched",
    data: jobs,
  });
});