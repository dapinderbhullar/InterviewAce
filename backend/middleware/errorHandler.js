const { PDF_SIZE_MESSAGE } = require("../config/uploadPolicy");
module.exports = function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = error.status || 500;
  let message = error.message;
  if (error.name === "MulterError") {
    status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    message = error.code === "LIMIT_FILE_SIZE" ? PDF_SIZE_MESSAGE : "Invalid upload";
  } else if (["ValidationError", "CastError"].includes(error.name)) {
    status = 400;
    message = "Invalid request data";
  } else if (error.code === 11000) {
    status = 409;
    message = "Account already exists";
  } else if (error.code === "ENOENT") {
    status = 404;
    message = "File not found. Please upload your resume again.";
  } else if (error.type === "entity.parse.failed") {
    status = 400;
    message = "Invalid JSON request";
  }
  if (status >= 500) {
    console.error("Request failed:", error.name);
    message = "Something went wrong. Please try again.";
  }
  res.status(status).json({ message });
};
