const { shape, parseEvaluation, evaluationSchema } = require('./interview');
const httpError = require('../utils/httpError');
const questionSchema = { type: 'object', required: ['prompt', 'topic', 'kind'], properties: { prompt: { type: 'string' }, topic: { type: 'string' }, kind: { type: 'string' } } };
const KINDS = ['conceptual', 'technical', 'scenario'];
function parseQuestion(raw, task, kind) {
  let value; try { if (typeof raw !== 'string' || raw.length > 10000) throw Error(); value = JSON.parse(raw); } catch { throw httpError(502, 'Invalid practice response'); }
  shape(value, ['prompt', 'topic', 'kind']);
  if (value.topic !== task.topic || value.kind !== kind || typeof value.prompt !== 'string' || !value.prompt.trim() || value.prompt.length > 1800 || /(?:answer|solution)\s*:/i.test(value.prompt)) throw httpError(502, 'Invalid practice question');
  return value.prompt.trim();
}
module.exports = { questionSchema, evaluationSchema, KINDS, parseQuestion, parseEvaluation };
