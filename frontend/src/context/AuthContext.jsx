import { useEffect, useState, useSyncExternalStore } from "react";
import api from "../lib/api";
import { session } from "../lib/session";
import { AuthContext } from "./auth";
function SessionProvider({ snapshot, children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!snapshot.token);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!snapshot.token) return;
    let active = true;
    const controller = new AbortController();
    const current = () => active && session.isCurrent(snapshot);
    api.get("/auth/me", { signal: controller.signal }).then(({ data }) => { if (current()) setUser(data); })
      .catch(err => { if (current() && err.code !== "ERR_CANCELED" && err.response?.status !== 401) setError("Unable to verify your session. Check the server connection."); })
      .finally(() => { if (current()) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [snapshot, attempt]);
  function retry() { setLoading(true); setError(""); setAttempt(value => value + 1); }
  return <AuthContext.Provider value={{ user, loading, error, login: session.login, logout: () => session.logout(), retry }}>
    {children}
  </AuthContext.Provider>;
}
export default function AuthProvider({ children }) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  // Remount all user-specific React state for every local or cross-tab session change.
  return <SessionProvider key={snapshot.revision} snapshot={snapshot}>{children}</SessionProvider>;
}
