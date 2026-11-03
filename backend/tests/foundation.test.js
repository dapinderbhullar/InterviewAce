const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
process.env.JWT_SECRET = "test-only-secret-not-for-production";
const app = require("../app");
const Note = require("../models/Note");
const User = require("../models/User");
const Resume = require("../models/Resume");
const services = require("../services/geminiService");
const { resolveUpload } = require("../config/storage");
const rateLimit = require("../middleware/rateLimit");
const { validPdf } = require("./helpers/pdf");
const originalFindById = User.findById;
const alice = "aaaaaaaaaaaaaaaaaaaaaaaa";
const bob = "bbbbbbbbbbbbbbbbbbbbbbbb";
const resumeId = "cccccccccccccccccccccccc";
let server, base;
before(async () => {
  User.findById = id => chain({ _id: id, name: "Test User", email: "test@example.com", sessionVersion: 0 });
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { User.findById = originalFindById; return new Promise(resolve => server.close(resolve)); });
function token(id = alice, options = {}) { return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1h", ...options }); }
async function request(path, { method = "GET", body, user = alice, authorization, form } = {}) {
  const headers = {};
  if (authorization !== undefined) headers.Authorization = authorization;
  else if (user) headers.Authorization = `Bearer ${token(user)}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(base + path, { method, headers, body: form || (body === undefined ? undefined : JSON.stringify(body)) });
}
function stub(t, target, key, replacement) { const original = target[key]; target[key] = replacement; t.after(() => { target[key] = original; }); }
function chain(value) {
  return { sort() { return this; }, skip() { return this; }, limit() { return Promise.resolve(value); }, select() { return Promise.resolve(value); } };
}
function uploadForm(content = validPdf(), name = "resume.pdf", type = "application/pdf") {
  const form = new FormData(); form.append("resume", new Blob([content], { type }), name); return form;
}
test("all sensitive route families reject anonymous callers before accessing data", async () => {
  for (const [path, method] of [["/api/notes", "GET"], ["/api/notes", "POST"], ["/api/notes/" + resumeId, "PUT"],
    ["/api/notes/" + resumeId, "DELETE"], ["/api/resume", "GET"], ["/api/resume/upload", "POST"],
    ["/api/uploads", "POST"], ["/api/gemini/analyze", "POST"], ["/api/gemini/ats", "POST"],
    ["/api/gemini/questions", "POST"], ["/uploads/private.pdf", "GET"]]) {
    assert.equal((await request(path, { method, user: null })).status, 401, path);
  }
});
test("invalid and expired tokens are rejected", async () => {
  for (const authorization of ["Bearer bad", `Bearer ${token(alice, { expiresIn: -1 })}`, `Bearer ${token("invalid-id")}`]) {
    assert.equal((await request("/api/notes", { authorization })).status, 401);
  }
});
test("notes are filtered to the owner and pagination retains the array contract", async t => {
  stub(t, Note, "find", query => { assert.deepEqual(query, { userId: alice }); return chain([{ title: "Alice" }]); });
  const response = await request("/api/notes?page=2");
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), [{ title: "Alice" }]);
});
test("note creation ignores spoofed ownership and unrecognized fields", async t => {
  stub(t, Note, "create", async fields => { assert.deepEqual(fields, { title: "Title", content: "Content", userId: alice }); return fields; });
  const response = await request("/api/notes", { method: "POST", body: { title: " Title ", content: "Content", userId: bob, extra: "ignored" } });
  assert.equal(response.status, 201);
});
test("cross-user note update and delete return 404", async t => {
  stub(t, Note, "findOneAndUpdate", async (query, update) => {
    assert.deepEqual(query, { _id: resumeId, userId: alice });
    assert.deepEqual(update, { $set: { title: "Title", content: "Content" } }); return null;
  });
  stub(t, Note, "findOneAndDelete", async query => { assert.deepEqual(query, { _id: resumeId, userId: alice }); return null; });
  assert.equal((await request(`/api/notes/${resumeId}`, { method: "PUT", body: { title: "Title", content: "Content", userId: bob } })).status, 404);
  assert.equal((await request(`/api/notes/${resumeId}`, { method: "DELETE" })).status, 404);
});
test("note editing/deletion still work for the owner", async t => {
  stub(t, Note, "findOneAndUpdate", async () => ({ _id: resumeId, title: "Updated" }));
  stub(t, Note, "findOneAndDelete", async () => ({ _id: resumeId }));
  assert.equal((await request(`/api/notes/${resumeId}`, { method: "PUT", body: { title: "Updated", content: "Content" } })).status, 200);
  assert.equal((await request(`/api/notes/${resumeId}`, { method: "DELETE" })).status, 200);
});
test("invalid note payloads are rejected", async () => {
  for (const body of [{}, { title: " ", content: "x" }, { title: "x", content: { $ne: "" } }]) {
    assert.equal((await request("/api/notes", { method: "POST", body })).status, 400);
  }
});
test("registration normalizes email, hashes password, and never exposes the hash", async t => {
  stub(t, User, "exists", async query => {
    assert.equal(new RegExp(query.email.$regex, query.email.$options).test("TEST@example.com"), true); return null;
  });
  stub(t, User, "create", async fields => {
    assert.equal(fields.email, "test@example.com");
    assert.equal(await bcrypt.compare("password123", fields.password), true);
    return { ...fields, id: alice };
  });
  const response = await request("/api/auth/register", { method: "POST", body: { name: "Tester", email: " TEST@example.com ", password: "password123" } });
  assert.equal(response.status, 201); const data = await response.json(); assert.equal(data.password, undefined); assert.equal(data.email, "test@example.com");
});
test("duplicate and malformed accounts are rejected", async t => {
  stub(t, User, "exists", async () => ({ _id: alice }));
  assert.equal((await request("/api/auth/register", { method: "POST", body: { name: "Test", email: "test@example.com", password: "password123" } })).status, 409);
  assert.equal((await request("/api/auth/register", { method: "POST", body: { name: "Test", email: { $ne: "" }, password: "x" } })).status, 400);
});
test("login remains compatible with existing short passwords and returns a usable JWT", async t => {
  const password = await bcrypt.hash("old", 4);
  stub(t, User, "findOne", () => chain({ id: alice, name: "Alice", password }));
  const response = await request("/api/auth/login", { method: "POST", body: { email: "alice@example.com", password: "old" } });
  assert.equal(response.status, 200); const data = await response.json();
  assert.equal(data.name, "Alice"); assert.equal(jwt.verify(data.token, process.env.JWT_SECRET).id, alice);
});
test("login failures use the same response for missing user and bad password", async t => {
  stub(t, User, "findOne", () => chain(null));
  const response = await request("/api/auth/login", { method: "POST", body: { email: "no@example.com", password: "wrong" } });
  assert.equal(response.status, 401); assert.equal((await response.json()).message, "Invalid email or password");
});
test("both upload endpoints save owned metadata with opaque names", async t => {
  const saved = [];
  stub(t, Resume, "create", async fields => { saved.push(fields); return { ...fields, id: resumeId }; });
  t.after(async () => { for (const fields of saved) await fs.unlink(resolveUpload(fields.filePath)).catch(() => {}); });
  for (const endpoint of ["/api/resume/upload", "/api/uploads"]) {
    const response = await request(endpoint, { method: "POST", form: uploadForm() });
    assert.equal(response.status, 201, await response.clone().text());
    const data = await response.json(); assert.equal(data.resumeId, resumeId);
    assert.match(data.file, /^[a-f0-9-]{36}\.pdf$/); assert.equal(saved.at(-1).userId, alice);
  }
});
test("missing, spoofed and oversized PDFs are rejected", async () => {
  for (const form of [new FormData(), uploadForm("not pdf"), uploadForm("%PDF-", "bad.txt", "text/plain")]) {
    assert.equal((await request("/api/resume/upload", { method: "POST", form })).status, 400);
  }
  assert.equal((await request("/api/resume/upload", { method: "POST", form: uploadForm("%PDF-" + "x".repeat(5 * 1024 * 1024)) })).status, 413);
});
test("filesystem traversal is rejected and foreign resumes cannot reach AI", async t => {
  for (const value of ["../secret.pdf", "uploads/../secret.pdf", "C:/secret.pdf", "uploads/x.pdf/../../secret.pdf"]) {
    assert.throws(() => resolveUpload(value));
    assert.equal((await request("/api/gemini/analyze", { method: "POST", body: { path: value } })).status, 400);
  }
  stub(t, Resume, "findOne", async query => { assert.equal(query.userId, alice); return null; });
  assert.equal((await request("/api/gemini/analyze", { method: "POST", body: { resumeId } })).status, 404);
  assert.equal((await request("/uploads/foreign.pdf")).status, 404);
});
test("legacy AI endpoints preserve response keys and reuse owned extracted text", async t => {
  let queryCount = 0;
  stub(t, Resume, "findOne", query => {
    assert.equal(query.userId, alice); queryCount++;
    return queryCount % 2 ? Promise.resolve({ _id: resumeId, filePath: "uploads/test.pdf" }) : chain({ extractedText: "Skills: JavaScript" });
  });
  for (const [endpoint, method, key] of [["analyze", "analyzeResume", "analysis"], ["ats", "generateATS", "result"], ["questions", "generateQuestions", "questions"]]) {
    stub(t, services, method, async text => { assert.equal(text, "Skills: JavaScript"); return "Test feedback"; });
    const response = await request(`/api/gemini/${endpoint}`, { method: "POST", body: { resumeId } });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { [key]: "Test feedback" });
  }
});
test("internal error details are not exposed", async t => {
  stub(t, Note, "find", () => { throw new Error("secret database connection string"); });
  const response = await request("/api/notes"); assert.equal(response.status, 500);
  assert.equal(JSON.stringify(await response.json()).includes("secret"), false);
});
test("rate limiter blocks excess requests and sets Retry-After", () => {
  const middleware = rateLimit({ limit: 1 }); let passed = 0; let status;
  const res = { set(key, value) { assert.equal(key, "Retry-After"); assert.ok(Number(value) > 0); },
    status(code) { status = code; return this; }, json() {} };
  middleware({ userId: alice }, res, () => passed++);
  middleware({ userId: alice }, res, () => passed++);
  assert.equal(passed, 1); assert.equal(status, 429);
});
test("health readiness does not report a disconnected database as healthy", async () => {
  assert.equal((await request("/health/ready", { user: null })).status, 503);
  const response = await request("/", { user: null }); assert.equal(await response.text(), "Server Running");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("database uniqueness races produce a safe conflict response", async t => {
  stub(t, User, "exists", async () => null);
  stub(t, User, "create", async fields => {
    assert.equal(fields.emailKey, "race@example.com");
    throw Object.assign(new Error("internal duplicate key details"), { code: 11000 });
  });
  const response = await request("/api/auth/register", { method: "POST", body: { name: "Race", email: "race@example.com", password: "password123" } });
  assert.equal(response.status, 409); assert.deepEqual(await response.json(), { message: "Account already exists" });
});
test("session verification returns public user fields", async t => {
  stub(t, User, "findById", id => { assert.equal(id, alice); return chain({ _id: alice, name: "Alice", email: "alice@example.com" }); });
  const response = await request("/api/auth/me"); assert.equal(response.status, 200);
  assert.equal((await response.json()).name, "Alice");
});
test("resume history queries only the authenticated owner", async t => {
  stub(t, Resume, "find", query => { assert.deepEqual(query, { userId: alice }); return chain([{ _id: resumeId }]); });
  const response = await request("/api/resume"); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{ _id: resumeId }]);
});
test("owned downloads work without exposing the upload directory publicly", async t => {
  const { randomUUID } = require("node:crypto");
  const fileName = `${randomUUID()}.pdf`, filePath = `uploads/${fileName}`;
  await fs.writeFile(resolveUpload(filePath), "%PDF-synthetic-download");
  t.after(() => fs.unlink(resolveUpload(filePath)));
  stub(t, Resume, "findOne", async query => {
    assert.deepEqual(query, { userId: alice, filePath });
    return { filePath, fileName };
  });
  const response = await request(`/uploads/${fileName}`);
  assert.equal(response.status, 200); assert.equal(await response.text(), "%PDF-synthetic-download");
  assert.match(response.headers.get("content-disposition"), /^attachment/);
});
