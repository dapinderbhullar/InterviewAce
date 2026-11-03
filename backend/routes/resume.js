const express = require("express");
const upload = require("../middleware/upload");
const { uploadResume } = require("../controllers/resumeController");
const Resume = require("../models/Resume");
module.exports = function resumeRoutes(uploadRateLimit) {
  const router = express.Router();
  router.get("/", async (req, res) => {
    res.json(await Resume.find({ userId: req.userId }).sort({ uploadedAt: -1 }).limit(100));
  });
  router.post("/upload", uploadRateLimit, upload.single("resume"), uploadResume);
  return router;
};
