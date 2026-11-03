import { feedbackModuleUrl } from './jsxLoader.js';
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { Buffer } from "node:buffer";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";
import { createProfileClient, editableEntry, entryDraft, draftPayload } from "../src/lib/profiles.js";
const require = createRequire(import.meta.url);
const { candidate, TEXT } = require("../../backend/tests/helpers/candidate.js");
const { parseCandidateResponse, editCandidate } = require("../../backend/schemas/candidateProfile.js");
const { scoreProfile } = require("../../backend/services/resumeScore.js");
function profile() {
  const data = parseCandidateResponse(JSON.stringify(candidate()), TEXT);
  return { _id: "profile", resumeId: "resume-1", revision: 1, status: "ready", data, score: scoreProfile(data) };
}
async function view() {
  const source = await readFile(new URL("../src/components/CandidateProfileView.jsx", import.meta.url), "utf8");
  const { code } = await transformWithOxc(source, "CandidateProfileView.jsx", { jsx: { runtime: "automatic" } });
  const runnable = code.replaceAll('"./Feedback"', JSON.stringify(await feedbackModuleUrl())).replaceAll('"react"', JSON.stringify(pathToFileURL(require.resolve("react")).href))
    .replaceAll('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href))
    .replaceAll('"../lib/profiles"', JSON.stringify(new URL("../src/lib/profiles.js", import.meta.url).href));
  return (await import("data:text/javascript;base64," + Buffer.from(runnable).toString("base64"))).default;
}
test("profile view renders every section, skill category, estimated level, evidence and score disclaimer", async () => {
  const View = await view(); const html = renderToStaticMarkup(createElement(View, { profile: profile() }));
  for (const text of ["Personal information", "Education", "Experience", "Projects", "Achievements", "Skills", "Programming Languages", "Intermediate", "Supporting resume evidence", "Source characters", "not an ATS score", "Node.js", "Confirm", "Edit", "Remove"]) assert.ok(html.includes(text), text);
});
test("user corrections are labelled and rendered as escaped text", async () => {
  const View = await view(); const p = profile(); p.data.personal.name = "<script>unsafe()</script>"; p.data.personal.origin = "user";
  const html = renderToStaticMarkup(createElement(View, { profile: p }));
  assert.ok(html.includes("User corrected")); assert.ok(html.includes("&lt;script&gt;")); assert.equal(html.includes("<script>"), false);
});
test("editor payload includes only editable facts, categories and project technology names", () => {
  const p = profile(); const skill = editableEntry("skills", p.data.skills[0]);
  assert.deepEqual(Object.keys(skill), ["name", "category", "proficiency"]); assert.equal(skill.evidence, undefined);
  assert.deepEqual(editableEntry("projects", p.data.projects[0]).technologies, ["Node.js"]);
});
test("comma-separated editor values preserve in-progress separators and serialize multiple technologies", () => {
  const draft = entryDraft("projects", profile().data.projects[0]);
  draft.technologies += ", ";
  assert.equal(draft.technologies, "Node.js, ");
  draft.technologies += "Python";
  assert.deepEqual(draftPayload("projects", draft).technologies, ["Node.js", "Python"]);
});
test("editing, confirming and removing persist through a new client and a simulated page refresh", async () => {
  let stored = JSON.stringify(profile());
  const api = {
    async get(url) { assert.equal(url, "/profiles/resume-1"); return { data: { profile: JSON.parse(stored) } }; },
    async patch(url, body) {
      assert.equal(url, "/profiles/resume-1"); const p = JSON.parse(stored); assert.equal(body.revision, p.revision);
      p.data = editCandidate(p.data, body); p.revision++; p.score = scoreProfile(p.data); stored = JSON.stringify(p); return { data: { profile: p } };
    },
  };
  const client = createProfileClient(api); let p = await client.get("resume-1");
  const value = { ...editableEntry("personal", p.data.personal), name: "Corrected Alice" };
  p = await client.edit("resume-1", p, "personal", undefined, "update", value);
  p = await client.edit("resume-1", p, "education", 0, "confirm");
  await client.edit("resume-1", p, "skills", 0, "remove");
  const loaded = await createProfileClient(api).get("resume-1");
  assert.equal(loaded.data.personal.name, "Corrected Alice"); assert.equal(loaded.data.education[0].confirmed, true);
  assert.equal(loaded.data.skills.length, 3); assert.equal(loaded.revision, 4);
});
test("extract/retry preserve failed status and do not hide authorization errors", async () => {
  const calls = [];
  const client = createProfileClient({ async post(url, body) { calls.push({ url, body }); throw { response: { status: 502, data: { profile: { status: "failed", failure: { message: "Invalid AI" } } } } }; } });
  assert.equal((await client.extract("resume-1")).status, "failed");
  await client.extract("resume-1", true); assert.deepEqual(calls.map(call => call.body), [{ retry: false }, { retry: true }]);
  const denied = createProfileClient({ async get() { throw { response: { status: 404 } }; } });
  await assert.rejects(() => denied.get("foreign-resume"));
});
test("optimistic edit conflicts propagate for the dashboard to reload instead of overwriting", async () => {
  let sent; const client = createProfileClient({ async patch(url, body) { sent = body; throw { response: { status: 409 } }; } });
  await assert.rejects(() => client.edit("resume-1", profile(), "projects", 0, "remove"));
  assert.equal(sent.revision, 1); assert.equal(sent.action, "remove"); assert.equal(sent.userId, undefined); assert.equal(sent.value, undefined);
});
test("resume version switching uses distinct resource URLs and loading never starts extraction", async () => {
  const urls = []; const client = createProfileClient({ async get(url) { urls.push(url); return { data: url === "/resume" ? [] : { profile: null } }; } });
  await client.resumes(); assert.equal(await client.get("version-1"), null); await client.get("version-2");
  assert.deepEqual(urls, ["/resume", "/profiles/version-1", "/profiles/version-2"]);
});
