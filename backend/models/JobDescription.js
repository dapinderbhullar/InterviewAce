const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: String, required: true }, sourceHash: { type: String, required: true },
  text: { type: String, required: true, maxlength: 30000 },
  data: { title: String, company: String, responsibilities: [String], requiredSkills: [String], preferredSkills: [String] },
  schemaVersion: { type: Number, default: 1 },
}, { timestamps: true, strict: 'throw' });
schema.index({ userId: 1, sourceHash: 1 }, { unique: true });
module.exports = mongoose.model('JobDescription', schema);
