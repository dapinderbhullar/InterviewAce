const { randomUUID } = require('node:crypto');
const Roadmap = require('../models/LearningRoadmap');
const Task = require('../models/LearningTask');
const Attempt = require('../models/PracticeAttempt');
const Profile = require('../models/CandidateProfile');
const Job = require('../models/JobDescription');
const Match = require('../models/MatchReport');
const Interview = require('../models/InterviewSession');
const { analyze, plan, progress } = require('./learningAnalysis');
const { contextFor, shape } = require('../schemas/interview');
const { KINDS, parseQuestion, parseEvaluation } = require('../schemas/learning');
const httpError = require('../utils/httpError');
function id(value) { if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw httpError(400, 'Invalid learning resource ID'); return value.toLowerCase(); }
function publicAttempt(doc) { const value = doc.toObject ? doc.toObject() : { ...doc }; delete value.context; delete value.leaseToken; return value; }
function createLearningService({ roadmaps = Roadmap, tasks = Task, attempts = Attempt, profiles = Profile, jobs = Job, matches = Match, interviews = Interview,
  generate = (data) => require('./geminiService').generatePractice(data), evaluate = data => require('./geminiService').evaluatePractice(data), clock = () => new Date(), deadlineMs = 65000 } = {}) {
  async function owned(model, userId, resourceId) { const row = await model.findOne({ userId, _id: id(resourceId) }); if (!row) throw httpError(404, 'Learning resource not found'); return row; }
  async function sources(userId, resumeId, jobId) {
    const profile = await profiles.findOne({ userId, resumeId, status: 'ready' }); if (!profile) throw httpError(404, 'Ready candidate profile not found');
    const job = jobId ? await jobs.findOne({ userId, _id: jobId }) : null; if (jobId && !job) throw httpError(404, 'Job not found');
    return { profile, job };
  }
  async function refresh(userId, input) {
    shape(input, ['resumeId', 'jobId'], 400);
    const resumeId = id(input.resumeId), jobId = input.jobId === null ? null : id(input.jobId);
    const { profile, job } = await sources(userId, resumeId, jobId);
    let roadmap;
    try { roadmap = await roadmaps.findOneAndUpdate({ userId, resumeId, jobId }, { $setOnInsert: { userId, resumeId, jobId } }, { upsert: true, new: true }); }
    catch (error) { if (error.code !== 11000) throw error; roadmap = await roadmaps.findOne({ userId, resumeId, jobId }); }
    const token = randomUUID(), now = clock();
    const claimed = await roadmaps.findOneAndUpdate({ userId, _id: roadmap._id, $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }] }, { $set: { leaseToken: token, leaseUntil: new Date(now.getTime() + 120000) } }, { new: true });
    if (!claimed) throw httpError(409, 'Roadmap refresh in progress. Reload shortly.');
    try {
      const [reports, sessions, practice] = await Promise.all([
        matches.find({ userId, resumeId, ...(jobId ? { jobId } : {}) }),
        interviews.find({ userId, resumeId, status: 'completed', ...(jobId ? { $or: [{ jobId }, { jobId: null }] } : {}) }),
        attempts.find({ userId, roadmapId: roadmap._id, status: 'completed' }),
      ]);
      const skills = analyze(profile.data, job?.data, reports, sessions, practice), recommendations = plan(skills);
      for (const task of recommendations) {
        try { await tasks.updateOne({ userId, roadmapId: roadmap._id, key: task.key }, { $set: task, $setOnInsert: { userId, roadmapId: roadmap._id, completed: false } }, { upsert: true, runValidators: true }); }
        catch (error) { if (error.code !== 11000) throw error; }
      }
      await tasks.updateMany({ userId, roadmapId: roadmap._id, key: { $nin: recommendations.map(t => t.key) } }, { $set: { active: false } });
      await roadmaps.updateOne({ userId, _id: roadmap._id, leaseToken: token }, { $set: { skills, profileRevision: profile.revision, refreshedAt: clock() } });
    } finally { await roadmaps.updateOne({ userId, _id: roadmap._id, leaseToken: token }, { $unset: { leaseToken: 1, leaseUntil: 1 } }); }
    return get(userId, String(roadmap._id));
  }
  async function get(userId, roadmapId) {
    const roadmap = await owned(roadmaps, userId, roadmapId);
    const [savedTasks, savedAttempts] = await Promise.all([tasks.find({ userId, roadmapId: roadmap._id }).sort({ priority: -1, key: 1 }), attempts.find({ userId, roadmapId: roadmap._id }).sort({ createdAt: 1 })]);
    const { profile, job } = await sources(userId, roadmap.resumeId, roadmap.jobId);
    const [reports, sessions] = await Promise.all([matches.find({ userId, resumeId: roadmap.resumeId, ...(roadmap.jobId ? { jobId: roadmap.jobId } : {}) }), interviews.find({ userId, resumeId: roadmap.resumeId, status: 'completed', ...(roadmap.jobId ? { $or: [{ jobId: roadmap.jobId }, { jobId: null }] } : {}) })]);
    const skills = analyze(profile.data, job?.data, reports, sessions, savedAttempts);
    return { roadmap: { _id: roadmap._id, resumeId: roadmap.resumeId, jobId: roadmap.jobId, refreshedAt: roadmap.refreshedAt }, tasks: savedTasks, attempts: savedAttempts.map(publicAttempt), skills, progress: progress(savedTasks, skills) };
  }
  async function complete(userId, taskId, input) {
    shape(input, ['completed'], 400); if (typeof input.completed !== 'boolean') throw httpError(400, 'Invalid completion status');
    const task = await owned(tasks, userId, taskId);
    await tasks.updateOne({ userId, _id: task._id }, { $set: { completed: input.completed, completedAt: input.completed ? clock() : null } });
    return get(userId, String(task.roadmapId));
  }
  async function ai(work) {
    let timer; try { return await Promise.race([Promise.resolve().then(work), new Promise((_, reject) => { timer = setTimeout(() => reject(httpError(504, 'Practice provider timed out')), deadlineMs); })]); }
    catch (error) { throw httpError(error.status || 502, 'Practice provider failed. Saved work can be retried.'); } finally { clearTimeout(timer); }
  }
  async function run(attempt, stage) {
    const token = randomUUID(), now = clock();
    const claimed = await attempts.findOneAndUpdate({ userId: attempt.userId, _id: attempt._id, status: attempt.status, $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }] }, { $set: { status: stage, leaseToken: token, leaseUntil: new Date(now.getTime() + 120000), failure: null } }, { new: true }).select('+context');
    if (!claimed) throw httpError(409, 'Practice request in progress. Reload shortly.');
    const lock = { userId: attempt.userId, _id: attempt._id, leaseToken: token };
    try {
      let update;
      if (stage === 'generating') update = { prompt: parseQuestion(await ai(() => generate({ topic: claimed.topic, level: claimed.level, kind: claimed.kind, context: claimed.context })), claimed, claimed.kind), status: 'ready' };
      else {
        const evaluation = parseEvaluation(await ai(() => evaluate({ topic: claimed.topic, level: claimed.level, prompt: claimed.prompt, answer: claimed.answer, context: claimed.context })), claimed.context, { type: 'Technical' });
        update = { evaluation, status: 'completed', evaluatedAt: clock() };
      }
      const saved = await attempts.findOneAndUpdate(lock, { $set: update, $unset: { leaseToken: 1, leaseUntil: 1 } }, { new: true, runValidators: true });
      if (!saved) throw httpError(409, 'Practice lease changed. Reload saved history.'); return publicAttempt(saved);
    } catch (error) {
      await attempts.updateOne(lock, { $set: { status: 'failed', failure: 'Provider response unavailable or invalid. Retry saved request.' }, $unset: { leaseToken: 1, leaseUntil: 1 } }); throw error;
    }
  }
  async function exercise(userId, taskId, input) {
    shape(input, ['requestId', 'kind'], 400);
    if (typeof input.requestId !== 'string' || !/^[a-z\d-]{16,80}$/i.test(input.requestId) || !KINDS.includes(input.kind)) throw httpError(400, 'Invalid practice configuration');
    const task = await owned(tasks, userId, taskId), roadmap = await owned(roadmaps, userId, String(task.roadmapId));
    let attempt = await attempts.findOne({ userId, requestId: input.requestId });
    if (attempt && (String(attempt.taskId) !== String(task._id) || attempt.kind !== input.kind)) throw httpError(409, 'Practice request key already used');
    if (!attempt) {
      const { profile, job } = await sources(userId, roadmap.resumeId, roadmap.jobId);
      try { attempt = await attempts.create({ userId, roadmapId: roadmap._id, taskId: task._id, requestId: input.requestId, kind: input.kind, topic: task.topic, level: task.level, context: contextFor(profile.data, job?.data), status: 'failed' }); }
      catch (error) { if (error.code !== 11000) throw error; attempt = await attempts.findOne({ userId, requestId: input.requestId }); if (String(attempt.taskId) !== String(task._id) || attempt.kind !== input.kind) throw httpError(409, 'Practice request key already used'); }
    }
    if (attempt.prompt || attempt.status === 'completed') return publicAttempt(attempt);
    return run(attempt, 'generating');
  }
  async function submit(userId, attemptId, input) {
    shape(input, ['answer'], 400);
    if (typeof input.answer !== 'string' || !input.answer.trim() || input.answer.length > 10000 || input.answer.includes('\0')) throw httpError(400, 'Answer must contain 1–10,000 characters');
    let attempt = await owned(attempts, userId, attemptId);
    if (!attempt.prompt) throw httpError(409, 'Generate a question first');
    if (attempt.answer && attempt.answer !== input.answer.trim()) throw httpError(409, 'Answer already saved; start a new exercise to try again');
    if (attempt.status === 'completed') return publicAttempt(attempt);
    // Save the first answer atomically before invoking the provider. Retries must reuse it.
    attempt = await attempts.findOneAndUpdate({ userId, _id: attempt._id, $or: [{ answer: null }, { answer: input.answer.trim() }] }, { $set: { answer: input.answer.trim() } }, { new: true });
    if (!attempt) throw httpError(409, 'Another answer was saved');
    return run(attempt, 'evaluating');
  }
  return { refresh, get, complete, exercise, submit };
}
module.exports = { createLearningService, publicAttempt, id };
