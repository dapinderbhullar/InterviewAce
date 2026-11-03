# InterviewAce — Phase 1.6 security remediation

This document records the scope and verification of this implementation phase. For the combined current application, setup and feature status, see the [InterviewAce README](../README.md).

## Scope and compatibility

This is an incremental change to the existing MERN application. Both upload endpoints, existing AI response keys, note APIs and upload response fields (message/file/path/resumeId) remain supported. No production database is used by tests, and no historical user record or resume PDF is migrated/deleted.

## Authentication/session policy

Every private route now verifies the JWT signature/expiry, account existence, disabled status, and session version. A missing or disabled account returns 401. A failed account lookup returns 503 without permitting the request. /api/auth/me uses that same verified account and returns only _id/name/email.

Tokens still expire after seven days. New tokens contain sv, copied from User.sessionVersion. Historical tokens without sv are treated as version zero; historical users without the field also default to zero. Incrementing an account's sessionVersion revokes all its previously issued tokens on subsequent authenticated requests. Setting disabled=true blocks login and private requests. These administrative actions have no public mutation endpoint in this phase.

Browser logout clears the local session and synchronizes other open tabs; it is NOT server-side single-token revocation. A copied token remains valid until expiry, account disable/deletion, version increment, or secret rotation. Requests already authorized and in flight are not retroactively undone.

Changing JWT_SECRET invalidates ALL existing tokens immediately on servers using the new secret. There is no dual-key rotation grace period; users must log in again. In multi-instance deployments, rotate consistently across instances.

## Upload policy and cleanup

The maximum is inclusive: 5 * 1024 * 1024 = 5,242,880 bytes. Multer's parser threshold is max+1 because its limit event fires at the threshold. Application validation independently enforces the exact maximum, and extraction/error messages share the same backend policy.

MIME type, .pdf extension and %PDF- signature are checked. A child process additionally validates the PDF header version, complete EOF/startxref trailer, xref target and successful parser opening of a document with pages. Invalid structure is rejected before any file or metadata is created. Validation accepts at most two concurrent children per API process, uses a ten-second timeout and a 128 MB V8 old-generation heap limit. Child processes receive no database, JWT or AI credentials. The installed parser failed on valid documents in worker_threads, so child-process isolation is used without adding dependencies.

A valid file is created through an exclusive wx handle. Partial write, close and database errors enter coordinated cleanup. The controller only unlinks a file after its own exclusive creation succeeded; collisions never delete pre-existing files. Unlink/close cleanup failures are logged with a fixed message, allowlisted error code, operation and generated UUID filename. Raw error messages, user filenames and paths are not logged. ENOENT cleanup is harmless. A failed cleanup can still leave an orphan and needs operational reconciliation; this change does not delete existing files to repair it.

Both upload aliases share one per-user limit of 20 attempts/minute, including invalid uploads. Resume history GET requests do not consume the upload budget. Existing 429 response and Retry-After are preserved.

## Password policy

Registration still requires at least eight characters and now explicitly caps new passwords at 72 UTF-8 bytes. Login preserves bcrypt's historical behavior for passwords longer than 72 bytes, including multibyte strings. The existing JSON request-size limit bounds input. This deliberately preserves legacy bcrypt truncation semantics rather than changing existing password hashes. Users should migrate long legacy passwords through a future password-change/reset flow.

## Cross-tab state and requests

A session store listens to storage token changes and notifies React through useSyncExternalStore. Local login/logout and remote tab changes increment a local session revision, clear resume selections, abort pending HTTP requests and remount the user-specific React subtree. Protected content is revalidated with /auth/me before display.

Requests capture the session synchronously. Both successful and error responses from previous sessions are discarded, including responses arriving before the browser dispatches the storage event. Old 401s cannot log out a newer user. Caller cancellation is forwarded. Cancelling HTTP on the client cannot undo server writes already in progress.

## Production configuration

Startup validates configuration before connecting to MongoDB. Known placeholder JWT secrets are rejected in every environment. Production requires a secret of at least 32 bytes with a basic character-diversity check; this is a guard, not proof of randomness. Generate a cryptographically random value, for example with Node crypto.randomBytes(48).toString('base64url'), and store it in a secret manager.

Production also requires an explicit FRONTEND_ORIGIN allowlist of exact HTTPS origins, without credentials, paths, wildcard origins or loopback hosts. Development retains the localhost:5173 default. PORT must be an integer from 1 through 65535. Secret values and connection strings are never included in validation errors. Existing .env credentials are not changed by this remediation.

## Changed implementation files

- backend/middleware/auth.js, backend/models/User.js, backend/routes/auth.js
- backend/controllers/resumeController.js, backend/middleware/upload.js, backend/middleware/errorHandler.js
- backend/config/uploadPolicy.js, backend/services/pdfValidation.js, backend/workers/validatePdf.js
- backend/app.js, backend/routes/resume.js, backend/routes/uploadRoutes.js, backend/utils/extractText.js
- backend/config/environment.js, backend/server.js
- frontend/src/lib/sessionStore.js, frontend/src/lib/session.js, frontend/src/lib/apiClient.js, frontend/src/lib/api.js
- frontend/src/context/AuthContext.jsx, frontend/package.json
- backend/tests/foundation.test.js, backend/tests/remediation.test.js, backend/tests/helpers/pdf.js
- frontend/tests/session.test.js, docs/FOUNDATION.md, docs/PHASE_1_6.md

## Regression coverage and commands

```powershell
npm test --prefix backend
npm test --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
git diff --check
```

Backend tests use explicit model doubles and temporary localhost HTTP servers, never server.js or an environment MongoDB URI. Existing upload tests create and clean only their synthetic UUID fixtures. New failure/boundary tests mock filesystem writes; PDF validation itself runs against generated valid, truncated and malformed documents. No user PDF is read as a parser fixture. Frontend tests exercise the real Axios interceptors/session store with fake storage events and controlled adapters, not a full browser.

Coverage includes deleted/disabled accounts on all private routes; fail-closed account lookup; session revocation and version-zero compatibility; filesystem/database/unlink errors and exclusive-open collisions; real structural parsing; inclusive size boundaries; shared rate budgets; legacy/new password policies; cross-tab session switching; stale success/error rejection; production configuration rejection; and child-process timeout/spawn failure.

## Remaining limitations

- No live MongoDB index/concurrency validation, provider smoke test or browser end-to-end run is performed. Existing sparse email uniqueness and historical reconciliation requirements remain.
- PDF validation is a structural safety gate, not malware detection, file sanitization, or an OS security sandbox. It opens the document and renders/parses one page; it does not validate every content stream. The legacy parser can reject otherwise valid unsupported PDFs. V8 limits do not cap every native allocation. Existing AI extraction should later move into a worker too.
- Rate limits are per process and not durable/distributed; AI requests still lack daily cost quotas and deduplication.
- Tokens remain in localStorage and are exposed to same-origin XSS; deploy an appropriate frontend CSP/HTTPS policy. No single-device server logout/revocation endpoint is added.
- A process crash between file creation and metadata commit can leave orphans; cleanup failure logging does not replace reconciliation.
- The three tracked historical PDFs and their Git history remain untouched and require separate privacy review.
- Strong production configuration must be supplied by the operator; this change does not rotate actual secrets or change deployment settings.

## Executed verification results

| Command | Result | Actual output |
| --- | --- | --- |
| npm test --prefix backend | PASS | tests 40; pass 40; fail 0 |
| npm test --prefix frontend | PASS | tests 10; pass 10; fail 0 |
| npm run lint --prefix frontend | PASS | eslint .; exit 0 |
| npm run build --prefix frontend | PASS | 84 modules transformed; built in 187ms; JS 269.08 kB (gzip 87.65 kB) |
| git diff --check | PASS | exit 0; only an LF/CRLF notice for backend/package.json |

The backend command initially encountered sandbox loopback EACCES errors. The permitted retry completed successfully. Logged Request failed: Error lines are intentional failure-path tests. No real database test was run.

| Issue | Previous failure | Implemented fix | Demonstrating regression |
| --- | --- | --- | --- |
| Account consistency | Deleted-account JWT accepted by notes | Shared live-account/disabled/version check; /me uses same account | Every private route rejects deleted/disabled accounts; unavailable lookups fail closed; old versions revoked (PASS, backend command) |
| Cleanup | Partial write bypassed cleanup; unlink errors swallowed | Exclusive handle and coordinated cleanup; sanitized failure logs | Partial write, database failure, unlink failure, collision preservation (PASS, backend command) |
| PDF structure | Five-byte prefix accepted | Bounded child-process structural parsing before saving | Valid, truncated, corrupt xref and malformed documents; no persistence on rejection (PASS, backend command) |
| Legacy passwords | Valid old long passwords rejected | Registration-only 72-byte cap; login retains bcrypt semantics | ASCII/multibyte legacy login; short/overlong new passwords; 72-byte registration (PASS, backend command) |
| Upload limits | Aliases had separate budgets | Shared per-user upload limiter | Exhaust one alias then both return 429/Retry-After; GET history does not spend budget (PASS, backend command) |
| Inclusive boundary | Exact 5 MiB rejected | Parser max+1 and independent application cap | max-1 and max return 201; max+1 returns 413 (PASS, backend command) |
| Cross-tab sessions | Stale state and old responses could survive account switch | Session revisions, React subtree remount, abort and response guards | Cross-tab/local login/logout; old success/error/401 handling; current expiry (PASS, frontend test command) |
| Configuration | Presence-only secret/origin validation | Production strength/origin validation and placeholder rejection | Invalid secrets/origins rejected without secret disclosure; valid config accepted (PASS, backend command) |
