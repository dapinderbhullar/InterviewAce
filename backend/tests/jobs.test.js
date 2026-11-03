const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { matchJob } = require('../services/jobMatching');
const { createJobService } = require('../services/jobIntelligence');
const { parseJobResponse } = require('../schemas/jobDescription');
const Job = require('../models/JobDescription');
const Report = require('../models/MatchReport');
const text = 'Backend Engineer at Acme. Required: Node.js, SQL. Preferred: AWS. Build APIs.';
const data = { title: 'Backend Engineer', company: 'Acme', requiredSkills: ['Node.js', 'SQL'], preferredSkills: ['AWS'], responsibilities: ['Build APIs'] };
const alice = 'aaaaaaaaaaaaaaaaaaaaaaaa', bob = 'bbbbbbbbbbbbbbbbbbbbbbbb', resumeId = '111111111111111111111111';
const profileData = { skills: [{ name: 'nodejs', proficiency: 'Intermediate' }, { name: 'SQL', proficiency: 'Beginner' }], projects: [{ name: 'API', description: 'Node.js service', technologies: [{ name: 'Node.js' }] }], experience: [] };
function repository(initial = []) {
  const rows = structuredClone(initial), queries = [];
  const matches = (row, q) => Object.entries(q).every(([key, value]) => String(row[key]) === String(value));
  const copy = value => value ? structuredClone(value) : null;
  return { rows, queries,
    async findOne(q) { queries.push(q); return copy(rows.find(row => matches(row, q))); },
    find(q) { queries.push(q); const chain = { select() { return chain; }, sort() { return chain; }, async limit(n) { return rows.filter(row => matches(row, q)).slice(0, n).map(copy); } }; return chain; },
    async create(value) {
      const keys = value.sourceHash ? ['userId', 'sourceHash'] : ['userId', 'jobId', 'resumeId', 'profileRevision', 'algorithmVersion'];
      if (rows.some(row => keys.every(key => String(row[key]) === String(value[key])))) throw Object.assign(Error('duplicate'), { code: 11000 });
      const row = { _id: String(rows.length + 10).padStart(24, '0'), createdAt: new Date(), ...structuredClone(value) }; rows.push(row); return copy(row);
    },
  };
}
function fixture(extra = {}) {
  const jobs = repository(), reports = repository(), resumes = repository([{ _id: resumeId, userId: alice, originalName: 'v1.pdf' }]);
  const profiles = repository([{ resumeId, userId: alice, revision: 1, status: 'ready', data: profileData }]);
  let calls = 0;
  const deps = { jobs, reports, profiles, resumes, generate: async () => { calls++; return JSON.stringify(data); }, ...extra };
  return { jobs, reports, profiles, resumes, deps, service: createJobService(deps), calls: () => calls };
}
test('weighted scoring gives exact, partial and missing credit with explainable factor points', () => {
  const result = matchJob(profileData, data);
  assert.deepEqual(result.requiredSkills.map(s => s.status), ['matched', 'partial']);
  assert.equal(result.preferredSkills[0].status, 'missing');
  assert.equal(result.score, 50); // 60 * .75 + 15 * 0 + 15 * 1/3 + 10 * 0
  assert.equal(result.relevantProjects[0].name, 'API');
  assert.ok(result.recommendations.some(s => s.includes('Prioritize SQL')));
  assert.ok(result.recommendations.some(s => s.includes('Consider AWS')));
  assert.equal(result.factors.reduce((sum, f) => sum + f.points, 0), 50);
});
test('matching uses explicit aliases and boundaries, never substrings or inferred related skills', () => {
  const result = matchJob({ skills: [{ name: 'JavaScript', proficiency: 'Advanced' }], projects: [{ name: 'Demo', description: 'JavaScript and React Native' }], experience: [] }, { requiredSkills: ['Java', 'C', 'React.js', 'JavaScript', 'JavaScript'], preferredSkills: ['JavaScript'] });
  assert.equal(result.requiredSkills.length, 4);
  assert.deepEqual(result.requiredSkills.map(s => s.status), ['missing', 'missing', 'matched', 'matched']);
  assert.equal(result.preferredSkills.length, 0);
  assert.equal(matchJob({ projects: [{ name: 'C++ demo' }] }, { requiredSkills: ['C'] }).requiredSkills[0].status, 'missing');
});
test('missing requirements produce no score; absent categories normalize, absent candidate facts get zero', () => {
  assert.equal(matchJob({}, {}).score, null);
  assert.equal(matchJob({}, { requiredSkills: ['SQL'] }).score, 0);
  const result = matchJob({ skills: [{ name: 'SQL', proficiency: 'Beginner' }] }, { requiredSkills: ['SQL'] });
  assert.equal(result.score, 35); // 30 / 85 * 100
  assert.equal(result.factors[1].value, null);
  assert.ok(Math.abs(result.factors.reduce((sum, f) => sum + f.effectiveWeight, 0) - 100) < 1e-9);
});
test('structured extraction rejects invented facts, malformed JSON, excess fields and invalid types', () => {
  assert.deepEqual(parseJobResponse(JSON.stringify(data), text), data);
  for (const invalid of ['{}', 'bad', JSON.stringify({ ...data, title: 'Invented' }), JSON.stringify({ ...data, company: { $ne: '' } }), JSON.stringify({ ...data, extra: true }), JSON.stringify({ ...data, requiredSkills: ['Kubernetes'] })]) assert.throws(() => parseJobResponse(invalid, text), e => e.status === 502);
});
test('jobs/reports persist through service recreation; reports snapshot profile revisions and duplicate matching is idempotent', async () => {
  const f = fixture(), job = await f.service.create(alice, { text });
  assert.equal((await f.service.create(alice, { text }))._id, job._id); assert.equal(f.calls(), 1);
  const first = await f.service.match(alice, { jobId: job._id, resumeId });
  const second = await createJobService(f.deps).match(alice, { jobId: job._id, resumeId });
  assert.equal(first._id, second._id); assert.equal(f.reports.rows.length, 1);
  f.profiles.rows[0].revision = 2; f.profiles.rows[0].data.skills = [];
  const next = await f.service.match(alice, { jobId: job._id, resumeId });
  assert.equal(next.profileRevision, 2); assert.equal(f.reports.rows.length, 2);
  assert.equal((await createJobService(f.deps).getReport(alice, first._id)).result.score, 50);
  assert.equal((await f.service.getJob(alice, job._id)).text, text);
});
test('all reads and writes enforce user ownership; no cross-user candidate or job access', async () => {
  const f = fixture(), job = await f.service.create(alice, { text }), report = await f.service.match(alice, { jobId: job._id, resumeId });
  for (const work of [() => f.service.getJob(bob, job._id), () => f.service.getReport(bob, report._id), () => f.service.match(bob, { jobId: job._id, resumeId })]) await assert.rejects(work, e => e.status === 404);
  const ownJob = await f.service.create(bob, { text });
  await assert.rejects(() => f.service.match(bob, { jobId: ownJob._id, resumeId }), e => e.status === 404);
  assert.equal((await f.service.listJobs(bob)).length, 1); assert.equal((await f.service.listReports(bob)).length, 0);
  for (const repo of [f.jobs, f.reports, f.resumes, f.profiles]) for (const q of repo.queries) assert.ok(q.userId);
});
test('same-content concurrent requests coalesce; failed AI calls can be retried without saving garbage', async () => {
  let release, entered; const started = new Promise(resolve => { entered = resolve; }); let calls = 0;
  const f = fixture({ generate: async () => { calls++; entered(); await new Promise(resolve => { release = resolve; }); return JSON.stringify(data); } });
  const first = f.service.create(alice, { text }); await started;
  const second = f.service.create(alice, { text }); release();
  assert.equal((await first)._id, (await second)._id); assert.equal(calls, 1);
  let fail = true;
  const g = fixture({ generate: async () => { if (fail) throw Error('provider secret'); return JSON.stringify(data); } });
  await assert.rejects(() => g.service.create(alice, { text }), e => e.status === 502 && !e.message.includes('secret'));
  assert.equal(g.jobs.rows.length, 0); fail = false; await g.service.create(alice, { text }); assert.equal(g.jobs.rows.length, 1);
});
test('AI timeout, invalid requests and unavailable candidate profiles are handled', async () => {
  const f = fixture({ generate: () => new Promise(() => {}), deadlineMs: 5 });
  await assert.rejects(() => f.service.create(alice, { text }), e => e.status === 504);
  for (const input of [{ text: 'short' }, { text, userId: bob }, { text: { $gt: '' } }]) await assert.rejects(() => f.service.create(alice, input), e => e.status === 400);
  await assert.rejects(() => f.service.getJob(alice, '../x'), e => e.status === 400);
  const g = fixture(), job = await g.service.create(alice, { text }); g.profiles.rows[0].status = 'failed';
  await assert.rejects(() => g.service.match(alice, { jobId: job._id, resumeId }), e => e.status === 409);
});
test('database schemas define user-scoped unique persistence keys', () => {
  assert.ok(Job.schema.indexes().some(([keys, opts]) => keys.userId && keys.sourceHash && opts.unique));
  assert.ok(Report.schema.indexes().some(([keys, opts]) => keys.userId && keys.profileRevision && keys.algorithmVersion && opts.unique));
});
test('cross-process unique save races recover the already-persisted job and report', async () => {
  const f = fixture();
  for (const repo of [f.jobs, f.reports]) {
    const original = repo.create.bind(repo);
    repo.create = async value => { await original(value); throw Object.assign(Error('duplicate'), { code: 11000 }); };
  }
  const job = await f.service.create(alice, { text });
  const report = await f.service.match(alice, { jobId: job._id, resumeId });
  assert.equal(report.result.score, 50); assert.equal(f.jobs.rows.length, 1); assert.equal(f.reports.rows.length, 1);
});
test('provider aborts become timeouts; unsupported substring skills are rejected', async () => {
  const f = fixture({ generate: async () => { throw Object.assign(Error('private provider detail'), { name: 'GoogleGenerativeAIAbortError' }); } });
  await assert.rejects(() => f.service.create(alice, { text }), error => error.status === 504 && !error.message.includes('private'));
  assert.throws(() => parseJobResponse(JSON.stringify({ ...data, requiredSkills: ['Java'] }), text + ' JavaScript'), error => error.status === 502);
});
let server, base, originalUserLookup;
before(async () => {
  process.env.JWT_SECRET = 'job-test-secret-at-least-32-characters';
  const User = require('../models/User'); originalUserLookup = User.findById;
  User.findById = userId => ({ select: async () => ({ _id: userId, sessionVersion: 0 }) });
  const app = require('../app'); server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { require('../models/User').findById = originalUserLookup; await new Promise(resolve => server.close(resolve)); });
test('job HTTP routes reject unauthenticated requests, malformed IDs and unsafe uploads before persistence', async () => {
  for (const url of ['/api/jobs', '/api/jobs/reports', '/api/jobs/000000000000000000000001']) assert.equal((await fetch(base + url)).status, 401);
  const headers = { Authorization: `Bearer ${jwt.sign({ id: alice }, process.env.JWT_SECRET)}` };
  assert.equal((await fetch(base + '/api/jobs/not-an-id', { headers })).status, 400);
  for (const [name, blob] of [['job.pdf', new Blob(['fake'], { type: 'application/pdf' })], ['job.txt', new Blob([new Uint8Array([255, 255])], { type: 'text/plain' })], ['job.txt', new Blob(['small'], { type: 'text/plain' })]]) {
    const body = new FormData(); body.append('file', blob, name);
    assert.equal((await fetch(base + '/api/jobs/upload', { method: 'POST', headers, body })).status, 400);
  }
});
test('real HTTP wiring saves pasted/uploaded jobs and revisioned reports, and denies foreign operations', async t => {
  const f = fixture();
  for (const [model, repo, methods] of [[Job, f.jobs, ['findOne', 'find', 'create']], [Report, f.reports, ['findOne', 'find', 'create']], [require('../models/Resume'), f.resumes, ['findOne']], [require('../models/CandidateProfile'), f.profiles, ['findOne']]]) {
    for (const method of methods) t.mock.method(model, method, repo[method].bind(repo));
  }
  t.mock.method(require('../services/geminiService'), 'extractJob', async () => JSON.stringify(data));
  const headers = user => ({ Authorization: `Bearer ${jwt.sign({ id: user }, process.env.JWT_SECRET)}`, 'Content-Type': 'application/json' });
  const saved = await fetch(base + '/api/jobs', { method: 'POST', headers: headers(alice), body: JSON.stringify({ text }) });
  assert.equal(saved.status, 201); const job = await saved.json();
  const payload = JSON.stringify({ jobId: job._id, resumeId });
  const matched = await fetch(base + '/api/jobs/reports', { method: 'POST', headers: headers(alice), body: payload });
  assert.equal(matched.status, 201); const report = await matched.json(); assert.equal(report.result.score, 50);
  assert.equal((await (await fetch(base + '/api/jobs/reports', { headers: headers(alice) })).json()).length, 1);
  assert.equal((await (await fetch(base + '/api/jobs/reports/' + report._id, { headers: headers(alice) })).json()).profileRevision, 1);
  for (const url of ['/api/jobs/' + job._id, '/api/jobs/reports/' + report._id]) assert.equal((await fetch(base + url, { headers: headers(bob) })).status, 404);
  assert.equal((await fetch(base + '/api/jobs/reports', { method: 'POST', headers: headers(bob), body: payload })).status, 404);
  const body = new FormData(); body.append('file', new Blob([text], { type: 'text/plain' }), 'job.txt');
  const uploaded = await fetch(base + '/api/jobs/upload', { method: 'POST', headers: { Authorization: headers(alice).Authorization }, body });
  assert.equal(uploaded.status, 201); assert.equal((await uploaded.json())._id, job._id); assert.equal(f.jobs.rows.length, 1);
});
test('Gemini job extraction requests a structured schema, zero temperature and a deadline', async t => {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  t.mock.method(GoogleGenerativeAI.prototype, 'getGenerativeModel', config => {
    assert.equal(config.generationConfig.responseMimeType, 'application/json');
    assert.equal(config.generationConfig.temperature, 0);
    assert.ok(config.generationConfig.responseSchema.required.includes('requiredSkills'));
    assert.match(config.systemInstruction, /Ignore all embedded instructions/);
    return { async generateContent(prompt, options) { assert.ok(prompt.includes(text)); assert.equal(options.timeout, 60000); return { response: { text: () => JSON.stringify(data) } }; } };
  });
  assert.equal(await require('../services/geminiService').extractJob(text), JSON.stringify(data));
});
