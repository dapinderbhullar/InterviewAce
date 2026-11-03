export function createLearningClient(api) {
  return {
    refresh: async (resumeId, jobId, options) => (await api.post('/learning', { resumeId, jobId: jobId || null }, options)).data,
    get: async (id, options) => (await api.get(`/learning/${id}`, options)).data,
    complete: async (id, completed) => (await api.patch(`/learning/tasks/${id}`, { completed })).data,
    exercise: async (id, requestId, kind) => (await api.post(`/learning/tasks/${id}/exercises`, { requestId, kind })).data.attempt,
    submit: async (id, answer) => (await api.post(`/learning/attempts/${id}/answer`, { answer })).data.attempt,
  };
}
export const visibleTasks = (tasks, filter) => tasks.filter(t => (t.active || t.completed) && (filter === 'all' || t.completed === (filter === 'completed')));
export const attemptBusy = a => ['generating', 'evaluating'].includes(a?.status) && new Date(a.leaseUntil) > new Date();
