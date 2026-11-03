import { scoreLabel } from '../lib/jobs';
export default function MatchReportView({ report }) {
  const result = report.result;
  return <article className="match-report">
    <h2>{report.jobTitle || 'Untitled job'} {report.company && `· ${report.company}`}</h2>
    <p>{report.resumeName} · profile revision {report.profileRevision} · scoring version {report.algorithmVersion}</p>
    <h3>{scoreLabel(result.score)}</h3>
    {result.score !== null && <meter aria-label="Overall compatibility" min="0" max="100" value={result.score}>{result.score}%</meter>}
    <h3>How the score was calculated</h3>
    <p>Required skills 60%, preferred skills 15%, project relevance 15%, experience relevance 10%. Categories without job requirements are excluded and weights are normalized.</p>
    {result.factors.map(f => <div className="match-factor" key={f.key}><strong>{f.label}: {f.value === null ? 'Not assessed' : `${Math.round(f.value * 100)}%`}</strong>
      {f.value !== null && <meter aria-label={f.label} min="0" max="100" value={f.value * 100} />}
      <p>{f.points.toFixed(1)} points · effective weight {f.effectiveWeight.toFixed(1)}% · {f.reason}</p></div>)}
    {[['Required skills', result.requiredSkills], ['Preferred skills', result.preferredSkills]].map(([label, skills]) => <section key={label}><h3>{label}</h3>
      {skills.length ? <ul>{skills.map(skill => <li key={skill.name}><strong>{skill.name}</strong> <span className={`match-status ${skill.status}`}>{skill.status === 'partial' ? 'Partially matched' : skill.status}</span><p>{skill.reason}</p>
        {skill.evidence.map((entry, i) => <p key={i}>Evidence: {entry.name} — {entry.description}</p>)}</li>)}</ul> : <p>No explicit requirements extracted for this category.</p>}</section>)}
    {[['Relevant projects', result.relevantProjects], ['Relevant work experience', result.relevantExperience]].map(([label, entries]) => <section key={label}><h3>{label}</h3>
      {entries.length ? <ul>{entries.map(entry => <li key={entry.index}><strong>{entry.name}</strong> {entry.company} · {entry.skills.join(', ')}<p>{entry.description}</p></li>)}</ul> : <p>No explicit skill overlap found in saved details.</p>}</section>)}
    <h3>Personalized recommendations</h3>
    {result.recommendations.length ? <ul>{result.recommendations.map((text, i) => <li key={i}>{text}</li>)}</ul> : <p>Review your resume for truthful, concrete examples aligned with the job responsibilities.</p>}
    <h3>Scope and limitations</h3><ul>{result.limitations.map(text => <li key={text}>{text}</li>)}</ul>
  </article>;
}
