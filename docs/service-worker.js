/* Adapts the original Unity client's data requests to device-local storage. */
importScripts('./market-data.js', './project-model.js', './local-store.js');
const CACHE = 'hyform-static-6';
const ASSETS = ['./', './index.html', './designer.html', './ops.html', './business.html', './about.html', './LICENSE.txt', './favicon.svg', './app.css', './studio.css', './landing.css', './app.js', './market-data.js', './project-model.js', './local-store.js', './Build/UnityLoader.js', './Build/webgl.json', './Build/webgl.data.unityweb', './Build/webgl.wasm.code.unityweb', './Build/webgl.wasm.framework.unityweb'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('hyform-static-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())
));
async function announce(type, extra = {}) {
  for (const client of await self.clients.matchAll()) client.postMessage({ type, ...extra });
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function list(results) { return { count: results.length, next: null, previous: null, results }; }
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
  if (path === '/exper/session/' && method === 'GET') return json({ id: 1, name: 'Local project', market: 1, use_ai: false });
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
  if (/^\/(repo|exper|ai)\//.test(url.pathname)) {
    event.respondWith(localRequest(event.request, url.pathname).catch(error => json({ detail: error.message }, 400)));
    return;
  }
  if (event.request.method === 'GET') {
    if (url.pathname.includes('/Build/')) {
      event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
    } else {
      // Keep releases fresh while allowing a previously loaded studio to work offline.
      event.respondWith(fetch(event.request).then(response => {
        if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); }
        return response;
      }).catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode !== 'navigate') return Response.error();
        const page = url.pathname.endsWith('designer.html') ? './designer.html'
          : url.pathname.endsWith('ops.html') ? './ops.html'
          : url.pathname.endsWith('business.html') ? './business.html' : './index.html';
        return caches.match(page);
      }));
    }
  }
});
