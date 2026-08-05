import handleValidationError from "../errors/handleValidationError.js";
import HandleCastError from "../errors/HandleCastError.js";
import handleDuplicateError from "../errors/handleDuplicateError.js";
import AppError from "./../errors/AppError.js";

const globalErrorHandler = (err, req, res, next) => {
  const isProduction = process.env.NODE_ENV === "production";
  let statusCode = 500;
  let message = err.message;
  let errorSources = [
    {
      path: "",
      message: err.message,
    },
  ];

  if (err?.name === "ValidationError") {
    const simplifiedError = handleValidationError(err);
    statusCode = simplifiedError?.statusCode;
    message = simplifiedError?.message;
    errorSources = simplifiedError?.errorSources;
  } else if (err?.name === "CastError") {
    const simplifiedError = HandleCastError(err);
    statusCode = simplifiedError?.statusCode;
    message = simplifiedError?.message;
    errorSources = simplifiedError?.errorSources;
  } else if (err?.code === 11000) {
    const simplifiedError = handleDuplicateError(err);
    statusCode = simplifiedError?.statusCode;
    message = simplifiedError?.message;
    errorSources = simplifiedError?.errorSources;
  } else if (err instanceof AppError) {
    statusCode = err?.statusCode;
    message = err.message;
    errorSources = [
      {
        path: "",
        message: err?.message,
      },
    ];
  }

  if (isProduction && statusCode >= 500 && !(err instanceof AppError)) {
    message = "Something went wrong";
    errorSources = [{ path: "", message }];
  }

  if (isProduction) {
    console.error(`[${statusCode}] ${err?.name || "Error"}: ${message}`);
  } else {
    console.error({ GlobalError: err });
  }

  const response = {
    success: false,
    message,
    errorSources,
  };

  if (!isProduction) {
    response.err = err;
    response.stack = err?.stack || null;
  }

  return res.status(statusCode).json(response);
};

export default globalErrorHandler;
