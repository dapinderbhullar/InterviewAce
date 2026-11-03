const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createInterviewService } = require('../services/interviews');
const { contextFor, questionPlan, topics, parseQuestions, parseEvaluation, CRITERIA } = require('../schemas/interview');
const { interviewReport } = require('../services/interviewReport');
const Model = require('../models/InterviewSession');
const alice = 'aaaaaaaaaaaaaaaaaaaaaaaa', bob = 'bbbbbbbbbbbbbbbbbbbbbbbb', resumeId = '111111111111111111111111', jobId = '222222222222222222222222';
const profile = { personal: { name: 'Private name', email: 'private@example.test' }, skills: [{ name: 'Node.js', proficiency: 'Intermediate' }], projects: [{ name: 'API', description: 'Built a Node.js service.', technologies: [{ name: 'Node.js' }] }], experience: [{ role: 'Developer', company: 'Acme', description: 'Built services.' }] };
const job = { title: 'Engineer', requiredSkills: ['SQL'], preferredSkills: [], responsibilities: ['Build APIs'] };
const context = contextFor(profile, job);
function questions(ctx, config) {
  return JSON.stringify({ questions: questionPlan(ctx, config.type, config.count).map((type, i) => ({ prompt: `Explain ${topics(ctx, type)[0]} with example ${i + 1}.`, topic: topics(ctx, type)[0], type, projectIndex: type === 'Project-Based' ? 0 : -1 })) });
}
function evaluation(q, value = 6) { return JSON.stringify({ criteria: Object.fromEntries(CRITERIA.map(key => [key, value])), strengths: ['Clear opening.'], missingPoints: ['Explain a tradeoff.'], improvements: ['Add a concrete example and explain one tradeoff.'], exampleAnswer: 'A conceptual explanation with a worked example.', evidence: q.type === 'Project-Based' ? [{ projectIndex: 0, quote: 'Built a Node.js service.' }] : [] }); }
function repository(initial = []) {
  const rows = structuredClone(initial), queries = [];
  const read = (row, key) => key.split('.').reduce((value, part) => value?.[part], row);
  const matches = (row, q) => Object.entries(q).every(([key, value]) => value && typeof value === 'object' && Object.hasOwn(value, '$lte') ? read(row, key) <= value.$lte : String(read(row, key)) === String(value));
  const copy = value => value ? structuredClone(value) : null;
  function query(value) { const p = Promise.resolve(copy(value)); p.select = () => p; return p; }
  function set(row, path, value) { const parts = path.split('.'), last = parts.pop(); let target = row; for (const part of parts) target = target[part]; target[last] = structuredClone(value); }
  return { rows, queries,
    findOne(q) { queries.push(q); return query(rows.find(row => matches(row, q))); },
    find(q) { queries.push(q); const chain = { sort() { return chain; }, async limit(n) { return rows.filter(row => matches(row, q)).slice(0, n).map(copy); } }; return chain; },
    async create(value) { if (rows.some(row => row.userId === value.userId && row.requestId === value.requestId)) throw Object.assign(Error('duplicate'), { code: 11000 }); const row = { _id: String(rows.length + 10).padStart(24, '0'), createdAt: new Date(), ...structuredClone(value) }; rows.push(row); return copy(row); },
    findOneAndUpdate(q, update) { queries.push(q); const row = rows.find(r => matches(r, q)); if (!row) return query(null);
      for (const [key, value] of Object.entries(update.$set || {})) set(row, key, value);
      for (const key of Object.keys(update.$unset || {})) delete row[key];
      for (const [key, value] of Object.entries(update.$inc || {})) set(row, key, (read(row, key) || 0) + value);
      return query(row);
    },
  };
}
const config = (extra = {}) => ({ requestId: 'creation-request-0001', resumeId, jobId, type: 'Mixed', difficulty: 'Intermediate', count: 3, ...extra });
function fixture(extra = {}) {
  const sessions = repository(), resumes = repository([{ _id: resumeId, userId: alice, originalName: 'v1.pdf' }]);
  const profiles = repository([{ resumeId, userId: alice, status: 'ready', revision: 4, data: profile }]), jobs = repository([{ _id: jobId, userId: alice, data: job }]);
  let generates = 0, evaluates = 0;
  const deps = { sessions, resumes, profiles, jobs, generate: async (ctx, conf) => { generates++; return questions(ctx, conf); }, evaluate: async (ctx, conf, q) => { evaluates++; return evaluation(q); }, ...extra };
  return { sessions, resumes, profiles, jobs, deps, service: createInterviewService(deps), generates: () => generates, evaluates: () => evaluates };
}
test('generation supports all types, optional jobs, difficulty/count and excludes contact details', async () => {
  for (const type of ['Technical', 'HR', 'Project-Based', 'Mixed']) {
    const f = fixture(); const { session } = await f.service.create(alice, config({ type, jobId: null }));
    assert.equal(session.status, 'active'); assert.equal(session.questions.length, 1); assert.equal(session.profileRevision, 4);
    assert.equal(f.sessions.rows[0].questions.length, 3); assert.equal(f.sessions.rows[0].config.difficulty, 'Intermediate');
    assert.equal(JSON.stringify(f.sessions.rows[0].context).includes('private@example'), false);
    assert.equal(session.context, undefined); assert.equal(session.leaseToken, undefined); assert.equal(session.questions[0].evaluation, undefined);
  }
});
test('same creation request is idempotent; different settings cannot reuse its key', async () => {
  const f = fixture(), first = await f.service.create(alice, config());
  assert.equal((await f.service.create(alice, config())).session._id, first.session._id); assert.equal(f.generates(), 1);
  await assert.rejects(() => f.service.create(alice, config({ difficulty: 'Advanced' })), e => e.status === 409);
});
test('sequential answers persist, resume after service recreation and produce accurate completed reports', async () => {
  const f = fixture(), created = await f.service.create(alice, config()); const sessionId = created.session._id;
  let result = await f.service.submit(alice, sessionId, { questionIndex: 0, answer: 'A clear technical answer.' });
  assert.equal(result.session.currentIndex, 1); assert.equal(result.session.report.overallScore, null); assert.equal(result.session.report.provisionalScore, 60);
  const fresh = createInterviewService(f.deps); assert.equal((await fresh.get(alice, sessionId)).questions[0].answer, 'A clear technical answer.');
  f.profiles.rows[0].data.projects[0].description = 'Later edit';
  await fresh.submit(alice, sessionId, { questionIndex: 1, answer: 'A real teamwork example.' });
  result = await fresh.submit(alice, sessionId, { questionIndex: 2, answer: 'My actual project contribution.' });
  assert.equal(result.session.status, 'completed'); assert.equal(result.session.report.overallScore, 60); assert.equal(result.session.report.evaluatedCount, 3);
  assert.equal(result.session.questions.length, 3); assert.ok(result.session.completedAt);
  assert.ok(result.session.questions[2].evaluation.exampleAnswer.includes('Built a Node.js service.')); assert.equal(result.session.questions[2].evaluation.exampleAnswer.includes('Later edit'), false);
  assert.ok(result.session.report.weakTopics.some(t => t.topic === 'Node.js')); assert.ok(result.session.report.revisionPlan.length);
});
test('ownership protects resume, profile, job, session, history, retry and submission', async () => {
  const f = fixture(), created = await f.service.create(alice, config()), sessionId = created.session._id;
  for (const work of [() => f.service.create(bob, config()), () => f.service.get(bob, sessionId), () => f.service.submit(bob, sessionId, { questionIndex: 0, answer: 'answer' }), () => f.service.retryGeneration(bob, sessionId, {})]) await assert.rejects(work, e => e.status === 404);
  assert.equal((await f.service.list(bob)).length, 0);
  f.jobs.rows[0].userId = bob; await assert.rejects(() => f.service.create(alice, config({ requestId: 'different-request-0002' })), e => e.status === 404);
  for (const repo of [f.sessions, f.resumes, f.profiles, f.jobs]) for (const query of repo.queries) assert.ok(query.userId);
});
test('invalid configuration, missing projects/profile, answer injection, future questions and empty answers are rejected', async () => {
  const f = fixture();
  for (const invalid of [config({ count: 0 }), config({ count: 11 }), config({ count: 1 }), config({ difficulty: 'Impossible' }), config({ userId: bob }), config({ resumeId: { $ne: '' } })]) await assert.rejects(() => f.service.create(alice, invalid), e => e.status === 400);
  const { session } = await f.service.create(alice, config());
  for (const invalid of [{ questionIndex: 0, answer: '' }, { questionIndex: 0, answer: 'a', score: 100 }, { questionIndex: 0, answer: 'x'.repeat(10001) }]) await assert.rejects(() => f.service.submit(alice, session._id, invalid), e => e.status === 400);
  await assert.rejects(() => f.service.submit(alice, session._id, { questionIndex: 2, answer: 'skip' }), e => e.status === 409);
  f.profiles.rows[0].data.projects = [];
  await assert.rejects(() => f.service.create(alice, config({ type: 'Project-Based', requestId: 'different-request-0002' })), e => e.status === 422);
  f.profiles.rows[0].status = 'failed'; await assert.rejects(() => f.service.create(alice, config({ requestId: 'different-request-0003' })), e => e.status === 409);
});
test('concurrent creation and submissions invoke AI once; evaluated-answer replays are idempotent', async () => {
  let release, entered; const started = new Promise(resolve => { entered = resolve; }); let calls = 0;
  const f = fixture({ generate: async (ctx, conf) => { calls++; entered(); await new Promise(resolve => { release = resolve; }); return questions(ctx, conf); } });
  const first = f.service.create(alice, config()); await started;
  assert.equal((await f.service.create(alice, config())).status, 202); release(); const saved = await first; assert.equal(calls, 1);
  let releaseAnswer, enteredAnswer; const startedAnswer = new Promise(resolve => { enteredAnswer = resolve; }); let evalCalls = 0;
  const service = createInterviewService({ ...f.deps, evaluate: async (ctx, conf, q) => { evalCalls++; enteredAnswer(); await new Promise(resolve => { releaseAnswer = resolve; }); return evaluation(q); } });
  const input = { questionIndex: 0, answer: 'My answer' }, submitting = service.submit(alice, saved.session._id, input); await startedAnswer;
  assert.equal((await service.submit(alice, saved.session._id, input)).status, 202);
  assert.equal((await service.get(alice, saved.session._id)).questions[0].answer, input.answer);
  releaseAnswer(); await submitting; await service.submit(alice, saved.session._id, input); assert.equal(evalCalls, 1);
  await assert.rejects(() => service.submit(alice, saved.session._id, { ...input, answer: 'Changed' }), e => e.status === 409);
});
test('malformed generation and evaluation failures persist and support explicit retries', async () => {
  let failGen = true, failEval = true;
  const f = fixture({ generate: async (ctx, conf) => failGen ? '{}' : questions(ctx, conf), evaluate: async (ctx, conf, q) => failEval ? 'bad JSON' : evaluation(q) });
  let result = await f.service.create(alice, config()); assert.equal(result.status, 502); assert.equal(result.session.status, 'generation_failed');
  failGen = false; result = await f.service.retryGeneration(alice, result.session._id, {}); assert.equal(result.session.status, 'active');
  const input = { questionIndex: 0, answer: 'Saved even when AI fails.' };
  result = await f.service.submit(alice, result.session._id, input); assert.equal(result.status, 502); assert.equal(result.session.questions[0].status, 'evaluation_failed');
  assert.equal(result.session.questions[0].answer, input.answer); assert.equal(result.session.currentIndex, 0);
  failEval = false; result = await createInterviewService(f.deps).submit(alice, result.session._id, input); assert.equal(result.session.currentIndex, 1);
});
test('expired generation/evaluation leases recover while late workers cannot overwrite newer progress', async () => {
  let now = new Date('2026-11-03T00:00:00Z'), release, entered; const started = new Promise(resolve => { entered = resolve; });
  const f = fixture({ clock: () => now, generate: async (ctx, conf) => { entered(); await new Promise(resolve => { release = resolve; }); return questions(ctx, conf); } });
  const old = f.service.create(alice, config()); await started; const sessionId = f.sessions.rows[0]._id;
  now = new Date(now.getTime() + 121000);
  const fresh = createInterviewService({ ...f.deps, generate: async (ctx, conf) => questions(ctx, conf) });
  assert.equal((await fresh.get(alice, sessionId)).canRecover, true);
  assert.equal((await fresh.retryGeneration(alice, sessionId, {})).session.status, 'active'); release(); await assert.rejects(() => old, e => e.status === 409);
  f.sessions.rows[0].questions[0].status = 'evaluating'; f.sessions.rows[0].questions[0].answer = 'Persisted answer'; f.sessions.rows[0].leaseUntil = new Date(now.getTime() - 1); f.sessions.rows[0].leaseToken = 'old-token';
  assert.equal((await fresh.submit(alice, sessionId, { questionIndex: 0, answer: 'Persisted answer' })).session.currentIndex, 1);
});
test('provider timeout is persisted without leaking secrets', async () => {
  const f = fixture({ deadlineMs: 5, generate: () => new Promise(() => {}) });
  const result = await f.service.create(alice, config()); assert.equal(result.status, 504); assert.equal(result.session.failure.code, 'TIMEOUT');
  const g = fixture({ evaluate: async () => { throw Object.assign(Error('private provider secret'), { name: 'GoogleGenerativeAIAbortError' }); } });
  const created = await g.service.create(alice, config()); const failed = await g.service.submit(alice, created.session._id, { questionIndex: 0, answer: 'Saved' });
  assert.equal(failed.status, 504); assert.equal(JSON.stringify(failed).includes('private provider secret'), false);
});
test('cross-service concurrent creation resolves a MongoDB uniqueness race without duplicate generation', async () => {
  const f = fixture(), other = createInterviewService(f.deps);
  const results = await Promise.all([f.service.create(alice, config()), other.create(alice, config())]);
  assert.equal(results[0].session._id, results[1].session._id); assert.equal(f.sessions.rows.length, 1); assert.equal(f.generates(), 1);
});
test('an expired evaluation worker cannot overwrite a newer evaluation or advance progress twice', async () => {
  let now = new Date('2026-11-03T00:00:00Z'), release, entered; const started = new Promise(resolve => { entered = resolve; });
  const f = fixture({ clock: () => now, evaluate: async (ctx, conf, q) => { entered(); await new Promise(resolve => { release = resolve; }); return evaluation(q, 2); } });
  const created = await f.service.create(alice, config()); const input = { questionIndex: 0, answer: 'Saved answer' };
  const old = f.service.submit(alice, created.session._id, input); await started; now = new Date(now.getTime() + 121000);
  const other = createInterviewService({ ...f.deps, evaluate: async (ctx, conf, q) => evaluation(q, 8) });
  const fresh = await other.submit(alice, created.session._id, input); assert.equal(fresh.session.questions[0].evaluation.score, 80);
  release(); await assert.rejects(() => old, e => e.status === 409);
  const saved = await other.get(alice, created.session._id); assert.equal(saved.currentIndex, 1); assert.equal(saved.questions[0].evaluation.score, 80);
});
test('question parser validates count, topic, type, duplicates and grounded project references', () => {
  const conf = { type: 'Mixed', count: 3 }, valid = JSON.parse(questions(context, conf));
  for (const mutate of [v => { v.questions.pop(); }, v => { v.questions[0].topic = 'Invented'; }, v => { v.questions[0].type = 'HR'; }, v => { v.questions[2].projectIndex = 99; }, v => { v.questions[0].solution = 'leak'; }, v => { v.questions[0].prompt = 'Expected answer: do this'; }]) {
    const v = structuredClone(valid); mutate(v); assert.throws(() => parseQuestions(JSON.stringify(v), context, conf), e => e.status === 502);
  }
  const projectQuestions = parseQuestions(questions(context, { type: 'Project-Based', count: 10 }), context, { type: 'Project-Based', count: 10 }); assert.equal(new Set(projectQuestions.map(q => q.prompt)).size, 10);
});
test('evaluation validates bounded criteria, feedback and exact project evidence; examples never invent project accomplishments', () => {
  const q = { type: 'Project-Based', projectIndex: 0 }, raw = JSON.parse(evaluation(q));
  for (const mutate of [v => { v.criteria.correctness = 11; }, v => { v.criteria.clarity = 1.5; }, v => { v.score = 100; }, v => { v.evidence[0].quote = 'Led a million-dollar project'; }, v => { v.evidence = []; }, v => { v.improvements = []; }]) {
    const v = structuredClone(raw); mutate(v); assert.throws(() => parseEvaluation(JSON.stringify(v), context, q), e => e.status === 502);
  }
  raw.exampleAnswer = 'I led 100 developers and improved revenue by 90%.';
  const result = parseEvaluation(JSON.stringify(raw), context, q); assert.equal(result.score, 60); assert.equal(result.exampleAnswer.includes('90%'), false); assert.ok(result.exampleAnswer.includes('Built a Node.js service.'));
});
test('reports average question scores equally and keep incomplete performance explicitly provisional', () => {
  const q = value => ({ topic: 'SQL', type: 'Technical', prompt: 'Explain SQL', status: 'evaluated', evaluation: { criteria: Object.fromEntries(CRITERIA.map(k => [k, value])), score: value * 10, improvements: ['Practice joins.'] } });
  const s = { config: { count: 2 }, status: 'completed', questions: [q(4), q(8)] };
  const r = interviewReport(s); assert.equal(r.overallScore, 60); assert.equal(r.criteria.correctness, 6); assert.equal(r.weakTopics[0].score, 60);
  s.status = 'active'; assert.equal(interviewReport(s).overallScore, null); s.questions = []; assert.equal(interviewReport(s).provisionalScore, null);
});
test('InterviewSession schema enforces strict nested fields and user-scoped idempotency index', async () => {
  assert.ok(Model.schema.indexes().some(([keys, options]) => keys.userId && keys.requestId && options.unique));
  const value = new Model({ userId: alice, requestId: 'test-key', configHash: 'hash', resumeId, profileRevision: 1, context, config: { type: 'Technical', difficulty: 'Intermediate', count: 1 }, status: 'active' });
  await value.validate(); assert.equal(Model.schema.path('context').options.select, false); assert.equal(Model.schema.path('leaseToken').options.select, false);
});
let server, base, originalUser;
before(async () => {
  process.env.JWT_SECRET = 'interview-test-isolated-secret'; const User = require('../models/User'); originalUser = User.findById;
  User.findById = userId => ({ select: async () => ({ _id: userId, sessionVersion: 0 }) });
  server = require('../app').listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { require('../models/User').findById = originalUser; await new Promise(resolve => server.close(resolve)); });
test('interview HTTP routes require authentication and protect every session operation', async t => {
  const f = fixture();
  for (const [model, repo, methods] of [[Model, f.sessions, ['findOne', 'findOneAndUpdate', 'find', 'create']], [require('../models/Resume'), f.resumes, ['findOne']], [require('../models/CandidateProfile'), f.profiles, ['findOne']], [require('../models/JobDescription'), f.jobs, ['findOne']]]) for (const method of methods) t.mock.method(model, method, repo[method].bind(repo));
  const gemini = require('../services/geminiService'); t.mock.method(gemini, 'generateInterview', async (ctx, conf) => questions(ctx, conf)); t.mock.method(gemini, 'evaluateInterviewAnswer', async (ctx, conf, q) => evaluation(q));
  const headers = userId => ({ Authorization: `Bearer ${jwt.sign({ id: userId }, process.env.JWT_SECRET)}`, 'Content-Type': 'application/json' });
  for (const [suffix, method] of [['', 'GET'], ['', 'POST'], ['/000000000000000000000001', 'GET'], ['/000000000000000000000001/answers', 'POST'], ['/000000000000000000000001/retry', 'POST']]) assert.equal((await fetch(base + '/api/interviews' + suffix, { method })).status, 401);
  const response = await fetch(base + '/api/interviews', { method: 'POST', headers: headers(alice), body: JSON.stringify(config({ type: 'Technical', count: 1 })) }); assert.equal(response.status, 200);
  const created = (await response.json()).session;
  for (const [suffix, method, body] of [['', 'GET'], ['/answers', 'POST', { questionIndex: 0, answer: 'Answer' }], ['/retry', 'POST', {}]]) assert.equal((await fetch(`${base}/api/interviews/${created._id}${suffix}`, { method, headers: headers(bob), ...(body ? { body: JSON.stringify(body) } : {}) })).status, 404);
  const answer = await fetch(`${base}/api/interviews/${created._id}/answers`, { method: 'POST', headers: headers(alice), body: JSON.stringify({ questionIndex: 0, answer: 'A technical explanation' }) }); assert.equal(answer.status, 200);
  const final = (await answer.json()).session; assert.equal(final.status, 'completed'); assert.equal(final.report.overallScore, 60);
  const history = await (await fetch(base + '/api/interviews', { headers: headers(alice) })).json(); assert.equal(history.length, 1); assert.equal(history[0].score, 60);
});
test('Gemini interview methods use structured schemas, zero temperature, deadlines and untrusted-data instructions', async t => {
  const { GoogleGenerativeAI } = require('@google/generative-ai'); let calls = 0;
  t.mock.method(GoogleGenerativeAI.prototype, 'getGenerativeModel', settings => {
    assert.equal(settings.generationConfig.responseMimeType, 'application/json'); assert.equal(settings.generationConfig.temperature, 0); assert.ok(settings.generationConfig.responseSchema.required.length); assert.match(settings.systemInstruction, /Never invent/);
    return { async generateContent(prompt, options) { calls++; assert.match(prompt, /UNTRUSTED DATA/); assert.equal(options.timeout, 60000); return { response: { text: () => '{}' } }; } };
  });
  const gemini = require('../services/geminiService'); await gemini.generateInterview(context, { type: 'Mixed', count: 3 }); await gemini.evaluateInterviewAnswer(context, {}, { prompt: 'Question', topic: 'SQL', type: 'Technical', projectIndex: -1 }, 'Answer'); assert.equal(calls, 2);
});
test('disabled and deleted accounts and failed account validation cannot reach interview data', async t => {
  const User = require('../models/User'); const header = { Authorization: `Bearer ${jwt.sign({ id: alice }, process.env.JWT_SECRET)}` };
  let account = null;
  t.mock.method(User, 'findById', () => ({ select: async () => account }));
  for (const state of [null, { disabled: true, sessionVersion: 0 }]) { account = state; assert.equal((await fetch(base + '/api/interviews', { headers: header })).status, 401); }
  t.mock.method(User, 'findById', () => ({ select: async () => { throw Error('private database detail'); } }));
  const response = await fetch(base + '/api/interviews', { headers: header }); assert.equal(response.status, 503); assert.equal((await response.text()).includes('private database detail'), false);
});
