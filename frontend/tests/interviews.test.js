import { feedbackModuleUrl } from './jsxLoader.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { createInterviewClient, currentQuestion, interviewBusy, INTERVIEW_TYPES, INTERVIEW_DIFFICULTIES } from '../src/lib/interviews.js';
const require = createRequire(import.meta.url);
const { interviewReport } = require('../../backend/services/interviewReport.js');
const { CRITERIA } = require('../../backend/schemas/interview.js');
async function component(file) {
  const source = await readFile(new URL(`../src/components/${file}.jsx`, import.meta.url), 'utf8');
  const { code } = await transformWithOxc(source, `${file}.jsx`, { jsx: { runtime: 'automatic' } });
  const runnable = code.replaceAll('"./Feedback"', JSON.stringify(await feedbackModuleUrl())).replaceAll('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href));
  return import('data:text/javascript;base64,' + Buffer.from(runnable).toString('base64'));
}
function session(completed = true) {
  const evaluation = { criteria: Object.fromEntries(CRITERIA.map(k => [k, 6])), score: 60, strengths: ['Clear opening'], missingPoints: ['Tradeoffs'], improvements: ['Explain one tradeoff with an example.'], exampleAnswer: 'An improved conceptual answer.', evidence: [{ projectIndex: 0, quote: 'Built a Node.js API.' }] };
  const s = { _id: 'session-1', config: { type: 'Mixed', difficulty: 'Intermediate', count: 2 }, resumeName: 'v2.pdf', profileRevision: 3, status: completed ? 'completed' : 'active', currentIndex: completed ? 2 : 1,
    questions: [{ index: 0, prompt: 'Explain an API tradeoff.', topic: 'Node.js', type: 'Technical', status: 'evaluated', answer: 'My API answer', evaluation }, ...(completed ? [{ index: 1, prompt: 'Explain your project.', topic: 'API', type: 'Project-Based', status: 'evaluated', answer: 'My project answer', evaluation }] : [{ index: 1, prompt: 'Explain your project.', topic: 'API', type: 'Project-Based', status: 'unanswered', answer: '' }])] };
  s.report = interviewReport(s); return s;
}
test('completed report renders accurate mean, criteria, question feedback, grounded evidence and personalized revision plan', async () => {
  const { default: View } = await component('InterviewReportView');
  const html = renderToStaticMarkup(createElement(View, { session: session() }));
  for (const text of ['Performance report', 'Overall practice score: 60/100', '2 of 2 answers evaluated', 'Weak technical and project topics', 'Node.js', 'Personalized revision plan', 'Explain one tradeoff', 'Question-wise feedback', 'My project answer', 'Stronger answer example or structure', 'Built a Node.js API.', 'profile revision', 'not a hiring prediction', 'aria-label="Overall interview performance"']) assert.ok(html.includes(text), text);
});
test('incomplete report labels provisional performance and safely escapes AI feedback and candidate text', async () => {
  const { default: View } = await component('InterviewReportView'); const s = session(false); s.questions[0].answer = '<script>unsafe()</script>'; s.questions[0].evaluation.strengths = ['<img src=x onerror=unsafe()>'];
  const html = renderToStaticMarkup(createElement(View, { session: s }));
  assert.ok(html.includes('Progress report — incomplete session')); assert.ok(html.includes('Provisional practice score: 60/100'));
  assert.equal(html.includes('aria-label="Overall interview performance"'), false); assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('&lt;img')); assert.equal(html.includes('<script>'), false);
});
test('one-question card never reveals evaluation or examples before submission and limits empty/duplicate submissions', async () => {
  const { default: Card } = await component('InterviewQuestionCard');
  const question = { index: 1, type: 'Technical', topic: 'SQL', prompt: 'Explain joins.', status: 'unanswered', answer: '', evaluation: { exampleAnswer: 'SECRET EXPECTED ANSWER' } };
  const html = renderToStaticMarkup(createElement(Card, { question, total: 3, answer: '', busy: false, working: false }));
  assert.ok(html.includes('Question 2 of 3')); assert.ok(html.includes('Explain joins.')); assert.equal(html.includes('SECRET EXPECTED ANSWER'), false); assert.ok(html.includes('<button disabled=""'));
  const pending = renderToStaticMarkup(createElement(Card, { question: { ...question, answer: 'Saved answer', status: 'evaluating' }, total: 3, answer: 'Saved answer', working: true }));
  assert.ok(pending.includes('Evaluating your saved answer')); assert.ok(pending.includes('disabled=""')); assert.ok(pending.includes('Saved answer'));
  const recover = renderToStaticMarkup(createElement(Card, { question: { ...question, answer: 'Saved answer', status: 'evaluating' }, total: 3, answer: 'Saved answer', canRecover: true, working: false }));
  assert.ok(recover.includes('previous evaluation stopped')); assert.ok(recover.includes('Retry evaluation of saved answer')); assert.equal(recover.includes('<button disabled=""'), false);
});
test('session helpers select exactly the current question and identify processing states for polling', () => {
  const s = session(false); assert.equal(currentQuestion(s).index, 1); assert.equal(interviewBusy(s), false);
  s.questions[1].status = 'evaluating'; assert.equal(interviewBusy(s), true);
  assert.equal(interviewBusy({ ...s, questions: [], status: 'generating' }), true); assert.equal(currentQuestion(session()), null);
  assert.deepEqual(INTERVIEW_TYPES, ['Technical', 'HR', 'Project-Based', 'Mixed']); assert.equal(INTERVIEW_DIFFICULTIES.length, 3);
});
test('client persists creation key, current answer and saved progress through a new client instance', async () => {
  const calls = [], saved = session(false), options = { signal: new AbortController().signal };
  const api = { async get(url, opts) { calls.push([url, opts]); return { data: url === '/interviews' ? [saved] : { session: saved } }; }, async post(url, body) { calls.push([url, body]); if (url.endsWith('/answers')) { saved.questions[1].answer = body.answer; saved.questions[1].status = 'evaluation_failed'; } return { data: { session: saved } }; } };
  const config = { requestId: 'unique-request-0001', resumeId: 'resume-v2', jobId: null, type: 'Technical', difficulty: 'Advanced', count: 5 };
  const client = createInterviewClient(api); await client.create(config); assert.deepEqual(calls[0], ['/interviews', config]);
  await client.submit(saved._id, 1, 'Persist my answer'); assert.deepEqual(calls[1], ['/interviews/session-1/answers', { questionIndex: 1, answer: 'Persist my answer' }]);
  const fresh = createInterviewClient(api); assert.equal(currentQuestion(await fresh.get(saved._id, options)).answer, 'Persist my answer'); assert.equal(calls.at(-1)[1], options);
  assert.equal((await fresh.list())[0]._id, saved._id); await fresh.retry(saved._id); assert.deepEqual(calls.at(-1), ['/interviews/session-1/retry', {}]);
});
test('client retains saved session failures for safe retry and propagates auth/ownership/conflict/network errors', async () => {
  const saved = session(false); saved.failure = { code: 'EVALUATION', message: 'Answer saved. Retry evaluation.' };
  const client = createInterviewClient({ async post() { throw { response: { status: 502, data: { session: saved } } }; } });
  assert.equal((await client.submit('session', 1, 'answer')).failure.code, 'EVALUATION');
  for (const status of [401, 404, 409, 429, 500]) {
    const error = { response: { status, data: { message: 'Request failed' } } };
    const broken = createInterviewClient({ async get() { throw error; }, async post() { throw error; } });
    await assert.rejects(() => broken.create({}), e => e === error); await assert.rejects(() => broken.get('foreign'), e => e === error); await assert.rejects(() => broken.submit('id', 0, 'answer'), e => e === error);
  }
});
