import test from 'node:test';
import assert from 'node:assert/strict';

// Configure the pool before importing demo.js in the first test.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

test('demo fixture requires explicit activation', async () => {
  const prior = process.env.DEMO_MODE;
  delete process.env.DEMO_MODE;
  try {
    const {seedDemoData} = await import('./demo.js');
    await seedDemoData();
  } finally {
    if (prior === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = prior;
  }
});

test('demo accounts and tickets seed once with private notes', {skip: !process.env.TEST_DATABASE_URL, timeout: 45000}, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DEMO_MODE = 'true';
  process.env.DEMO_AGENT_PASSWORD = 'ci-demo-only-password-12345';
  process.env.DEMO_ADMIN_PASSWORD = 'ci-demo-admin-password-12345';
  const {initialize, query, close} = await import('./db.js');
  const {seedDemoData,seedDemoStaff, DEMO_AGENTS} = await import('./demo.js');
  try {
    await initialize();
    await seedDemoStaff();
    await seedDemoData();
    const first = await query("SELECT count(*)::integer AS count FROM tickets WHERE subject LIKE '[DEMO] %'");
    assert.equal(first.rows[0].count, 36);
    await seedDemoData();
    const second = await query("SELECT count(*)::integer AS count FROM tickets WHERE subject LIKE '[DEMO] %'");
    assert.equal(second.rows[0].count, 36);
    const accounts = await query('SELECT email FROM agents WHERE email LIKE $1', ['agent%@arvo.example']);
    assert.equal(accounts.rowCount, DEMO_AGENTS.length);
    const newAgents = await query('SELECT count(*)::integer AS count FROM agents WHERE email LIKE $1', ['agent%@arvo.com']);
    assert.equal(newAgents.rows[0].count,9);
    const admins = await query('SELECT role FROM agents WHERE email=$1',['admin@arvo.com']);
    assert.equal(admins.rows[0].role,'admin');
    const statuses = await query("SELECT DISTINCT status FROM tickets WHERE subject LIKE '[DEMO] %'");
    assert.deepEqual(new Set(statuses.rows.map(x => x.status)), new Set(['open','in_progress','waiting','resolved','closed']));
    const notes = await query("SELECT count(*)::integer AS count FROM messages m JOIN tickets t ON t.id=m.ticket_id WHERE t.subject LIKE '[DEMO] %' AND m.is_internal=true");
    assert.ok(notes.rows[0].count > 0);
    await assert.rejects(query("UPDATE ticket_events SET event_type='changed' WHERE id=(SELECT id FROM ticket_events LIMIT 1)"),/immutable/);
  } finally {
    delete process.env.DEMO_MODE;
    delete process.env.DEMO_AGENT_PASSWORD;
    delete process.env.DEMO_ADMIN_PASSWORD;
    await close();
  }
});
