const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: String, required: true }, resumeId: { type: mongoose.Schema.Types.ObjectId, required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, default: null }, skills: [mongoose.Schema.Types.Mixed],
  profileRevision: Number, refreshedAt: Date, leaseToken: { type: String, select: false }, leaseUntil: Date,
}, { timestamps: true, strict: 'throw' });
schema.index({ userId: 1, resumeId: 1, jobId: 1 }, { unique: true });
module.exports = mongoose.model('LearningRoadmap', schema);
