const { createHash, randomUUID } = require('node:crypto');
const InterviewSession = require('../models/InterviewSession');
const Resume = require('../models/Resume');
const CandidateProfile = require('../models/CandidateProfile');
const JobDescription = require('../models/JobDescription');
const { TYPES, DIFFICULTIES, shape, contextFor, parseQuestions, parseEvaluation } = require('../schemas/interview');
const { interviewReport } = require('./interviewReport');
const httpError = require('../utils/httpError');
const LEASE_MS = 120000;
function id(value) { if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw httpError(400, 'Invalid interview resource ID'); return value.toLowerCase(); }
function publicSession(doc, now = new Date()) {
  const s = doc.toObject ? doc.toObject() : structuredClone(doc);
  const questions = s.questions || [];
  const busy = s.status === 'generating' || questions[s.currentIndex]?.status === 'evaluating';
  return {
    _id: s._id, resumeId: s.resumeId, jobId: s.jobId, resumeName: s.resumeName, jobTitle: s.jobTitle,
    profileRevision: s.profileRevision, config: s.config, status: s.status, currentIndex: s.currentIndex, revision: s.revision,
    createdAt: s.createdAt, completedAt: s.completedAt, failure: s.failure || null,
    leaseUntil: busy ? s.leaseUntil : null, canRecover: !!(busy && s.leaseUntil <= now),
    questions: questions.flatMap((q, index) => q.status === 'evaluated' || index === s.currentIndex ? [{
      index, prompt: q.prompt, topic: q.topic, type: q.type, status: q.status, answer: q.answer || '',
      ...(q.status === 'evaluated' ? { evaluation: q.evaluation, evaluatedAt: q.evaluatedAt } : {}),
    }] : []),
    report: interviewReport({ ...s, questions }),
  };
}
function createInterviewService({ sessions = InterviewSession, resumes = Resume, profiles = CandidateProfile, jobs = JobDescription,
  generate = (context, config) => require('./geminiService').generateInterview(context, config),
  evaluate = (context, config, question, answer) => require('./geminiService').evaluateInterviewAnswer(context, config, question, answer),
  clock = () => new Date(), deadlineMs = 65000 } = {}) {
  async function owned(userId, sessionId) {
    const session = await sessions.findOne({ userId, _id: id(sessionId) }).select('+context +leaseToken');
    if (!session) throw httpError(404, 'Interview not found'); return session;
  }
  async function ai(work) {
    let timer;
    try { return await Promise.race([Promise.resolve().then(work), new Promise((resolve, reject) => { timer = setTimeout(() => reject(httpError(504, 'Interview AI timed out')), deadlineMs); })]); }
    catch (error) { if (error.status) throw error; if (['AbortError', 'GoogleGenerativeAIAbortError'].includes(error.name)) throw httpError(504, 'Interview AI timed out'); throw httpError(502, 'Interview AI could not complete this request'); }
    finally { clearTimeout(timer); }
  }
  const response = (session, status = 200) => ({ status, session: publicSession(session, clock()) });
  async function generateClaimed(session) {
    const locked = { userId: session.userId, _id: session._id, status: 'generating', leaseToken: session.leaseToken };
    try {
      const questions = parseQuestions(await ai(() => generate(session.context, session.config)), session.context, session.config);
      const saved = await sessions.findOneAndUpdate(locked, { $set: { questions, status: 'active', failure: null, currentIndex: 0 }, $unset: { leaseToken: 1, leaseUntil: 1 }, $inc: { revision: 1 } }, { new: true, runValidators: true });
      if (!saved) throw httpError(409, 'Interview generation lease changed. Reload the session.');
      return response(saved);
    } catch (error) {
      const failed = await sessions.findOneAndUpdate(locked, { $set: { status: 'generation_failed', failure: { code: error.status === 504 ? 'TIMEOUT' : 'GENERATION', message: 'Question generation failed. Your setup is saved; retry this session.' } }, $unset: { leaseToken: 1, leaseUntil: 1 }, $inc: { revision: 1 } }, { new: true });
      if (!failed) throw httpError(409, 'Interview changed. Reload the session.');
      return response(failed, error.status === 504 ? 504 : 502);
    }
  }
  async function create(userId, input) {
    shape(input, ['requestId', 'resumeId', 'jobId', 'type', 'difficulty', 'count'], 400);
    if (typeof input.requestId !== 'string' || !/^[a-z\d-]{16,80}$/i.test(input.requestId) || !TYPES.includes(input.type) || !DIFFICULTIES.includes(input.difficulty) || !Number.isInteger(input.count) || input.count < (input.type === 'Mixed' ? 3 : 1) || input.count > 10) throw httpError(400, 'Invalid interview configuration');
    const resumeId = id(input.resumeId), jobId = input.jobId === null ? null : id(input.jobId);
    const config = { type: input.type, difficulty: input.difficulty, count: input.count };
    const configHash = createHash('sha256').update(JSON.stringify({ resumeId, jobId, config })).digest('hex');
    const existing = await sessions.findOne({ userId, requestId: input.requestId });
    if (existing) { if (existing.configHash !== configHash) throw httpError(409, 'This creation request was already used with different settings'); return response(existing, existing.status === 'generating' ? 202 : 200); }
    const resume = await resumes.findOne({ userId, _id: resumeId }); if (!resume) throw httpError(404, 'Resume not found');
    const profile = await profiles.findOne({ userId, resumeId, status: 'ready' }); if (!profile) throw httpError(409, 'Build a ready Resume Intelligence Profile first');
    const job = jobId ? await jobs.findOne({ userId, _id: jobId }) : null; if (jobId && !job) throw httpError(404, 'Job description not found');
    const context = contextFor(profile.data, job?.data);
    if (config.type === 'Project-Based' && !context.projects.length) throw httpError(422, 'This profile has no saved projects. Choose another interview type or add a truthful project to the profile.');
    let session;
    try {
      session = await sessions.create({ userId, requestId: input.requestId, configHash, resumeId, jobId, profileRevision: profile.revision,
        resumeName: resume.originalName || resume.fileName, jobTitle: job?.data.title || '', config, context,
        questions: [], currentIndex: 0, revision: 0, status: 'generating', leaseToken: randomUUID(), leaseUntil: new Date(clock().getTime() + LEASE_MS) });
    } catch (error) {
      if (error.code !== 11000) throw error;
      const saved = await sessions.findOne({ userId, requestId: input.requestId });
      if (!saved) throw error;
      if (saved.configHash !== configHash) throw httpError(409, 'Creation request settings conflict');
      return response(saved, saved.status === 'generating' ? 202 : 200);
    }
    return generateClaimed(session);
  }
  async function retryGeneration(userId, sessionId, input) {
    shape(input, [], 400);
    const session = await owned(userId, sessionId);
    if (['active', 'completed'].includes(session.status)) return response(session);
    if (session.status === 'generating' && session.leaseUntil > clock()) return response(session, 202);
    const query = { userId, _id: session._id, revision: session.revision, status: session.status,
      ...(session.status === 'generating' ? { leaseUntil: { $lte: clock() } } : {}) };
    const claimed = await sessions.findOneAndUpdate(query, { $set: { status: 'generating', leaseToken: randomUUID(), leaseUntil: new Date(clock().getTime() + LEASE_MS), failure: null }, $inc: { revision: 1 } }, { new: true }).select('+context +leaseToken');
    if (!claimed) return response(await owned(userId, sessionId), 202);
    return generateClaimed(claimed);
  }
  async function submit(userId, sessionId, input) {
    shape(input, ['questionIndex', 'answer'], 400);
    if (!Number.isInteger(input.questionIndex) || input.questionIndex < 0 || typeof input.answer !== 'string' || !input.answer.trim() || input.answer.length > 10000 || input.answer.includes('\0')) throw httpError(400, 'Submit a nonempty text answer of at most 10,000 characters');
    const answer = input.answer.trim(), session = await owned(userId, sessionId), index = input.questionIndex;
    const question = session.questions[index];
    if (!question || index > session.currentIndex) throw httpError(409, 'Answer the current question in sequence');
    if (question.answer && question.answer !== answer) throw httpError(409, 'A submitted answer cannot be replaced. Retry evaluation with the saved answer.');
    if (question.status === 'evaluated') return response(session);
    if (session.status !== 'active' || index !== session.currentIndex) throw httpError(409, 'Interview is not ready for this answer');
    if (question.status === 'evaluating' && session.leaseUntil > clock()) return response(session, 202);
    const leaseToken = randomUUID(), path = `questions.${index}`;
    const claimed = await sessions.findOneAndUpdate({ userId, _id: session._id, revision: session.revision, status: 'active', currentIndex: index,
      ...(question.status === 'evaluating' ? { leaseUntil: { $lte: clock() } } : {}),
    }, { $set: { [`${path}.answer`]: answer, [`${path}.status`]: 'evaluating', [`${path}.submittedAt`]: question.submittedAt || clock(), leaseToken,
      leaseUntil: new Date(clock().getTime() + LEASE_MS), failure: null }, $inc: { revision: 1 } }, { new: true }).select('+context +leaseToken');
    if (!claimed) return response(await owned(userId, sessionId), 202);
    const locked = { userId, _id: session._id, leaseToken, currentIndex: index, status: 'active' };
    try {
      const evaluation = parseEvaluation(await ai(() => evaluate(claimed.context, claimed.config, claimed.questions[index], answer)), claimed.context, claimed.questions[index]);
      const completed = index + 1 === claimed.config.count;
      const saved = await sessions.findOneAndUpdate(locked, { $set: { [`${path}.status`]: 'evaluated', [`${path}.evaluation`]: evaluation, [`${path}.evaluatedAt`]: clock(),
        currentIndex: index + 1, status: completed ? 'completed' : 'active', ...(completed ? { completedAt: clock() } : {}), failure: null },
      $unset: { leaseToken: 1, leaseUntil: 1 }, $inc: { revision: 1 } }, { new: true, runValidators: true });
      if (!saved) throw httpError(409, 'Evaluation lease changed. Reload the session.');
      return response(saved);
    } catch (error) {
      const failed = await sessions.findOneAndUpdate(locked, { $set: { [`${path}.status`]: 'evaluation_failed', failure: { code: error.status === 504 ? 'TIMEOUT' : 'EVALUATION', message: 'Evaluation failed. Your answer is saved; retry evaluation without resubmitting a different answer.' } }, $unset: { leaseToken: 1, leaseUntil: 1 }, $inc: { revision: 1 } }, { new: true });
      if (!failed) throw httpError(409, 'Interview changed. Reload the saved session.');
      return response(failed, error.status === 504 ? 504 : 502);
    }
  }
  return { create, retryGeneration, submit,
    get: async (userId, sessionId) => publicSession(await owned(userId, sessionId), clock()),
    async list(userId) { const rows = await sessions.find({ userId }).sort({ createdAt: -1 }).limit(100); return rows.map(row => {
      const s = publicSession(row, clock()); return { _id: s._id, resumeName: s.resumeName, jobTitle: s.jobTitle, config: s.config, status: s.status, currentIndex: s.currentIndex, createdAt: s.createdAt, completedAt: s.completedAt, score: s.report.overallScore };
    }); },
  };
}
module.exports = { createInterviewService, publicSession };
