# InterviewAce — security foundation

This document records the scope and verification of this implementation phase. For the combined current application, setup and feature status, see the [InterviewAce README](../README.md).

## Implemented

- Bearer JWT verification plus live account availability/session-version checks on notes, resume metadata/uploads, AI requests, and file downloads.
- Server-derived ownership on every note/resume query; clients cannot assign owners.
- Shared upload controller for POST /api/resume/upload and POST /api/uploads.
- PDF extension/MIME/header and structural checks, an inclusive 5 MB limit, UUID filenames, persistent owned metadata, and coordinated cleanup for filesystem/database failures.
- No public static upload directory. GET /uploads/:file requires a Bearer token and ownership.
- GET /api/resume returns up to 100 recent owned resumes. Upload responses preserve file/path and add resumeId.
- AI accepts resumeId (preferred) or an exact owned legacy path; arbitrary filesystem paths cannot reach extraction.
- Async file reads; extraction capped at 50 pages/100000 characters and cached per resume. PDF parsing still runs in the API process.
- Existing AI response keys remain analysis/result/questions. Provider requests have a 60-second timeout and configurable model.
- Request validation, safe error responses, security headers, restricted CORS, and bounded in-memory rate guards.
- Registration returns only public fields; email normalization, legacy case-insensitive lookup, and password hashing are retained.
- New registrations populate emailKey with a sparse unique index to prevent concurrent duplicate registrations. Existing documents are not rewritten. Startup waits for User indexes.
- Frontend shared API client, cross-tab session synchronization, cancellation/stale-response rejection, server-verified protected routes, expiry handling, resume selector, disabled/pending actions, note edit and pagination.
- Backend startup scripts, environment validation, database-before-listen startup, readiness endpoint, and shutdown handling.

## Run

Use Node 24 (the environment used for verification) and the committed lockfiles.

```powershell
npm ci --prefix backend
npm ci --prefix frontend
# Configure backend/.env using backend/.env.example. Never overwrite existing credentials.
npm start --prefix backend
# In a separate terminal:
npm run dev --prefix frontend
```

Vite proxies /api to localhost:5000. If PORT changes, update the proxy or set VITE_API_BASE_URL. Add the exact frontend origin to the comma-separated FRONTEND_ORIGIN configuration when using another port or host. Production needs an /api reverse proxy or an explicit VITE_API_BASE_URL, frontend SPA fallback routing, and HTTPS.

Restart an already-running backend to load these changes. Existing valid seven-day JWTs remain supported. Login clears browser-local resume selection; the dashboard restores selection from authenticated resume metadata.

## Existing data and compatibility

No existing documents, PDFs, or Git history are deleted or reassigned. Records without userId are deliberately invisible to ordinary users. There is no reliable ownership evidence for the previously global notes or unregistered PDFs. Administrators must reconcile those records from verified evidence; users may re-upload their own PDFs. Do not create a public endpoint to claim arbitrary old records.

Old API paths and AI response keys remain supported, with authentication now required. Pass Authorization: Bearer <token> to protected routes. The path compatibility input only resolves records already belonging to that user. Direct unauthenticated browser links to uploads no longer work.

The emailKey index protects new registrations without indexing pre-existing duplicate emails. Audit and reconcile old duplicate/case-variant accounts before extending uniqueness to all historical records. The API must retain control of registration writes so emailKey cannot be bypassed.

Adding uploads to .gitignore does not remove the three already-tracked PDFs or their history. Their review/removal is a separate explicit migration; this change leaves them intact.

## Verification

```powershell
npm test --prefix backend
npm test --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
```

The backend tests exercise real HTTP routing/middleware against a temporary loopback server, with model/provider operations stubbed. They use generated synthetic upload bytes and delete their temporary UUID files. They do not contact MongoDB or Gemini, validate live index creation, or prove model-output quality. A database-backed integration pass and live provider smoke test remain necessary before deployment.

## Historical roadmap

This list records the original foundation plan, not current feature status. Structured profiles, job matching, saved mock interviews and adaptive learning are now implemented; OCR and retrieval remain outside the current implementation.

1. Resume extraction workers, OCR, structured profiles, source evidence, versioning, and user corrections.
2. Job-description ingestion and explainable matching.
3. Persisted interview sessions/answers and calibrated rubric evaluation.
4. Deterministic adaptive topic/difficulty selection using evaluated answers.
5. Learning events, confidence-aware analytics, and personalized plans.
6. Curated knowledge ingestion, semantic/hybrid retrieval, access filters, citations, and retrieval evaluations.

Before production scaling: migrate uploads to private object storage, move parsing/AI to resource-limited workers, use shared rate limits/durable queues, add daily AI cost quotas, improve token lifecycle/revocation, migrate the legacy Google SDK behind a provider adapter, and add deployment/observability infrastructure. Current rate limits are per-process guards, not distributed or durable quotas. Resume text is transmitted to Gemini when a user requests an AI action. Model instructions reduce prompt-injection risk but do not establish a security boundary. The legacy free-form dashboard results live only in frontend state; later phases persist their structured profiles, reports, sessions and learning records. OCR and structured AI features are not implemented in this foundation phase.

## Phase 1.6 remediation

See [the remediation verification report](PHASE_1_6.md) for policies, changed files, tests and limitations. Upload validation now runs in a bounded child process, while existing AI text extraction still runs in the API process. No Phase 2 features were introduced.
