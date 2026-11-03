import { ConfirmButton } from './Feedback';
export default function InterviewQuestionCard({
  question,
  total,
  answer,
  busy,
  working,
  canRecover,
  onAnswer,
  onSubmit
}) {
  const saved = !!question.answer;
  return <section className="panel">
    <h3>Question {question.index + 1} of {total} · {question.type} · {question.topic}</h3><p>{question.prompt}</p>
    <label htmlFor="interview-answer">Your answer (up to 10,000 characters)</label><textarea id="interview-answer" rows="10" maxLength={10000} value={answer} disabled={busy || saved} onChange={e => onAnswer(e.target.value)} />
    <p className="editor-meta">{answer.length.toLocaleString()} / 10,000 characters</p><p className="muted">Submitted answers are saved before evaluation and cannot be changed. Unsubmitted drafts are not saved. Expected answers are shown only after evaluation.</p>
    {question.status === 'evaluating' && <p role="status">{canRecover ? 'The previous evaluation stopped. Your submitted answer is safe.' : 'Evaluating your saved answer…'}</p>}
    <ConfirmButton disabled={busy || working || !answer.trim()} title="Submit your answer?" description="Your answer will be saved and evaluated. Submitted answers cannot be edited." confirmLabel="Submit answer" onConfirm={onSubmit}>{saved ? 'Retry evaluation of saved answer' : 'Submit answer for evaluation'}</ConfirmButton>
  </section>;
}
