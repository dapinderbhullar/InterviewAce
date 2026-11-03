import { createApiClient } from "./apiClient";
import { session } from "./session";
export function clearSession() { session.logout(); }
export default createApiClient(session, { baseURL: import.meta.env.VITE_API_BASE_URL || "/api" });
