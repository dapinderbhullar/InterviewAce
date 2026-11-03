# InterviewAce — Phase 5: adaptive learning

This document records the scope and verification of this implementation phase. For the combined current application, setup and feature status, see the [InterviewAce README](../README.md).

Open `/learning` after building a ready Resume Intelligence Profile. Select a resume version and optionally a saved job. Without a target job, the latest saved match report per job contributes gaps. With a target, requirements are compared deterministically against current profile evidence. Completed mock interviews for the selected resume (targeted or untargeted for a selected job) and roadmap practice attempts supply assessed performance.

Required skills sort ahead of optional skills. Missing/partial evidence, repeated scores below 70, and declines greater than 10 points increase priority. Each gap has stable normalized-topic/level keys for Beginner, Intermediate and Advanced tasks. Refreshes upsert recommendations, retire obsolete pending tasks, and preserve completed tasks and attempts. Recommendations refresh on target selection, page focus, explicit refresh and successful practice evaluation; no background provider calls occur.

Task completion percentage measures effort only. Skill scores average the latest three evaluated answers; trends compare them with the preceding three. Unassessed skills have no score. Three recent scores of at least 80 produce a label of consistent assessed performance, never automatic mastery from task completion. Skill history includes individual interview and practice scores. Gemini feedback is an estimate.

## Authenticated API

- `POST /api/learning` — `{ resumeId, jobId: string | null }`, create or refresh the target roadmap.
- `GET /api/learning/:roadmapId` — roadmap, tasks, attempts, current skills and deterministic progress.
- `PATCH /api/learning/tasks/:taskId` — `{ completed: boolean }`.
- `POST /api/learning/tasks/:taskId/exercises` — `{ requestId, kind }`, where kind is `conceptual`, `technical` or `scenario`. Reuse a request key to recover generation; use a new key for a new attempt.
- `POST /api/learning/attempts/:attemptId/answer` — `{ answer }`. The first answer is immutable. Retry the same answer after a provider failure. Start a new exercise to practice again.

All resources and source queries are scoped to the authenticated account. Existing JWT/account validation and rate limits apply. Unique MongoDB indexes prevent duplicate target roadmaps, task keys and practice request keys. Atomic leases serialize refresh/provider operations, expire after two minutes and fence late provider results. Answers persist before evaluation. Failed provider responses are validated and never count toward progress. Gemini uses the existing API key/model, structured schemas and timeout; no additional configuration is required. The frontend can reopen history and retry saved generation/evaluation after reload.

Run `npm test --prefix backend`, `npm test --prefix frontend`, `npm run lint --prefix frontend` and `npm run build --prefix frontend`. Service tests inject repositories and providers; HTTP tests exercise authentication through the existing app. They do not require a live Gemini call or MongoDB instance.
