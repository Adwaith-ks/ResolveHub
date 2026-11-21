CREATE TABLE IF NOT EXISTS agents (
 id BIGSERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, agent_id BIGINT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tickets (
 id BIGSERIAL PRIMARY KEY, subject VARCHAR(160) NOT NULL, description TEXT NOT NULL,
 customer_name VARCHAR(120) NOT NULL, customer_email TEXT NOT NULL,
 customer_token_hash TEXT NOT NULL UNIQUE,
 priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','waiting','resolved','closed')),
 assignee_id BIGINT REFERENCES agents(id),
 first_response_at TIMESTAMPTZ, first_response_due TIMESTAMPTZ,
 resolution_due TIMESTAMPTZ, remaining_resolution_ms BIGINT,
 waiting_since TIMESTAMPTZ, resolved_at TIMESTAMPTZ, closed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets(status,created_at DESC);
CREATE INDEX IF NOT EXISTS tickets_assignee_idx ON tickets(assignee_id,status);
CREATE TABLE IF NOT EXISTS messages (
 id BIGSERIAL PRIMARY KEY, ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
 actor_type TEXT NOT NULL CHECK(actor_type IN ('agent','customer')),
 actor_id BIGINT, body TEXT NOT NULL, is_internal BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ticket_events (
 id BIGSERIAL PRIMARY KEY, ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
 actor_type TEXT NOT NULL, actor_id BIGINT, event_type TEXT NOT NULL,
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
