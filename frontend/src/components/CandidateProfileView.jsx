import { ConfirmButton, ScoreBar } from './Feedback';
import { useState } from "react";
import { PROFILE_FIELDS, SKILL_CATEGORIES, entryDraft, draftPayload } from "../lib/profiles";
const label = key => key.replace(/([A-Z])/g, " $1").replace(/^./, char => char.toUpperCase());
function Entry({
  section,
  entry,
  index,
  busy,
  onAction
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => entryDraft(section, entry));
  const title = entry.name || entry.institution || entry.company || entry.title || label(section);
  return <article className="profile-entry">
    <h3>{title}</h3><p>{entry.confirmed ? "Confirmed by you" : "Needs your review"} · {entry.origin === "user" ? "User corrected" : "Extracted from resume"}</p>
    {section === "skills" && <p><strong>{entry.category} · {entry.proficiency}</strong> (estimate)<ScoreBar label={`${entry.name} estimated proficiency`} value={{
        Beginner: 1,
        Intermediate: 2,
        Advanced: 3
      }[entry.proficiency] || 0} max={3} /><br />{entry.proficiencyNote}</p>}
    {editing ? <form className="profile-form" onSubmit={event => {
      event.preventDefault();
      onAction(section, index, "update", draftPayload(section, draft));
    }}>
      {PROFILE_FIELDS[section].map(key => <label key={key}>{label(key)}
        {key === "category" || key === "proficiency" ? <select value={draft[key]} onChange={event => setDraft(previous => ({
          ...previous,
          [key]: event.target.value
        }))}>
          {(key === "category" ? SKILL_CATEGORIES : ["Beginner", "Intermediate", "Advanced"]).map(value => <option key={value}>{value}</option>)}
        </select> : ["description", "details"].includes(key) ? <textarea rows={4} value={draft[key]} onChange={event => setDraft(previous => ({
          ...previous,
          [key]: event.target.value
        }))} /> : <input value={draft[key]} onChange={event => setDraft(previous => ({
          ...previous,
          [key]: event.target.value
        }))} />}
        {["links", "technologies"].includes(key) && <small>Separate values with commas.</small>}
      </label>)}
      <p>Corrections are labelled as user-provided. They do not change your uploaded PDF.</p>
      <div className="actions"><button disabled={busy}>Save correction</button><button type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button></div>
    </form> : <dl>{PROFILE_FIELDS[section].filter(key => !["category", "proficiency"].includes(key)).map(key => <div key={key}><dt>{label(key)}</dt><dd>{Array.isArray(entry[key]) ? entry[key].map(item => typeof item === "string" ? item : item.name).join(", ") || "Not found" : entry[key] || "Not found"}</dd></div>)}</dl>}
    {entry.origin === "user" && <p className="muted">Original evidence is kept for reference and may not support your corrected wording.</p>}
    <details><summary>Supporting resume evidence ({entry.evidence.length})</summary>
      {entry.evidence.length ? entry.evidence.map((item, i) => <blockquote key={i}>{item.quote}<small>Source characters {item.start}–{item.end}</small></blockquote>) : <p>No resume evidence. This is user-provided information or an empty section.</p>}
      {section === "projects" && entry.technologies.map((technology, i) => <div key={i}><strong>{technology.name}</strong>{technology.evidence.map((item, j) => <blockquote key={j}>{item.quote}</blockquote>)}{!technology.evidence.length && <p>User-provided technology; no resume evidence.</p>}</div>)}
    </details>
    {!editing && <div className="actions"><button disabled={busy} onClick={() => setEditing(true)}>Edit</button>
      <button disabled={busy || entry.confirmed} onClick={() => onAction(section, index, "confirm")}>Confirm</button>
      <ConfirmButton disabled={busy} title="Remove this profile entry?" description="This removes the saved profile entry. Your original PDF stays intact." confirmLabel="Remove entry" onConfirm={() => onAction(section, index, "remove")}>Remove</ConfirmButton></div>}
  </article>;
}
export default function CandidateProfileView({
  profile,
  busy = false,
  onAction = () => {}
}) {
  const {
    data,
    score
  } = profile;
  const [sectionView, setSectionView] = useState("all");
  return <>
    <section className="panel"><h2>{score.label}: {score.total}/{score.maximum}</h2><ScoreBar label={score.label} value={score.total} max={score.maximum} /><p>{score.disclaimer}</p>
      <div className="score-grid">{score.factors.map(factor => <details key={factor.name}><summary>{factor.name}: {factor.earned}/{factor.maximum}</summary><ScoreBar label={factor.name} value={factor.earned} max={factor.maximum} /><ul>{factor.checks.map(check => <li key={check.label}>{check.label}: {check.earned}/{check.maximum}{check.recommendation && ` — ${check.recommendation}`}</li>)}</ul></details>)}</div>
      <h3>Strengths</h3>{score.strengths.length ? <ul>{score.strengths.map(item => <li key={item}>{item}</li>)}</ul> : <p>More supported detail would help this profile.</p>}
      <h3>Missing information and improvements</h3>{score.recommendations.length ? <ul>{score.recommendations.map(item => <li key={item}>{item}</li>)}</ul> : <p>All current presentation checks are met. Continue reviewing your evidence and factual accuracy.</p>}
    </section>
    <div className="segmented" role="group" aria-label="Profile sections">{["all", ...Object.keys(PROFILE_FIELDS)].map(key => <button key={key} aria-pressed={sectionView === key} onClick={() => setSectionView(key)}>{label(key)}</button>)}</div>
    {Object.keys(PROFILE_FIELDS).filter(section => sectionView === "all" || sectionView === section).map(section => <section className="panel" key={section}><h2>{section === "personal" ? "Personal information" : label(section)}</h2>
      {section === "skills" && <p>Levels are estimates from resume evidence, not verified abilities. Non-technical skills are included.</p>}
      {(section === "personal" ? [data.personal] : data[section]).map((entry, index) => <Entry key={`${profile.revision}:${index}`} section={section} entry={entry} index={index} busy={busy} onAction={onAction} />)}
      {section !== "personal" && !data[section].length && <p>Nothing extracted in this section. Add missing information to a new resume version and upload it.</p>}
    </section>)}
  </>;
}
