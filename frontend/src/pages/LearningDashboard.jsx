import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import Navbar from '../components/Navbar';
import LearningOverview from '../components/LearningOverview';
import api from '../lib/api';
import { createLearningClient, visibleTasks, attemptBusy } from '../lib/learning';
const client = createLearningClient(api);
export default function LearningDashboard() {
  const [loadingTargets, setLoadingTargets] = useState(true);
  const [resumes, setResumes] = useState([]),
    [jobs, setJobs] = useState([]);
  const [resumeId, setResumeId] = useState(''),
    [jobId, setJobId] = useState('');
  const [data, setData] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [filter, setFilter] = useState('pending'),
    [kind, setKind] = useState('conceptual');
  const [attempt, setAttempt] = useState(null),
    [answer, setAnswer] = useState('');
  const requests = useRef(new Map());
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api.get('/resume', {
      signal: controller.signal
    }), api.get('/jobs', {
      signal: controller.signal
    })]).then(([r, j]) => {
      setResumes(r.data);
      setJobs(j.data);
      setResumeId(r.data[0]?._id || '');
    }).catch(e => {
      if (e.code !== 'ERR_CANCELED') setError('Could not load resume versions and jobs. Reload to retry.');
    }).finally(() => { if (!controller.signal.aborted) setLoadingTargets(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!resumeId) return;
    const controller = new AbortController();
    let active = true;
    async function load() {
      try {
        const value = await client.refresh(resumeId, jobId, {
          signal: controller.signal
        });
        if (active) {
          setData(value);
          setError('');
        }
      } catch (e) {
        if (active && e.code !== 'ERR_CANCELED') setError(e.response?.data?.message || 'Could not refresh recommendations.');
      }
    }
    load();
    window.addEventListener('focus', load);
    return () => {
      active = false;
      controller.abort();
      window.removeEventListener('focus', load);
    };
  }, [resumeId, jobId]);
  async function run(action) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e.response?.data?.message || 'Request failed. Refresh saved progress to recover or retry the same request.');
    } finally {
      setBusy(false);
    }
  }
  function open(a) {
    setAttempt(a);
    setAnswer(a.answer || '');
  }
  function changeTarget(setter, value) {
    setData(null);
    setAttempt(null);
    setAnswer('');
    setter(value);
  }
  async function practice(task) {
    const key = `${task._id}:${kind}`;
    if (!requests.current.has(key)) requests.current.set(key, crypto.randomUUID());
    const a = await client.exercise(task._id, requests.current.get(key), kind);
    open(a);
    requests.current.delete(key);
    setData(await client.get(data.roadmap._id));
  }
  async function submit() {
    const a = await client.submit(attempt._id, attempt.answer || answer);
    open(a);
    setData(await client.refresh(resumeId, jobId));
  }
  return <><Navbar /><main className="feature-page" id="workspace" tabIndex={-1}><h1>Learning Dashboard</h1>
    <p>Turn saved resume evidence, job matches and completed mock interviews into focused preparation.</p>
    {error && <p role="alert">{error}</p>}
    <section><h2>Preparation target</h2>
      <label htmlFor="learning-resume">Resume version</label><select id="learning-resume" value={resumeId} disabled={busy} onChange={e => changeTarget(setResumeId, e.target.value)}><option value="">Select a resume</option>{resumes.map(r => <option key={r._id} value={r._id}>{r.originalName || r.fileName} · {r._id.slice(-6)}</option>)}</select>
      <label htmlFor="learning-job">Target job</label><select id="learning-job" value={jobId} disabled={busy} onChange={e => changeTarget(setJobId, e.target.value)}><option value="">All saved job match reports</option>{jobs.map(j => <option key={j._id} value={j._id}>{j.data.title || 'Untitled job'} · {j.data.company}</option>)}</select>
      <button disabled={busy || !resumeId} onClick={() => run(async () => {
          const value = await client.refresh(resumeId, jobId);
          setData(value);
          if (attempt) {
            const saved = value.attempts.find(a => a._id === attempt._id);
            if (saved) open(saved);
          }
        })}>Refresh recommendations and saved progress</button>
      <p>Refresh incorporates new reports and retains completed tasks and every saved attempt. Recommendations also refresh when this page regains focus. A ready Resume Intelligence Profile is required.</p>
    </section>
    {busy && <p role="status">Saving preparation…</p>}
    {loadingTargets && <p role="status">Loading preparation targets…</p>}
    {!loadingTargets && resumeId && !data && !error && <p role="status">Loading your personalized roadmap…</p>}
    {!loadingTargets && !resumeId && !error && <section><h2>Start with your experience</h2><p>Select a resume above, or upload your first version to build your personalized learning plan.</p><Link className="button-link" to="/resume">Upload resume</Link></section>}
    {data && <><LearningOverview data={data} />
      <section><h2>Personalized learning roadmap</h2>
        <label htmlFor="task-view">Task view</label><select id="task-view" value={filter} onChange={e => setFilter(e.target.value)}><option value="pending">Pending</option><option value="completed">Completed</option><option value="all">All</option></select>
        <label htmlFor="practice-kind">Practice question type</label><select id="practice-kind" value={kind} disabled={busy} onChange={e => setKind(e.target.value)}><option value="conceptual">Conceptual</option><option value="technical">Technical</option><option value="scenario">Scenario-based</option></select>
        {!visibleTasks(data.tasks, filter).length && <p>No tasks in this view.</p>}
        {visibleTasks(data.tasks, filter).map(t => <article key={t._id}><h3>{t.topic} · {t.level}</h3><p>{t.explanation}</p><p>Objective: {t.objective}</p><p>Estimated effort: {t.effortMinutes} minutes · {t.completed ? 'Completed' : 'Pending'}{t.revisionRecommended && ' · Revision recommended'}</p>
          <button disabled={busy} onClick={() => run(async () => setData(await client.complete(t._id, !t.completed)))}>{t.completed ? 'Mark pending' : 'Mark completed'}</button>{' '}
          <button disabled={busy} onClick={() => run(() => practice(t))}>Practice {t.topic}</button>
        </article>)}
      </section>
      {attempt && <section><h2>Practice: {attempt.topic} · {attempt.kind} · {attempt.level}</h2><p>{attempt.prompt || 'Question generation pending. Retry from the task or refresh saved progress.'}</p>
        {attempt.failure && <p role="alert">{attempt.failure}</p>}
        {!attempt.prompt && <button disabled={busy || attemptBusy(attempt)} onClick={() => run(async () => {
            open(await client.exercise(attempt.taskId, attempt.requestId, attempt.kind));
            setData(await client.get(data.roadmap._id));
          })}>Retry saved question generation</button>}
        {attempt.prompt && <><label htmlFor="practice-answer">Your answer</label><textarea id="practice-answer" maxLength={10000} rows="8" value={answer} disabled={busy || !!attempt.answer} onChange={e => setAnswer(e.target.value)} />
          {attempt.status !== 'completed' && <button disabled={busy || attemptBusy(attempt) || !answer.trim()} onClick={() => run(submit)}>{attempt.answer ? 'Retry evaluation of saved answer' : 'Submit answer for feedback'}</button>}</>}
        {attempt.evaluation && <><h3>Feedback · {attempt.evaluation.score}/100</h3><meter aria-label="Practice score" min="0" max="100" value={attempt.evaluation.score} />{[['strengths', 'Strengths'], ['missingPoints', 'Missing points'], ['improvements', 'Improvements']].map(([key, label]) => <div key={key}><h4>{label}</h4><ul>{attempt.evaluation[key].map((x, i) => <li key={i}>{x}</li>)}</ul></div>)}<h4>Example explanation</h4><p>{attempt.evaluation.exampleAnswer}</p><p>Start another exercise from the task to practice again. This answer remains in your history.</p></>}
      </section>}
      <section><h2>Practice history</h2>{!data.attempts.length && <p>No saved exercises yet.</p>}{[...data.attempts].reverse().map(a => <p key={a._id}><button disabled={busy} onClick={() => open(a)}>{a.topic} · {a.kind} · {a.status} · {a.evaluation ? `${a.evaluation.score}/100` : 'Not evaluated'} · {new Date(a.createdAt).toLocaleString()}</button></p>)}</section>
    </>}
  </main></>;
}
