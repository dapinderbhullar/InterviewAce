const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
process.env.JWT_SECRET = "isolated-remediation-test-secret";
const app = require("../app");
const User = require("../models/User");
const Note = require("../models/Note");
const Resume = require("../models/Resume");
const { uploadResume } = require("../controllers/resumeController");
const { validatePdf, createPdfValidator } = require("../services/pdfValidation");
const { validateEnvironment } = require("../config/environment");
const { MAX_PDF_BYTES, PDF_SIZE_MESSAGE } = require("../config/uploadPolicy");
const { validPdf } = require("./helpers/pdf");
const alice = "aaaaaaaaaaaaaaaaaaaaaaaa", bob = "bbbbbbbbbbbbbbbbbbbbbbbb";
const oldFindById = User.findById;
let server, base;
function account(id) { return { _id: id, id, name: "Test", email: "test@example.com", sessionVersion: 0 }; }
function select(value) { return { select: async () => value }; }
function stub(t, object, key, value) { const old = object[key]; object[key] = value; t.after(() => { object[key] = old; }); }
before(async () => {
  User.findById = id => select(account(id));
  server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { User.findById = oldFindById; return new Promise(resolve => server.close(resolve)); });
async function request(path, { method = "GET", body, form, user = alice, sv } = {}) {
  const headers = { Authorization: "Bearer " + jwt.sign({ id: user, ...(sv === undefined ? {} : { sv }) }, process.env.JWT_SECRET, { expiresIn: "1h" }) };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(base + path, { method, headers, body: form || (body === undefined ? undefined : JSON.stringify(body)) });
}
function form(buffer, name = "test.pdf", type = "application/pdf") { const data = new FormData(); data.append("resume", new Blob([buffer], { type }), name); return data; }
function privateRoutes() { return [["/api/auth/me", "GET"], ["/api/notes", "GET"], ["/api/notes", "POST"],
  ["/api/notes/" + bob, "PUT"], ["/api/notes/" + bob, "DELETE"], ["/api/resume", "GET"],
  ["/api/uploads", "POST"], ["/api/resume/upload", "POST"], ["/api/gemini/analyze", "POST"],
  ["/api/gemini/ats", "POST"], ["/api/gemini/questions", "POST"], ["/uploads/owned.pdf", "GET"]]; }
test("deleted and disabled accounts are rejected on every private route", async t => {
  let current;
  stub(t, User, "findById", () => select(current));
  for (const value of [null, { ...account(alice), disabled: true }]) {
    current = value;
    for (const [path, method] of privateRoutes()) assert.equal((await request(path, { method })).status, 401, path);
  }
});
test("account lookup failure fails closed with 503 on every private route", async t => {
  stub(t, User, "findById", () => ({ select: async () => { throw Error("private URI must not escape"); } }));
  for (const [path, method] of privateRoutes()) {
    const response = await request(path, { method }); assert.equal(response.status, 503, path);
    assert.equal((await response.text()).includes("private URI"), false);
  }
});
test("session-version increment revokes old tokens while legacy version zero stays compatible", async t => {
  stub(t, User, "findById", () => select({ ...account(alice), sessionVersion: 1 }));
  for (const [path, method] of privateRoutes()) assert.equal((await request(path, { method, sv: 0 })).status, 401, path);
  assert.equal((await request("/api/auth/me", { sv: 1 })).status, 200);
  User.findById = () => select(account(alice));
  assert.equal((await request("/api/auth/me")).status, 200);
});
test("long ASCII and multibyte legacy passwords retain bcrypt login semantics", async t => {
  let hash;
  stub(t, User, "findOne", () => select({ ...account(alice), password: hash }));
  for (const password of ["a".repeat(73), "\u00e9".repeat(40)]) {
    hash = await bcrypt.hash(password, 4);
    const response = await request("/api/auth/login", { method: "POST", body: { email: "legacy@example.com", password } });
    assert.equal(response.status, 200);
    const data = await response.json(); assert.equal(data.password, undefined);
    assert.equal(jwt.verify(data.token, process.env.JWT_SECRET).sv, 0);
  }
});
test("new passwords reject short and over-72-byte values; 72 bytes remain accepted", async t => {
  stub(t, User, "exists", async () => null);
  stub(t, User, "create", async data => ({ ...data, id: alice }));
  for (const password of ["short", "a".repeat(73), "\u00e9".repeat(37)]) {
    assert.equal((await request("/api/auth/register", { method: "POST", body: { name: "Test", email: "new@example.com", password } })).status, 400);
  }
  assert.equal((await request("/api/auth/register", { method: "POST", body: { name: "Test", email: "new@example.com", password: "a".repeat(72) } })).status, 201);
});
test("disabled accounts cannot obtain new login tokens", async t => {
  stub(t, User, "findOne", () => select({ ...account(alice), disabled: true }));
  assert.equal((await request("/api/auth/login", { method: "POST", body: { email: "disabled@example.com", password: "password123" } })).status, 401);
});
test("real PDF validation rejects prefix, truncation, corrupt xref and malformed objects", async () => {
  const valid = validPdf();
  for (const buffer of [Buffer.from("%PDF-"), valid.subarray(0, valid.length - 20),
    Buffer.from(valid.toString().replace(/startxref\n\d+/, "startxref\n999999999")),
    Buffer.from("%PDF-1.4\nxref\ntrailer\nstartxref\n9\n%%EOF\n")]) {
    await assert.rejects(() => validatePdf(buffer), error => error.status === 422);
  }
  await validatePdf(valid);
});
test("truncated and malformed uploads never reach file creation or database writes", async t => {
  let touched = false;
  stub(t, fs, "open", async () => { touched = true; throw Error(); });
  stub(t, Resume, "create", async () => { touched = true; throw Error(); });
  for (const bytes of [Buffer.from("%PDF-"), validPdf().subarray(0, 100)]) {
    assert.equal((await request("/api/resume/upload", { method: "POST", form: form(bytes) })).status, 422);
  }
  assert.equal(touched, false);
});
function mockFile(t) {
  const state = { closed: 0, unlinked: 0, writes: 0, created: 0 };
  const handle = { async writeFile() { state.writes++; }, async close() { state.closed++; } };
  stub(t, fs, "mkdir", async () => {});
  stub(t, fs, "open", async (path, mode) => { assert.equal(mode, "wx"); state.created++; return handle; });
  stub(t, fs, "unlink", async () => { state.unlinked++; });
  return { state, handle };
}
function uploadRequest() { const buffer = validPdf(); return { userId: alice, file: { buffer, originalname: "test.pdf", size: buffer.length } }; }
test("partial write failure closes the handle and removes only the created file", async t => {
  const { state, handle } = mockFile(t); let persisted = false;
  handle.writeFile = async () => { throw Object.assign(Error("disk full"), { code: "ENOSPC" }); };
  stub(t, Resume, "create", async () => { persisted = true; });
  await assert.rejects(() => uploadResume(uploadRequest(), {}), { code: "ENOSPC" });
  assert.equal(state.closed, 1); assert.equal(state.unlinked, 1); assert.equal(persisted, false);
});
test("database failure closes handle and removes the newly created file", async t => {
  const { state } = mockFile(t);
  stub(t, Resume, "create", async () => { throw Error("synthetic DB failure"); });
  await assert.rejects(() => uploadResume(uploadRequest(), {}), /synthetic DB failure/);
  assert.equal(state.closed, 1); assert.equal(state.unlinked, 1);
});
test("cleanup failure is logged safely and preserves the original error", async t => {
  mockFile(t); const logs = [];
  stub(t, fs, "unlink", async () => { throw Object.assign(Error("SECRET absolute path"), { code: "EPERM" }); });
  stub(t, Resume, "create", async () => { throw Error("original failure"); });
  stub(t, console, "error", (...args) => logs.push(args));
  await assert.rejects(() => uploadResume(uploadRequest(), {}), /original failure/);
  assert.equal(logs.length, 1); assert.equal(logs[0][1].operation, "unlink"); assert.equal(logs[0][1].code, "EPERM");
  assert.equal(JSON.stringify(logs).includes("SECRET"), false); assert.equal(JSON.stringify(logs).includes("test.pdf"), false);
});
test("exclusive-open collision never unlinks a pre-existing file", async t => {
  const { state } = mockFile(t);
  stub(t, fs, "open", async () => { throw Object.assign(Error("exists"), { code: "EEXIST" }); });
  await assert.rejects(() => uploadResume(uploadRequest(), {}), { code: "EEXIST" });
  assert.equal(state.unlinked, 0);
});
test("inclusive size policy accepts max-1/max and rejects max+1 through multipart", async t => {
  const { state } = mockFile(t);
  stub(t, Resume, "create", async data => {
    assert.equal(data.userId, alice); assert.ok(data.size <= MAX_PDF_BYTES); return { ...data, id: bob };
  });
  for (const size of [MAX_PDF_BYTES - 1, MAX_PDF_BYTES]) {
    const response = await request("/api/resume/upload", { method: "POST", form: form(validPdf(size)) });
    assert.equal(response.status, 201, await response.clone().text());
    const data = await response.json(); assert.equal(data.resumeId, bob); assert.match(data.path, /^uploads\//);
  }
  const tooLarge = await request("/api/resume/upload", { method: "POST", form: form(validPdf(MAX_PDF_BYTES + 1)) });
  assert.equal(tooLarge.status, 413); assert.equal((await tooLarge.json()).message, PDF_SIZE_MESSAGE);
  assert.equal(state.created, 2);
});
test("both upload aliases share a budget and Retry-After; listing does not consume it", async t => {
  stub(t, Resume, "find", () => ({ sort() { return this; }, limit: async () => [] }));
  const user = "dddddddddddddddddddddddd";
  for (let i = 0; i < 25; i++) assert.equal((await request("/api/resume", { user })).status, 200);
  for (let i = 0; i < 20; i++) assert.equal((await request("/api/uploads", { method: "POST", user, form: form("bad") })).status, 400);
  for (const path of ["/api/resume/upload", "/api/uploads"]) {
    const response = await request(path, { method: "POST", user, form: form("bad") });
    assert.equal(response.status, 429); assert.ok(Number(response.headers.get("retry-after")) > 0);
    assert.equal((await response.json()).message, "Too many requests. Please try again shortly.");
  }
});
function production(overrides = {}) { return { NODE_ENV: "production", MONGO_URI: "mongodb://unused/test", GEMINI_API_KEY: "test-provider",
  JWT_SECRET: "d8ba10c4-7fa2-4b6c-923a-5ee0a791fde8", FRONTEND_ORIGIN: "https://interview.example", ...overrides }; }
test("production configuration rejects short, repetitive and placeholder secrets without exposing them", () => {
  for (const secret of ["short-private-secret", "x".repeat(64), "replace-with-a-long-random-secret", "your_super_secret_key"]) {
    assert.throws(() => validateEnvironment(production({ JWT_SECRET: secret })), error => !error.message.includes(secret));
  }
  assert.equal(validateEnvironment(production()).port, 5000);
  assert.throws(() => validateEnvironment(production({ NODE_ENV: "development", JWT_SECRET: "supersecret" })));
});
test("production origins require explicit exact public HTTPS origins", () => {
  for (const origin of [undefined, "", "*", "http://interview.example", "https://localhost", "https://user:pass@interview.example", "https://interview.example/path", "https://interview.example/"]) {
    assert.throws(() => validateEnvironment(production({ FRONTEND_ORIGIN: origin })));
  }
  assert.deepEqual(validateEnvironment(production({ FRONTEND_ORIGIN: "https://a.example,https://b.example" })).origins, ["https://a.example", "https://b.example"]);
  assert.deepEqual(validateEnvironment(production({ NODE_ENV: "development", FRONTEND_ORIGIN: undefined })).origins, ["http://localhost:5173"]);
});

test("validator timeout terminates the child and releases concurrency capacity", async () => {
  const { EventEmitter } = require("node:events"); let killed = 0;
  function forkProcess() {
    const child = new EventEmitter(); Object.assign(child, { pid: 1, exitCode: null, signalCode: null,
      send() {}, kill() { killed++; child.signalCode = "SIGTERM"; queueMicrotask(() => { child.emit("exit"); child.emit("close"); }); } }); return child;
  }
  const validate = createPdfValidator({ forkProcess, timeoutMs: 10, maxWorkers: 1 });
  const pending = validate(Buffer.from("test"));
  await assert.rejects(() => validate(Buffer.from("test")), error => error.status === 503);
  await assert.rejects(pending, /timed out/); assert.equal(killed, 1);
  await assert.rejects(() => validate(Buffer.from("test")), /timed out/); assert.equal(killed, 2);
});
test("validator spawn failures settle without hanging or leaking secrets", async () => {
  const { EventEmitter } = require("node:events");
  const validate = createPdfValidator({ forkProcess() {
    const child = new EventEmitter(); Object.assign(child, { send() {}, exitCode: null, signalCode: null });
    queueMicrotask(() => { child.emit("error", Error("SECRET launch details")); child.emit("close"); }); return child;
  } });
  await assert.rejects(() => validate(Buffer.from("test")), error => error.status === 422 && !error.message.includes("SECRET"));
});
