const httpError = require('../utils/httpError');
const fields = ['title', 'company', 'responsibilities', 'requiredSkills', 'preferredSkills'];
const providerSchema = {
  type: 'object', required: fields,
  properties: Object.fromEntries(fields.map(key => [key, key === 'title' || key === 'company' ? { type: 'string' } : { type: 'array', items: { type: 'string' } }])),
};
function jobText(value) {
  if (typeof value !== 'string' || value.trim().length < 20 || value.length > 30000 || /[\x00-\x08\x0e-\x1f]/.test(value)) throw httpError(400, 'Provide 20–30,000 characters of job description text');
  return value.trim().replace(/\r\n/g, '\n');
}
function parseJobResponse(raw, text) {
  let data;
  try { if (typeof raw !== 'string' || raw.length > 60000) throw Error(); data = JSON.parse(raw); }
  catch { throw httpError(502, 'Invalid job extraction response'); }
  if (!data || Array.isArray(data) || Object.keys(data).length !== fields.length || fields.some(key => !Object.hasOwn(data, key))) throw httpError(502, 'Invalid job extraction fields');
  const source = text.toLowerCase().replace(/\s+/g, ' ');
  for (const key of fields) {
    const values = key === 'title' || key === 'company' ? [data[key]] : data[key];
    if (!Array.isArray(values) || values.length > 60) throw httpError(502, 'Invalid job extraction list');
    for (const value of values) {
      if (typeof value !== 'string' || value.length > (key === 'responsibilities' ? 1500 : 200) ||
        (value && !new RegExp(`(?:^|[^\\p{L}\\p{N}])${value.toLowerCase().replace(/\s+/g, ' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'u').test(source))) throw httpError(502, 'Job extraction contains unsupported facts');
    }
    if (Array.isArray(data[key])) data[key] = [...new Set(values.map(v => v.trim()).filter(Boolean))];
  }
  const required = new Set(data.requiredSkills.map(s => s.toLowerCase()));
  data.preferredSkills = data.preferredSkills.filter(s => !required.has(s.toLowerCase()));
  return data;
}
module.exports = { providerSchema, parseJobResponse, jobText };
