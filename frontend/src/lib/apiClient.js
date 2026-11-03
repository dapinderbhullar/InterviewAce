import axios from "axios";
export function createApiClient(session, options = {}) {
  const api = axios.create({ timeout: 90000, ...options });
  api.interceptors.request.use(config => {
    const request = session.trackRequest(config.signal);
    config.sessionRequest = request;
    config.signal = request.signal;
    if (request.captured.token) config.headers.Authorization = `Bearer ${request.captured.token}`;
    else delete config.headers.Authorization;
    return config;
  }, undefined, { synchronous: true });
  api.interceptors.response.use(response => {
    const request = response.config.sessionRequest;
    request?.release();
    if (request && !session.isCurrent(request.captured)) throw new axios.CanceledError("Session changed");
    return response;
  }, error => {
    const request = error.config?.sessionRequest;
    request?.release();
    if (request && !session.isCurrent(request.captured)) return Promise.reject(new axios.CanceledError("Session changed"));
    if (error.response?.status === 401 && !["/auth/login", "/auth/register"].includes(error.config?.url)) {
      session.logout(request?.captured);
    }
    return Promise.reject(error);
  });
  return api;
}
