const multer = require("multer");
const httpError = require("../utils/httpError");
const { MAX_PDF_BYTES } = require("../config/uploadPolicy");
module.exports = multer({
  storage: multer.memoryStorage(),
  // Busboy rejects at the threshold; +1 makes the application maximum inclusive.
  limits: { fileSize: MAX_PDF_BYTES + 1, files: 1, fields: 0, parts: 2 },
  fileFilter(req, file, cb) {
    if (!/\.pdf$/i.test(file.originalname) || file.mimetype !== "application/pdf") {
      return cb(httpError(400, "Please upload a PDF file"));
    }
    cb(null, true);
  },
});
