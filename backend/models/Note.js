const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  content: { type: String, required: true, maxlength: 20000 },
  userId: { type: String, required: true },
}, { timestamps: true });
schema.index({ userId: 1, _id: -1 });
module.exports = mongoose.model("Note", schema);
