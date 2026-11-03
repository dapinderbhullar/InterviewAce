const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: String, required: true }, roadmapId: { type: mongoose.Schema.Types.ObjectId, required: true },
  key: { type: String, required: true }, topic: String, level: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'] },
  explanation: String, objective: String, effortMinutes: Number, priority: Number, revisionRecommended: Boolean,
  active: { type: Boolean, default: true }, completed: { type: Boolean, default: false }, completedAt: Date,
}, { timestamps: true, strict: 'throw' });
schema.index({ userId: 1, roadmapId: 1, key: 1 }, { unique: true });
module.exports = mongoose.model('LearningTask', schema);
