# InterviewAce — Phase 3: Job Description Intelligence and Matching

This document records the scope and verification of this implementation phase. For the combined current application, setup and feature status, see the [InterviewAce README](../README.md).

Open **Job matching** in the navigation (`/jobs`). Build a ready Phase 2 profile for each resume version you want to compare. Paste a job or upload a UTF-8 `.txt` file, review the extracted requirements alongside the original source, select a resume version, and calculate a match. Saved comparisons can be revisited and compared across jobs and resume versions.

## Architecture and ownership

The implementation reuses the existing authenticated API client, JWT/account validation, CandidateProfile, Resume and Gemini SDK. No new packages or environment variables are required. Existing Phase 1/2 code and uncommitted changes are preserved.

`JobDescription` stores owner, original text, validated extraction and source hash. `MatchReport` stores owner, resume/job IDs, profile revision, algorithm version, display names and the complete deterministic result. Reports are immutable snapshots; rerunning after a profile edit creates a separate report. No full personal profile or contact information is copied into reports.

Every resource query includes authenticated `userId`. IDs are validated before model queries. Missing and foreign resources return 404. Client-supplied ownership, score and profile fields are rejected. Existing disabled-account/session-revocation checks apply to every route. Both new models initialize their unique indexes before the server accepts requests.

API routes (all require authentication):

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/jobs` | Most recent 100 owned job descriptions, without source text |
| POST | `/api/jobs` | Extract/save `{text}` |
| POST | `/api/jobs/upload` | Extract/save one multipart `file` (.txt) |
| GET | `/api/jobs/:jobId` | Owned job including original text |
| GET | `/api/jobs/reports` | Most recent 100 owned complete reports |
| POST | `/api/jobs/reports` | Calculate/save `{jobId, resumeId}` |
| GET | `/api/jobs/reports/:reportId` | Owned historical report |

## AI extraction and failure handling

Gemini receives only job text, not candidate data, for Phase 3 extraction. JSON mode, a provider schema, zero temperature, a 60-second provider timeout and a 65-second service deadline are used. Backend validation rejects malformed JSON, extra/missing fields, invalid types, oversized arrays/strings and facts without a bounded verbatim occurrence in the source. Missing fields use empty strings/arrays. AI prompt instructions treat source text as untrusted data. Classification of a stated skill as required or preferred remains an AI interpretation and must be reviewed against the source.

Input is limited to 20–30,000 characters. File uploads are bounded in memory, limited to one UTF-8 `.txt` file of at most 120,000 bytes, and never written to disk. Binary/control-character content and malformed UTF-8 are rejected. The existing PDF upload/validation pipeline for resumes is unchanged.

Same-owner normalized source text hashes deduplicate saved jobs. Concurrent identical extractions share a bounded in-process promise. A MongoDB unique index resolves cross-process save races; multiple API processes may still perform duplicate AI calls. Failed extraction saves no invalid job and permits an explicit retry. Extraction routes share a 15-request/minute/user limit; report generation has a 60-request/minute/user limit. Existing rate limiting is process-local. Report uniqueness includes owner, job, resume, profile revision and algorithm version; duplicate report creates return the saved report.

## Deterministic score (algorithm version 1)

| Factor | Base weight | Calculation |
| --- | ---: | --- |
| Required skills | 60 | Mean skill credit |
| Preferred skills | 15 | Mean skill credit |
| Project relevance | 15 | Fraction of distinct job skills explicitly mentioned in saved project names, descriptions or technologies |
| Experience relevance | 10 | Fraction of distinct job skills explicitly mentioned in saved role or work description |

Full credit (1): an exact normalized skill or explicit alias is listed above Beginner level, or is explicitly named in a project/work entry. Partial credit (0.5): a Beginner skill listing without applied evidence. Missing evidence receives 0. Skill labels, credit, reasons and supporting entries are included in each report. Skill aliases are intentionally small and explicit (e.g. Node.js/nodejs, JS/JavaScript); substring matching cannot turn JavaScript into Java or C++ into C. Duplicate requirements, including aliases, count once. Required takes precedence when a skill is also preferred.

Factors whose **job requirement category is absent** are excluded, and remaining base weights are normalized to 100%. A missing candidate section receives zero rather than being excluded. The final score is the rounded sum of factor points. No explicit job skills means `score: null`, not a misleading 0 or 100. Responsibilities are extracted for review but not scored. Each factor displays raw coverage, effective weight, points and calculation reason. The dashboard uses accessible meters and text status labels, and a comparison table distinguishes saved profile revisions.

Recommendations prioritize required gaps, then preferred gaps, suggest truthful examples for partial skills, and name existing relevant projects/work to highlight with verified contributions/outcomes. Suggestions never invent candidate accomplishments. Compatibility is preparation guidance and never guarantees ATS success, interviews or selection.

## Validation results (2026-11-03)

- Backend `npm test`: **78 passed, 0 failed** after implementation. Tests use repository/model doubles and real local HTTP requests, not a live MongoDB or Gemini account.
- Frontend `npm test`: **22 passed, 0 failed**. Includes server-rendered report output/escaping, accessible meters, missing information, client payloads, saved-report reload and error propagation, plus existing Phase 2/session regression tests.
- Frontend `npm run lint`: passed.
- Frontend `npm run build`: passed (Vite production bundle).
- Backend syntax checks and `git diff --check`: passed. The backend has no configured lint script.
- Initial sandboxed backend HTTP tests could not connect to localhost (`EACCES`); rerunning outside the sandbox enabled the HTTP suite. An initial new test fixture omitted the account lookup stub; it was corrected before the successful full run.

## Remaining limitations

- Uploads accept `.txt`; PDF/DOCX job descriptions must be pasted or converted to text first.
- Matching is explicit lexical evidence with a small alias dictionary, not semantic understanding. It does not assess responsibility fulfillment, negation, years of experience, seniority, education eligibility, recency or actual proficiency. A listing is not an independent skills assessment.
- AI extraction classification can be wrong despite source grounding. The UI exposes original text and extracted facts for review; job correction/deletion is not part of this version. A revised source can be saved as a new job.
- Job/report lists show the latest 100 entries. Older report/job resources remain accessible by their owned IDs; pagination/search is not implemented.
- In-process extraction coalescing and rate limits require shared coordination before scaling. Database uniqueness protects saved records, not provider billing across processes.
- No live MongoDB persistence, real-provider execution or interactive browser end-to-end test was performed. Persistence is covered with repository doubles, Mongoose index assertions and HTTP wiring tests. No mock interviews, adaptive learning, RAG or unrelated features were added.

## Phase 3 files

Added: `backend/models/JobDescription.js`, `backend/models/MatchReport.js`, `backend/schemas/jobDescription.js`, `backend/services/jobIntelligence.js`, `backend/services/jobMatching.js`, `backend/routes/jobRoutes.js`, `backend/tests/jobs.test.js`, `frontend/src/lib/jobs.js`, `frontend/src/pages/JobDashboard.jsx`, `frontend/src/components/MatchReportView.jsx`, `frontend/tests/jobs.test.js`, `docs/PHASE_3.md`.

Updated: `backend/app.js`, `backend/server.js`, `backend/services/geminiService.js`, `frontend/src/App.jsx`, `frontend/src/components/Navbar.jsx`, `frontend/src/index.css`.
