import bcrypt from 'bcryptjs';
import {randomBytes, createHash} from 'node:crypto';
import {transaction} from './db.js';
import {deadlines, budgets} from './sla.js';

// This fixture is strictly opt-in. Never enable it with real customer data.
export const DEMO_AGENTS = [
  'Meera Nair', 'Ananya Menon', 'Rahul Iyer', 'Aisha Khan', 'Vivek Nair',
  'Priya Shah', 'Arjun Kumar', 'Neha Thomas', 'Kiran Rao'
].map((name, index) => ({
  name,
  email: 'agent' + (index + 1) + '@arvo.example'
}));

const SUBJECTS = [
  'Unable to access the project workspace',
  'Invoice PDF download returns an error',
  'Two-factor authentication recovery request',
  'Customer dashboard is not loading',
  'Unable to invite a new team member',
  'Exported report is missing recent entries',
  'Password reset email has not arrived',
  'Duplicate notifications in the activity feed',
  'Payment confirmation is not appearing',
  'Incorrect timezone in account settings',
  'API request returns a 403 response',
  'Request to update billing contact details',
  'Slow response when opening large records',
  'File attachment fails during upload',
  'Application freezes on the analytics page',
  'Question about monthly subscription limits',
  'Webhook deliveries appear to be delayed',
  'User access needs to be revoked',
  'Data import stalled at the validation stage',
  'New customer onboarding checklist request',
  'Unexpected session sign-out during work',
  'Search results omit an active project',
  'Mobile layout is misaligned',
  'Clarification about data retention policy',
  'Email notification preferences do not save',
  'A team member cannot view an assigned task',
  'CSV upload rejects a valid date field',
  'Help with configuring a custom domain',
  'Account locked after repeated login attempts',
  'Audit export request from operations',
  'Customer portal displays an older ticket status',
  'Integration token rotation guidance',
  'Quarterly usage report request',
  'Intermittent error when submitting a form',
  'Cannot remove a previous collaborator',
  'General question about upcoming maintenance'
];

const NAMES = [
  'Sonia Mathew', 'Deepak Pillai', 'Ishita Das', 'Farhan Ali', 'Rohit Varma',
  'Tara Joseph', 'Nikhil Das', 'Sara Paul', 'Aparna Babu', 'Kabir Mehta',
  'Leena Roy', 'Manu George'
];


export async function seedDemoStaff() {
  if (process.env.DEMO_MODE !== 'true') return;
  const agentPassword=process.env.DEMO_AGENT_PASSWORD;
  const adminPassword=process.env.DEMO_ADMIN_PASSWORD;
  if (agentPassword && agentPassword.length >= 12) {
    const hash=await bcrypt.hash(agentPassword,12);
    await transaction(async db=>{
      for(const staff of DEMO_AGENTS){
        const email=staff.email.replace('@arvo.example','@arvo.com');
        await db.query("INSERT INTO agents(name,email,password_hash,role) VALUES($1,$2,$3,'agent') ON CONFLICT(email) DO NOTHING",[staff.name,email,hash]);
      }
    });
  }
  if (adminPassword && adminPassword.length >= 12) {
    const hash=await bcrypt.hash(adminPassword,12);
    await transaction(async db=>{
      await db.query("INSERT INTO agents(name,email,password_hash,role) VALUES('Arvo Administrator',$1,$2,'admin') ON CONFLICT(email) DO UPDATE SET role='admin'",['admin@arvo.com',hash]);
    });
  }
}

export async function seedDemoData() {
  if (process.env.DEMO_MODE !== 'true') return;
  const password = process.env.DEMO_AGENT_PASSWORD;
  if (!password || password.length < 12) {
    console.warn('DEMO_MODE is enabled but DEMO_AGENT_PASSWORD (12+ chars) is missing; demo data was not created.');
    return;
  }
  const hash = await bcrypt.hash(password, 12);
  const now = Date.now();
  await transaction(async db => {
    // Serialize concurrent app instances and avoid duplicating tickets on redeploy.
    await db.query('SELECT pg_advisory_xact_lock($1)', [71402912]);
    await db.query('CREATE TABLE IF NOT EXISTS demo_seed_runs (seed_key TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const {rows: existing} = await db.query('SELECT seed_key FROM demo_seed_runs WHERE seed_key=$1', ['arvo-v1']);
    if (existing.length) return;

    const agents = [];
    for (const agent of DEMO_AGENTS) {
      const result = await db.query(
        'INSERT INTO agents (name,email,password_hash) VALUES($1,$2,$3) ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name RETURNING id',
        [agent.name, agent.email, hash]
      );
      agents.push(result.rows[0].id);
    }

    for (let i = 0; i < SUBJECTS.length; i++) {
      const priority = i % 7 === 0 ? 'high' : i % 3 === 0 ? 'low' : 'medium';
      const status = i % 9 === 0 ? 'open' : i % 9 === 1 ? 'waiting' : i % 9 === 2 ? 'resolved' : i % 9 === 3 ? 'closed' : 'in_progress';
      const createdAt = new Date(now - (i % 12 + 1) * 86400000 - (i % 5) * 3600000);
      const responseAt = new Date(createdAt.getTime() + 35 * 60000);
      const d = deadlines(priority, createdAt);
      const assignedId = status === 'open' ? null : agents[(i + 1) % agents.length];
      const waitingAt = status === 'waiting' ? new Date(now - (i % 4 + 1) * 86400000) : null;
      const resolvedAt = ['resolved', 'closed'].includes(status) ? new Date(now - (i % 6 + 1) * 86400000) : null;
      const closedAt = status === 'closed' ? new Date(now - 86400000) : null;
      const customerName = NAMES[i % NAMES.length];
      const customerEmail = 'customer' + (i + 1) + '@example.invalid';
      const tokenHash = createHash('sha256').update(randomBytes(32)).digest('hex');
      const remaining = waitingAt ? budgets[priority].resolution * 60000 : null;
      const result = await db.query(
        `INSERT INTO tickets
        (subject,description,customer_name,customer_email,customer_token_hash,priority,status,assignee_id,first_response_at,first_response_due,resolution_due,remaining_resolution_ms,waiting_since,resolved_at,closed_at,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
        [
          '[DEMO] ' + SUBJECTS[i],
          'Sample request for the Arvo Systems support demonstration. This issue is fictional and contains no real customer information. Please investigate the reported behaviour and document the next steps.',
          customerName, customerEmail, tokenHash, priority, status, assignedId,
          assignedId ? responseAt : null, d.first_response_due, status === 'waiting' ? null : d.resolution_due,
          remaining, waitingAt, resolvedAt, closedAt, createdAt, new Date(now)
        ]
      );
      const ticketId = result.rows[0].id;
      await db.query(
        'INSERT INTO ticket_events(ticket_id,actor_type,actor_id,event_type,metadata,created_at) VALUES($1,$2,$3,$4,$5,$6)',
        [ticketId, 'customer', null, 'created', JSON.stringify({demo:true}), createdAt]
      );
      if (assignedId) {
        await db.query(
          'INSERT INTO ticket_events(ticket_id,actor_type,actor_id,event_type,metadata,created_at) VALUES($1,$2,$3,$4,$5,$6)',
          [ticketId, 'agent', assignedId, 'claimed', JSON.stringify({demo:true}), new Date(createdAt.getTime() + 10 * 60000)]
        );
        await db.query(
          'INSERT INTO messages(ticket_id,actor_type,actor_id,body,is_internal,created_at) VALUES($1,$2,$3,$4,$5,$6)',
          [ticketId, 'agent', assignedId, 'Thanks for reaching out. We have reviewed your request and are checking the next steps.', false, responseAt]
        );
        await db.query(
          'INSERT INTO ticket_events(ticket_id,actor_type,actor_id,event_type,metadata,created_at) VALUES($1,$2,$3,$4,$5,$6)',
          [ticketId, 'agent', assignedId, 'public_reply', JSON.stringify({demo:true}), responseAt]
        );
        if (i % 4 === 0) {
          const noteAt = new Date(responseAt.getTime() + 10 * 60000);
          await db.query(
            'INSERT INTO messages(ticket_id,actor_type,actor_id,body,is_internal,created_at) VALUES($1,$2,$3,$4,$5,$6)',
            [ticketId, 'agent', assignedId, 'DEMO INTERNAL NOTE: Verify the account configuration before sending further guidance.', true, noteAt]
          );
          await db.query(
            'INSERT INTO ticket_events(ticket_id,actor_type,actor_id,event_type,metadata,created_at) VALUES($1,$2,$3,$4,$5,$6)',
            [ticketId, 'agent', assignedId, 'internal_note', JSON.stringify({demo:true}), noteAt]
          );
        }
        if (status !== 'in_progress') {
          await db.query(
            'INSERT INTO ticket_events(ticket_id,actor_type,actor_id,event_type,metadata,created_at) VALUES($1,$2,$3,$4,$5,$6)',
            [ticketId, 'agent', assignedId, 'updated', JSON.stringify({demo:true,status:{from:'in_progress',to:status}}), waitingAt || resolvedAt || closedAt]
          );
        }
      }
    }
    await db.query('INSERT INTO demo_seed_runs(seed_key) VALUES($1)', ['arvo-v1']);
  });
  console.log('Arvo demo dataset is ready (9 agents and 36 sample tickets).');
}
