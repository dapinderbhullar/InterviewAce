const mongoose = require('mongoose');
const evaluation = new mongoose.Schema({
  criteria: { correctness: Number, technicalDepth: Number, clarity: Number, relevance: Number, completeness: Number },
  score: { type: Number, min: 0, max: 100 }, strengths: [String], missingPoints: [String], improvements: [String], exampleAnswer: String,
  evidence: [{ _id: false, projectIndex: Number, quote: String }],
}, { _id: false, strict: 'throw' });
const question = new mongoose.Schema({
  prompt: String, topic: String, type: { type: String, enum: ['Technical', 'HR', 'Project-Based'] }, projectIndex: Number,
  status: { type: String, enum: ['unanswered', 'evaluating', 'evaluation_failed', 'evaluated'], default: 'unanswered' },
  answer: { type: String, maxlength: 10000 }, submittedAt: Date, evaluatedAt: Date, evaluation,
}, { _id: false, strict: 'throw' });
const schema = new mongoose.Schema({
  userId: { type: String, required: true }, requestId: { type: String, required: true }, configHash: { type: String, required: true },
  resumeId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Resume' }, jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobDescription', default: null },
  profileRevision: { type: Number, required: true }, resumeName: String, jobTitle: String,
  config: { type: { type: String, enum: ['Technical', 'HR', 'Project-Based', 'Mixed'] }, difficulty: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'] }, count: { type: Number, min: 1, max: 10 } },
  context: { type: mongoose.Schema.Types.Mixed, required: true, select: false },
  status: { type: String, enum: ['generating', 'generation_failed', 'active', 'completed'], required: true },
  questions: [question], currentIndex: { type: Number, default: 0 }, revision: { type: Number, default: 0 },
  leaseToken: { type: String, select: false }, leaseUntil: Date, failure: { code: String, message: String }, completedAt: Date,
}, { timestamps: true, strict: 'throw' });
schema.index({ userId: 1, requestId: 1 }, { unique: true });
schema.index({ userId: 1, createdAt: -1 });
module.exports = mongoose.model('InterviewSession', schema);
