const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyze, plan, progress } = require('../services/learningAnalysis');
const { createLearningService } = require('../services/learning');
const { parseQuestion } = require('../schemas/learning');
const { CRITERIA } = require('../schemas/interview');
const user = 'aaaaaaaaaaaaaaaaaaaaaaaa', other = 'bbbbbbbbbbbbbbbbbbbbbbbb', resumeId = '111111111111111111111111', jobId = '222222222222222222222222';
function repo(initial = []) {
  const rows = structuredClone(initial), queries = [];
  const copy = x => x == null ? x : structuredClone(x);
  const match = (r, q) => Object.entries(q).every(([k, v]) => {
    if (k === '$or') return v.some(x => match(r, x));
    if (v === null) return r[k] == null;
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('$lte' in v) return r[k] <= v.$lte;
      if ('$nin' in v) return !v.$nin.includes(r[k]);
    }
    return String(r[k]) === String(v);
  });
  const promise = x => { const p = Promise.resolve(copy(x)); p.select = () => p; return p; };
  function update(r, u, insert = false) {
    Object.assign(r, copy(u.$set || {}), insert ? copy(u.$setOnInsert || {}) : {});
    for (const k of Object.keys(u.$unset || {})) delete r[k];
  }
  return { rows, queries,
    findOne(q) { queries.push(q); return promise(rows.find(r => match(r, q))); },
    find(q) { queries.push(q); const p = promise(rows.filter(r => match(r, q))); p.sort = () => p; return p; },
    async create(value) { if (rows.some(r => r.userId === value.userId && r.requestId === value.requestId)) throw Object.assign(Error(), { code: 11000 }); const row = { _id: (rows.length + 10).toString(16).padStart(24, '0'), createdAt: new Date(), ...copy(value) }; rows.push(row); return copy(row); },
    findOneAndUpdate(q, u, options = {}) { queries.push(q); let r = rows.find(r => match(r, q)); let insert = false; if (!r && options.upsert) { r = { _id: (rows.length + 10).toString(16).padStart(24, '0'), ...q }; rows.push(r); insert = true; } if (r) update(r, u, insert); return promise(r); },
    async updateOne(q, u, options) { return this.findOneAndUpdate(q, u, options); },
    async updateMany(q, u) { queries.push(q); rows.filter(r => match(r, q)).forEach(r => update(r, u)); },
  };
}
const data = { skills: [{ name: 'Node.js', proficiency: 'Intermediate' }], projects: [{ name: 'API', description: 'Node.js API', technologies: [{ name: 'Node.js' }] }], experience: [] };
const job = { requiredSkills: ['SQL'], preferredSkills: ['Docker'] };
function feedback(value = 6) { return JSON.stringify({ criteria: Object.fromEntries(CRITERIA.map(k => [k, value])), strengths: ['Clear'], missingPoints: ['Tradeoffs'], improvements: ['Explain tradeoffs'], exampleAnswer: 'A conceptual explanation.', evidence: [] }); }
function fixture(extra = {}) {
  const deps = { roadmaps: repo(), tasks: repo(), attempts: repo(), profiles: repo([{ userId: user, resumeId, status: 'ready', revision: 1, data }]), jobs: repo([{ userId: user, _id: jobId, data: job }]), matches: repo(), interviews: repo(),
    generate: async ({ topic, kind }) => JSON.stringify({ topic, kind, prompt: `Explain ${topic} tradeoffs.` }), evaluate: async () => feedback(), ...extra };
  return { ...deps, service: createLearningService(deps) };
}
const target = { resumeId, jobId };
test('deterministic roadmap prioritizes required gaps, recurring weaknesses and grounded application', () => {
  const sessions = [{ _id: 's', questions: [{ topic: 'Node.js', type: 'Technical', status: 'evaluated', evaluation: { score: 40 }, evaluatedAt: new Date() }] }];
  const skills = analyze(data, job, [], sessions, []), tasks = plan(skills);
  assert.equal(tasks[0].topic, 'SQL'); assert.equal(tasks.length, 9);
  assert.deepEqual(tasks.filter(t => t.topic === 'SQL').map(t => t.level), ['Beginner', 'Intermediate', 'Advanced']);
  assert.ok(tasks.find(t => t.topic === 'Node.js' && t.level === 'Intermediate').objective.includes('API'));
  assert.equal(progress(tasks.map(t => ({ ...t, completed: true })), skills).assessedScore, 40);
  assert.equal(skills.find(s => s.topic === 'SQL').score, null);
});
test('historical report revisions do not double count or revive stale gaps', () => {
  const reports = [1, 2].map(v => ({ jobId, profileRevision: v, result: { requiredSkills: [{ name: 'SQL', status: v === 1 ? 'missing' : 'matched' }] } }));
  assert.equal(plan(analyze(data, null, reports, [], [])).length, 0);
});
test('progress uses assessments only, computes declines and requires repeated high scores', () => {
  const attempts = [90, 90, 90, 40, 50, 60].map((score, i) => ({ _id: String(i), status: 'completed', topic: 'SQL', evaluation: { score }, evaluatedAt: new Date(2026, 0, i + 1) }));
  const sql = analyze(data, job, [], [], attempts).find(s => s.topic === 'SQL');
  assert.equal(sql.score, 50); assert.equal(sql.trend, -40); assert.equal(sql.declining, true); assert.equal(sql.assessment, 'Developing');
  assert.equal(progress([{ completed: true, active: true }], [sql]).completionPercent, 100);
  assert.equal(progress([], []).assessedScore, null);
});
test('refresh prevents duplicates and preserves completion and historical attempts', async () => {
  const f = fixture(), first = await f.service.refresh(user, target), task = first.tasks[0];
  await f.service.complete(user, task._id, { completed: true });
  const a = await f.service.exercise(user, task._id, { requestId: 'request-key-00001', kind: 'technical' });
  await f.service.submit(user, a._id, { answer: 'My answer' });
  const refreshed = await f.service.refresh(user, target);
  assert.equal(f.tasks.rows.length, 6); assert.equal(f.roadmaps.rows.length, 1);
  assert.equal(refreshed.tasks.find(t => t._id === task._id).completed, true);
  assert.equal(refreshed.attempts[0].answer, 'My answer'); assert.equal(refreshed.attempts[0].evaluation.score, 60);
  assert.equal(refreshed.attempts[0].context, undefined);
});
test('exercise keys and submitted answers are idempotent and reject conflicting replays', async () => {
  let calls = 0; const f = fixture({ evaluate: async () => { calls++; return feedback(8); } });
  const d = await f.service.refresh(user, target), task = d.tasks[0];
  const config = { requestId: 'request-key-00001', kind: 'scenario' };
  const a = await f.service.exercise(user, task._id, config);
  assert.equal((await f.service.exercise(user, task._id, config))._id, a._id);
  await f.service.submit(user, a._id, { answer: 'Answer' }); await f.service.submit(user, a._id, { answer: 'Answer' }); assert.equal(calls, 1);
  await assert.rejects(() => f.service.submit(user, a._id, { answer: 'Changed' }), e => e.status === 409);
  await assert.rejects(() => f.service.exercise(user, d.tasks[1]._id, config), e => e.status === 409);
});
test('generation and evaluation failures retain work and retry safely', async () => {
  let fail = true; const f = fixture({ generate: async ({ topic, kind }) => fail ? '{}' : JSON.stringify({ topic, kind, prompt: 'Explain a tradeoff.' }), evaluate: async () => fail ? '{}' : feedback() });
  const d = await f.service.refresh(user, target), t = d.tasks[0], config = { requestId: 'request-key-00001', kind: 'conceptual' };
  await assert.rejects(() => f.service.exercise(user, t._id, config), e => e.status === 502); assert.equal(f.attempts.rows[0].status, 'failed');
  fail = false; const a = await f.service.exercise(user, t._id, config); fail = true;
  await assert.rejects(() => f.service.submit(user, a._id, { answer: 'Saved answer' }), e => e.status === 502);
  assert.equal(f.attempts.rows[0].answer, 'Saved answer'); fail = false;
  assert.equal((await f.service.submit(user, a._id, { answer: 'Saved answer' })).status, 'completed');
});
test('concurrent refresh and evaluation claims reject duplicate work; expired leases recover', async () => {
  let release, enter; const entered = new Promise(r => { enter = r; }); let calls = 0;
  const f = fixture({ evaluate: async () => { calls++; enter(); await new Promise(r => { release = r; }); return feedback(); } });
  const d = await f.service.refresh(user, target), t = d.tasks[0];
  f.roadmaps.rows[0].leaseUntil = new Date(Date.now() + 10000);
  await assert.rejects(() => f.service.refresh(user, target), e => e.status === 409); delete f.roadmaps.rows[0].leaseUntil;
  const a = await f.service.exercise(user, t._id, { requestId: 'request-key-00001', kind: 'technical' });
  const pending = f.service.submit(user, a._id, { answer: 'answer' }); await entered;
  await assert.rejects(() => f.service.submit(user, a._id, { answer: 'answer' }), e => e.status === 409);
  release(); await pending; assert.equal(calls, 1);
  const row = f.attempts.rows[0]; row.status = 'evaluating'; row.leaseUntil = new Date(0);
  const recovery = createLearningService({ ...f, evaluate: async () => feedback(7) });
  assert.equal((await recovery.submit(user, a._id, { answer: 'answer' })).evaluation.score, 70);
});
test('ownership and strict request validation protect every learning resource', async () => {
  const f = fixture(), d = await f.service.refresh(user, target), t = d.tasks[0];
  const a = await f.service.exercise(user, t._id, { requestId: 'request-key-00001', kind: 'technical' });
  for (const action of [() => f.service.refresh(other, target), () => f.service.get(other, d.roadmap._id), () => f.service.complete(other, t._id, { completed: true }), () => f.service.exercise(other, t._id, { requestId: 'request-key-00002', kind: 'technical' }), () => f.service.submit(other, a._id, { answer: 'Answer' })]) await assert.rejects(action, e => e.status === 404);
  await assert.rejects(() => f.service.refresh(user, { ...target, userId: other }), e => e.status === 400);
  await assert.rejects(() => f.service.get(user, { $ne: '' }), e => e.status === 400);
  for (const r of [f.tasks, f.roadmaps, f.attempts, f.profiles, f.jobs, f.matches, f.interviews]) assert.ok(r.queries.every(q => q.userId));
});
test('AI validation rejects wrong topics, kinds, leaked answers and malformed scores', () => {
  for (const raw of ['{}', JSON.stringify({ topic: 'wrong', kind: 'technical', prompt: 'Explain.' }), JSON.stringify({ topic: 'SQL', kind: 'technical', prompt: 'Answer: secret' })]) assert.throws(() => parseQuestion(raw, { topic: 'SQL' }, 'technical'), e => e.status === 502);
});
test('all learning HTTP endpoints require authentication', async () => {
  const app = require('../app'), server = app.listen(0, '127.0.0.1'); await new Promise(r => server.on('listening', r));
  try { for (const [method, path] of [['POST', ''], ['GET', '/123'], ['PATCH', '/tasks/123'], ['POST', '/tasks/123/exercises'], ['POST', '/attempts/123/answer']]) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/learning${path}`, { method }); assert.equal(response.status, 401);
  } } finally { await new Promise(r => server.close(r)); }
});

test('concurrent exercise generation shares a key and invokes provider once', async () => {
  let enter, release, calls = 0; const entered = new Promise(r => { enter = r; });
  const f = fixture({ generate: async ({ topic, kind }) => { calls++; enter(); await new Promise(r => { release = r; }); return JSON.stringify({ topic, kind, prompt: 'Explain a tradeoff.' }); } });
  const d = await f.service.refresh(user, target), t = d.tasks[0], config = { requestId: 'request-key-00001', kind: 'technical' };
  const pending = f.service.exercise(user, t._id, config); await entered;
  await assert.rejects(() => f.service.exercise(user, t._id, config), e => e.status === 409);
  release(); await pending; assert.equal(calls, 1); assert.equal(f.attempts.rows.length, 1);
});
test('provider deadline saves a recoverable failure and does not expose private errors', async () => {
  const f = fixture({ deadlineMs: 5, generate: async () => new Promise(() => {}) });
  const d = await f.service.refresh(user, target);
  await assert.rejects(() => f.service.exercise(user, d.tasks[0]._id, { requestId: 'request-key-00001', kind: 'technical' }), e => e.status === 504);
  assert.equal(f.attempts.rows[0].status, 'failed'); assert.equal(f.attempts.rows[0].leaseToken, undefined);
});
test('expired evaluation worker cannot overwrite a recovered attempt', async () => {
  let enter, release; const entered = new Promise(r => { enter = r; });
  const f = fixture({ evaluate: async () => { enter(); await new Promise(r => { release = r; }); return feedback(2); } });
  const d = await f.service.refresh(user, target), a = await f.service.exercise(user, d.tasks[0]._id, { requestId: 'request-key-00001', kind: 'technical' });
  const pending = f.service.submit(user, a._id, { answer: 'Saved answer' }); await entered;
  f.attempts.rows[0].leaseUntil = new Date(0);
  const recovered = createLearningService({ ...f, evaluate: async () => feedback(9) });
  await recovered.submit(user, a._id, { answer: 'Saved answer' }); release();
  await assert.rejects(() => pending, e => e.status === 409);
  assert.equal(f.attempts.rows[0].evaluation.score, 90); assert.equal(f.attempts.rows[0].status, 'completed');
});
test('resolved gaps retire pending tasks without deleting completed tasks or assessment history', async () => {
  const f = fixture(), d = await f.service.refresh(user, target), task = d.tasks.find(t => t.topic === 'SQL');
  await f.service.complete(user, task._id, { completed: true });
  f.jobs.rows[0].data.requiredSkills = [];
  const next = await f.service.refresh(user, target), old = next.tasks.filter(t => t.topic === 'SQL');
  assert.equal(old.length, 3); assert.ok(old.every(t => !t.active)); assert.equal(old.find(t => t._id === task._id).completed, true);
  assert.equal(next.progress.completedTasks, 1);
});
test('learning models declare owner-scoped unique keys and strict validation', async () => {
  for (const [file, keys] of [['LearningRoadmap', ['userId', 'resumeId', 'jobId']], ['LearningTask', ['userId', 'roadmapId', 'key']], ['PracticeAttempt', ['userId', 'requestId']]]) {
    const Model = require(`../models/${file}`);
    assert.ok(Model.schema.indexes().some(([index, options]) => options.unique && keys.every(k => index[k] === 1)));
    assert.throws(() => new Model({ unexpected: true }), /strict mode/);
  }
  const Attempt = require('../models/PracticeAttempt');
  await assert.rejects(() => new Attempt({ userId: user, roadmapId: jobId, taskId: resumeId, requestId: 'key', kind: 'unsupported', status: 'completed' }).validate());
});
