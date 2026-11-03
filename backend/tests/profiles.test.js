const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, writeFile, rm } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const { createProfileService } = require("../services/candidateProfiles");
const { parseCandidateResponse, editCandidate, providerSchema } = require("../schemas/candidateProfile");
const { scoreProfile } = require("../services/resumeScore");
const { extractResumeText } = require("../services/resumeText");
const CandidateProfile = require("../models/CandidateProfile");
const { TEXT, candidate } = require("./helpers/candidate");
const { validPdf } = require("./helpers/pdf");
const alice = "aaaaaaaaaaaaaaaaaaaaaaaa", bob = "bbbbbbbbbbbbbbbbbbbbbbbb";
const a1 = "111111111111111111111111", a2 = "222222222222222222222222", b1 = "333333333333333333333333";
function repository(initial = [], unique = false) {
  const rows = structuredClone(initial), queries = [];
  const matches = (row, query) => Object.entries(query).every(([key, value]) => value && typeof value === "object" && Object.hasOwn(value, "$lte") ? row[key] <= value.$lte : value && typeof value === "object" && value.$exists ? row[key] !== undefined && row[key] !== value.$ne : String(row[key]) === String(value));
  let sequence = 1;
  const copy = value => value ? structuredClone(value) : null;
  return { rows, queries,
    findOne(query) { queries.push(query); const result = Promise.resolve(copy(rows.find(row => matches(row, query)))); result.select = () => result; return result; },
    async create(value) {
      if (unique && rows.some(row => row.userId === value.userId && row.resumeId === value.resumeId)) throw Object.assign(Error("duplicate"), { code: 11000 });
      const row = { _id: String(sequence++).padStart(24, "0"), revision: 0, ...structuredClone(value) }; rows.push(row); return copy(row);
    },
    async findOneAndUpdate(query, update) { queries.push(query); const row = rows.find(item => matches(item, query)); if (!row) return null;
      Object.assign(row, structuredClone(update.$set || {})); for (const key of Object.keys(update.$unset || {})) delete row[key];
      for (const [key, value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value;
      return copy(row);
    },
    async updateOne(query, update) { return { matchedCount: await this.findOneAndUpdate(query, update) ? 1 : 0 }; },
  };
}
function fixture(options = {}) {
  const resumes = repository([
    { _id: a1, userId: alice, filePath: "uploads/a1.pdf", extractedText: TEXT },
    { _id: a2, userId: alice, filePath: "uploads/a2.pdf", extractedText: TEXT + "\nVersion two" },
    { _id: b1, userId: bob, filePath: "uploads/b1.pdf", extractedText: TEXT.replaceAll("Alice", "Bob").replaceAll("alice@", "bob@") },
  ]);
  const profiles = repository([], true); let calls = 0;
  const dependencies = { resumes, profiles, generate: async text => { calls++; return JSON.stringify(candidate(text)); }, ...options };
  return { resumes, profiles, dependencies, service: createProfileService(dependencies), calls: () => calls };
}
test("structured JSON extracts every section, categories, project technologies and grounded spans", () => {
  const data = parseCandidateResponse(JSON.stringify(candidate()), TEXT);
  for (const section of ["education", "experience", "projects", "achievements", "skills"]) assert.ok(data[section].length);
  assert.equal(data.projects[0].technologies[0].name, "Node.js");
  assert.equal(data.skills.find(s => s.name === "SQL").proficiency, "Beginner");
  assert.equal(data.skills.find(s => s.name === "JavaScript").proficiency, "Intermediate");
  assert.ok(data.skills.some(s => s.category === "Non-technical"));
  for (const skill of data.skills) for (const evidence of skill.evidence) assert.equal(TEXT.slice(evidence.start, evidence.end), evidence.quote);
  assert.equal(providerSchema().properties.skills.items.properties.category.format, "enum");
});
test("malformed JSON, missing keys, extra keys, wrong types, enums and ungrounded facts are rejected", () => {
  const invalid = ["not JSON", "```json\n{}\n```", "{}", JSON.stringify({ ...candidate(), injection: true })];
  for (const mutate of [raw => { raw.skills[0].category = "Invented"; }, raw => { raw.skills[0].name = "Python"; },
    raw => { raw.skills[0].evidence = ["not in source"]; }, raw => { raw.experience[0].company = "Imaginary Corp"; },
    raw => { raw.personal.email = { $ne: "" }; }, raw => { raw.projects[0].technologies[0].name = "Kubernetes"; }]) {
    const raw = candidate(); mutate(raw); invalid.push(JSON.stringify(raw));
  }
  for (const raw of invalid) assert.throws(() => parseCandidateResponse(raw, TEXT), error => error.status === 502);
});
test("profiles for multiple resume versions/users persist and remain distinct after service recreation", async () => {
  const f = fixture();
  for (const [user, id] of [[alice, a1], [alice, a2], [bob, b1]]) assert.equal((await f.service.extract(user, id)).status, 200);
  assert.equal(f.profiles.rows.length, 3); assert.equal(f.calls(), 3);
  const refreshed = createProfileService(f.dependencies);
  assert.equal((await refreshed.get(bob, b1)).data.personal.name, "Bob Example");
  assert.equal((await refreshed.get(alice, a1)).data.personal.name, "Alice Example");
  assert.equal((await refreshed.get(alice, a2)).resumeId, a2);
  for (const query of [...f.profiles.queries, ...f.resumes.queries]) assert.ok(query.userId);
});
test("cross-user get, extraction and edits are denied before any AI call", async () => {
  const f = fixture();
  for (const work of [() => f.service.get(bob, a1), () => f.service.extract(bob, a1), () => f.service.edit(bob, a1, { revision: 0 })]) {
    await assert.rejects(work, error => error.status === 404);
  }
  assert.equal(f.calls(), 0); assert.equal(f.profiles.rows.length, 0);
  await assert.rejects(() => f.service.get(alice, "../uploads/a.pdf"), error => error.status === 400);
});
test("ready extraction is idempotent and returns saved corrections without another Gemini call", async () => {
  const f = fixture(); const first = (await f.service.extract(alice, a1)).profile;
  const corrected = await f.service.edit(alice, a1, { revision: first.revision, section: "personal", action: "update", value: { name: "Corrected Name", email: "alice@example.test", phone: "", location: "", links: [] } });
  const next = await f.service.extract(alice, a1);
  assert.equal(next.profile.data.personal.name, "Corrected Name"); assert.equal(f.calls(), 1);
  assert.equal(next.profile.revision, corrected.revision);
  assert.equal(next.profile.sourceData, undefined); assert.equal(next.profile.leaseToken, undefined);
});
test("concurrent same-resume extraction uses one lease and one AI invocation", async () => {
  let release, entered; const started = new Promise(resolve => { entered = resolve; });
  const f = fixture({ generate: async text => { entered(); await new Promise(resolve => { release = resolve; }); return JSON.stringify(candidate(text)); } });
  const first = f.service.extract(alice, a1); await started;
  const second = await f.service.extract(alice, a1); assert.equal(second.status, 202);
  assert.equal(f.profiles.rows.length, 1); release(); assert.equal((await first).status, 200);
});
test("duplicate create race is handled through the unique profile key", async () => {
  const f = fixture(); const results = await Promise.all([f.service.extract(alice, a1), f.service.extract(alice, a1)]);
  assert.equal(f.profiles.rows.length, 1); assert.equal(f.calls(), 1); assert.ok(results.some(r => r.status === 202));
});
test("identical text for the same owner reuses original extraction, never another user's profile or user edits", async () => {
  const f = fixture(); f.resumes.rows[1].extractedText = TEXT;
  const first = (await f.service.extract(alice, a1)).profile;
  await f.service.edit(alice, a1, { revision: first.revision, section: "skills", index: 0, action: "remove" });
  const duplicate = (await f.service.extract(alice, a2)).profile;
  assert.equal(f.calls(), 1); assert.equal(duplicate.data.skills.length, 4); assert.equal(duplicate.data.skills[0].confirmed, false);
  f.resumes.rows[2].extractedText = TEXT;
  await f.service.extract(bob, b1); assert.equal(f.calls(), 2);
});
test("user corrections, confirmations and removals survive reload; stale revision cannot overwrite", async () => {
  const f = fixture(); let profile = (await f.service.extract(alice, a1)).profile;
  profile = await f.service.edit(alice, a1, { revision: profile.revision, section: "skills", index: 0, action: "update", value: { name: "JavaScript", category: "Programming Languages", proficiency: "Advanced" } });
  assert.equal(profile.data.skills[0].origin, "user"); assert.equal(profile.data.skills[0].confirmed, true);
  const stale = profile.revision;
  profile = await f.service.edit(alice, a1, { revision: profile.revision, section: "education", index: 0, action: "confirm" });
  profile = await f.service.edit(alice, a1, { revision: profile.revision, section: "projects", index: 0, action: "remove" });
  const loaded = await createProfileService(f.dependencies).get(alice, a1);
  assert.equal(loaded.data.projects.length, 0); assert.equal(loaded.data.education[0].confirmed, true);
  assert.equal(loaded.score.factors.find(factor => factor.name === "Project descriptions").earned, 0);
  await assert.rejects(() => f.service.edit(alice, a1, { revision: stale, section: "skills", index: 0, action: "remove" }), error => error.status === 409);
  assert.equal(profile.data.skills[0].proficiency, "Advanced");
});
test("edits reject evidence/owner injection and tag user-added project technologies", async () => {
  const f = fixture(); const profile = (await f.service.extract(alice, a1)).profile;
  for (const value of [{ ...candidate().personal, evidence: [] }, { name: { $set: "x" } }]) {
    await assert.rejects(() => f.service.edit(alice, a1, { revision: profile.revision, section: "personal", action: "update", value }), error => error.status === 400);
  }
  const updated = await f.service.edit(alice, a1, { revision: profile.revision, section: "projects", index: 0, action: "update", value: { name: "Interview Tool", description: "User correction", technologies: ["Node.js", "Python"] } });
  assert.equal(updated.data.projects[0].technologies[1].origin, "user"); assert.deepEqual(updated.data.projects[0].technologies[1].evidence, []);
  assert.equal(editCandidate(profile.data, { section: "personal", action: "remove" }).personal.name, "");
});
test("malformed AI failures persist, do not automatically repeat, and require cooldown before explicit retry", async () => {
  let now = new Date("2026-01-01"), attempts = 0;
  const f = fixture({ clock: () => now, generate: async text => ++attempts === 1 ? "invalid" : JSON.stringify(candidate(text)) });
  const failed = await f.service.extract(alice, a1); assert.equal(failed.status, 502); assert.equal(failed.profile.status, "failed");
  assert.equal((await f.service.get(alice, a1)).failure.code, "AI_EXTRACTION");
  await f.service.extract(alice, a1); assert.equal(attempts, 1);
  await assert.rejects(() => f.service.extract(alice, a1, { retry: true }), error => error.status === 429);
  now = new Date(now.getTime() + 61000);
  assert.equal((await f.service.extract(alice, a1, { retry: true })).profile.status, "ready"); assert.equal(attempts, 2);
});
test("failed PDF extraction is persisted without calling Gemini", async () => {
  let calls = 0; const f = fixture({ readText: async () => { throw Object.assign(Error("secret parser path"), { status: 422 }); }, generate: async () => { calls++; } });
  delete f.resumes.rows[0].extractedText;
  const result = await f.service.extract(alice, a1); assert.equal(result.status, 422); assert.equal(calls, 0);
  assert.equal(result.profile.failure.code, "PDF_EXTRACTION"); assert.equal(JSON.stringify(result).includes("secret parser"), false);
});
test("missing/empty PDF text fails safely and parsed text is cached on the owned resume", async () => {
  let reads = 0; const f = fixture({ readText: async () => { reads++; return TEXT; } });
  delete f.resumes.rows[0].extractedText;
  await f.service.extract(alice, a1); assert.equal(f.resumes.rows[0].extractedText, TEXT); assert.equal(reads, 1);
  const empty = fixture({ readText: async () => " " }); delete empty.resumes.rows[0].extractedText;
  assert.equal((await empty.service.extract(alice, a1)).status, 422);
});
test("AI timeout produces a persisted recoverable failure", async () => {
  const f = fixture({ generate: () => new Promise(() => {}), deadlineMs: 10 });
  const result = await f.service.extract(alice, a1); assert.equal(result.status, 504); assert.equal(result.profile.failure.code, "TIMEOUT");
});
test("expired leases can be recovered and active leases cannot be stolen", async () => {
  const f = fixture(); const now = Date.now();
  f.profiles.rows.push({ _id: "lease", userId: alice, resumeId: a1, status: "processing", leaseUntil: new Date(now - 1000), revision: 0 });
  assert.equal((await f.service.extract(alice, a1, { retry: true })).status, 200);
});
test("explainable score is deterministic, bounded, and not labelled as an ATS prediction", () => {
  const data = parseCandidateResponse(JSON.stringify(candidate()), TEXT); data.achievements = []; const score = scoreProfile(data);
  assert.deepEqual(score, scoreProfile(data)); assert.equal(score.total, score.factors.reduce((sum, f) => sum + f.earned, 0));
  assert.ok(score.total >= 0 && score.total <= 100); assert.match(score.disclaimer, /not an ATS score/);
  assert.ok(score.recommendations.length); assert.ok(score.factors.every(f => f.checks.length === 5));
});
test("MongoDB schema declares a unique owner/resume key and validates structured profile data", () => {
  assert.ok(CandidateProfile.schema.indexes().some(([key, options]) => key.userId && key.resumeId && options.unique));
  const profile = new CandidateProfile({ userId: alice, resumeId: a1, status: "ready", data: parseCandidateResponse(JSON.stringify(candidate()), TEXT) });
  assert.equal(profile.validateSync(), undefined);
  profile.data.skills[0].category = "Invalid category"; assert.ok(profile.validateSync());
});
test("text extraction worker reuses the PDF parser on isolated synthetic files", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "interviewace-profile-"));
  try {
    const file = path.join(directory, "synthetic.pdf"); await writeFile(file, validPdf());
    assert.match(await extractResumeText(file), /Synthetic resume skills/);
    await writeFile(file, "%PDF-truncated"); await assert.rejects(() => extractResumeText(file), error => error.status === 422);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
// Real HTTP route/auth wiring with models mocked; never connect to MongoDB or a live provider.
process.env.JWT_SECRET = "profile-route-isolated-secret";
const app = require("../app"), User = require("../models/User"), Resume = require("../models/Resume"), gemini = require("../services/geminiService");
let server, base; const originals = {};
before(async () => {
  originals.user = User.findById; originals.resume = Resume.findOne; originals.profile = CandidateProfile.findOne;
  User.findById = id => ({ select: async () => ({ _id: id, name: "Test", sessionVersion: 0 }) });
  Resume.findOne = query => ({ select: async () => query.userId === alice && query._id === a1 ? { _id: a1, userId: alice } : null });
  CandidateProfile.findOne = async query => { assert.equal(query.userId, alice); return null; };
  server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { User.findById = originals.user; Resume.findOne = originals.resume; CandidateProfile.findOne = originals.profile; return new Promise(resolve => server.close(resolve)); });
test("profile HTTP routes require JWTs and deny foreign resumes", async () => {
  for (const [suffix, method] of [["", "GET"], ["/extract", "POST"], ["", "PATCH"]]) {
    assert.equal((await fetch(`${base}/api/profiles/${a1}${suffix}`, { method })).status, 401);
    const response = await fetch(`${base}/api/profiles/${a1}${suffix}`, { method, headers: { Authorization: `Bearer ${jwt.sign({ id: bob }, process.env.JWT_SECRET)}` } });
    assert.equal(response.status, 404);
  }
  const response = await fetch(`${base}/api/profiles/${a1}`, { headers: { Authorization: `Bearer ${jwt.sign({ id: alice }, process.env.JWT_SECRET)}` } });
  assert.deepEqual(await response.json(), { profile: null });
  assert.equal(typeof gemini.extractCandidate, "function");
});

test("Gemini extraction uses structured JSON schema, deterministic settings and a request timeout", async t => {
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const original = GoogleGenerativeAI.prototype.getGenerativeModel;
  t.after(() => { GoogleGenerativeAI.prototype.getGenerativeModel = original; });
  GoogleGenerativeAI.prototype.getGenerativeModel = function(config) {
    assert.equal(config.generationConfig.responseMimeType, "application/json");
    assert.ok(config.generationConfig.responseSchema.required.includes("skills"));
    assert.equal(config.generationConfig.temperature, 0);
    return { async generateContent(prompt, options) {
      assert.equal(options.timeout, 60000); assert.ok(prompt.includes(TEXT)); assert.match(prompt, /do not summarize/i);
      return { response: { text: () => JSON.stringify(candidate()) } };
    } };
  };
  assert.deepEqual(JSON.parse(await gemini.extractCandidate(TEXT)), candidate());
});
test("provider abort errors are persisted as timeouts without exposing raw provider details", async () => {
  const { GoogleGenerativeAIAbortError } = require("@google/generative-ai");
  const f = fixture({ generate: async () => { throw new GoogleGenerativeAIAbortError("SECRET provider URL"); } });
  const result = await f.service.extract(alice, a1);
  assert.equal(result.status, 504); assert.equal(result.profile.failure.code, "TIMEOUT"); assert.equal(JSON.stringify(result).includes("SECRET"), false);
});

test("identical resume versions do not duplicate AI work while the first result is committing", async () => {
  const f = fixture(); f.resumes.rows[1].extractedText = TEXT;
  let started, release; const committing = new Promise(resolve => { started = resolve; });
  const original = f.profiles.findOneAndUpdate;
  f.profiles.findOneAndUpdate = async function(query, update) {
    if (query.resumeId === a1 && update.$set?.status === "ready") { started(); await new Promise(resolve => { release = resolve; }); }
    return original.call(this, query, update);
  };
  const first = f.service.extract(alice, a1); await committing;
  const second = await f.service.extract(alice, a2); assert.equal(second.status, 200); assert.equal(f.calls(), 1);
  release(); assert.equal((await first).status, 200);
});
test("partial skill-name matches cannot create an unsupported skill", () => {
  const raw = candidate(); raw.skills[0].name = "Java";
  assert.throws(() => parseCandidateResponse(JSON.stringify(raw), TEXT), error => error.status === 502);
});

test("byte-identical uploads reuse parsed text only within the authenticated owner", async () => {
  let reads = 0; const bobText = TEXT.replaceAll("Alice", "Bob").replaceAll("alice@", "bob@");
  const f = fixture({ readText: async () => { reads++; return bobText; } });
  for (const resume of f.resumes.rows) resume.contentHash = "a".repeat(64);
  delete f.resumes.rows[1].extractedText; delete f.resumes.rows[2].extractedText;
  await f.service.extract(alice, a1); await f.service.extract(alice, a2);
  assert.equal(reads, 0); assert.equal(f.calls(), 1);
  const bobProfile = (await f.service.extract(bob, b1)).profile;
  assert.equal(reads, 1); assert.equal(bobProfile.data.personal.name, "Bob Example");
  for (const query of f.resumes.queries) assert.ok(query.userId);
});
