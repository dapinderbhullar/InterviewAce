// Pure browser-session coordinator; dependencies are injectable for isolated tests.
export function createSessionStore({ storage, eventTarget }) {
  let snapshot = { token: storage.getItem("token"), revision: 0 };
  const listeners = new Set();
  const requests = new Set();
  function clearSelection() {
    storage.removeItem("resumePath"); storage.removeItem("resumeId");
  }
  function sync(force = false) {
    const token = storage.getItem("token");
    if (force || token !== snapshot.token) {
      for (const controller of requests) controller.abort();
      requests.clear();
      clearSelection();
      snapshot = { token, revision: snapshot.revision + 1 };
      for (const listener of listeners) listener();
    }
    return snapshot;
  }
  function storageChanged(event) {
    if ((event.key === "token" || event.key === null) && (!event.storageArea || event.storageArea === storage)) sync();
  }
  const store = {
    getSnapshot: () => snapshot,
    capture: () => sync(),
    isCurrent: captured => captured?.revision === snapshot.revision && captured?.token === storage.getItem("token"),
    subscribe(listener) {
      if (!listeners.size) eventTarget.addEventListener("storage", storageChanged);
      listeners.add(listener);
      // Catch a storage change between render and subscription.
      sync();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) eventTarget.removeEventListener("storage", storageChanged);
      };
    },
    login(data) {
      clearSelection();
      storage.setItem("userName", data.name);
      storage.setItem("token", data.token);
      sync(true);
    },
    logout(expected) {
      if (expected && !store.isCurrent(expected)) return;
      storage.removeItem("userName"); clearSelection(); storage.removeItem("token");
      sync(true);
    },
    trackRequest(externalSignal) {
      const captured = sync();
      const controller = new AbortController();
      const cancel = () => controller.abort();
      if (externalSignal?.aborted) cancel();
      else externalSignal?.addEventListener("abort", cancel, { once: true });
      requests.add(controller);
      return { captured, signal: controller.signal, release() {
        requests.delete(controller); externalSignal?.removeEventListener("abort", cancel);
      } };
    },
  };
  return store;
}
