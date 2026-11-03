const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: String, required: true }, roadmapId: { type: mongoose.Schema.Types.ObjectId, required: true },
  taskId: { type: mongoose.Schema.Types.ObjectId, required: true }, requestId: { type: String, required: true },
  kind: { type: String, enum: ['conceptual', 'technical', 'scenario'] }, topic: String, level: String,
  context: { type: mongoose.Schema.Types.Mixed, select: false }, prompt: String, answer: String,
  evaluation: mongoose.Schema.Types.Mixed, status: { type: String, enum: ['generating', 'ready', 'evaluating', 'completed', 'failed'] },
  leaseToken: { type: String, select: false }, leaseUntil: Date, failure: String, evaluatedAt: Date,
}, { timestamps: true, strict: 'throw' });
schema.index({ userId: 1, requestId: 1 }, { unique: true });
schema.index({ userId: 1, roadmapId: 1, createdAt: 1 });
module.exports = mongoose.model('PracticeAttempt', schema);
