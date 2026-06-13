const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema({
  userId: String,
  atsScore: String,
  analysis: String,
});

module.exports = mongoose.model(
  "Report",
  reportSchema
);