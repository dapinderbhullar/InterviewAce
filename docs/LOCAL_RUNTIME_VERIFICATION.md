# InterviewAce local runtime verification

Verified on 3 November 2026. Existing application features, credentials and records were preserved. No database, collection, index or user record was dropped. No Git remote changes, commits or pushes were made.

## Startup diagnosis and repair

The previous terminal output was only `InterviewAce API startup failed: Error`; the server logged the error name without its stage or network cause. A fresh sanitized probe reproduced Atlas SRV DNS failure: `ETIMEOUT`, syscall `querySrv`. Gemini requests failed with `ENOTFOUND`; backend HTTP tests failed with loopback `EACCES`. Environment validation itself passed. The Atlas URI was loaded from `backend/.env`, with the `mongodb+srv` scheme, credentials, database and existing query options present; their values were not printed.

Running the same configuration outside the restricted command sandbox resolved Atlas DNS to three nodes, connected to MongoDB, and returned a real Gemini response. The runtime fix was to launch the existing npm scripts with permitted network access; no URI, credentials, DNS settings or database substitution was needed. The previous sparse log alone cannot establish more detail than the reproduced network failure.

`backend/server.js` now identifies the failing startup stage and a sanitized error code without dumping raw connection strings or provider errors. Startup awaits all ten current models' index initialization before opening HTTP, including the learning models previously omitted from the explicit startup sequence. It uses `Model.init()`, not destructive index synchronization. HTTP listen errors now reach the startup handler. The registration heading also received a line-height correction after visual review exposed overlapping wrapped text.

## Live results

- Backend: `npm start --prefix backend`; port 5000 loaded from configuration. Restart with updated startup code confirmed MongoDB connected and all model indexes initialized.
- Readiness: `GET /health/ready` returned HTTP 200 and `{"ready":true}` after restart.
- Frontend: `npm run dev --prefix frontend -- --host 127.0.0.1`; accessible at `http://localhost:5173`, HTTP 200. The existing Vite `/api` proxy targets port 5000.
- Gemini: existing `@google/generative-ai` integration, configured fallback `gemini-2.5-flash`. A minimal real generation returned `OK`. The actual authenticated job-extraction endpoint subsequently returned HTTP 201 and the saved job survived reload. This verifies generation access to that model; other models and sustained quota were not tested.
- Authentication: real UI registration and password login succeeded against Atlas. Authenticated dashboard and `/resume`, `/profile`, `/interviews`, `/learning`, `/jobs` loaded. Anonymous `/api/resume` returned HTTP 401.
- Browser: Playwright with installed Google Chrome, headless, 1440 × 1000, scale 1. Downloaded Chromium failed to spawn (`UNKNOWN`); installed Chrome worked. Browser console errors, page errors and HTTP error responses during the successful workflow: none.
- A synthetic `Portfolio Candidate` account and one explicitly synthetic sample job were added through the real application and retained. Its random password, token and email were not written to documentation or screenshots. Existing users and private resumes were not used.

## Automated checks

| Check | Result |
| --- | --- |
| Backend tests | 111 passed, 0 failed with loopback access; initial sandbox run failed HTTP cases with EACCES. |
| Frontend tests | 32 passed, 0 failed; rerun after heading fix. |
| Frontend ESLint | Passed. |
| Frontend production build | Passed. |
| Backend syntax | All 59 backend JavaScript files passed `node --check`. |
| Real backend startup and indexes | Passed after server changes. |
| Git whitespace checks | `git diff --check` passed; existing LF/CRLF notices are informational. |

## Screenshots and repeatability

Three genuine PNGs were opened for visual verification, with the registration page recaptured after its layout fix:

- `screenshots/01-authentication/login.png`
- `screenshots/01-authentication/register.png`
- `screenshots/04-job-matching/job-extraction.png`

All six requested phase directories exist. Other directories intentionally have no placeholder images. The README embeds only verified captures. These are a runtime verification gallery, not complete coverage of all five phases.

`docs/scripts/runtime-smoke.cjs` repeats readiness, UI registration/login, protected-page loading, real job extraction, reload persistence and screenshot capture. Pass the installed Playwright module directory and Chrome executable as its two arguments. It requires the backend/frontend already running and permitted loopback/provider network access. Every run adds a new synthetic account and sample job; it deletes nothing and prints no credentials.

## Remaining work and manual actions

No current MongoDB or Gemini configuration blocker remains. In restricted agent sessions, allow network access for the npm startup/tests and browser commands; ordinary terminals with working Atlas/Gemini access can use the README startup commands unchanged. No credential replacement or Atlas allowlist expansion was needed in this verification.

The full original gallery still requires a privacy-safe synthetic PDF and completion of resume extraction/editing/versioning, resume-job scoring, all interview types and evaluated adaptive practice. These were not executed in this runtime-focused smoke test; successful page loading does not establish their live end-to-end correctness. No manual account action is required to finish the runtime repair. The generated test account is retained, and its ephemeral password was not saved.
