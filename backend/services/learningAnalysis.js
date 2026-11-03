const { normalize, matchJob } = require('./jobMatching');
const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
const mean = xs => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
function analyze(data, job, reports, interviews, attempts) {
  const skills = new Map();
  function get(topic) { const key = normalize(topic); if (!skills.has(key)) skills.set(key, { key, topic, required: false, gap: false, listed: false, scores: [], reasons: [], applied: [] }); return skills.get(key); }
  for (const s of data.skills || []) get(s.name).listed = true;
  // Current evidence is authoritative; historical reports contribute only their latest profile revision per job.
  const sources = job ? [matchJob(data, job)] : [...new Map([...reports].sort((a, b) => a.profileRevision - b.profileRevision).map(r => [String(r.jobId), r])).values()].map(r => r.result);
  for (const report of sources) for (const category of ['requiredSkills', 'preferredSkills']) for (const s of report[category] || []) {
    const skill = get(s.name); skill.required ||= category === 'requiredSkills'; skill.gap ||= s.status !== 'matched';
    if (s.status !== 'matched') skill.reasons.push(`${category === 'requiredSkills' ? 'Required' : 'Optional'} job skill: ${s.status} evidence.`);
  }
  for (const session of interviews) for (const q of session.questions || []) if (q.status === 'evaluated' && q.type !== 'HR' && Number.isFinite(q.evaluation?.score)) get(q.topic).scores.push({ score: q.evaluation.score, date: q.evaluatedAt || session.completedAt, source: 'interview', id: `${session._id}:${session.questions.indexOf(q)}` });
  for (const a of attempts) if (a.status === 'completed') get(a.topic).scores.push({ score: a.evaluation.score, date: a.evaluatedAt, source: 'practice', id: String(a._id) });
  return [...skills.values()].map(s => {
    s.scores.sort((a, b) => new Date(a.date) - new Date(b.date) || a.id.localeCompare(b.id));
    const recent = s.scores.slice(-3), previous = s.scores.slice(-6, -3);
    const score = mean(recent.map(x => x.score)), baseline = mean(previous.map(x => x.score));
    const trend = baseline === null || score === null ? null : score - baseline;
    const recurring = s.scores.filter(x => x.score < 70).length;
    const weak = score !== null && score < 70, declining = trend !== null && trend < -10;
    if (weak) s.reasons.push(`Recent assessed performance: ${score}/100; ${recurring} weak answers.`);
    if (declining) s.reasons.push('Performance declined; revise and reassess.');
    const application = matchJob(data, { requiredSkills: [s.topic], preferredSkills: [] });
    s.applied = [...application.relevantProjects, ...application.relevantExperience].map(entry => entry.name);
    return { ...s, score, trend, recurring, weak, declining, recommended: s.gap || weak || declining,
      priority: (s.required ? 10000 : 0) + (s.gap ? 1000 : 0) + Math.min(recurring, 20) * 20 + (declining ? 200 : 0) + (100 - (score ?? 0)),
      // Task completion cannot establish mastery. Only repeated assessments can show consistent performance.
      assessment: recent.length >= 3 && recent.every(x => x.score >= 80) ? 'Consistent assessed performance' : score === null ? 'Not assessed' : 'Developing' };
  }).sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key));
}
function plan(skills) {
  return skills.filter(s => s.recommended).flatMap(s => LEVELS.map((level, index) => ({
    key: `${s.key}:${level}`, topic: s.topic, level, priority: s.priority - index,
    explanation: [...new Set(s.reasons)].join(' '), revisionRecommended: s.declining,
    objective: [
      `Explain ${s.topic} fundamentals and work through a small example.`,
      `Apply ${s.topic} to a worked problem and explain testing and tradeoffs.${s.applied.length ? ` Reflect on saved evidence from ${s.applied.join(', ')} without inventing contributions.` : ' Use a hypothetical project; do not claim experience you do not have.'}`,
      `Evaluate alternative ${s.topic} designs, edge cases and failure modes; justify your decisions.`,
    ][index], effortMinutes: [30, 60, 90][index], active: true,
  })));
}
function progress(tasks, skills) {
  const active = tasks.filter(t => t.active || t.completed), completed = active.filter(t => t.completed).length;
  return { totalTasks: active.length, completedTasks: completed, completionPercent: active.length ? Math.round(completed / active.length * 100) : 0,
    assessedScore: mean(skills.filter(s => s.score !== null).map(s => s.score)),
    strongest: skills.filter(s => s.score !== null).sort((a, b) => b.score - a.score).slice(0, 5),
    weakest: skills.filter(s => s.recommended).slice(0, 5) };
}
module.exports = { analyze, plan, progress, LEVELS };
