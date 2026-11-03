export default function LearningOverview({ data }) {
  const { progress, skills } = data;
  return <>
    <section><h2>Preparation overview</h2>
      <p>{progress.completedTasks} of {progress.totalTasks} tasks completed ({progress.completionPercent}%)</p>
      <progress aria-label="Learning task completion" value={progress.completionPercent} max="100" />
      <p>Recent assessed performance: {progress.assessedScore === null ? 'Not assessed' : `${progress.assessedScore}/100`}</p>
      <p>Completing tasks records effort, not skill mastery. Scores come only from evaluated answers; AI feedback is a practice estimate.</p>
      <h3>Strongest assessed skills</h3><p>{progress.strongest.map(s => `${s.topic}: ${s.score}/100`).join(' · ') || 'Complete assessments to identify strengths.'}</p>
      <h3>Priority gaps and weaknesses</h3><p>{progress.weakest.map(s => s.topic).join(' · ') || 'No gaps identified in available evidence.'}</p>
    </section>
    <section><h2>Skill gap analysis and improvement trends</h2><p>Recent score is the mean of the latest three answers; trend compares with the preceding three. Job evidence and assessment performance are separate.</p>
      <div className="match-table"><table><thead><tr><th>Topic</th><th>Evidence</th><th>Assessed progress</th><th>Trend</th><th>History (oldest first)</th></tr></thead><tbody>{skills.map(s => <tr key={s.key}>
        <td>{s.topic}{s.required && ' · Required'}</td><td>{s.gap ? 'Job evidence gap' : s.listed ? 'Listed in profile' : 'Assessment topic'}<p>{s.reasons.join(' ')}</p>{s.applied.length > 0 && <p>Saved application: {s.applied.join(', ')}</p>}</td>
        <td>{s.score === null ? 'Not assessed' : <><meter aria-label={`${s.topic} assessed score`} value={s.score} min="0" max="100" /> {s.score}/100</>}<p>{s.assessment}</p></td>
        <td>{s.trend === null ? 'Insufficient history' : `${s.trend > 0 ? '+' : ''}${s.trend} points`}{s.declining && <p>Revision recommended</p>}</td>
        <td>{s.scores.map(x => <div key={x.id}>{new Date(x.date).toLocaleDateString()} · {x.source} · {x.score}/100</div>)}</td>
      </tr>)}</tbody></table></div>
    </section>
  </>;
}
