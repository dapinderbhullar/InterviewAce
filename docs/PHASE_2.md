# InterviewAce — Phase 2: Resume Intelligence Engine

This document records the scope and verification of this implementation phase. For the combined current application, setup and feature status, see the [InterviewAce README](../README.md).

## Scope and reuse

This phase adds resume intelligence to the existing MERN application. Authentication/session revocation, uploads and their compatibility endpoints, ownership checks, PDF validation, notes, existing resume analysis/ATS feedback/question generation remain in place. No job-description matching, mock-interview session, learning analytics or RAG feature is added.

Reusable components: Resume, shared JWT/account middleware, upload/PDF validation, extractText, Gemini SDK integration and provider timeout, frontend authenticated Axios client/session guards, existing resume selection and navigation.

## Data model

CandidateProfile has one unique compound key (userId, resumeId). Each upload retains its own immutable resume ID, so different resume versions retain independent profiles, review decisions and corrections. Resume gains contentHash (SHA-256 of upload bytes); old records remain usable without backfill.

Profile fields:

- userId and resumeId: owner and source resume association.
- schemaVersion: extraction schema version (currently 1).
- status: processing, ready or failed.
- revision: optimistic edit revision; incremented after successful extraction and every saved correction.
- data: typed personal, education, experience, projects, achievements and skills subdocuments.
- sourceData: original unedited structured extraction, hidden from ordinary queries and all API responses.
- sourceHash: SHA-256 of extracted text; indexed with owner/schema/status for reuse.
- score: server-computed factors, individual checks, missing information, strengths and recommendations.
- model, generatedAt and timestamps: provenance.
- leaseToken (hidden), leaseUntil: conditional extraction ownership and recovery.
- failure and retryAfter: sanitized persisted failure state and one-minute retry cooldown.

Every extracted entity carries origin=resume, confirmed=false and evidence quotes with zero-based source character start/end offsets. Projects additionally carry technologies with their own evidence. Skills carry category, conservative estimated proficiency and a qualification note. User corrections set origin=user and confirmed=true while retaining original evidence for reference; manually supplied project technologies are explicitly marked user-provided with no invented evidence. Source data is never modified by edits.

Mongoose uses typed strict nested schemas and enums. Application validation independently enforces complete JSON shapes, rejects extra keys, checks lengths/counts/enums and anchors evidence before writing data. The unique profile index is awaited at server startup. No production index migration was executed during development.

## Extraction and evidence policy

The existing Gemini integration requests application/json with an explicit response schema, temperature zero, a bounded output and a 60-second provider timeout. Unknown facts must be empty; names, dates, descriptions and other factual values must be verbatim evidence substrings. Evidence quotes are matched against PDF text with whitespace/case tolerance and retain the actual source spans. Partial name matches (Java versus JavaScript) do not qualify. Unsupported facts or malformed JSON fail the entire extraction, rather than silently saving unverified data. Skill aliases are not expanded automatically.

Proficiency is an unverified estimate, not an assessment. A listing alone is conservatively labelled Beginner; Advanced is capped without explicit advanced/expert wording in evidence. User-selected levels are labelled accordingly. These rules cannot establish actual skill level or verify that the source resume is truthful. Anchoring verifies text occurrence, not every semantic relationship, so user review remains necessary.

Existing extractedText is reused. Byte-identical uploads reuse parsed text only from records owned by the same user. Otherwise a bounded child process reuses extractText (50-page/100000-character cap) with a 15-second timeout and V8 heap limit. An owned typed-array copy avoids an observed legacy PDF parser issue with asynchronous Buffer views. No user PDF is used as a test fixture.

Ready profiles are returned without regenerating or overwriting corrections. A unique per-resume profile plus a 120-second MongoDB lease prevents concurrent same-resume requests from both extracting. Active work returns 202. Expired leases can be recovered; final writes require the current lease token, so a superseded worker cannot overwrite a newer result. No transaction or external queue is required for the single-document commit.

Original ready extractions with matching owner/text hash/schema can be reused for another upload. A bounded in-process promise/cache also shares identical-text requests and covers the database commit window. Different users never share this data. Concurrent byte-identical uploads on DIFFERENT API processes with DIFFERENT resume IDs can still duplicate a first-time provider request; a distributed owner/hash job cache would close that remaining optimization gap.

A failed extraction persists sanitized state. Ordinary GETs and repeated POSTs do not automatically rerun failures. Explicit retries wait one minute. The AI wrapper has an additional deadline; failures do not become ready profiles. A process crash leaves a recoverable lease. Extraction is request-driven, not a durable background queue; an operator restart does not automatically resume it.

## API

All routes require shared JWT/account authentication. Every resume and profile read, update, cache lookup, lease acquisition and final commit is scoped to the authenticated user.

| Method | Route | Contract |
| --- | --- | --- |
| GET | /api/profiles/:resumeId | {profile: null} if not built, otherwise the saved profile; 404 for a foreign/missing resume |
| POST | /api/profiles/:resumeId/extract | {} or {retry: true}; 200 ready/cached, 202 active with Retry-After, or persisted failure response |
| PATCH | /api/profiles/:resumeId | {revision, section, index?, action, value?}; returns {profile} with next revision |

Actions are update, confirm and remove. Personal data has no index; list sections use an index guarded by the overall revision. Update values must contain exactly that section's editable fields. Evidence, owner, resume association, score, provenance, original source data and job state cannot be supplied by clients. Project technology edits use arrays of names, retaining existing evidence where appropriate and tagging newly supplied names as user facts.

Malformed inputs return 400. Missing/foreign resources return 404. Stale edits or lost leases return 409. Retry cooldown returns 429. PDF extraction failures return 422; malformed/unverified/provider failures return 502; AI timeouts return 504. The failure response includes {profile, message}; the saved failure can also be fetched after refresh. Cached reads never call Gemini.

## Dashboard and scoring

Open /profile through the Profile navigation link. Choose an uploaded resume version, then explicitly build its candidate profile. This action discloses transmission of resume text to Gemini. GET/page refresh never starts extraction. Processing state is polled; failed work can be retried after cooldown. Each version reloads its saved server profile rather than using transient dashboard results.

The dashboard displays all sections, categories, estimated proficiency, project technology evidence, source quotes, review status, strengths and missing information. Users can edit, confirm and remove entries. Corrections are persisted with optimistic concurrency and rescored; a 409 reloads current data instead of overwriting it. User/session changes retain the Phase 1.6 remount/cancellation guards.

The deterministic Resume Intelligence Score has four equally weighted 25-point factors, each with five visible five-point checks: completeness, skill presentation, project descriptions and experience presentation. Recommendations correspond to unmet checks. It is a presentation heuristic, not an ATS result or hiring prediction. Numeric-outcome checks are simple heuristics and can count numbers that are not meaningful results. Early-career candidates can score lower without experience; no experience is fabricated. Editing the profile does not change the uploaded PDF.

## Modified/new files in Phase 2

- backend/models/CandidateProfile.js; backend/models/Resume.js
- backend/schemas/candidateProfile.js
- backend/services/candidateProfiles.js; backend/services/resumeScore.js; backend/services/resumeText.js; backend/services/geminiService.js
- backend/workers/extractResumeText.js; backend/utils/extractText.js
- backend/controllers/profileController.js; backend/controllers/resumeController.js
- backend/routes/profileRoutes.js; backend/app.js; backend/server.js
- frontend/src/pages/ProfileDashboard.jsx; frontend/src/components/CandidateProfileView.jsx
- frontend/src/lib/profiles.js; frontend/src/App.jsx; frontend/src/components/Navbar.jsx; frontend/src/index.css
- backend/tests/profiles.test.js; backend/tests/helpers/candidate.js; frontend/tests/profiles.test.js
- docs/PHASE_2.md; README.md

## Verification scope

Commands: npm test --prefix backend; npm test --prefix frontend; npm run lint --prefix frontend; npm run build --prefix frontend; git diff --check.

Backend tests use isolated repositories/model doubles and synthetic PDFs, never an application MongoDB URI or live Gemini request. Tests cover multiple users and resume versions; source evidence and JSON schema validation; malformed AI responses; failed/empty PDF extraction; provider abort/deadline handling; ownership; actual HTTP authentication wiring; persisted edits after service recreation; optimistic conflicts; lease races and recovery; parsed-text/result reuse; deterministic scoring; actual Mongoose schema validation; and Gemini SDK request configuration.

Frontend tests render the real profile component to static HTML, exercise the real API facade and editor payload helpers, and simulate persistence across client recreation. Existing cross-tab/session/interceptor tests remain. These are not browser interaction/end-to-end tests. Database writes/indexes and concurrent leases have not been exercised against a live MongoDB instance, and real provider output quality remains unverified.

## Remaining limitations

Text-based PDFs only; no OCR/DOCX support. Strict verbatim facts can reject valid paraphrases or unsupported layouts, resulting in an explicit retryable failure. Extraction/refinement quality needs a human-reviewed corpus and live provider evaluation before production claims. HTTP server timeouts/reverse proxies must allow the bounded extraction request; polling can recover the saved result if the client disconnects.

The legacy PDF parser is isolated for this new extraction path but is not an OS sandbox or malware scanner. Limits are per process. AI quotas are request-based, not daily cost budgets. Separate identical uploads across separate API processes can duplicate first-time extraction. Existing resume listing exposes only the latest 100 records to the selector. Old unowned uploads remain inaccessible until reconciled or uploaded again. No automatic data migration, secret rotation or privacy-history cleanup is performed.

## Actual final results

| Command | Result | Relevant output |
| --- | --- | --- |
| npm test --prefix backend | PASS | tests 64; pass 64; fail 0 |
| npm test --prefix frontend | PASS | tests 18; pass 18; fail 0 |
| npm run lint --prefix frontend | PASS | eslint .; exit 0, no warnings |
| npm run build --prefix frontend | PASS | 87 modules transformed; built in 191ms; JS 279.65 kB (gzip 90.59 kB) |
| git diff --check | PASS | exit 0; LF/CRLF notice only |

The HTTP suite ran with localhost access after explicit user approval; earlier automatic approval attempts encountered reviewer capacity/deadline failures and did not execute. All failures injected by tests use isolated mocks. Live MongoDB/provider and full browser end-to-end verification were NOT RUN. The three pre-existing user PDFs were verified against their original SHA-256 hashes and remain unchanged. No production database or existing credential file was used or modified by the test runs.
