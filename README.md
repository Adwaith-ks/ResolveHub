# ResolveHub

A full-stack support ticket platform for Arvo Systems. ResolveHub replaces shared spreadsheets with a searchable agent queue, customer portal, SLA deadlines, and traceable ticket history.

**Live site:** https://resolvehub-app.onrender.com

## Features

- **Staff:** agent and administrator login; ticket queue, claim, priority, status, public replies, private notes, SLA dashboard, and activity history. Administrators can view the team directory and ticket workload.
- **Customers:** registration, login, own-ticket dashboard, create tickets, choose category and priority, attach a PDF/PNG/JPEG, read public conversations, reply, and request reopening when eligible.
- **Security:** bcrypt password hashes; signed HS256 JWTs in Secure/HttpOnly/SameSite cookies with database-backed revocation; backend role and ticket-owner checks; private notes excluded from all customer endpoints; parameterized SQL.
- **Incidents:** conditional atomic ticket claiming (409 on a competing claim), strict customer-facing note filtering, and append-only audit events protected by a PostgreSQL trigger.
- **SLA:** India business hours Monday–Friday 09:30–18:30 IST, configured holidays, pause on waiting for customer, resume on reply, and automatic closure after five working days of waiting.

## Stack

React 19 + Vite; Node.js 20+ + Express + Zod; PostgreSQL + `pg`; bcryptjs; GitHub Actions; Render Blueprint. The project uses **SQL directly**, not Prisma.

## Project layout

- `client/src/main.jsx` — staff dashboard, authentication and agent ticket UI
- `client/src/CustomerPortal.jsx` — customer ticket screens
- `client/src/styles.css`, `client/src/customer.css` — responsive design
- `server/index.js` — API routes and authorization
- `server/schema.sql` — schema with additive, idempotent SQL updates
- `server/db.js` — database connection, initialization and optional initial staff account
- `server/customer-jwt.js` — customer and staff signed token helpers
- `server/attachments.js` — attachment content validation and safe download
- `server/closure.js` — automatic closure of expired customer waits
- `server/demo.js` — optional demo accounts and fictional tickets
- `server/*.test.js` — security, SLA, demo and API integration tests
- `render.yaml` — Node web service and PostgreSQL database

## Local development

1. Install Node.js 20+ and PostgreSQL 14+; create database `resolvehub`.
2. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/Adwaith-ks/ResolveHub.git
   cd ResolveHub
   npm install
   ```
3. Copy `.env.example` to `.env`. Set `DATABASE_URL`, a random 32+-character `SESSION_SECRET`, `SEED_AGENT_EMAIL`, and `SEED_AGENT_PASSWORD` (minimum 12 characters).
4. Run `npm run dev`; open http://localhost:5173.

The backend loads `server/schema.sql` at startup. There is no separate versioned migration command yet. `SEED_AGENT_EMAIL` creates a staff user only when the email does not already exist; changing `SEED_AGENT_PASSWORD` later does not reset an existing account.

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run Express and Vite in development |
| `npm run dev:server` | Run only Express |
| `npm run dev:client` | Run only Vite |
| `npm start` | Start the production Express server |
| `npm run build` | Build React into `dist/` |
| `npm test` | Run Node tests; database tests require `TEST_DATABASE_URL` |
| `npm run check` | Run tests and production build |
| `npm run smoke:deploy` | Read-only verification of public deployment |

## Roles and demo accounts

All real passwords are stored as bcrypt hashes in PostgreSQL; never place passwords in frontend source, Git commits, or a public README.

With `DEMO_MODE=true`:
- `admin@arvo.com` is seeded **only if** `DEMO_ADMIN_PASSWORD` is set to at least 12 characters.
- `agent1@arvo.com` through `agent9@arvo.com` are seeded when `DEMO_AGENT_PASSWORD` is set to at least 12 characters.
- For compatibility with the previous demonstration, `agent1@arvo.example` through `agent9@arvo.example` and 36 fictional `[DEMO]` tickets remain supported.
- Staff insertion is idempotent; demo tickets are created once per database. Seed values do **not** overwrite existing passwords.

For **isolated local demonstrations only**, you may set `DEMO_ADMIN_PASSWORD=AdminPassword123!` and `DEMO_AGENT_PASSWORD=AgentPassword123!`. These are publicly documented sample passwords: **never use them on the internet-facing Render service**. Choose unique private values on Render and rotate them when the demo ends. Demo staff can access ticket data; use a disposable database for public evaluations.

Registered customers create their own passwords through the registration form and have a `customer` role. Staff accounts have `agent` or `admin` roles.

## API

- Auth: `POST /api/auth/register` (customer), `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`.
- Customer portal (authenticated): `GET /api/customer/tickets`, `POST /api/customer/tickets`, `GET /api/customer/tickets/:id`, `POST /api/customer/tickets/:id/reply`, `POST /api/customer/tickets/:id/reopen`, `GET /api/customer/tickets/:id/attachments/:attachmentId`.
- Staff (authenticated): `GET /api/tickets`, `GET /api/tickets/:id`, `POST /api/tickets`, `POST /api/tickets/:id/claim`, `PATCH /api/tickets/:id`, `POST /api/tickets/:id/messages`, `GET /api/tickets/:id/attachments/:attachmentId`.
- Administrator only: `GET /api/admin/agents`.
- Backward-compatible public token API: `/api/public/tickets` endpoints are retained for existing integrations. A bearer ticket token is required to read/reply/reopen those tickets.

Customer ownership is verified by `customer_id` in database queries. Internal notes are never included in customer ticket responses. Attachments are optional and stored in PostgreSQL with a maximum **2 MiB**, restricted to valid PDF/PNG/JPEG signatures. Download endpoints verify staff or matching customer identity.

## Business rules and assumptions

| Priority in database | UI label | First response | Resolution |
| --- | --- | --- | --- |
| `high` | Critical | 120 working minutes | 540 working minutes |
| `medium` | Medium | 270 working minutes | 1620 working minutes |
| `low` | Low | 540 working minutes | 2700 working minutes |

All amounts are **working minutes** (one working day = 540 minutes). This explicitly interprets "same working day" as a 540-minute working-time budget, not necessarily before the end of the calendar date; an issue received near closing may have a deadline the following day. This and priority changes were ambiguous in the meeting. A priority change currently recalculates the active SLA from the change time; for a waiting ticket, it resets the remaining resolution budget to the new priority. Configure excluded dates using comma-separated `HOLIDAYS=YYYY-MM-DD,YYYY-MM-DD`.

Waiting on a customer pauses the resolution SLA. When the customer responds, the remaining time resumes. The background check closes tickets that have waited at least 2,700 working minutes, checking at startup and every 15 minutes; automatic closure may occur up to 15 minutes after the threshold. A resolved ticket may be reopened within five working days. Audit history is appended to `ticket_events`; an SQL trigger rejects updates and deletes, but privileged database administrators can still change database structures.

## Render deployment

The root `render.yaml` Blueprint deploys `resolvehub-app` (Express serving the React production build) and `resolvehub-db` (PostgreSQL). Render injects `DATABASE_URL` from the database and generates `SESSION_SECRET`. On the web service, configure all password variables privately:

- `SEED_AGENT_EMAIL` / `SEED_AGENT_PASSWORD` for the initial staff account.
- `DEMO_MODE=true`, `DEMO_AGENT_PASSWORD`, and `DEMO_ADMIN_PASSWORD` only for an isolated demonstration.

Sync the Blueprint to apply environment configuration changes, then inspect the web-service deployment and logs. New commits to `main` trigger deployments when auto-deploy is enabled. Render free-plan instances can sleep; verify current plan restrictions and database retention before committing important customer data.

To check availability, run `npm run smoke:deploy`; or use **GitHub Actions → Deployment smoke check**. This verifies homepage, health API, PostgreSQL readiness (`GET /api/ready`), and unauthenticated access denial, not full production database workflows.

## Known limitations / future work

- No dedicated customer email notifications or automated customer-token delivery.
- No password-reset/email-verification flow, CSRF token protection, or persistent distributed request rate limiting.
- Attachments are stored in PostgreSQL, not object storage; upload limits are deliberately small, and antivirus/content scanning is not implemented.
- Admins can monitor staff, but staff creation/editing is currently via seed/configuration rather than an admin settings UI.
- The schema uses additive startup SQL, not versioned production migration tooling.
- Automatic closure runs inside the web process. For robust scheduling across outages, use a separate scheduled worker.
- The health endpoint reports API liveness; `/api/ready` checks database connectivity but does not exercise the full ticket workflow. Use authenticated end-to-end tests and backups before real customer use.
- Some original ambiguous SLA rules are documented above and should be approved by Arvo before production use.
