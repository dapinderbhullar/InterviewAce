const path = require("node:path");
const httpError = require("../utils/httpError");
const uploadDirectory = path.resolve(__dirname, "../uploads");
function resolveUpload(filePath) {
  if (typeof filePath !== "string" || !/^uploads\/[a-zA-Z0-9._-]+\.pdf$/i.test(filePath)) {
    throw httpError(400, "Invalid resume reference");
  }
  return path.join(uploadDirectory, filePath.slice("uploads/".length));
}
module.exports = { uploadDirectory, resolveUpload };
