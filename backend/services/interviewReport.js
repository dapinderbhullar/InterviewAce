const { CRITERIA } = require('../schemas/interview');
function interviewReport(session) {
  const evaluated = session.questions.filter(q => q.status === 'evaluated');
  const count = evaluated.length;
  const average = values => values.length ? Math.round(values.reduce((sum, n) => sum + n, 0) / values.length) : null;
  const byTopic = new Map();
  evaluated.forEach(q => { const key = `${q.type}:${q.topic}`; if (!byTopic.has(key)) byTopic.set(key, { topic: q.topic, type: q.type, scores: [] }); byTopic.get(key).scores.push(q.evaluation.score); });
  const topics = [...byTopic.values()].map(t => ({ topic: t.topic, type: t.type, score: average(t.scores) }));
  const criteria = Object.fromEntries(CRITERIA.map(key => [key, average(evaluated.map(q => q.evaluation.criteria[key]))]));
  const improvementAreas = CRITERIA.filter(key => criteria[key] !== null && criteria[key] < 7);
  const weakTopics = topics.filter(t => t.type !== 'HR' && t.score < 70);
  return {
    completed: session.status === 'completed', evaluatedCount: count, totalQuestions: session.config.count,
    overallScore: session.status === 'completed' ? average(evaluated.map(q => q.evaluation.score)) : null,
    provisionalScore: average(evaluated.map(q => q.evaluation.score)), criteria, topics, weakTopics, improvementAreas,
    revisionPlan: [
      ...weakTopics.map((t, index) => ({ step: index + 1, topic: t.topic, action: `Review ${t.topic} fundamentals, write a worked example and explain the tradeoffs aloud or in writing.`, reason: `Practice score ${t.score}/100; target clearer, correct and complete explanations.` })),
      ...improvementAreas.map(key => ({ step: 0, topic: key, action: `Rework answers to strengthen ${key}. Compare your response with the question feedback and example structure.`, reason: `Average ${key}: ${criteria[key]}/10.` })),
      ...evaluated.filter(q => q.evaluation.improvements.length).map(q => ({ step: 0, topic: q.topic, action: q.evaluation.improvements[0], reason: `Question: ${q.prompt}` })),
    ].map((item, index) => ({ ...item, step: index + 1 })),
    disclaimer: 'AI practice feedback is an estimate, not a hiring prediction or verified assessment. Each criterion contributes equally (20%); overall performance is the mean of all evaluated question scores. HR depth means reasoning and reflection, not technical jargon. Project/HR examples are truthful-answer scaffolds, not claims about your experience.',
  };
}
module.exports = { interviewReport };
