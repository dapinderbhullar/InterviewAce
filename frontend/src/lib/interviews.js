export const INTERVIEW_TYPES = ['Technical', 'HR', 'Project-Based', 'Mixed'];
export const INTERVIEW_DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'];
export function currentQuestion(session) { return session.questions.find(q => q.index === session.currentIndex) || null; }
export function interviewBusy(session) { return session.status === 'generating' || currentQuestion(session)?.status === 'evaluating'; }
export function createInterviewClient(api) {
  async function mutation(url, body) {
    try { return (await api.post(url, body)).data.session; }
    catch (error) { if (error.response?.data?.session) return error.response.data.session; throw error; }
  }
  return {
    async list(options) { return (await api.get('/interviews', options)).data; },
    async get(id, options) { return (await api.get(`/interviews/${id}`, options)).data.session; },
    create: input => mutation('/interviews', input),
    retry: id => mutation(`/interviews/${id}/retry`, {}),
    submit: (id, questionIndex, answer) => mutation(`/interviews/${id}/answers`, { questionIndex, answer }),
  };
}
