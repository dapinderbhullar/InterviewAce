const express = require("express");
const upload = require("../middleware/upload");
const { uploadResume } = require("../controllers/resumeController");
module.exports = function uploadRoutes(uploadRateLimit) {
  const router = express.Router();
  router.post("/", uploadRateLimit, upload.single("resume"), uploadResume);
  return router;
};
