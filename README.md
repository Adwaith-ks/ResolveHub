# ResolveHub

**Support with clarity.** ResolveHub is an independent support-ticket application replacing scattered spreadsheets and chat messages with auditable support workflows.

## Features
- Restrained slate-and-teal React support workspace with searchable queues, operational metrics, priority filters, pagination, and a two-column ticket workspace.
- Agent authentication with bcrypt-hashed passwords and opaque HttpOnly session cookies.
- Race-safe claiming of unassigned tickets through a conditional PostgreSQL update.
- Public replies, private internal notes, and append-only ticket events.
- Priority-based response and resolution targets in business hours, Monday–Friday 09:30–18:30 IST (configurable holidays).
- Customer-scoped ticket access using individual bearer tokens, with replies and reopen actions.
- Status transitions: open → in progress → waiting/resolved; customer reply resumes a waiting ticket and recently resolved tickets can be reopened.

## Stack and architecture

| Layer | Implementation |
| --- | --- |
| Frontend | React 19, Vite, CSS |
| Backend | Node.js 20+, Express, Zod |
| Database | PostgreSQL with parameterized queries and explicit transactions |
| Authentication | bcrypt passwords, SHA-256-hashed random tokens |
| Test suite | Native Node.js test runner |
| Deployment | Render web service and PostgreSQL, GitHub Actions CI |

The React application talks to the Express API under `/api`. In development, Vite forwards these requests to Express; in production, Express serves the compiled frontend. PostgreSQL owns ticket state, messages, sessions, and audit events.

## Local setup

1. Install Node.js 20+ and PostgreSQL 14+.
2. Clone the repository, then run `npm install`.
3. Create a PostgreSQL database named `resolvehub`.
4. Copy `.env.example` to `.env`. Set `DATABASE_URL`, a fresh random `SESSION_SECRET` (at least 32 characters), `SEED_AGENT_EMAIL`, and a `SEED_AGENT_PASSWORD` of 12+ characters.
5. Run `npm run dev`. Open [http://localhost:5173](http://localhost:5173) and sign in with your configured agent.

The server creates the initial database schema and inserts an agent if the email does not exist. Updating the seed password later does not reset an existing agent.

### Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite and Express |
| `npm test` | Execute SLA and security unit tests |
| `npm run build` | Build the frontend into `dist/` |
| `npm run check` | Run tests and build |
| `npm run smoke:deploy` | Run read-only smoke checks against the deployed site (uses `DEPLOY_URL` when set) |
| `npm start` | Run Express in production |

## API routes

**Agent session required:** `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/tickets`, `GET /api/tickets/:id`, `POST /api/tickets`, `POST /api/tickets/:id/claim`, `PATCH /api/tickets/:id`, and `POST /api/tickets/:id/messages`.

**Customer API:** `POST /api/public/tickets` returns a ticket ID and a one-time access token. For `GET /api/public/tickets/:id`, `POST /api/public/tickets/:id/reply`, and `POST /api/public/tickets/:id/reopen`, set `Authorization: Bearer <customer_token>`. Customer responses exclude private messages and events.

### SLA budgets

| Priority | First response | Resolution |
| --- | --- | --- |
| High | 2 working hours | 1 working day |
| Medium | 4.5 working hours | 3 working days |
| Low | 1 working day | 5 working days |

Set `HOLIDAYS` to a comma-separated list of `YYYY-MM-DD` IST dates, if required.

## Render deployment

**Live application:** [https://resolvehub-app.onrender.com](https://resolvehub-app.onrender.com)

The existing `render.yaml` Blueprint describes two services in the **Adwaith-ks/ResolveHub** project:

- `resolvehub-app` — Node.js web service that runs the Express API and serves the production Vite bundle.
- `resolvehub-db` — isolated PostgreSQL database linked through Render's `DATABASE_URL` reference.

The Blueprint generates `SESSION_SECRET`. In the Render web service's environment settings, configure `SEED_AGENT_EMAIL` and `SEED_AGENT_PASSWORD` privately. The initial password must have at least 12 characters. **Seeding is insert-only:** changing `SEED_AGENT_PASSWORD` later does not reset the password of an existing agent.

To deploy a new code version, push to `main` and check the Render service's deployment dashboard. If Blueprint auto-sync is disabled, apply the Blueprint sync manually when infrastructure changes. Review any pricing and database retention limits in your Render account.

### Verify a deployment

The production-safe smoke test does not need credentials and performs only HTTP GET requests:

```bash
npm run smoke:deploy
# Alternative environment:
DEPLOY_URL=https://resolvehub-app.onrender.com npm run smoke:deploy
```

Checks:
1. `GET /api/health` responds with HTTP 200 and `{"status":"ok"}`.
2. `GET /api/auth/me` without credentials responds with HTTP 401.
3. `GET /` serves the HTML app entry point.

You can also run **Actions → Deployment smoke check → Run workflow** in GitHub. These checks verify reachability and basic authentication protection, **not** a database-backed end-to-end ticket workflow.

### Validation and production considerations

GitHub Actions `CI` provisions a disposable PostgreSQL 16 service and runs `npm run check`, covering Node tests, database-backed API smoke tests, and the Vite build. The live deployment was independently shown to serve the health endpoint, reject anonymous agent access, and display the login page.

The health endpoint does not currently query PostgreSQL. For any production launch that stores important customer data, confirm successful authenticated login and a full ticket workflow against the live deployment, configure backups and retention, review database-plan expiration/limits, and implement versioned database migrations. The current in-memory rate limiter is per process; multi-instance deployments require shared rate limiting. Customer access tokens must be delivered over a secure, private channel; they are shown only once.

## Authorship and scope

Project created for **Adwaith KS**, using the support-desk problem statement as the reference. This repository has its own source implementation, interface, and database; it is not a fork.
