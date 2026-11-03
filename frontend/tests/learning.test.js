import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { createLearningClient, visibleTasks, attemptBusy } from '../src/lib/learning.js';
const require = createRequire(import.meta.url);
const { analyze, plan, progress } = require('../../backend/services/learningAnalysis');
test('learning client preserves request keys, target versions, answer retries and completion status', async () => {
  const calls = [], data = { tasks: [], attempts: [] }, attempt = { _id: 'a', answer: 'Saved', status: 'failed' };
  const api = Object.fromEntries(['post', 'patch', 'get'].map(method => [method, async (...args) => { calls.push([method, ...args]); return { data: args[0].includes('exercises') || args[0].includes('/answer') ? { attempt } : data }; }]));
  const client = createLearningClient(api), options = { signal: new AbortController().signal };
  assert.equal(await client.refresh('v2', '', options), data); assert.deepEqual(calls.at(-1), ['post', '/learning', { resumeId: 'v2', jobId: null }, options]);
  await client.complete('task', true); assert.deepEqual(calls.at(-1), ['patch', '/learning/tasks/task', { completed: true }]);
  assert.equal(await client.exercise('task', 'stable-key', 'scenario'), attempt);
  assert.deepEqual(calls.at(-1), ['post', '/learning/tasks/task/exercises', { requestId: 'stable-key', kind: 'scenario' }]);
  assert.equal(await client.submit('a', 'Saved'), attempt); assert.deepEqual(calls.at(-1), ['post', '/learning/attempts/a/answer', { answer: 'Saved' }]);
  await createLearningClient(api).get('roadmap', options); assert.deepEqual(calls.at(-1), ['get', '/learning/roadmap', options]);
});
test('client propagates authentication, ownership, concurrency and provider failures for recovery', async () => {
  for (const status of [401, 404, 409, 502, 504]) {
    const error = { response: { status, data: { message: 'Saved work can be retried' } } };
    const client = createLearningClient({ async post() { throw error; }, async get() { throw error; }, async patch() { throw error; } });
    for (const action of [() => client.refresh('r', 'j'), () => client.get('r'), () => client.complete('t', true), () => client.exercise('t', 'key', 'technical'), () => client.submit('a', 'answer')]) await assert.rejects(action, e => e === error);
  }
});
test('pending/completed filters retain completed retired tasks and hide inactive pending recommendations', () => {
  const tasks = [{ active: true, completed: false }, { active: false, completed: true }, { active: false, completed: false }];
  assert.deepEqual(visibleTasks(tasks, 'pending'), [tasks[0]]); assert.deepEqual(visibleTasks(tasks, 'completed'), [tasks[1]]); assert.equal(visibleTasks(tasks, 'all').length, 2);
  assert.equal(attemptBusy({ status: 'evaluating', leaseUntil: new Date(Date.now() + 10000) }), true);
  assert.equal(attemptBusy({ status: 'evaluating', leaseUntil: new Date(0) }), false);
});
test('overview renders evidence gaps, deterministic progress, charts and assessment history without invented mastery', async () => {
  const source = await readFile(new URL('../src/components/LearningOverview.jsx', import.meta.url), 'utf8');
  const { code } = await transformWithOxc(source, 'LearningOverview.jsx', { jsx: { runtime: 'automatic' } });
  const runnable = code.replaceAll('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href));
  const { default: View } = await import('data:text/javascript;base64,' + Buffer.from(runnable).toString('base64'));
  const attempts = [90, 90, 90, 40, 50, 60].map((score, i) => ({ _id: String(i), topic: '<SQL>', status: 'completed', evaluation: { score }, evaluatedAt: new Date(2026, 0, i + 1) }));
  const skills = analyze({ skills: [], projects: [], experience: [] }, { requiredSkills: ['<SQL>'], preferredSkills: [] }, [], [], attempts);
  const tasks = plan(skills).map(t => ({ ...t, completed: true }));
  const html = renderToStaticMarkup(createElement(View, { data: { skills, progress: progress(tasks, skills) } }));
  for (const text of ['3 of 3 tasks completed (100%)', '50/100', '-40 points', 'Revision recommended', 'not skill mastery', 'Job evidence gap', 'Required', '90/100', 'aria-label="Learning task completion"', '&lt;SQL&gt;']) assert.ok(html.includes(text), text);
  assert.equal(html.includes('<SQL>'), false); assert.equal(skills[0].assessment, 'Developing');
});
