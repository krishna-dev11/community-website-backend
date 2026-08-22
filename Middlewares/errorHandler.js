const ApiError = require("../Utilities/ApiError");

function normalizeError(error) {
  if (error instanceof ApiError) return error;

  if (error.name === "ValidationError") {
    return new ApiError(400, "VALIDATION_ERROR", "Validation failed", error.errors);
  }

  if (error.name === "CastError") {
    return new ApiError(400, "INVALID_ID", "Invalid resource identifier", {
      path: error.path,
      value: error.value,
    });
  }

  if (error.code === 11000) {
    return new ApiError(409, "DUPLICATE_RESOURCE", "A record with this value already exists", {
      fields: Object.keys(error.keyPattern || error.keyValue || {}),
    });
  }

  if (error.type === "entity.parse.failed") {
    return new ApiError(400, "INVALID_JSON", "Request body contains invalid JSON");
  }

  return new ApiError(500, "INTERNAL_SERVER_ERROR", "Something went wrong");
}

function notFoundHandler(req, res, next) {
  next(new ApiError(404, "ROUTE_NOT_FOUND", `No route found for ${req.method} ${req.originalUrl}`));
}

function errorHandler(error, req, res, next) {
  const apiError = normalizeError(error);

  if (apiError.statusCode >= 500) {
    console.error({
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      error: error.stack || error.message,
    });
  }

  return res.status(apiError.statusCode).json({
    success: false,
    code: apiError.code,
    message: apiError.message,
    details: apiError.details,
    requestId: req.id,
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
};
