/* Adapts the original Unity client's data requests to device-local storage. */
importScripts('./project-model.js', './local-store.js');
const CACHE = 'hyform-static-5';
const ASSETS = ['./', './index.html', './designer.html', './about.html', './LICENSE.txt', './favicon.svg', './app.css', './studio.css', './landing.css', './app.js', './project-model.js', './local-store.js', './Build/UnityLoader.js', './Build/webgl.json', './Build/webgl.data.unityweb', './Build/webgl.wasm.code.unityweb', './Build/webgl.wasm.framework.unityweb'];
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
async function localRequest(request, path) {
  const method = request.method;
  const data = ['POST', 'PUT', 'PATCH'].includes(method) ? await request.json() : null;
  if (path === '/exper/session/' && method === 'GET') return json({ id: 1, name: 'Local project', market: 1, use_ai: false });
  if (path === '/repo/vehicle/' && method === 'GET') {
    const project = await HyformStore.read();
    return json({ count: project.vehicles.length, next: null, previous: null, results: project.vehicles });
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
      HyformProject.applyLog(project, action); project.updatedAt = new Date().toISOString(); return project;
    });
    await announce(action.includes('StartSession') ? 'engine-started' : 'project-changed', { action });
    return json({ stored: true }, 201);
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
        return cached || (event.request.mode === 'navigate' ? caches.match(url.pathname.endsWith('designer.html') ? './designer.html' : './index.html') : Response.error());
      }));
    }
  }
});
