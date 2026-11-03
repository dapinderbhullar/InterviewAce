import { test } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { createSessionStore } from "../src/lib/sessionStore.js";
import { createApiClient } from "../src/lib/apiClient.js";
function fixture(token = "alice") {
  const values = new Map(token ? [["token", token]] : []);
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const listeners = new Set();
  const eventTarget = { addEventListener(type, fn) { if (type === "storage") listeners.add(fn); }, removeEventListener(type, fn) { if (type === "storage") listeners.delete(fn); } };
  const store = createSessionStore({ storage, eventTarget });
  let notifications = 0;
  const unsubscribe = store.subscribe(() => notifications++);
  return { store, storage, values, unsubscribe, notifications: () => notifications,
    remote(token) { if (token) storage.setItem("token", token); else storage.removeItem("token"); for (const listener of listeners) listener({ key: "token", storageArea: storage }); } };
}
test("cross-tab login changes the session revision, clears selections and invalidates prior state", () => {
  const f = fixture(); const previous = f.store.capture();
  f.storage.setItem("resumeId", "alice-private"); f.storage.setItem("resumePath", "alice-path");
  f.remote("bob");
  assert.equal(f.store.getSnapshot().token, "bob"); assert.notEqual(f.store.getSnapshot().revision, previous.revision);
  assert.equal(f.store.isCurrent(previous), false); assert.equal(f.storage.getItem("resumeId"), null);
  assert.equal(f.notifications(), 1); f.unsubscribe();
});
test("cross-tab logout cancels pending work and clears user selection", () => {
  const f = fixture(); const request = f.store.trackRequest();
  f.storage.setItem("resumeId", "private"); f.remote(null);
  assert.equal(request.signal.aborted, true); assert.equal(f.store.getSnapshot().token, null);
  assert.equal(f.storage.getItem("resumeId"), null); f.unsubscribe();
});
test("same-tab login/logout notify subscribers and preserve unrelated storage", () => {
  const f = fixture(); f.storage.setItem("unrelated", "keep"); const old = f.store.capture();
  f.store.login({ token: "bob", name: "Bob" }); assert.equal(f.store.isCurrent(old), false);
  assert.equal(f.storage.getItem("userName"), "Bob");
  f.store.logout(); assert.equal(f.storage.getItem("token"), null); assert.equal(f.storage.getItem("userName"), null);
  assert.equal(f.storage.getItem("unrelated"), "keep"); assert.equal(f.notifications(), 2); f.unsubscribe();
});
test("a delayed logout from an old session cannot clear the new session", () => {
  const f = fixture(); const old = f.store.capture(); f.store.login({ token: "bob", name: "Bob" });
  f.store.logout(old); assert.equal(f.storage.getItem("token"), "bob"); f.unsubscribe();
});
test("request token is captured synchronously and pending requests abort on session switching", async () => {
  const f = fixture(); let started;
  const api = createApiClient(f.store, { adapter: config => { started = config; return new Promise(() => {}); } });
  const pending = api.get("/notes"); pending.catch(() => {});
  assert.equal(started.headers.Authorization, "Bearer alice");
  f.remote("bob"); assert.equal(started.signal.aborted, true); f.unsubscribe();
});
test("late successful responses cannot enter a newer session", async () => {
  const f = fixture(); let resolve;
  const api = createApiClient(f.store, { adapter: config => new Promise(done => { resolve = () => done({ data: "alice-private", status: 200, headers: {}, config }); }) });
  const pending = api.get("/notes"); f.remote("bob"); resolve();
  await assert.rejects(pending, error => axios.isCancel(error)); f.unsubscribe();
});
test("late old-token 401 cannot log out the current session", async () => {
  const f = fixture(); let fail;
  const api = createApiClient(f.store, { adapter: config => new Promise((resolve, reject) => {
    fail = () => reject(new axios.AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, null, { status: 401 }));
  }) });
  const pending = api.get("/notes"); f.remote("bob"); fail();
  await assert.rejects(pending); assert.equal(f.storage.getItem("token"), "bob"); f.unsubscribe();
});
test("current expired-token 401 clears session; failed login does not", async () => {
  const f = fixture();
  const api = createApiClient(f.store, { adapter: async config => { throw new axios.AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, null, { status: 401 }); } });
  await assert.rejects(api.post("/auth/login")); assert.equal(f.storage.getItem("token"), "alice");
  await assert.rejects(api.get("/notes")); assert.equal(f.storage.getItem("token"), null); f.unsubscribe();
});
test("cross-tab changes are detected even before the storage event is delivered", async () => {
  const f = fixture(); let resolve;
  const api = createApiClient(f.store, { adapter: config => new Promise(done => { resolve = () => done({ data: "old", status: 200, headers: {}, config }); }) });
  const pending = api.get("/notes"); f.storage.setItem("token", "bob"); resolve();
  await assert.rejects(pending, error => axios.isCancel(error));
  const captured = f.store.capture(); assert.equal(captured.token, "bob"); f.unsubscribe();
});
test("caller cancellation is forwarded and anonymous requests have no Bearer header", async () => {
  const f = fixture(null); const controller = new AbortController(); let config;
  const api = createApiClient(f.store, { adapter: async input => { config = input; controller.abort(); return { data: {}, status: 200, headers: {}, config: input }; } });
  await assert.rejects(api.get("/auth/login", { signal: controller.signal }), error => axios.isCancel(error));
  assert.equal(config.headers.Authorization, undefined); assert.equal(config.signal.aborted, true); f.unsubscribe();
});
