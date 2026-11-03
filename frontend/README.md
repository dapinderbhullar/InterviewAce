# InterviewAce frontend

The React interface for InterviewAce provides authentication, resume uploads and analysis, private notes, editable Resume Intelligence Profiles, job matching, mock interviews and adaptive learning.

From the repository root:

```powershell
npm ci --prefix frontend
npm run dev --prefix frontend
npm test --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
```

Run the backend in a separate terminal. Development proxies `/api` to `http://localhost:5000`. For another backend, configure `VITE_API_BASE_URL` (including `/api`) using [the example configuration](.env.example). Only public configuration belongs in `VITE_` variables; never put a Gemini key or JWT secret there. A deployed SPA requires fallback routing and an API reverse proxy or an explicit backend URL.

The browser title and shared navigation use **InterviewAce**. Keep that spelling in future UI and documentation updates. Existing route paths and session storage identifiers remain stable.

See the [project README](../README.md) for architecture, models, setup, security, workflows, limitations and screenshot placeholders. The [phase documents](../docs/) retain implementation-specific details and historical verification results.
