# InterviewAce — Phase 4: AI-powered mock interviews

This document records the scope and verification of this implementation phase. For the combined current application, setup and feature status, see the [InterviewAce README](../README.md).

## User workflow

Open **Mock Interview** (`/interviews`). Select a resume version with a ready Resume Intelligence Profile and optionally a saved job description. Configure Technical, HR, Project-Based or Mixed questions, Beginner/Intermediate/Advanced difficulty, and 1–10 questions (Mixed: 3–10). Create the session, answer one question at a time, review feedback, and continue. Interview history opens saved sessions at `/interviews/:sessionId` for resuming or reviewing the completed performance report and revision plan.

Mixed interviews rotate Technical, HR and Project-Based questions. If a profile has no projects, Mixed rotates Technical and HR; Project-Based creation returns 422 rather than inventing a project. Technical topics come from saved skills and optional job requirements, falling back to general fundamentals when neither exists. HR topics use a small explicit set of behavioral competencies.

No new dependencies or environment variables are required. The existing Gemini configuration, authenticated Axios client, account/session validation, CandidateProfile, Resume and JobDescription are reused. Legacy Interview/Report models and question-generation endpoints remain unchanged. No voice/video, speech recognition, RAG or adaptive learning is included.

## Persistence and state

`InterviewSession` is a new MongoDB collection. Questions are embedded so answer persistence, evaluation state and progress changes can be committed atomically in one document. A separate InterviewQuestion collection is unnecessary for this bounded session size.

Each session saves:

- Owner, client creation request ID and configuration hash, selected resume/job IDs and display names, profile revision, configuration and timestamps.
- A stable snapshot of skill names/levels, saved project names/descriptions/technologies, work roles/descriptions/companies and optional job requirements. Personal/contact fields are excluded. Free-text descriptions may still contain information the user included in those descriptions.
- Generated questions with type/topic/project reference, immutable submitted answers, per-question status, feedback, criteria scores and evaluation timestamps.
- Session status (`generating`, `generation_failed`, `active`, `completed`), current question index, revision, sanitized failure information and an internal lease token/deadline.

Source profile/job edits do not change an ongoing or completed interview. Submitted answers are persisted **before** any evaluation request. Unsubmitted drafts are held in React memory and are not saved across reloads; the UI states this explicitly. Submitted answers cannot be edited, including after evaluation failure. Explicit evaluation retry uses the same saved answer. Sessions have fixed questions; no adaptive question selection occurs.

## API and ownership

All routes run behind the existing JWT and account-validation middleware. All database operations filter by authenticated `userId`. IDs, configuration, answer bounds and exact request fields are validated. Foreign/missing resources return 404. No client-supplied score, question, context or owner is accepted.

| Method | Route | Input / response |
| --- | --- | --- |
| GET | `/api/interviews` | Most recent 100 owned session summaries |
| POST | `/api/interviews` | `{requestId, resumeId, jobId, type, difficulty, count}`; `jobId: null` means no job |
| GET | `/api/interviews/:sessionId` | `{session}` with current question, evaluated history and report |
| POST | `/api/interviews/:sessionId/retry` | `{}`; explicitly retry failed/expired question generation |
| POST | `/api/interviews/:sessionId/answers` | `{questionIndex, answer}`; submit or explicitly retry the saved answer |

Successful mutations return 200 with `{session}`; an active competing worker returns 202 with `Retry-After: 3`. Provider/structured-output failures return 502 or 504 **with the saved session**, allowing the frontend to retain progress and offer retry. Invalid inputs return 400, profile/configuration conflicts 409, and missing projects for Project-Based interviews 422. Internal provider details are never returned.

The public projection excludes source context, internal lease tokens, creation hashes and future questions. It exposes only the current question and evaluated earlier questions. Evaluation/examples are included only for questions whose submitted answer has been successfully evaluated. Generation schemas have no expected-answer field; extra fields and common answer/solution-prefixed prompt leakage are rejected.

## Duplicate requests and concurrency

A unique `(userId, requestId)` index makes creation replay-safe. Reusing a key with different settings returns 409. The setup page preserves its key for retries with unchanged settings while it stays mounted. A refresh starts a new setup attempt; the saved interview remains in history. The server initializes the new model's indexes before accepting requests.

Generation and evaluation use MongoDB compare-and-set updates with session revision/current index, a random lease token and a two-minute deadline. The submitted answer and evaluating status are saved in the lease claim. Only the lease owner can persist a result and advance progress. Two clients/processes cannot commit competing evaluations or advance twice. Identical evaluated-answer replays return the saved result without calling Gemini again. Replacing a submitted answer is rejected.

Failed generation or evaluation can be explicitly retried. Expired leases can be recovered after a crash. A stale worker cannot overwrite a newer result. The provider timeout is 60 seconds and service deadline is 65 seconds, below the lease duration. Recovery can cause another provider call if a process crashed after obtaining a result but before committing it; provider-level exactly-once billing is not possible with the current SDK.

Existing rate-limit middleware is reused: creation and generation retry each allow 10 requests/minute/user; answer submission allows 30/minute/user. These request budgets remain process-local, while persisted leases and uniqueness protect state across processes.

## AI validation and source grounding

Both generation and evaluation use Gemini JSON response schemas, zero temperature, bounded response sizes and timeouts. Prompts treat profile, job, questions and answers as untrusted data and prohibit invented candidate accomplishments or following embedded instructions.

Generation validation enforces exact field shapes/count, configured type order, allowed source-derived topics, integer in-range project references, bounded nonempty prompts and unique question text. Project prompts are constructed by the backend around the selected saved project's exact name and distinct discussion focuses; an AI-generated project premise is never used.

Evaluation validates all five integer criteria in 0–10, bounded feedback arrays, at least one improvement, bounded example text and exact saved-project evidence quotes. Project evaluation must cite the selected project's saved content. Unsupported answer details must be described as unverified, not silently accepted as saved facts. For HR and project questions, the backend replaces model-authored autobiographical examples with truthful-answer scaffolds; project scaffolds include saved descriptions/technologies and placeholders for real contributions, tests and outcomes. Technical examples are conceptual model-generated examples, not verified personal experiences.

Structural validation and evidence quotes do not prove that every free-text feedback sentence or technical explanation is correct. Users should review AI feedback critically; the report labels it an estimate, not an assessment or hiring prediction.

## Scores and reports

Gemini evaluates correctness, technical depth, clarity, relevance and completeness at the configured difficulty. For HR, depth means reasoning, specificity and reflection instead of technical jargon. Each criterion is equally weighted (20%). The backend computes each question's practice score as `round(sum(criteria) * 2)`, out of 100; the model cannot submit its own total.

The completed performance score is the rounded arithmetic mean of all evaluated question scores. Before completion, the official overall score is `null`; any available mean is explicitly provisional. Topic averages below 70 identify weak Technical/Project-Based topics. Criterion averages below 7/10 identify improvement areas. The revision plan deterministically combines these areas with each question's specific AI improvement suggestion. Reports are derived from saved evaluations, so revisiting does not incur an AI call or rescore earlier answers.

The UI includes question/progress indicators, preserved submitted text, retry/recovery actions, per-criterion meters, strengths, missing points, improvements, stronger answer examples/scaffolds, saved project evidence and question-wise feedback. No answer feedback is rendered on the unanswered question card.

## Verification (2026-11-03)

| Check | Actual result |
| --- | --- |
| Backend `npm test` | **96 passed, 0 failed** (includes all Phase 1–3 regressions) |
| Frontend `npm test` | **28 passed, 0 failed** |
| Frontend `npm run lint` | Passed |
| Frontend `npm run build` | Passed; Vite production bundle generated |
| Backend `node --check` on new/changed backend modules | Passed |
| `git diff --check` | Passed; existing package file line-ending warning only |

Backend coverage includes all interview types, optional jobs, source snapshots, contact-field exclusion, persistence/resuming, exact scoring/report aggregation, ownership, JWT/account validation, invalid inputs, future-question protection, provider/schema failure, timeout, retry, duplicate creation/evaluation, cross-service uniqueness races, expired leases and stale-worker rejection. Tests use model/repository doubles plus real localhost HTTP requests, with local network access outside the sandbox. Gemini methods are stubbed, including provider-schema assertions.

Frontend coverage includes report rendering, provisional/complete distinctions, escaped text, feedback/evidence, question-card answer hiding, submission/recovery states, current-question selection, request payloads/idempotency key forwarding, saved-answer reload, failure-state preservation and error propagation. Existing session/profile/matching tests also pass. These are Node tests and server-rendered component checks, not interactive browser end-to-end tests.

No live MongoDB round trip or real Gemini request was performed. MongoDB ownership/index configuration and persistence flows are covered with schema assertions, repository doubles and HTTP wiring tests. Live provider response quality and production deployment remain to be verified. History is limited to the most recent 100 sessions; older owned session URLs still work. There is no pagination, session deletion, unsent-draft autosave or provider-independent semantic verification in this phase.

## Phase 4 file inventory

Added:

- `backend/models/InterviewSession.js`
- `backend/schemas/interview.js`
- `backend/services/interviews.js`
- `backend/services/interviewReport.js`
- `backend/routes/interviewRoutes.js`
- `backend/tests/interviews.test.js`
- `frontend/src/lib/interviews.js`
- `frontend/src/pages/MockInterview.jsx`
- `frontend/src/components/InterviewQuestionCard.jsx`
- `frontend/src/components/InterviewReportView.jsx`
- `frontend/tests/interviews.test.js`
- `docs/PHASE_4.md`

Updated:

- `backend/app.js` — mount authenticated interview routes.
- `backend/server.js` — initialize interview indexes before listening.
- `backend/services/geminiService.js` — structured question generation and answer evaluation methods.
- `frontend/src/App.jsx` — protected setup/history and resumable session routes.
- `frontend/src/components/Navbar.jsx` — Mock Interview navigation.
- `frontend/src/index.css` — shared interview feedback/progress styling.

All pre-existing uncommitted Phase 1–3 changes are preserved.
