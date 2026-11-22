/* Adapts the original Unity client's data requests to device-local storage. */
importScripts('./market-data.js', './project-model.js', './local-store.js', './assistant-core.js');
const BRIDGE_VERSION = 2;
let designerRowsPromise;
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
async function announce(type, extra = {}) {
  for (const client of await self.clients.matchAll()) client.postMessage({ type, ...extra });
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function list(results) { return { count: results.length, next: null, previous: null, results }; }
async function designerRows() {
  if (!designerRowsPromise) designerRowsPromise = fetch(new URL('./ai/designerAI.csv', self.location.href)).then(response => {
    if (!response.ok) throw new Error('The historical RNN candidate library could not be opened.');
    return response.text();
  }).then(HyformAssistants.parseDesignerCsv);
  return designerRowsPromise;
}
function findScenario(project, id) {
  if (project.scenario?.id === id) return project.scenario;
  for (const plan of project.plans || []) if (plan.scenario?.id === id) return plan.scenario;
  return null;
}
function createPlan(project, data) {
  if (!data || typeof data.tag !== 'string' || !Array.isArray(data.paths)) throw new Error('The operations plan is invalid.');
  const scenario = findScenario(project, +data.scenario);
  if (!scenario) throw new Error('The plan uses an unavailable market scenario.');
  const vehicles = new Map(project.vehicles.map(vehicle => [vehicle.id, vehicle]));
  const customers = new Map(scenario.customers.map(customer => [customer.id, customer]));
  const paths = data.paths.map((path, index) => {
    const vehicle = vehicles.get(+path.vehicle);
    if (!vehicle) throw new Error('A design used by this plan is unavailable.');
    if (+path.warehouse !== scenario.warehouse.id) throw new Error('The plan uses an unavailable warehouse.');
    if (!Array.isArray(path.customers)) throw new Error('A delivery path is invalid.');
    const stops = path.customers.map(id => {
      const customer = customers.get(+id);
      if (!customer) throw new Error('A delivery customer is unavailable.');
      // The original Unity PlanPathCalculation fills delivery times from distance and vehicle speed.
      return { ...clone(customer), deliverytime: 0 };
    });
    return {
      id: index + 1, vehicle: clone(vehicle), warehouse: clone(scenario.warehouse), customers: stops,
      leavetime: Number.isFinite(+path.leavetime) ? +path.leavetime : 0,
      returntime: Number.isFinite(+path.returntime) ? +path.returntime : 0
    };
  });
  return HyformProject.plan({
    id: Math.max(0, ...(project.plans || []).map(plan => plan.id)) + 1,
    tag: data.tag.trim(), valid: true, scenario: clone(scenario), paths
  });
}
async function localRequest(request, path) {
  const method = request.method;
  const data = ['POST', 'PUT', 'PATCH'].includes(method) ? await request.json() : null;
  if (path === '/exper/session/' && method === 'GET') return json({ id: 1, name: 'Local project', market: 1, use_ai: true });
  if (path === '/ai/designer1/' && method === 'GET') {
    const query = new URL(request.url).searchParams;
    const current = { range: +query.get('range') || 0, cost: +query.get('cost') || 0, payload: +query.get('payload') || 0 };
    const pool = HyformAssistants.designerCandidates(await designerRows(), current, 100);
    const seen = new Set(), results = [];
    for (const candidate of pool) {
      try {
        HyformProject.configuration(candidate.config);
        if (seen.has(candidate.config)) continue;
        seen.add(candidate.config);
        results.push({
          id: results.length + 1, tag: 'AI alternative ' + (results.length + 1), config: candidate.config,
          result: 'Success', range: candidate.range, velocity: candidate.velocity, cost: candidate.cost,
          payload: candidate.payload, valid: true
        });
      } catch (_) { /* Skip RNN samples that use the superseded design grammar. */ }
      if (results.length === 5) break;
    }
    if (results.length < 5) throw new Error('The RNN library did not return five compatible alternatives.');
    return json(list(results));
  }
  if (path === '/ai/opsplan/' && method === 'POST') {
    if (!data || typeof data.input !== 'string') throw new Error('The operations assistant input is invalid.');
    const incoming = JSON.parse(data.input);
    if (!incoming.scenario || !Array.isArray(incoming.paths)) throw new Error('The operations assistant plan is invalid.');
    const generated = HyformAssistants.planOperations(incoming.scenario, incoming.paths.map(path => path.vehicle));
    const customers = new Map(incoming.scenario.customers.map(customer => [customer.id, customer]));
    incoming.tag = 'airesults';
    incoming.paths.forEach((path, index) => {
      const route = generated.paths[index];
      path.customers = route.customerIds.map(id => ({ ...clone(customers.get(id)), deliverytime: 0 }));
      path.leavetime = route.startTime; path.returntime = route.returnTime;
    });
    return json({ input: data.input, output: JSON.stringify(incoming) }, 201);
  }
  if (path === '/repo/vehicle/' && method === 'GET') {
    const project = await HyformStore.read();
    return json(list(project.vehicles));
  }
  if (path === '/repo/vehicle/' && method === 'POST') {
    let saved;
    await HyformStore.update(project => {
      saved = HyformProject.vehicle({ ...data, id: Math.max(0, ...project.vehicles.map(v => v.id)) + 1 });
      project.vehicles.push(saved); project.updatedAt = new Date().toISOString(); return project;
    });
    await announce('project-changed');
    return json(saved, 201);
  }
  const vehicleId = path.match(/^\/repo\/vehicle\/(\d+)\/$/);
  if (vehicleId && method === 'PUT') {
    let saved;
    await HyformStore.update(project => {
      saved = project.vehicles.find(v => v.id === +vehicleId[1]);
      if (!saved) throw new Error('This design is not in the project.');
      saved.valid = true; return project;
    });
    return json(saved);
  }
  if (path === '/repo/datalog/' && method === 'POST') {
    const action = data.action || '';
    await HyformStore.update(project => {
      if (action.startsWith('designer;')) HyformProject.applyLog(project, action);
      project.updatedAt = new Date().toISOString(); return project;
    });
    await announce(action.includes('StartSession') ? 'engine-started' : 'project-changed', { action });
    return json({ stored: true }, 201);
  }
  if (path === '/repo/scenario/' && method === 'GET') {
    let saved;
    await HyformStore.update(project => {
      if (!project.scenario) project.scenario = HyformMarket.createScenario();
      saved = clone(project.scenario); return project;
    });
    return json(saved);
  }
  if (path === '/repo/scenario/' && method === 'PUT') {
    let saved;
    await HyformStore.update(project => {
      const current = project.scenario || HyformMarket.createScenario();
      const selected = new Set(Array.isArray(data.customers) ? data.customers.map(Number) : []);
      const scenarioIds = [current.id, ...(project.plans || []).map(plan => plan.scenario?.id || 0)];
      saved = HyformProject.scenario({
        ...clone(current), id: Math.max(...scenarioIds) + 1,
        tag: typeof data.tag === 'string' && data.tag.trim() ? data.tag.trim() : current.tag,
        version: current.version + 1,
        customers: current.customers.map(customer => ({ ...customer, selected: selected.has(customer.id) }))
      });
      project.scenario = saved; project.updatedAt = new Date().toISOString(); return project;
    });
    await announce('project-changed');
    return json(saved, 201);
  }
  if (path === '/repo/planshort/' && method === 'GET') {
    const project = await HyformStore.read();
    return json(list((project.plans || []).map(plan => ({ id: plan.id, tag: plan.tag }))));
  }
  if (path === '/repo/plan/' && method === 'POST') {
    let saved;
    await HyformStore.update(project => {
      project.plans ||= [];
      saved = createPlan(project, data); project.plans.push(saved);
      project.updatedAt = new Date().toISOString(); return project;
    });
    await announce('project-changed');
    return json(saved, 201);
  }
  const planId = path.match(/^\/repo\/plan\/(\d+)\/$/);
  if (planId && method === 'GET') {
    const project = await HyformStore.read();
    const saved = (project.plans || []).find(plan => plan.id === +planId[1]);
    return saved ? json(saved) : json({ detail: 'This plan is not in the project.' }, 404);
  }
  if (planId && method === 'PUT') {
    let saved;
    await HyformStore.update(project => {
      saved = (project.plans || []).find(plan => plan.id === +planId[1]);
      if (!saved) throw new Error('This plan is not in the project.');
      saved.valid = true; project.updatedAt = new Date().toISOString(); return project;
    });
    return json(saved, 201);
  }
  return json({ detail: 'This feature is not part of the standalone designer.' }, 404);
}
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const route = url.pathname.match(/\/(?:repo|exper|ai)\/.*$/)?.[0];
  if (route && !url.pathname.endsWith('/ai/designerAI.csv')) {
    event.respondWith(localRequest(event.request, route).catch(error => json({ detail: error.message }, 400)));
    return;
  }
});
