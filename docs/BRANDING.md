# InterviewAce branding and repository review

The official project name is **InterviewAce**. The root [project instructions](../AGENTS.md) record this rule for future agent work. Product version suffixes and spaced variants have been removed from current text. Phase numbers remain implementation labels, not product names.

## Files updated in this branding pass

- Root: `README.md`, `AGENTS.md` (added), `.gitignore`, `package.json`, `package-lock.json`.
- Backend: `backend/package.json`, `backend/server.js`.
- Frontend metadata/assets: `frontend/README.md`, `frontend/index.html`, `frontend/package.json`, `frontend/public/favicon.svg`.
- Frontend UI: `frontend/src/components/Navbar.jsx`, `frontend/src/components/ProtectedRoute.jsx`, `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Login.jsx`, `frontend/src/pages/Register.jsx`.
- Documentation: `docs/FOUNDATION.md`, `docs/PHASE_1_6.md`, `docs/PHASE_2.md`, `docs/PHASE_3.md`, `docs/PHASE_4.md`, `docs/phase-5-learning.md`, and this review.

All prior implementation work is retained. Application routes, database fields, collection/model names, session storage keys and provider behavior were not changed by the branding pass.

## Documentation changes

The root README now covers the problem and objectives, features across Phases 1–5, stack, architecture diagrams, repository layout, database relationships, AI workflows, authentication/security, local installation, environment variables, run commands, testing, screenshot placeholders, limitations and proposed improvements. It distinguishes persisted structured feature records from browser-state legacy dashboard results.

The frontend README now describes all current screens and links to the main setup guide. Phase documents have consistent InterviewAce titles and explicit historical-scope notices. The foundation roadmap is labelled historical rather than presented as the current missing-feature list. Existing documents and historical images are preserved.

## GitHub and repository configuration

- Existing fetch/push remote: `https://github.com/dapinderbhullar/InterviewAce-.git`.
- The trailing hyphen is part of the existing repository slug; no remote URL or repository name was changed.
- README clone instructions use that remote and select `InterviewAce` as the local destination. Package repository metadata uses the same remote.
- No repository was created, code pushed, Git history rewritten, or content published. Hosted GitHub About/settings were not changed or independently verified. A suggested InterviewAce About description is included in the README.
- Ignore rules cover real environment files and variants, dependencies, build output, coverage, caches, logs and common private-key formats. `.env.example` files remain distributable.
- Backend/frontend example environment files contain replacement placeholders and non-secret local defaults; existing private environment files were not changed.

## Credential review and retained assets

A local pattern scan inspected tracked/current non-ignored files and reachable historical Git blobs for common API keys, tokens, private keys, database credentials and assigned secrets. Matches were reviewed as synthetic JWT secrets used by HTTP test fixtures. No live credential was identified by this scan. Pattern scanning is not a guarantee that arbitrary secret formats are absent.

Three resume PDFs are already tracked under `backend/uploads/`; ignore rules do not remove them or their history. They were preserved under the instruction to retain existing work. They need a separate privacy review before any publication. Historical screenshots may also contain sample/user details and must be reviewed before reuse.

## Verification

After the branding edits:

| Check | Result |
| --- | --- |
| Backend tests | 111 passed, 0 failed |
| Frontend tests | 32 passed, 0 failed |
| Frontend ESLint | Passed |
| Frontend production build | Passed |
| `git diff --check` | Passed |
| Current-text search for spaced/versioned project names and former dashboard title | No matches |
| Environment/dependency/generated-file ignore checks | Passed; examples remain unignored |

Tests use repository/provider doubles and temporary HTTP servers; no live Gemini or MongoDB validation or full browser end-to-end run was performed.

## Intentionally retained technical or historical names

The local checkout directory, Git remote slug, lowercase npm/database identifiers and internal `backend`/`frontend` package names remain technical identifiers. The root npm name is now `interviewace`, avoiding a name inferred from the checkout directory. Package descriptions consistently use InterviewAce. Standard semantic package/dependency versions do not form part of the product name.

The earlier dashboard title survives only inside preserved historical screenshots, which the README labels as historical. Unused Vite/React starter assets and CSS selectors retain vendor names; the active browser favicon is now InterviewAce, and those vendor names are not alternate product identities. Git history may retain earlier text because history was not rewritten. Current source documentation has no spaced or versioned alternative project name.
