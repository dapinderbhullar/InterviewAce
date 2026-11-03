const httpError = require("../utils/httpError");
const CATEGORIES = ["Programming Languages", "Frameworks", "Databases", "Tools", "Cloud & DevOps", "Technical Concepts", "Non-technical", "Other"];
const LEVELS = ["Beginner", "Intermediate", "Advanced"];
const string = (max = 500) => ({ type: "string", max });
const list = (items, max = 30) => ({ type: "array", items, max });
const object = properties => ({ type: "object", properties });
const enumeration = values => ({ type: "string", enum: values, max: 100 });
const evidence = list(string(1500), 4);
const technology = object({ name: string(100), evidence });
const definitions = {
  personal: object({ name: string(150), email: string(254), phone: string(100), location: string(200), links: list(string(300), 8), evidence }),
  education: list(object({ institution: string(250), qualification: string(250), field: string(200), startDate: string(80), endDate: string(80), details: string(1500), evidence }), 15),
  experience: list(object({ company: string(250), role: string(250), startDate: string(80), endDate: string(80), description: string(2000), evidence }), 20),
  projects: list(object({ name: string(250), description: string(2000), technologies: list(technology, 20), evidence }), 20),
  achievements: list(object({ title: string(300), description: string(1500), evidence }), 20),
  skills: list(object({ name: string(100), category: enumeration(CATEGORIES), proficiency: enumeration(LEVELS), evidence }), 60),
};
const rawSchema = object(definitions);
function providerSchema(node = rawSchema) {
  if (node.type === "object") return { type: "object", properties: Object.fromEntries(Object.entries(node.properties).map(([key, value]) => [key, providerSchema(value)])), required: Object.keys(node.properties) };
  if (node.type === "array") return { type: "array", items: providerSchema(node.items) };
  return node.enum ? { type: "string", format: "enum", enum: node.enum } : { type: "string" };
}
function validateShape(value, schema = rawSchema, path = "profile", status = 502) {
  const fail = () => { throw httpError(status, `Invalid structured data at ${path}`); };
  if (schema.type === "string") {
    if (typeof value !== "string" || value.length > schema.max || (schema.enum && !schema.enum.includes(value))) fail();
    return;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value) || value.length > schema.max) fail();
    value.forEach((item, i) => validateShape(item, schema.items, `${path}[${i}]`, status)); return;
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(schema.properties, key)) ||
      Object.keys(schema.properties).some(key => !Object.hasOwn(value, key))) fail();
  for (const [key, child] of Object.entries(schema.properties)) validateShape(value[key], child, `${path}.${key}`, status);
}
const normalized = value => value.toLowerCase().replace(/\s+/g, " ").trim();
function containsFact(context, fact) {
  const escaped = normalized(fact).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "u").test(context);
}
function anchor(quote, text) {
  if (!quote.trim()) throw httpError(502, "AI returned empty evidence");
  const pattern = quote.trim().split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  const match = new RegExp(pattern, "iu").exec(text);
  if (!match) throw httpError(502, "AI returned evidence not present in the resume");
  return { quote: match[0], start: match.index, end: match.index + match[0].length };
}
function groundEntry(entry, text, section) {
  const result = { ...entry, evidence: entry.evidence.map(quote => anchor(quote, text)), origin: "resume", confirmed: false };
  const context = normalized(result.evidence.map(item => item.quote).join(" "));
  for (const [key, value] of Object.entries(entry)) {
    if (["evidence", "category", "proficiency", "technologies"].includes(key)) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const fact of values) if (fact && !containsFact(context, fact)) throw httpError(502, "AI returned a fact without supporting resume evidence");
  }
  if (section !== "personal" && (!entry.name && !entry.institution && !entry.company && !entry.title)) throw httpError(502, "AI returned an unnamed entry");
  if (section === "projects") result.technologies = entry.technologies.map(item => groundEntry(item, text, "technology"));
  return result;
}
function parseCandidateResponse(response, text) {
  if (typeof response !== "string" || response.length > 120000) throw httpError(502, "Invalid AI response size");
  let raw;
  try { raw = JSON.parse(response); } catch { throw httpError(502, "AI returned malformed JSON"); }
  validateShape(raw);
  const data = {};
  for (const [section, value] of Object.entries(raw)) data[section] = section === "personal" ? groundEntry(value, text, section) : value.map(item => groundEntry(item, text, section));
  // A skill list alone is insufficient evidence of applied proficiency.
  const applied = [...data.projects, ...data.experience].flatMap(item => item.evidence.map(e => normalized(e.quote)));
  const names = new Set();
  data.skills = data.skills.filter(skill => {
    const key = normalized(skill.name); if (names.has(key)) return false; names.add(key); return true;
  }).map(skill => {
    const context = skill.evidence.map(e => normalized(e.quote)).join(" ");
    const used = applied.some(quote => quote.includes(normalized(skill.name)));
    const advanced = /\b(advanced|expert)\b/.test(context);
    const proficiency = !used && !advanced ? "Beginner" : skill.proficiency === "Advanced" && !advanced ? "Intermediate" : skill.proficiency;
    return { ...skill, proficiency, proficiencyNote: advanced ? "Resume-stated level; unverified estimate." : used ? "Estimated from documented application; not an assessment." : "Conservative estimate from a listing; proficiency is not established." };
  });
  return data;
}
function editCandidate(data, input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["revision", "section", "index", "action", "value"].includes(key))) throw httpError(400, "Invalid profile edit");
  const { section, action } = input;
  if (!Object.hasOwn(definitions, section) || !["update", "confirm", "remove"].includes(action)) throw httpError(400, "Invalid section or action");
  const updated = structuredClone(data);
  const isPersonal = section === "personal";
  const index = isPersonal ? null : input.index;
  if (!isPersonal && (!Number.isInteger(index) || index < 0 || index >= updated[section].length)) throw httpError(400, "Invalid entry index");
  const entry = isPersonal ? updated.personal : updated[section][index];
  if (action === "remove") {
    if (isPersonal) updated.personal = { name: "", email: "", phone: "", location: "", links: [], evidence: [], origin: "user", confirmed: true };
    else updated[section].splice(index, 1);
  } else if (action === "confirm") entry.confirmed = true;
  else {
    const schema = isPersonal ? definitions.personal : definitions[section].items;
    const editable = Object.fromEntries(Object.entries(schema.properties).filter(([key]) => key !== "evidence" && key !== "technologies"));
    if (section === "projects") editable.technologies = list(string(100), 20);
    validateShape(input.value, object(editable), "edit", 400);
    Object.assign(entry, input.value, { origin: "user", confirmed: true });
    if (section === "projects") entry.technologies = input.value.technologies.map(name => {
      const previous = data.projects[index].technologies.find(item => normalized(item.name) === normalized(name));
      return previous ? { ...previous, origin: "user", confirmed: true } : { name, evidence: [], origin: "user", confirmed: true };
    });
    if (section === "skills") entry.proficiencyNote = "User-selected level; not independently assessed.";
  }
  return updated;
}
module.exports = { CATEGORIES, LEVELS, definitions, rawSchema, providerSchema, parseCandidateResponse, editCandidate, normalized };
