# ResolveHub

**Support with clarity.** ResolveHub is an independent full-stack solution to the same helpdesk challenge as [Frontdesk](https://github.com/abinavdev/Frontdesk): replacing a shared spreadsheet and chat with auditable ticket management for support agents.

## Features
- Custom dark-violet React dashboard with searchable ticket queues, metrics, detail panel, priority and status controls.
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

`render.yaml` specifies one Node web service and one PostgreSQL database. Connect **Adwaith-ks/ResolveHub** to Render as a Blueprint, review the plan and billing, then set `SEED_AGENT_EMAIL` and `SEED_AGENT_PASSWORD` as private environment variables. Render generates `SESSION_SECRET`. Never use Frontdesk's production database, secrets, or login credentials.

## Validation status and limitations

The SLA and security unit tests passed in local Node.js execution. Full dependency installation, a complete frontend production build, database-backed integration tests, and live Render deployment have **not yet been verified**.

Before public production use, add login and public-ticket rate limiting, customer-token delivery, a versioned migration system, credential rotation, database-backed test coverage, and a scheduled job for expired customer waits. Confirm the final deployment's PostgreSQL TLS configuration.

## Authorship and scope

Project created for **Adwaith KS**, using the support-desk problem statement as the reference. This repository has its own source implementation, interface, and database; it is not a fork.
