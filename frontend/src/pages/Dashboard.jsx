import WorkspaceOverview from '../components/WorkspaceOverview';
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import api from "../lib/api";
import { useAuth } from "../context/auth";
const actions = [["analyze", "Analyze Resume", "analysis", "Resume Analysis"], ["ats", "Generate ATS Score", "result", "ATS Feedback"], ["questions", "Generate Questions", "questions", "Interview Questions"]];
export default function Dashboard() {
  const {
    user
  } = useAuth();
  const [resumes, setResumes] = useState([]);
  const [resumeId, setResumeId] = useState("");
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    api.get("/resume").then(({
      data
    }) => {
      if (!active) return;
      setResumes(data);
      const saved = localStorage.getItem("resumeId");
      const selected = data.find(resume => resume._id === saved)?._id || data[0]?._id || "";
      setResumeId(selected);
      if (selected) localStorage.setItem("resumeId", selected);else {
        localStorage.removeItem("resumeId");
        localStorage.removeItem("resumePath");
      }
    }).catch(err => {
      if (active) setError(err.response?.data?.message || "Could not load your resumes.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [attempt]);
  async function generate(endpoint, key) {
    setBusy(endpoint);
    setError("");
    try {
      const {
        data
      } = await api.post(`/gemini/${endpoint}`, {
        resumeId
      });
      setResults(previous => ({
        ...previous,
        [key]: data[key]
      }));
    } catch (err) {
      setError(err.response?.data?.message || "Request failed. Please try again.");
    } finally {
      setBusy("");
    }
  }
  return <><Navbar /><main className="feature-page" id="workspace" tabIndex={-1}><h1>Your preparation, at a glance.</h1>
    <p>Welcome, {user?.name || "User"}. Analyze your resume and practice interview questions.</p>
    <WorkspaceOverview resumes={resumes} loading={loading} /><h2>Resume analysis studio</h2>
    {loading ? <p role="status">Loading resumes...</p> : resumes.length ? <div className="panel">
      <label htmlFor="selected-resume">Your resume</label>
      <select id="selected-resume" value={resumeId} disabled={!!busy} onChange={event => {
          setResumeId(event.target.value);
          localStorage.setItem("resumeId", event.target.value);
          setResults({});
        }}>{resumes.map(resume => <option key={resume._id} value={resume._id}>{resume.originalName || resume.fileName}</option>)}</select>
    </div> : <p><Link to="/resume">Upload a resume</Link> to get started. Earlier unlinked uploads must be uploaded again.</p>}
    <div className="actions">{actions.map(([endpoint, label, key]) => <button key={endpoint} disabled={loading || !resumeId || !!busy} onClick={() => generate(endpoint, key)}>
      {busy === endpoint ? "Generating..." : label}</button>)}</div>
    <p className="muted">ATS feedback is AI guidance, not a verified employer ATS score. Results are not saved yet.</p>
    {error && <div role="alert"><p>{error}</p>{!resumes.length && <button onClick={() => {
          setLoading(true);
          setError("");
          setAttempt(value => value + 1);
        }}>Retry loading resumes</button>}</div>}
    {actions.map(([endpoint,, key, title]) => results[key] && <section className="panel" key={endpoint}>
      <h2>{title}</h2><pre className="ai-result">{results[key]}</pre></section>)}
  </main></>;
}
