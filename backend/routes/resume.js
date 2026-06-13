const express = require("express");
const upload = require("../middleware/upload");

const router = express.Router();

router.post(
  "/upload",
  upload.single("resume"),
  (req, res) => {
    res.json({
      message: "Resume Uploaded",
      file: req.file.filename,
      path: `uploads/${req.file.filename}`,
    });
  }
);

module.exports = router;