import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../backend/worker.mjs';

const model = globalThis.HyformProject;
const ORIGIN = 'https://hyform.github.io';

class MemoryD1 {
  constructor() { this.rows = new Map(); }
  prepare(sql) {
    const database = this;
    return {
      values: [],
      bind(...values) { this.values = values; return this; },
      async first() {
        const row = database.rows.get(this.values[0]);
        if (!row) return null;
        if (sql.includes('payload, version, updated_at')) return { payload: row.payload, version: row.version, updated_at: row.updated_at };
        return { edit_token_hash: row.edit_token_hash, version: row.version };
      },
      async run() {
        if (sql.includes('INSERT INTO hyform_projects')) {
          const [id, edit_token_hash, payload, created_at, updated_at] = this.values;
          database.rows.set(id, { id, edit_token_hash, payload, version: 1, created_at, updated_at });
          return { success: true, meta: { changes: 1 } };
        }
        if (sql.includes('UPDATE hyform_projects')) {
          const [payload, version, updated_at, id, expected] = this.values;
          const row = database.rows.get(id);
          if (!row || row.version !== expected) return { success: true, meta: { changes: 0 } };
          Object.assign(row, { payload, version, updated_at });
          return { success: true, meta: { changes: 1 } };
        }
        throw new Error('Unexpected SQL in test.');
      }
    };
  }
}

function request(path, options = {}) {
  return new Request('https://api.hyform.test' + path, {
    ...options,
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
}

async function body(response) { return JSON.parse(await response.text()); }

test('health is available before project storage is configured', async () => {
  const response = await handleRequest(request('/api/v1/health'), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await body(response), { ok: true, service: 'hyform-projects', version: 1 });
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

test('project creation is disabled without a server access key', async () => {
  const response = await handleRequest(request('/api/v1/projects', {
    method: 'POST', body: JSON.stringify({ project: model.newProject('Secure by default') })
  }), { DB: new MemoryD1() });
  assert.equal(response.status, 503);
});

test('projects create, read, reject stale or unauthorized writes, and update with a lease', async () => {
  const env = { DB: new MemoryD1(), CREATE_ACCESS_KEY: 'cohort-key' };
  const project = model.newProject('Shared delivery study');
  const createdResponse = await handleRequest(request('/api/v1/projects', {
    method: 'POST', headers: { 'X-Hyform-Access-Key': 'cohort-key' }, body: JSON.stringify({ project })
  }), env);
  assert.equal(createdResponse.status, 201);
  const created = await body(createdResponse);
  assert.match(created.id, /^[0-9a-f-]{36}$/);
  assert.ok(created.editToken.length > 30);
  assert.equal(createdResponse.headers.get('ETag'), '"v1"');
  assert.equal(createdResponse.headers.get('Access-Control-Expose-Headers'), 'ETag, Location');

  const readResponse = await handleRequest(request('/api/v1/projects/' + created.id), env);
  assert.equal(readResponse.status, 200);
  assert.deepEqual((await body(readResponse)).project, project);

  const wrongToken = await handleRequest(request('/api/v1/projects/' + created.id, {
    method: 'PUT', headers: { Authorization: 'Bearer wrong', 'If-Match': '"v1"' }, body: JSON.stringify({ project })
  }), env);
  assert.equal(wrongToken.status, 403);

  const stale = await handleRequest(request('/api/v1/projects/' + created.id, {
    method: 'PUT', headers: { Authorization: 'Bearer ' + created.editToken, 'If-Match': '"v9"' }, body: JSON.stringify({ project })
  }), env);
  assert.equal(stale.status, 409);

  project.name = 'Updated delivery study';
  const updatedResponse = await handleRequest(request('/api/v1/projects/' + created.id, {
    method: 'PUT', headers: { Authorization: 'Bearer ' + created.editToken, 'If-Match': '"v1"' }, body: JSON.stringify({ project })
  }), env);
  assert.equal(updatedResponse.status, 200);
  assert.equal(updatedResponse.headers.get('ETag'), '"v2"');
  assert.equal((await body(updatedResponse)).version, 2);
  assert.equal((await body(await handleRequest(request('/api/v1/projects/' + created.id), env))).project.name, 'Updated delivery study');
});

test('the backend applies the browser project validator and origin policy', async () => {
  const env = { DB: new MemoryD1(), CREATE_ACCESS_KEY: 'cohort-key' };
  const invalid = model.newProject('Invalid'); invalid.version = 99;
  const response = await handleRequest(request('/api/v1/projects', {
    method: 'POST', headers: { 'X-Hyform-Access-Key': 'cohort-key' }, body: JSON.stringify({ project: invalid })
  }), env);
  assert.equal(response.status, 400);

  const foreign = await handleRequest(new Request('https://api.hyform.test/api/v1/health', {
    headers: { Origin: 'https://attacker.example' }
  }), env);
  assert.equal(foreign.status, 403);
});
