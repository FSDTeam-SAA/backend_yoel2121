import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { Carousel } from "../model/carousel.model.js";

export const getActiveCarousels = catchAsync(async (req, res) => {
  const items = await Carousel.find({ isActive: true }).sort({
    order: 1,
    createdAt: -1,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Carousel items fetched",
    data: {
      items,
      count: items.length,
    },
  });
});
