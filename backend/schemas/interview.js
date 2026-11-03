const httpError = require('../utils/httpError');
const TYPES = ['Technical', 'HR', 'Project-Based', 'Mixed'];
const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'];
const CRITERIA = ['correctness', 'technicalDepth', 'clarity', 'relevance', 'completeness'];
const HR_TOPICS = ['Communication', 'Teamwork', 'Conflict resolution', 'Motivation', 'Problem solving'];
const str = { type: 'string' };
const questionSchema = { type: 'object', required: ['questions'], properties: { questions: { type: 'array', items: {
  type: 'object', required: ['prompt', 'topic', 'type', 'projectIndex'], properties: { prompt: str, topic: str, type: str, projectIndex: { type: 'integer' } },
} } } };
const evaluationSchema = { type: 'object', required: ['criteria', 'strengths', 'missingPoints', 'improvements', 'exampleAnswer', 'evidence'], properties: {
  criteria: { type: 'object', required: CRITERIA, properties: Object.fromEntries(CRITERIA.map(key => [key, { type: 'integer' }])) },
  strengths: { type: 'array', items: str }, missingPoints: { type: 'array', items: str }, improvements: { type: 'array', items: str }, exampleAnswer: str,
  evidence: { type: 'array', items: { type: 'object', required: ['projectIndex', 'quote'], properties: { projectIndex: { type: 'integer' }, quote: str } } },
} };
function shape(value, keys, status = 502) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw httpError(status, 'Invalid interview data fields');
}
function string(value, max, allowEmpty = false) { if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) throw httpError(502, 'Invalid interview text'); }
function parse(raw) {
  try { if (typeof raw !== 'string' || raw.length > 80000) throw Error(); return JSON.parse(raw); }
  catch { throw httpError(502, 'Invalid structured interview response'); }
}
function contextFor(data, job) {
  return {
    skills: (data.skills || []).map(s => ({ name: s.name, proficiency: s.proficiency })),
    projects: (data.projects || []).map(p => ({ name: p.name, description: p.description, technologies: (p.technologies || []).map(t => t.name) })),
    experience: (data.experience || []).map(e => ({ company: e.company, role: e.role, description: e.description })),
    job: job ? { title: job.title, company: job.company, requiredSkills: job.requiredSkills, preferredSkills: job.preferredSkills, responsibilities: job.responsibilities } : null,
  };
}
function questionPlan(context, type, count) {
  const kinds = type === 'Mixed' ? context.projects.length ? ['Technical', 'HR', 'Project-Based'] : ['Technical', 'HR'] : [type];
  return Array.from({ length: count }, (_, index) => kinds[index % kinds.length]);
}
function topics(context, type) {
  if (type === 'HR') return HR_TOPICS;
  if (type === 'Project-Based') return context.projects.map(p => p.name);
  const skills = [...context.skills.map(s => s.name), ...(context.job?.requiredSkills || []), ...(context.job?.preferredSkills || [])];
  return [...new Set(skills)].filter(Boolean).length ? [...new Set(skills)].filter(Boolean) : ['General technical fundamentals'];
}
function parseQuestions(raw, context, config) {
  const result = parse(raw); shape(result, ['questions']);
  if (!Array.isArray(result.questions) || result.questions.length !== config.count) throw httpError(502, 'Incorrect question count');
  const plan = questionPlan(context, config.type, config.count), seen = new Set();
  return result.questions.map((q, index) => {
    shape(q, ['prompt', 'topic', 'type', 'projectIndex']); string(q.prompt, 1800); string(q.topic, 250);
    if (/(?:expected|model|sample|correct)\s+answer\s*:|(?:answer|solution)\s*:/i.test(q.prompt)) throw httpError(502, 'Question response included an answer');
    if (q.type !== plan[index] || !topics(context, q.type).includes(q.topic) || !Number.isInteger(q.projectIndex) ||
      (q.type === 'Project-Based' ? q.projectIndex < 0 || q.projectIndex >= context.projects.length || q.topic !== context.projects[q.projectIndex].name : q.projectIndex !== -1)) throw httpError(502, 'Question does not match interview configuration or source');
    // Project questions use a source-grounded prompt, never an AI-invented premise.
    const projectPrompts = [
      'Explain the problem, your own contribution and the design decisions. Distinguish saved evidence from details you are adding now.',
      'Discuss one implementation tradeoff, how you tested it and what you would improve. Use only outcomes you can verify.',
      'Describe a challenge, alternatives you considered and what you learned. Do not invent metrics or responsibilities.',
      'Explain the data flow and identify the component you personally implemented. Clarify any details absent from your saved profile.',
      'Describe how you handled errors and what a failure taught you. State only real events or mark proposed changes as hypothetical.',
      'Explain the testing strategy and one concrete test case. Separate actual tests from tests you would add.',
      'Discuss security and privacy considerations. Identify actual protections and proposed improvements separately.',
      'Explain how you would scale the design, distinguishing the current implementation from hypothetical changes.',
      'Describe how you debugged or would debug a difficult issue. Clearly mark hypothetical steps.',
      'Reflect on maintainability and one verified lesson. What would you change in a future iteration?',
    ];
    const focus = config.type === 'Mixed' ? Math.floor(index / 3) : index;
    const prompt = q.type === 'Project-Based' ? `For your saved project “${context.projects[q.projectIndex].name}”: ${projectPrompts[focus % projectPrompts.length]}` : q.prompt.trim();
    const key = prompt.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) throw httpError(502, 'Duplicate interview questions'); seen.add(key);
    return { prompt, topic: q.topic, type: q.type, projectIndex: q.projectIndex, status: 'unanswered', answer: '' };
  });
}
function projectText(project) { return [project.name, project.description, ...project.technologies].join('\n'); }
function parseEvaluation(raw, context, question) {
  const result = parse(raw); shape(result, ['criteria', 'strengths', 'missingPoints', 'improvements', 'exampleAnswer', 'evidence']); shape(result.criteria, CRITERIA);
  for (const key of CRITERIA) if (!Number.isInteger(result.criteria[key]) || result.criteria[key] < 0 || result.criteria[key] > 10) throw httpError(502, 'Invalid evaluation score');
  for (const key of ['strengths', 'missingPoints', 'improvements']) {
    if (!Array.isArray(result[key]) || result[key].length > 8 || (key === 'improvements' && !result[key].length)) throw httpError(502, 'Invalid evaluation feedback');
    result[key].forEach(value => string(value, 800));
  }
  string(result.exampleAnswer, 5000);
  if (!Array.isArray(result.evidence) || result.evidence.length > 6) throw httpError(502, 'Invalid evaluation evidence');
  for (const evidence of result.evidence) {
    shape(evidence, ['projectIndex', 'quote']); string(evidence.quote, 2000);
    if (!Number.isInteger(evidence.projectIndex) || !context.projects[evidence.projectIndex] || !projectText(context.projects[evidence.projectIndex]).includes(evidence.quote) ||
      (question.type === 'Project-Based' && evidence.projectIndex !== question.projectIndex)) throw httpError(502, 'Evaluation evidence is not in the saved project');
  }
  if (question.type === 'Project-Based') {
    const project = context.projects[question.projectIndex];
    if (!result.evidence.length) throw httpError(502, 'Project evaluation requires saved project evidence');
    // A model-written autobiographical example could fabricate accomplishments. Use a grounded scaffold instead.
    result.exampleAnswer = `Saved project: ${project.name}. Saved description: ${project.description || 'Not provided'}. Saved technologies: ${project.technologies.join(', ') || 'Not provided'}.\nA stronger response structure: [Explain the problem]. My verified contribution was [add only your actual contribution]. I chose [actual approach] because [tradeoff]. I tested it using [actual tests]. The verified outcome was [real outcome, or say it was not measured].`;
  } else if (question.type === 'HR') {
    result.exampleAnswer = 'A stronger response structure: The situation was [a real situation]. My responsibility was [your actual role]. I took [specific actions you actually took] because [reason]. The outcome was [verified result, or state that it was not measured]. I learned [lesson relevant to the question].';
  }
  result.score = Math.round(CRITERIA.reduce((sum, key) => sum + result.criteria[key], 0) * 2);
  return result;
}
module.exports = { TYPES, DIFFICULTIES, CRITERIA, questionSchema, evaluationSchema, shape, contextFor, questionPlan, topics, parseQuestions, parseEvaluation };
