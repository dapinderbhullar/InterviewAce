import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import InterviewReportView, { AnswerFeedback } from '../components/InterviewReportView';
import InterviewQuestionCard from '../components/InterviewQuestionCard';
import api from '../lib/api';
import { createInterviewClient, currentQuestion, interviewBusy, INTERVIEW_TYPES, INTERVIEW_DIFFICULTIES } from '../lib/interviews';
const client = createInterviewClient(api);
function Session({
  sessionId
}) {
  const [session, setSession] = useState(null),
    [draft, setDraft] = useState({
      key: '',
      text: ''
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0),
    [acknowledged, setAcknowledged] = useState(-1);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let timer;
    async function refresh() {
      try {
        const saved = await client.get(sessionId, {
          signal: controller.signal
        });
        if (active) {
          setSession(saved);
          if (interviewBusy(saved) && !saved.canRecover) timer = setTimeout(refresh, 3000);
        }
      } catch (err) {
        if (active && err.code !== 'ERR_CANCELED') setError(err.response?.data?.message || 'Could not load saved interview. Reload to check progress.');
      }
    }
    refresh();
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [sessionId, attempt]);
  const question = session ? currentQuestion(session) : null;
  const questionIndex = question?.index,
    savedAnswer = question?.answer;
  // Submitted answers are restored from the server. Unsubmitted drafts remain in memory.
  const draftKey = `${sessionId}:${questionIndex}`;
  const visibleAnswer = savedAnswer || (draft.key === draftKey ? draft.text : '');
  async function run(action) {
    setBusy(true);
    setError('');
    try {
      setSession(await action());
      setAttempt(n => n + 1);
    } catch (err) {
      if (err.code !== 'ERR_CANCELED') setError(err.response?.data?.message || 'Request failed. Reload the saved session before retrying.');
    } finally {
      setBusy(false);
    }
  }
  if (!session) return <>{error && <p role="alert">{error}</p>}<p role="status">Loading saved interview…</p><button onClick={() => setAttempt(n => n + 1)}>Reload</button></>;
  const working = interviewBusy(session) && !session.canRecover;
  const previous = session.questions.find(q => q.index === session.currentIndex - 1 && q.status === 'evaluated');
  const showFeedback = previous && acknowledged < previous.index && session.status !== 'completed';
  return <>
    <h2>{session.config.type} interview · {session.config.difficulty}</h2><p>{session.resumeName} · profile revision {session.profileRevision}{session.jobTitle && ` · ${session.jobTitle}`}</p>
    <label htmlFor="interview-progress">{session.report.evaluatedCount} of {session.config.count} answers evaluated</label><progress id="interview-progress" max={session.config.count} value={session.report.evaluatedCount} />
    {error && <p role="alert">{error}</p>}{session.failure && <p role="alert">{session.failure.message}</p>}
    <div className="actions"><button disabled={busy} onClick={() => {
        setError('');
        setAttempt(n => n + 1);
      }}>Reload saved progress</button><Link to="/interviews">Interview history and setup</Link></div>
    {session.status === 'generating' && <p role="status">{session.canRecover ? 'Question generation stopped. Recover this saved session.' : 'Generating personalized questions. You may return later; this page checks saved progress automatically.'}</p>}
    {(session.status === 'generation_failed' || session.status === 'generating' && session.canRecover) && <button disabled={busy} onClick={() => run(() => client.retry(sessionId))}>Retry question generation</button>}
    {showFeedback ? <section className="panel"><h3>Feedback for question {previous.index + 1}</h3><p>{previous.prompt}</p><AnswerFeedback evaluation={previous.evaluation} /><button onClick={() => setAcknowledged(previous.index)}>Continue to next question</button></section> : session.status === 'active' && question && <InterviewQuestionCard question={question} total={session.config.count} answer={visibleAnswer} busy={busy} working={working} canRecover={session.canRecover} onAnswer={text => setDraft({
      key: draftKey,
      text
    })} onSubmit={() => run(() => client.submit(sessionId, question.index, visibleAnswer))} />}
    {session.status === 'completed' ? <InterviewReportView session={session} /> : session.report.evaluatedCount > 0 && <details><summary>Review evaluated answers and provisional revision plan</summary><InterviewReportView session={session} /></details>}
  </>;
}
function SetupAndHistory() {
  const navigate = useNavigate();
  const [historyFilter, setHistoryFilter] = useState("all");
  const [resumes, setResumes] = useState([]),
    [jobs, setJobs] = useState([]),
    [history, setHistory] = useState([]);
  const [resumeId, setResumeId] = useState(''),
    [jobId, setJobId] = useState(''),
    [type, setType] = useState('Mixed'),
    [difficulty, setDifficulty] = useState('Intermediate'),
    [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  const request = useRef(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    Promise.all([api.get('/resume', {
      signal: controller.signal
    }), api.get('/jobs', {
      signal: controller.signal
    }), client.list({
      signal: controller.signal
    })]).then(([r, j, h]) => {
      if (active) {
        setResumes(r.data);
        setResumeId(r.data[0]?._id || '');
        setJobs(j.data);
        setHistory(h);
      }
    }).catch(err => {
      if (active && err.code !== 'ERR_CANCELED') setError('Could not load resume versions, jobs and interview history.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);
  async function create(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const settings = {
      resumeId,
      jobId: jobId || null,
      type,
      difficulty,
      count
    };
    const key = JSON.stringify(settings);
    if (request.current?.key !== key) request.current = {
      key,
      requestId: crypto.randomUUID()
    };
    try {
      const saved = await client.create({
        ...settings,
        requestId: request.current.requestId
      });
      navigate(`/interviews/${saved._id}`);
    } catch (err) {
      if (err.code !== 'ERR_CANCELED') setError(err.response?.data?.message || 'Could not create interview. Retry with the same settings or check history for a saved session.');
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <p role="status">Loading interview setup and history…</p>;
  return <>{error && <p role="alert">{error} <button disabled={busy} onClick={() => {
        setLoading(true);
        setError('');
        setAttempt(n => n + 1);
      }}>Reload saved data</button></p>}
    <form className="panel interview-setup" onSubmit={create}><h2>Configure an interview</h2><p><Link to="/profile">Build a ready candidate profile</Link> for your selected resume. Profile and optional job snapshots are sent to Gemini to generate questions and evaluate submitted answers. Contact details are excluded.</p>
      <label>Resume version<select required disabled={busy} value={resumeId} onChange={e => setResumeId(e.target.value)}>{!resumes.length && <option value="">Upload a resume first</option>}{resumes.map(r => <option key={r._id} value={r._id}>{r.originalName || r.fileName} · {r._id.slice(-6)}</option>)}</select></label>
      <label>Optional job description<select disabled={busy} value={jobId} onChange={e => setJobId(e.target.value)}><option value="">No job — use saved profile</option>{jobs.map(j => <option key={j._id} value={j._id}>{j.data.title || 'Untitled job'} · {j.data.company || 'Company unknown'}</option>)}</select></label>
      <label>Interview type<select disabled={busy} value={type} onChange={e => {
          setType(e.target.value);
          if (e.target.value === 'Mixed' && count < 3) setCount(3);
        }}>{INTERVIEW_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
      <label>Difficulty<select disabled={busy} value={difficulty} onChange={e => setDifficulty(e.target.value)}>{INTERVIEW_DIFFICULTIES.map(d => <option key={d}>{d}</option>)}</select></label>
      <label>Number of questions<input disabled={busy} type="number" required min={type === 'Mixed' ? 3 : 1} max="10" value={count} onChange={e => setCount(Number(e.target.value))} /></label>
      <p className="muted">Mixed interviews rotate Technical, HR and Project-Based questions. Profiles without projects use Technical and HR questions. Project-Based interviews require a saved project.</p>
      <button className="primary" disabled={busy || !resumeId}>{busy ? 'Creating saved interview…' : 'Create interview'}</button>
    </form>
    <section className="panel"><h2>Interview history</h2><p>Resume an unfinished session or revisit a completed report. Most recent 100 sessions.</p>
      <div className="segmented" role="group" aria-label="Interview history filter">{["all", "active", "completed"].map(value => <button key={value} aria-pressed={historyFilter === value} onClick={() => setHistoryFilter(value)}>{value === "all" ? "All sessions" : value === "active" ? "In progress" : "Completed"}</button>)}</div>
      {history.length > 0 && !history.some(s => historyFilter === "all" || (historyFilter === "completed" ? s.status === "completed" : s.status !== "completed")) && <p>No sessions in this view.</p>}
      {history.length ? <ul>{history.filter(s => historyFilter === "all" || (historyFilter === "completed" ? s.status === "completed" : s.status !== "completed")).map(s => <li key={s._id}><Link to={`/interviews/${s._id}`}>{s.config.type} · {s.config.difficulty} · {s.resumeName}{s.jobTitle && ` · ${s.jobTitle}`}</Link><p>{s.status} · {s.currentIndex}/{s.config.count} evaluated · {new Date(s.createdAt).toLocaleString()}{s.score !== null && ` · ${s.score}/100`}</p></li>)}</ul> : <p>No interviews yet.</p>}
    </section>
  </>;
}
export default function MockInterview() {
  const {
    sessionId
  } = useParams();
  return <><Navbar /><main className="feature-page" id="workspace" tabIndex={-1}><h1>Mock Interview</h1>{sessionId ? <Session key={sessionId} sessionId={sessionId} /> : <SetupAndHistory />}</main></>;
}
