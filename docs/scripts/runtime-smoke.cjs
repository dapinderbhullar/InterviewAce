// Run with Node; pass the installed Playwright module and Chromium executable paths.
// Creates one synthetic account and one sample job through the real UI. Deletes no data.
const { chromium } = require(process.argv[2] || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
async function main() {
  const root = path.resolve(__dirname, '..', 'screenshots');
  for (const folder of ['01-authentication', '02-dashboard', '03-resume-intelligence', '04-job-matching', '05-mock-interviews', '06-adaptive-learning']) fs.mkdirSync(path.join(root, folder), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.argv[3], headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', e => problems.push(e.name));
    page.on('console', m => { if (m.type() === 'error') problems.push('console error'); });
    page.on('response', r => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`); });
    page.on('dialog', d => d.accept());
    const ready = await context.request.get('http://localhost:5000/health/ready');
    if (ready.status() !== 200 || !(await ready.json()).ready) throw Error('Backend is not ready');
    console.log('Backend readiness: HTTP 200, ready=true');
    await page.goto('http://localhost:5173/login');
    await page.getByRole('heading', { name: 'InterviewAce', exact: true }).waitFor();
    await page.screenshot({ path: path.join(root, '01-authentication/login.png'), fullPage: true });
    await page.goto('http://localhost:5173/register');
    await page.getByRole('heading', { name: 'Join InterviewAce' }).waitFor();
    await page.screenshot({ path: path.join(root, '01-authentication/register.png'), fullPage: true });
    const email = `runtime-${crypto.randomUUID()}@example.invalid`;
    const password = crypto.randomBytes(24).toString('hex');
    await page.getByLabel('Name', { exact: true }).fill('Portfolio Candidate');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await page.waitForURL('**/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await page.waitForURL('**/dashboard');
    await page.getByRole('heading', { name: 'InterviewAce Dashboard' }).waitFor();
    await page.getByText('Loading resumes...').waitFor({ state: 'hidden' });
    console.log('Real UI registration, login and authenticated dashboard: passed');
    for (const route of ['resume', 'profile', 'interviews', 'learning', 'jobs']) {
      await page.goto(`http://localhost:5173/${route}`);
      await page.waitForLoadState('networkidle');
      if (!page.url().endsWith('/' + route)) throw Error('Protected route redirected: ' + route);
      console.log('Protected page loaded: /' + route);
    }
    await page.getByLabel('Paste job description', { exact: false }).fill('Frontend Developer\nCompany: Example Studio (synthetic portfolio job)\nRequired skills: JavaScript, React, HTML, CSS.\nPreferred skills: TypeScript, Jest.\nResponsibilities: Build accessible interfaces and write component tests.');
    const extracted = page.waitForResponse(r => r.url().endsWith('/api/jobs') && r.request().method() === 'POST', { timeout: 90000 });
    await page.getByRole('button', { name: 'Extract and save pasted job' }).click();
    const response = await extracted;
    if (response.status() !== 201) throw Error('Real Gemini extraction failed: HTTP ' + response.status());
    await page.getByText('Review extracted job requirements and original text', { exact: true }).click();
    await page.getByText('Working… Repeated requests reuse saved jobs and reports.').waitFor({ state: 'hidden' });
    await page.screenshot({ path: path.join(root, '04-job-matching/job-extraction.png'), fullPage: true });
    await page.reload();
    await page.getByText('Review extracted job requirements and original text', { exact: true }).waitFor();
    console.log('Real Gemini job extraction and persistence after reload: passed');
    console.log('Browser console/page/HTTP errors: ' + JSON.stringify(problems));
    if (problems.length) throw Error('Browser reported errors');
    console.log('Screenshots saved: 3');
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
