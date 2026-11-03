import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { createJobClient, scoreLabel } from '../src/lib/jobs.js';
const require = createRequire(import.meta.url);
const { matchJob } = require('../../backend/services/jobMatching.js');
async function view() {
  const source = await readFile(new URL('../src/components/MatchReportView.jsx', import.meta.url), 'utf8');
  const { code } = await transformWithOxc(source, 'MatchReportView.jsx', { jsx: { runtime: 'automatic' } });
  const runnable = code.replaceAll('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href))
    .replaceAll('"../lib/jobs"', JSON.stringify(new URL('../src/lib/jobs.js', import.meta.url).href));
  return (await import('data:text/javascript;base64,' + Buffer.from(runnable).toString('base64'))).default;
}
test('report renders deterministic factors, accessible charts, required/preferred status, recommendations and limitations', async () => {
  const View = await view();
  const report = { jobTitle: '<script>unsafe</script>', resumeName: 'v2.pdf', profileRevision: 3, algorithmVersion: 1,
    result: matchJob({ skills: [{ name: 'SQL', proficiency: 'Beginner' }], projects: [{ name: 'API', description: 'Node.js API' }] }, { requiredSkills: ['SQL', 'Node.js'], preferredSkills: ['AWS'] }) };
  const html = renderToStaticMarkup(createElement(View, { report }));
  for (const expected of ['Required skills', 'Preferred skills', 'Partially matched', 'missing', 'matched', 'Project relevance', 'Experience relevance', 'Prioritize SQL', 'Highlight project', 'does not guarantee ATS success', 'profile revision', '<meter', 'aria-label', '&lt;script&gt;']) assert.ok(html.includes(expected), expected);
  assert.equal(html.includes('<script>'), false);
});
test('unscorable jobs render missing-information guidance without a misleading overall score', async () => {
  const View = await view(), report = { result: matchJob({}, {}), profileRevision: 1, algorithmVersion: 1 };
  const html = renderToStaticMarkup(createElement(View, { report }));
  assert.ok(html.includes('Not enough requirements to score')); assert.ok(html.includes('Not assessed'));
  assert.equal(html.includes('aria-label="Overall compatibility"'), false);
  assert.equal(scoreLabel(0), '0% compatibility');
});
test('client saves text, uploads files, matches selected versions and revisits persisted reports', async () => {
  const calls = [], saved = { _id: 'saved-report', profileRevision: 2, result: { score: 50 } };
  const api = { async get(url, options) { calls.push([url, options]); return { data: url === '/jobs/reports' ? [saved] : saved }; }, async post(url, body) { calls.push([url, body]); return { data: saved }; } };
  const client = createJobClient(api); await client.create('Job description'); await client.match('job-1', 'resume-v2');
  assert.deepEqual(calls[0], ['/jobs', { text: 'Job description' }]); assert.deepEqual(calls[1], ['/jobs/reports', { jobId: 'job-1', resumeId: 'resume-v2' }]);
  const fresh = createJobClient(api); assert.deepEqual(await fresh.reports(), [saved]); assert.deepEqual(await fresh.report(saved._id), saved);
  await fresh.upload(new Blob(['Job description'], { type: 'text/plain' })); assert.ok(calls.at(-1)[1] instanceof FormData); assert.ok(calls.at(-1)[1].get('file'));
});
test('client propagates ownership, missing-profile and AI errors for dashboard handling', async () => {
  for (const status of [404, 409, 502, 504]) {
    const error = Object.assign(Error('Request failed'), { response: { status, data: { message: 'Retry or choose a ready profile' } } });
    const client = createJobClient({ async post() { throw error; }, async get() { throw error; } });
    await assert.rejects(() => client.match('job', 'resume'), e => e === error);
    await assert.rejects(() => client.create('description'), e => e === error);
    await assert.rejects(() => client.report('id'), e => e === error);
  }
});
