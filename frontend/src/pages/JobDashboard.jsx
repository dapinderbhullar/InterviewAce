import { notify } from '../lib/notifications';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import MatchReportView from '../components/MatchReportView';
import api from '../lib/api';
import { createJobClient, scoreLabel } from '../lib/jobs';
const client = createJobClient(api);
export default function JobDashboard() {
  const [inputMode, setInputMode] = useState('paste');
  const [jobs, setJobs] = useState([]),
    [resumes, setResumes] = useState([]),
    [reports, setReports] = useState([]);
  const [jobId, setJobId] = useState(''),
    [resumeId, setResumeId] = useState('');
  const [text, setText] = useState(''),
    [file, setFile] = useState(null),
    [report, setReport] = useState(null),
    [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    Promise.all([client.jobs({
      signal: controller.signal
    }), api.get('/resume', {
      signal: controller.signal
    }), client.reports({
      signal: controller.signal
    })]).then(([j, r, saved]) => {
      if (active) {
        setJobs(j);
        setResumes(r.data);
        setReports(saved);
        setJobId(j[0]?._id || '');
        setResumeId(r.data[0]?._id || '');
      }
    }).catch(err => {
      if (active && err.code !== 'ERR_CANCELED') setError('Could not load saved jobs and reports.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);
  useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    let active = true;
    client.job(jobId, {
      signal: controller.signal
    }).then(value => {
      if (active) setJob(value);
    }).catch(err => {
      if (active && err.code !== 'ERR_CANCELED') setError('Could not load job details.');
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [jobId]);
  async function run(action) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err.response?.data?.message || 'Request failed. Retry to recover any saved result.');
    } finally {
      setBusy(false);
    }
  }
  async function save(upload) {
    const saved = upload ? await client.upload(file) : await client.create(text);
    notify("Job description saved.");
    setJobs(previous => [saved, ...previous.filter(j => j._id !== saved._id)]);
    setJobId(saved._id);
    setJob(saved);
  }
  async function match() {
    const saved = await client.match(jobId, resumeId);
    notify("Comparison saved.");
    setReport(saved);
    setReports(previous => [saved, ...previous.filter(r => r._id !== saved._id)]);
  }
  return <><Navbar /><main className="feature-page" id="workspace" tabIndex={-1}><h1>Job compatibility</h1>
    <p>Compare saved resume profiles with job requirements. <Link to="/profile">Build or review your Resume Intelligence Profile</Link> before matching.</p>
    {error && <p role="alert">{error} <button disabled={busy} onClick={() => {
          setError('');
          setLoading(true);
          setAttempt(a => a + 1);
        }}>Reload saved data</button></p>}
    {loading ? <p role="status">Loading jobs and reports…</p> : <>
      <section><h2>Add a job description</h2><p>Job text is sent to Gemini for extraction. Review the extracted facts against the source before using the report.</p>
        <div className="segmented" role="group" aria-label="Job description source"><button aria-pressed={inputMode === "paste"} onClick={() => setInputMode("paste")}>Paste description</button><button aria-pressed={inputMode === "file"} onClick={() => setInputMode("file")}>Upload text file</button></div><div hidden={inputMode !== "paste"}><label htmlFor="job-text">Paste job description (20–30,000 characters)</label><textarea id="job-text" rows="8" placeholder="Paste the role, responsibilities, required skills, and preferred experience…" maxLength={30000} value={text} onChange={e => setText(e.target.value)} />
        <p className="editor-meta">{text.length.toLocaleString()} / 30,000 characters</p><button disabled={busy || text.trim().length < 20} onClick={() => run(() => save(false))}>Extract and save pasted job</button>
        </div><div hidden={inputMode !== "file"}><label htmlFor="job-file">Or upload a UTF-8 .txt file (up to 120 KB, 30,000 characters)</label><input id="job-file" type="file" accept=".txt,text/plain" onChange={e => setFile(e.target.files[0] || null)} />
        <button disabled={busy || !file} onClick={() => run(() => save(true))}>Extract and save uploaded job</button></div>
      </section>
      <section><h2>Compare a resume version</h2>
        <label htmlFor="match-job">Saved job</label><select id="match-job" value={jobId} disabled={busy} onChange={e => {
            setJob(null);
            setJobId(e.target.value);
          }}>{!jobs.length && <option value="">Save a job first</option>}{jobs.map(j => <option key={j._id} value={j._id}>{j.data.title || 'Untitled job'} · {j.data.company || 'Company unknown'} · {j._id.slice(-6)}</option>)}</select>
        <label htmlFor="match-resume">Resume version</label><select id="match-resume" disabled={busy} value={resumeId} onChange={e => setResumeId(e.target.value)}>{!resumes.length && <option value="">Upload a resume first</option>}{resumes.map(r => <option key={r._id} value={r._id}>{r.originalName || r.fileName} · {r._id.slice(-6)}</option>)}</select>
        <button disabled={busy || !jobId || !resumeId} onClick={() => run(match)}>Calculate and save match</button>
        {job && job._id === jobId && <details><summary>Review extracted job requirements and original text</summary><h3>{job.data.title || 'Title unavailable'} · {job.data.company || 'Company unavailable'}</h3><p>Required: {job.data.requiredSkills.join(', ') || 'Not specified'}</p><p>Preferred: {job.data.preferredSkills.join(', ') || 'Not specified'}</p><ul>{job.data.responsibilities.map((r, i) => <li key={i}>{r}</li>)}</ul><pre className="job-source">{job.text}</pre></details>}
      </section>
      {busy && <p role="status">Working… Repeated requests reuse saved jobs and reports.</p>}
      <section><h2>Saved comparisons</h2><p>Reports preserve the profile revision used at calculation time. Run a new match after profile edits. The most recent 100 reports are shown.</p>
        {reports.length ? <div className="match-table"><table><thead><tr><th>Job</th><th>Resume / revision</th><th>Compatibility</th><th>Saved</th><th>Report</th></tr></thead><tbody>{reports.map(r => <tr key={r._id}><td>{r.jobTitle || 'Untitled'} · {r.company}</td><td>{r.resumeName} / {r.profileRevision}</td><td>{scoreLabel(r.result.score)}</td><td>{new Date(r.createdAt).toLocaleString()}</td><td><button disabled={busy} onClick={() => run(async () => setReport(await client.report(r._id)))}>View</button></td></tr>)}</tbody></table></div> : <p>No saved matching reports yet.</p>}
      </section>
      {report && <MatchReportView report={report} />}
    </>}
  </main></>;
}
