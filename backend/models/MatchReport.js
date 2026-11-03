const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: String, required: true }, jobId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'JobDescription' },
  resumeId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Resume' },
  profileRevision: { type: Number, required: true }, algorithmVersion: { type: Number, required: true },
  jobTitle: String, company: String, resumeName: String,
  result: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true, strict: 'throw' });
schema.index({ userId: 1, jobId: 1, resumeId: 1, profileRevision: 1, algorithmVersion: 1 }, { unique: true });
module.exports = mongoose.model('MatchReport', schema);
