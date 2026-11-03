export function createJobClient(api) {
  return {
    async jobs(options) { return (await api.get('/jobs', options)).data; },
    async reports(options) { return (await api.get('/jobs/reports', options)).data; },
    async job(id, options) { return (await api.get(`/jobs/${id}`, options)).data; },
    async report(id, options) { return (await api.get(`/jobs/reports/${id}`, options)).data; },
    async create(text) { return (await api.post('/jobs', { text })).data; },
    async upload(file) { const body = new FormData(); body.append('file', file); return (await api.post('/jobs/upload', body)).data; },
    async match(jobId, resumeId) { return (await api.post('/jobs/reports', { jobId, resumeId })).data; },
  };
}
export function scoreLabel(score) { return score === null ? 'Not enough requirements to score' : `${score}% compatibility`; }
