const mongoose = require("mongoose");

const resumeSchema = new mongoose.Schema({
  userId: String,
  fileName: String,
  filePath: String,
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Resume", resumeSchema);