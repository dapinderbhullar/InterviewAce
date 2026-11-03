export function AnswerFeedback({ evaluation }) {
  return <div className="interview-feedback"><h4>Practice score: {evaluation.score}/100</h4>
    <dl className="interview-criteria">{Object.entries(evaluation.criteria).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}/10 <meter aria-label={key} min="0" max="10" value={value} /></dd></div>)}</dl>
    {[['Strengths', evaluation.strengths], ['Missing points', evaluation.missingPoints], ['Specific improvements', evaluation.improvements]].map(([label, items]) => <section key={label}><h4>{label}</h4>{items.length ? <ul>{items.map((text, i) => <li key={i}>{text}</li>)}</ul> : <p>None identified by the evaluator.</p>}</section>)}
    <h4>Stronger answer example or structure</h4><p className="ai-result">{evaluation.exampleAnswer}</p>
    {evaluation.evidence.length > 0 && <details><summary>Supporting saved project evidence</summary>{evaluation.evidence.map((e, i) => <blockquote key={i}>{e.quote}</blockquote>)}</details>}
  </div>;
}
export default function InterviewReportView({ session }) {
  const report = session.report;
  return <article className="panel"><h2>{report.completed ? 'Performance report' : 'Progress report — incomplete session'}</h2>
    <p>{session.config.type} · {session.config.difficulty} · {session.resumeName} · profile revision {session.profileRevision}{session.jobTitle && ` · ${session.jobTitle}`}</p>
    <h3>{report.completed ? `Overall practice score: ${report.overallScore}/100` : report.provisionalScore === null ? 'No evaluated answers yet' : `Provisional practice score: ${report.provisionalScore}/100`}</h3>
    <p>{report.evaluatedCount} of {report.totalQuestions} answers evaluated. {report.disclaimer}</p>
    {report.completed && <meter aria-label="Overall interview performance" min="0" max="100" value={report.overallScore} />}
    <h3>Weak technical and project topics</h3>{report.weakTopics.length ? <ul>{report.weakTopics.map(t => <li key={`${t.type}:${t.topic}`}>{t.topic} ({t.type}): {t.score}/100</li>)}</ul> : <p>{report.evaluatedCount ? 'No evaluated technical or project topic scored below 70.' : 'Not enough evaluated answers yet.'}</p>}
    <h3>Improvement areas</h3><p>{report.improvementAreas.join(', ') || 'No criterion average below 7/10 in evaluated answers.'}</p>
    <h3>Personalized revision plan</h3>{report.revisionPlan.length ? <ol>{report.revisionPlan.map(step => <li key={step.step}><strong>{step.topic}</strong>: {step.action}<p className="muted">{step.reason}</p></li>)}</ol> : <p>Submit answers to receive a revision plan.</p>}
    <h3>Question-wise feedback</h3>{session.questions.filter(q => q.status === 'evaluated').map(q => <details key={q.index}><summary>Question {q.index + 1}: {q.topic} · {q.evaluation.score}/100</summary><p>{q.prompt}</p><h4>Your submitted answer</h4><p className="ai-result">{q.answer}</p><AnswerFeedback evaluation={q.evaluation} /></details>)}
  </article>;
}
