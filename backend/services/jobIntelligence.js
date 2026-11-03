const { createHash } = require('node:crypto');
const JobDescription = require('../models/JobDescription');
const MatchReport = require('../models/MatchReport');
const CandidateProfile = require('../models/CandidateProfile');
const Resume = require('../models/Resume');
const { jobText, parseJobResponse } = require('../schemas/jobDescription');
const { matchJob, ALGORITHM_VERSION } = require('./jobMatching');
const httpError = require('../utils/httpError');
function id(value) { if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw httpError(400, 'Invalid ID'); return value; }
function exact(input, keys) { if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(input, key))) throw httpError(400, 'Invalid request fields'); }
function createJobService({ jobs = JobDescription, reports = MatchReport, profiles = CandidateProfile, resumes = Resume,
  generate = text => require('./geminiService').extractJob(text), deadlineMs = 65000 } = {}) {
  const pending = new Map();
  async function ownedJob(userId, jobId) { const job = await jobs.findOne({ userId, _id: id(jobId) }); if (!job) throw httpError(404, 'Job description not found'); return job; }
  async function create(userId, input) {
    exact(input, ['text']);
    const text = jobText(input.text), sourceHash = createHash('sha256').update(text).digest('hex');
    const query = { userId, sourceHash }, key = `${userId}:${sourceHash}`;
    const saved = await jobs.findOne(query); if (saved) return saved;
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 32) throw httpError(503, 'Job extraction busy. Retry shortly.');
    const task = (async () => {
      let timer;
      try {
        const raw = await Promise.race([Promise.resolve().then(() => generate(text)), new Promise((resolve, reject) => { timer = setTimeout(() => reject(httpError(504, 'Job extraction timed out')), deadlineMs); })]);
        const data = parseJobResponse(raw, text);
        try { return await jobs.create({ ...query, text, data, schemaVersion: 1 }); }
        catch (error) { if (error.code !== 11000) throw error; const existing = await jobs.findOne(query); if (!existing) throw error; return existing; }
      } catch (error) {
        if (error.status) throw error;
        if (error.name === 'AbortError' || error.name === 'GoogleGenerativeAIAbortError') throw httpError(504, 'Job extraction timed out');
        throw httpError(502, 'Job extraction failed. Please retry.');
      }
      finally { clearTimeout(timer); pending.delete(key); }
    })();
    pending.set(key, task); return task;
  }
  async function match(userId, input) {
    exact(input, ['jobId', 'resumeId']);
    const job = await ownedJob(userId, input.jobId);
    const resume = await resumes.findOne({ userId, _id: id(input.resumeId) });
    if (!resume) throw httpError(404, 'Resume not found');
    const profile = await profiles.findOne({ userId, resumeId: input.resumeId, status: 'ready' });
    if (!profile) throw httpError(409, 'Build a ready Resume Intelligence Profile for this resume first');
    const query = { userId, jobId: job._id, resumeId: resume._id, profileRevision: profile.revision, algorithmVersion: ALGORITHM_VERSION };
    const saved = await reports.findOne(query); if (saved) return saved;
    const data = profile.data.toObject ? profile.data.toObject() : profile.data;
    const result = matchJob(data, job.data);
    try { return await reports.create({ ...query, jobTitle: job.data.title, company: job.data.company, resumeName: resume.originalName || resume.fileName, result }); }
    catch (error) { if (error.code !== 11000) throw error; const existing = await reports.findOne(query); if (!existing) throw error; return existing; }
  }
  async function getReport(userId, reportId) { const report = await reports.findOne({ userId, _id: id(reportId) }); if (!report) throw httpError(404, 'Report not found'); return report; }
  return { create, match, getJob: ownedJob, getReport,
    listJobs: userId => jobs.find({ userId }).select('-text').sort({ createdAt: -1 }).limit(100),
    listReports: userId => reports.find({ userId }).sort({ createdAt: -1 }).limit(100),
  };
}
module.exports = { createJobService };
