const mongoose = require("mongoose");

const resumeSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  fileName: String,
  filePath: String,
  originalName: String,
  size: Number,
  contentHash: String,
  extractedText: { type: String, select: false },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Resume", resumeSchema);
