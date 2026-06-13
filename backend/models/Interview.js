const mongoose = require("mongoose");

const interviewSchema =
  new mongoose.Schema({
    userId: String,
    questions: String,
  });

module.exports = mongoose.model(
  "Interview",
  interviewSchema
);