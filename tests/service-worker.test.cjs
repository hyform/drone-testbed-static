const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function workerHarness() {
  const listeners = {};
  const store = { state: null };
  const context = vm.createContext({
    URL, Request, Response, console,
    self: {
      location: { origin: 'https://example.test', href: 'https://example.test/service-worker.js' },
      clients: { matchAll: async () => [] },
      addEventListener(type, handler) { listeners[type] = handler; },
      skipWaiting: async () => {}
    },
    caches: { open: async () => ({ addAll: async () => {}, put: async () => {} }), keys: async () => [], match: async () => null },
    fetch: async input => {
      const url = String(input?.url || input);
      if (url.endsWith('/ai/designerAI.csv')) return new Response(fs.readFileSync(path.join(root, 'docs/ai/designerAI.csv')), { status: 200 });
      return new Response('', { status: 404 });
    }
  });
  context.importScripts = (...files) => {
    for (const file of files) {
      if (file.endsWith('local-store.js')) continue;
      vm.runInContext(fs.readFileSync(path.join(root, 'docs', file.replace('./', '')), 'utf8'), context, { filename: file });
    }
    store.state ||= context.HyformProject.newProject('Planner test');
    context.HyformStore = {
      read: async () => store.state,
      update: async mutator => (store.state = mutator(store.state))
    };
  };
  vm.runInContext(fs.readFileSync(path.join(root, 'docs/service-worker.js'), 'utf8'), context, { filename: 'service-worker.js' });
  return { context, store };
}

async function body(response) { return JSON.parse(await response.text()); }

test('the service worker stores local scenarios and operations plans', async () => {
  const { context, store } = workerHarness();
  const scenario = await body(await context.localRequest(new Request('https://example.test/repo/scenario/'), '/repo/scenario/'));
  assert.equal(scenario.customers.length, 56);

  store.state.vehicles.push(context.HyformProject.vehicle({
    id: 1, tag: 'Baseline', config: context.HyformProject.BASE_CONFIG, result: 'Success',
    range: 10, velocity: 20, cost: 3470, payload: 5, valid: true
  }));
  const planResponse = await context.localRequest(new Request('https://example.test/repo/plan/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag: 'Local route', scenario: scenario.id, paths: [{ vehicle: 1, warehouse: 1, customers: [57, 58], leavetime: 0, returntime: 0 }] })
  }), '/repo/plan/');
  assert.equal(planResponse.status, 201);
  const savedPlan = await body(planResponse);
  assert.equal(savedPlan.paths[0].customers.length, 2);

  const shortPlans = await body(await context.localRequest(new Request('https://example.test/repo/planshort/'), '/repo/planshort/'));
  assert.deepEqual(shortPlans.results.map(plan => plan.tag), ['Local route']);

  const scenarioUpdate = await context.localRequest(new Request('https://example.test/repo/scenario/', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag: 'Focused market', customers: [57, 103] })
  }), '/repo/scenario/');
  const updated = await body(scenarioUpdate);
  assert.equal(updated.customers.filter(customer => customer.selected).length, 2);
  assert.equal(store.state.plans[0].scenario.customers.filter(customer => customer.selected).length, 56);
});

test('the original Designer and Operations wand endpoints run without a backend', async () => {
  const { context } = workerHarness();
  const designer = await body(await context.localRequest(
    new Request('https://example.test/ai/designer1/?range=10&cost=3470&payload=5'), '/ai/designer1/'
  ));
  assert.equal(designer.results.length, 5);
  assert.equal(new Set(designer.results.map(vehicle => vehicle.config)).size, 5);
  for (const vehicle of designer.results) context.HyformProject.configuration(vehicle.config);

  const scenario = context.HyformMarket.createScenario();
  const vehicle = context.HyformProject.vehicle({
    id: 1, tag: 'Baseline', config: context.HyformProject.BASE_CONFIG, result: 'Success',
    range: 10, velocity: 20, cost: 3470, payload: 5, valid: true
  });
  const input = {
    id: 0, tag: 'working', valid: true, scenario,
    paths: [{ id: 1, vehicle, warehouse: scenario.warehouse, customers: [], leavetime: 0, returntime: 0 }]
  };
  const response = await body(await context.localRequest(new Request('https://example.test/ai/opsplan/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: JSON.stringify(input), output: '' })
  }), '/ai/opsplan/'));
  const planned = JSON.parse(response.output);
  assert.equal(planned.tag, 'airesults');
  assert.ok(planned.paths[0].customers.length > 0);
  assert.ok(planned.paths[0].customers.reduce((sum, customer) => sum + customer.weight, 0) <= vehicle.payload);
});
