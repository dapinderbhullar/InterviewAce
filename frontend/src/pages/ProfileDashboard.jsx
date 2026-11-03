import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { createProfileClient } from "../lib/profiles";
import Navbar from "../components/Navbar";
import CandidateProfileView from "../components/CandidateProfileView";
const client = createProfileClient(api);
function ResumeProfile({ resumeId }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const profileStatus = profile?.status;
  useEffect(() => {
    if (!profileStatus || profileStatus === "ready") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [profileStatus]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    client.get(resumeId, { signal: controller.signal }).then(data => { if (active) setProfile(data); })
      .catch(err => { if (active && err.code !== "ERR_CANCELED") setError(err.response?.data?.message || "Could not load profile."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [resumeId, attempt]);
  useEffect(() => {
    if (profile?.status !== "processing") return;
    let active = true;
    const controller = new AbortController();
    const timer = setInterval(() => {
      client.get(resumeId, { signal: controller.signal }).then(data => { if (active) setProfile(data); })
        .catch(err => { if (active && err.code !== "ERR_CANCELED") setError("Could not refresh extraction status. Reload to check."); });
    }, 3000);
    return () => { active = false; clearInterval(timer); controller.abort(); };
  }, [resumeId, profile?.status]);
  async function extract() {
    setBusy(true); setError("");
    try { setProfile(await client.extract(resumeId, !!profile)); }
    catch (err) { if (err.code !== "ERR_CANCELED") setError(err.response?.data?.message || "Extraction failed. Reload to check the saved status."); }
    finally { setBusy(false); }
  }
  async function edit(section, index, action, value) {
    setBusy(true); setError("");
    try { setProfile(await client.edit(resumeId, profile, section, index, action, value)); }
    catch (err) {
      if (err.code !== "ERR_CANCELED") setError(err.response?.data?.message || "Could not save correction.");
      if (err.response?.status === 409) { setLoading(true); setAttempt(previous => previous + 1); }
    } finally { setBusy(false); }
  }
  if (loading) return <p role="status">Loading saved profile...</p>;
  const expired = profile?.status === "processing" && new Date(profile.leaseUntil).getTime() <= now;
  const canRetry = profile?.status === "failed" || expired;
  return <>
    {error && <p role="alert">{error}</p>}
    <div className="actions"><button disabled={busy} onClick={() => { setLoading(true); setError(""); setAttempt(previous => previous + 1); }}>Reload saved profile</button>
      {(!profile || canRetry) && <button disabled={busy || (profile?.retryAfter && new Date(profile.retryAfter).getTime() > now)} onClick={extract}>{busy ? "Extracting..." : profile ? "Retry extraction" : "Build candidate profile"}</button>}</div>
    {busy && <p role="status">Working... Your profile will be saved on the server.</p>}
    {!profile && <p>Build a profile from this resume using Gemini. Resume text will be sent to the AI provider. Existing analysis tools remain available on the dashboard.</p>}
    {profile?.status === "processing" && <p role="status">{expired ? "The previous extraction stopped. You can retry." : "Extraction is in progress. This page checks the saved status automatically."}</p>}
    {profile?.status === "failed" && <p role="alert">{profile.failure.message} Reload after the retry time if the button is disabled.</p>}
    {profile?.status === "ready" && <><p>Saved profile · revision {profile.revision} · generated {new Date(profile.generatedAt).toLocaleString()}</p><CandidateProfileView profile={profile} busy={busy} onAction={edit} /></>}
  </>;
}
export default function ProfileDashboard() {
  const [resumes, setResumes] = useState([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    client.resumes({ signal: controller.signal }).then(data => {
      if (!active) return; setResumes(data);
      const saved = localStorage.getItem("resumeId"); setSelected(data.find(item => item._id === saved)?._id || data[0]?._id || "");
    }).catch(err => { if (active && err.code !== "ERR_CANCELED") setError("Could not load your resumes."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [attempt]);
  return <><Navbar /><main className="feature-page" id="workspace" tabIndex={-1}><h1>Resume Intelligence</h1>
    <p>Each uploaded resume is a separate version with its own saved profile and corrections.</p>
    {error && <p role="alert">{error} <button onClick={() => { setLoading(true); setError(""); setAttempt(value => value + 1); }}>Retry</button></p>}
    {loading ? <p role="status">Loading resume versions...</p> : resumes.length ? <>
      <label htmlFor="profile-resume">Resume version</label><select id="profile-resume" value={selected} onChange={event => { setSelected(event.target.value); localStorage.setItem("resumeId", event.target.value); }}>
        {resumes.map(item => <option key={item._id} value={item._id}>{item.originalName || item.fileName} · {new Date(item.uploadedAt).toLocaleDateString()} · {item._id.slice(-6)}</option>)}
      </select><ResumeProfile key={selected} resumeId={selected} />
    </> : <p><Link to="/resume">Upload your first resume</Link> to build a candidate profile.</p>}
  </main></>;
}
