import '../docs/project-model.js';

const model = globalThis.HyformProject;
const API_PREFIX = '/api/v1';
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_ORIGINS = ['https://hyform.github.io', 'http://127.0.0.1:8765', 'http://localhost:8765'];

class BadRequest extends Error {}

function allowedOrigins(env) {
  return new Set((env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(','))
    .split(',').map(value => value.trim()).filter(Boolean));
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const headers = new Headers({ Vary: 'Origin', 'Cache-Control': 'no-store' });
  if (origin && allowedOrigins(env).has(origin)) headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Expose-Headers', 'ETag, Location');
  return headers;
}

function json(request, env, body, status = 200, extra = {}) {
  const headers = corsHeaders(request, env);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  return new Response(JSON.stringify(body), { status, headers });
}

function problem(request, env, status, detail) {
  return json(request, env, { error: detail }, status);
}

function originAllowed(request, env) {
  const origin = request.headers.get('Origin');
  return !origin || allowedOrigins(env).has(origin);
}

function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function tokenHash(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function equalHash(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1) different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return different === 0;
}

function maxBytes(env) {
  const configured = Number(env.MAX_PROJECT_BYTES);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, DEFAULT_MAX_BYTES) : DEFAULT_MAX_BYTES;
}

async function readProjectBody(request, env) {
  const limit = maxBytes(env);
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > limit) throw new BadRequest('Project payloads must be 5 MB or smaller.');
  const source = await request.text();
  if (new TextEncoder().encode(source).byteLength > limit) throw new BadRequest('Project payloads must be 5 MB or smaller.');
  let body;
  try { body = JSON.parse(source); } catch (_) { throw new BadRequest('The request body must be valid JSON.'); }
  if (!body || typeof body !== 'object' || !body.project) throw new BadRequest('The request must include a HyForm project.');
  try { return model.validateProject(body.project); }
  catch (error) { throw new BadRequest(error.message); }
}

function projectId(pathname) {
  const match = pathname.match(/^\/api\/v1\/projects\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
  return match?.[1] || null;
}

async function createProject(request, env) {
  if (!env.CREATE_ACCESS_KEY) return problem(request, env, 503, 'Project creation is disabled until a server access key is configured.');
  const suppliedKey = request.headers.get('X-Hyform-Access-Key') || '';
  if (!equalHash(await tokenHash(suppliedKey), await tokenHash(env.CREATE_ACCESS_KEY))) return problem(request, env, 401, 'A valid project-creation access key is required.');
  const project = await readProjectBody(request, env);
  const id = crypto.randomUUID(), editToken = token(), now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO hyform_projects
    (id, edit_token_hash, payload, version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`)
    .bind(id, await tokenHash(editToken), JSON.stringify(project), now, now).run();
  return json(request, env, { id, editToken, version: 1, updatedAt: now }, 201, {
    Location: new URL(`${API_PREFIX}/projects/${id}`, request.url).toString(), ETag: '"v1"'
  });
}

async function getProject(request, env, id) {
  const row = await env.DB.prepare('SELECT payload, version, updated_at FROM hyform_projects WHERE id = ?').bind(id).first();
  if (!row) return problem(request, env, 404, 'This shared project does not exist.');
  return json(request, env, { project: JSON.parse(row.payload), version: row.version, updatedAt: row.updated_at }, 200, {
    ETag: `"v${row.version}"`
  });
}

async function updateProject(request, env, id) {
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return problem(request, env, 401, 'The project edit token is required.');
  const expected = request.headers.get('If-Match')?.match(/^"v(\d+)"$/);
  if (!expected) return problem(request, env, 428, 'Send the current project ETag with If-Match.');
  const existing = await env.DB.prepare('SELECT edit_token_hash, version FROM hyform_projects WHERE id = ?').bind(id).first();
  if (!existing) return problem(request, env, 404, 'This shared project does not exist.');
  if (!equalHash(existing.edit_token_hash, await tokenHash(authorization.slice(7)))) return problem(request, env, 403, 'The project edit token is invalid.');
  if (existing.version !== Number(expected[1])) return problem(request, env, 409, 'This project changed elsewhere. Reload it before saving again.');
  const project = await readProjectBody(request, env), nextVersion = existing.version + 1, now = new Date().toISOString();
  const result = await env.DB.prepare(`UPDATE hyform_projects SET payload = ?, version = ?, updated_at = ?
    WHERE id = ? AND version = ?`).bind(JSON.stringify(project), nextVersion, now, id, existing.version).run();
  if (result.meta?.changes !== 1) return problem(request, env, 409, 'This project changed elsewhere. Reload it before saving again.');
  return json(request, env, { id, version: nextVersion, updatedAt: now }, 200, { ETag: `"v${nextVersion}"` });
}

export async function handleRequest(request, env) {
  if (!originAllowed(request, env)) return problem(request, env, 403, 'This origin is not allowed to use the HyForm API.');
  if (request.method === 'OPTIONS') {
    const headers = corsHeaders(request, env);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, If-Match, X-Hyform-Access-Key');
    headers.set('Access-Control-Expose-Headers', 'ETag, Location');
    headers.set('Access-Control-Max-Age', '86400');
    return new Response(null, { status: 204, headers });
  }
  const url = new URL(request.url);
  if (url.pathname === `${API_PREFIX}/health` && request.method === 'GET') return json(request, env, { ok: true, service: 'hyform-projects', version: 1 });
  if (!env.DB) return problem(request, env, 503, 'Project storage is not configured.');
  if (url.pathname === `${API_PREFIX}/projects` && request.method === 'POST') {
    try { return await createProject(request, env); }
    catch (error) {
      if (error instanceof BadRequest) return problem(request, env, 400, error.message);
      console.error('Project creation failed.'); return problem(request, env, 500, 'Project storage is temporarily unavailable.');
    }
  }
  const id = projectId(url.pathname);
  if (id && request.method === 'GET') {
    try { return await getProject(request, env, id); }
    catch (_) {
      console.error('Project read failed.'); return problem(request, env, 500, 'Project storage is temporarily unavailable.');
    }
  }
  if (id && request.method === 'PUT') {
    try { return await updateProject(request, env, id); }
    catch (error) {
      if (error instanceof BadRequest) return problem(request, env, 400, error.message);
      console.error('Project update failed.'); return problem(request, env, 500, 'Project storage is temporarily unavailable.');
    }
  }
  return problem(request, env, 404, 'API route not found.');
}

export default { fetch: handleRequest };
