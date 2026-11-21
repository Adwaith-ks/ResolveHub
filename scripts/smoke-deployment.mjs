#!/usr/bin/env node
/**
 * Read-only smoke checks for a deployed ResolveHub instance.
 * Does not authenticate, create tickets, or modify production data.
 */
const target = process.env.DEPLOY_URL || 'https://resolvehub-app.onrender.com';
let origin;
try {
  origin = new URL(target);
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('Unsupported URL scheme');
} catch {
  console.error('DEPLOY_URL must be a valid HTTP(S) address.');
  process.exit(1);
}
const base = origin.origin;
const timeoutMs = 30000;
async function request(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(base + path, { signal: controller.signal, redirect: 'follow', headers: { Accept: path === '/' ? 'text/html' : 'application/json' } });
  } finally { clearTimeout(timer); }
}

async function check(name, path, expectedStatus, validate) {
  const response = await request(path);
  const body = await response.text();
  if (response.status !== expectedStatus || !validate(body, response)) {
    throw new Error(name + ' failed: HTTP ' + response.status + ', expected HTTP ' + expectedStatus);
  }
  console.log('PASS ' + name + ' (HTTP ' + response.status + ')');
}

try {
  console.log('Checking deployment at ' + base);
  await check('backend health', '/api/health', 200, body => {
    try { return JSON.parse(body).status === 'ok'; } catch { return false; }
  });
  await check('unauthenticated agent access denied', '/api/auth/me', 401, body => {
    try { return JSON.parse(body).error === 'Sign in required'; } catch { return false; }
  });
  await check('frontend entry point', '/', 200, (body, response) =>
    (response.headers.get('content-type') || '').includes('text/html') &&
    /<div\s+id=["']root["']/.test(body)
  );
  console.log('Deployment smoke checks passed.');
} catch (error) {
  console.error('Deployment smoke checks failed:', error.message);
  process.exitCode = 1;
}
