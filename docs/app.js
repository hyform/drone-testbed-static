/* Static shell for the original HyForm Unity WebGL tools. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const scene = document.body.dataset.scene || 'design';
  let game, ready = false, starting = false, project, refreshTimer, toastTimer, evaluationPhase = 'design';
  const buttons = ['new-project', 'load-project', 'save-project'];
  const sceneNames = { design: 'designer and flight simulator', ops: 'operations planner', business: 'business planner' };

  function status(message, error = false) {
    clearTimeout(toastTimer); $('status').textContent = message; $('status').classList.toggle('error', error); $('status').classList.remove('quiet');
    if (!error && ready) toastTimer = setTimeout(() => $('status').classList.add('quiet'), 5500);
  }
  function failure(error) {
    $('loading').hidden = false; $('loading').classList.add('error');
    $('loading').querySelector('h2').textContent = 'This HyForm tool could not start';
    $('loading-message').textContent = error.message || String(error);
    status(error.message || String(error), true);
  }
  function formatMetric(id, value, options, unit = '') {
    const element = $(id); if (!element) return;
    element.textContent = value == null ? '—' : new Intl.NumberFormat(undefined, options).format(value) + unit;
  }
  function setEvaluationPhase(next) {
    if (!$('evaluation-dock')) return;
    evaluationPhase = next;
    const active = next !== 'design';
    $('evaluation-dock').hidden = !active;
    document.querySelector('.designer-main').classList.toggle('evaluation-active', active);
    if (!active) return;
    panel('project-panel', false);
    const complete = next === 'results';
    $('evaluation-title').textContent = complete ? 'Flight metrics' : 'Running flight evaluation';
    $('evaluation-message').textContent = complete
      ? 'Flight complete. Check the simulator message in the flight view for the outcome.'
      : 'Testing the current design in the simulator…';
    $('evaluation-progress').hidden = complete;
    $('evaluation-metrics').hidden = !complete;
    $('evaluation-actions').hidden = !complete;
  }
  async function refresh() {
    project = HyformProject.validateProject(await HyformStore.read());
    if (document.activeElement !== $('project-name')) $('project-name').value = project.name;
    if ($('design-count')) $('design-count').textContent = project.vehicles.length.toLocaleString();
    if ($('plan-count')) $('plan-count').textContent = project.plans.length.toLocaleString();
    const result = project.lastEvaluation;
    if (result) {
      const current = result.config === project.draftConfig;
      if ($('evaluation-context')) $('evaluation-context').textContent = current ? 'Current design' : 'Design changed since this flight';
      formatMetric('range', result.range >= 0 ? result.range : null, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, ' mi');
      formatMetric('payload', result.payload, { maximumFractionDigits: 2 }, ' lb');
      formatMetric('cost', result.cost >= 0 ? result.cost : null, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
      formatMetric('velocity', result.velocity >= 0 ? result.velocity : null, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, ' mph');
    }
    if ($('library')) {
      $('library').replaceChildren();
      for (const vehicle of project.vehicles) {
        const button = document.createElement('button'); button.textContent = 'Open ' + vehicle.tag; button.disabled = !ready;
        button.addEventListener('click', async () => {
          await HyformStore.update(p => { p.draftConfig = vehicle.config; p.updatedAt = new Date().toISOString(); return p; });
          location.reload();
        });
        $('library').append(button);
      }
    }
  }
  function queueRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => refresh().catch(failure), 120); }
  function confirmChange(title, message) {
    const dialog = $('confirmation'); $('confirmation-title').textContent = title; $('confirmation-message').textContent = message;
    dialog.returnValue = ''; dialog.showModal();
    return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
  }
  async function engineStarted() {
    if (starting) return; starting = true;
    // StartSession is emitted from Unity's scene Start; allow that frame to finish.
    setTimeout(async () => {
      try {
        project = await HyformStore.read();
        if (scene === 'design' && project.draftConfig !== HyformProject.BASE_CONFIG) game.SendMessage('GUI', 'fromstring', project.draftConfig);
        ready = true; $('loading').hidden = true;
        buttons.forEach(id => $(id).disabled = false);
        await refresh();
        if (scene === 'design') status('Ready · changes are autosaved in this browser. Save a project file for a durable copy.');
        else if (scene === 'ops' && project.vehicles.length === 0) status('Operations is ready · submit a successful flight in Design to add a drone for route planning.');
        else status((scene === 'ops' ? 'Operations' : 'Business planning') + ' is ready · changes are autosaved in this browser.');
      } catch (error) { failure(error); }
    }, 500);
  }
  function panel(id, open) {
    for (const other of ['help', 'project-panel']) {
      const expanded = other === id && open; $(other).hidden = !expanded;
      $(other === 'help' ? 'help-toggle' : 'project-toggle').setAttribute('aria-expanded', String(expanded));
    }
  }
  $('help-toggle').addEventListener('click', () => panel('help', $('help').hidden));
  $('help-close').addEventListener('click', () => panel('help', false));
  $('project-toggle').addEventListener('click', () => panel('project-panel', $('project-panel').hidden));
  $('project-close').addEventListener('click', () => panel('project-panel', false));
  $('fullscreen-toggle').addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch (_) { status('Full screen is unavailable in this browser window. The workspace already fills the available space.'); }
  });
  document.addEventListener('fullscreenchange', () => $('fullscreen-toggle').textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen');
  async function saveName() {
    const name = $('project-name').value.trim() || 'Untitled project';
    await HyformStore.update(p => { p.name = name; p.updatedAt = new Date().toISOString(); return p; });
    return name;
  }
  $('project-name').addEventListener('input', () => saveName().catch(error => status(error.message, true)));
  // Prevent the legacy Unity runtime from consuming keys meant for HTML controls.
  for (const type of ['keydown', 'keyup', 'keypress']) window.addEventListener(type, event => {
    if (event.target.closest?.('input,button,a,dialog')) event.stopImmediatePropagation();
    if (type === 'keydown' && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && ready) {
      event.preventDefault(); event.stopImmediatePropagation(); $('save-project').click();
    }
  }, true);
  $('save-project').addEventListener('click', async () => {
    try {
      await saveName();
      project = HyformProject.validateProject(await HyformStore.read());
      const blob = new Blob([JSON.stringify(project, null, 2) + '\n'], { type: 'application/json' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = (project.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'hyform-project') + '.hyform.json';
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      status('Project file downloaded · includes designs, the market scenario, plans, and the latest flight metrics.');
    } catch (error) { status(error.message, true); }
  });
  $('load-project').addEventListener('click', () => $('project-file').click());
  $('project-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Project files must be smaller than 5 MB.');
      const incoming = HyformProject.validateProject(JSON.parse(await file.text()));
      if (!await confirmChange('Open “' + incoming.name + '”?', 'Save your current project file first if you want to keep a separate copy.')) return;
      await HyformStore.update(() => incoming); location.reload();
    } catch (error) { status('Could not open project: ' + error.message + ' Your current project is unchanged.', true); }
    finally { event.target.value = ''; }
  });
  $('new-project').addEventListener('click', async () => {
    if (!await confirmChange('Start a new project?', 'Save your current project file first if you want to keep a separate copy.')) return;
    await HyformStore.update(() => HyformProject.newProject()); location.reload();
  });
  if ($('back-to-design')) $('back-to-design').addEventListener('click', () => {
    if (evaluationPhase !== 'results') return;
    // Reloading restores the autosaved draft in a clean Unity design scene without cancelling active physics.
    location.href = './designer.html?scene=design';
  });

  async function ensureCurrentWorker() {
    const original = navigator.serviceWorker.controller;
    let resolveChange;
    const changed = new Promise(resolve => { resolveChange = resolve; });
    navigator.serviceWorker.addEventListener('controllerchange', resolveChange, { once: true });
    const registration = await navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' });
    await registration.update();
    const candidate = registration.installing || registration.waiting;
    if (candidate && candidate.state !== 'activated' && candidate.state !== 'redundant') {
      await new Promise(resolve => candidate.addEventListener('statechange', () => {
        if (candidate.state === 'activated' || candidate.state === 'redundant') resolve();
      }));
    }
    await navigator.serviceWorker.ready;
    const activeChanged = original && registration.active && registration.active !== original;
    if (!navigator.serviceWorker.controller || (activeChanged && navigator.serviceWorker.controller === original)) await changed;
  }
  async function start() {
    try {
      if (!('serviceWorker' in navigator) || !window.isSecureContext) throw new Error('Open HyForm over HTTPS or localhost in a browser with service worker support.');
      await HyformStore.update(p => HyformProject.validateProject(p)); await refresh();
      $('loading-message').textContent = 'Preparing the browser’s local workspace…';
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data.type === 'engine-started') engineStarted();
        else if (event.data.type === 'project-changed') {
          const action = event.data.action || '';
          if (scene === 'design') {
            if (action.startsWith('designer;Evaluated;')) setEvaluationPhase('results');
            else if (action.startsWith('designer;Evaluate;')) setEvaluationPhase('running');
            else if (action === 'designer;DesignMode') setEvaluationPhase('design');
          }
          queueRefresh();
        }
      });
      await ensureCurrentWorker();
      for (const [key, value] of Object.entries({ username: 'local_designer', csrftoken: 'local', use_ai: 'False', is_tutorial: 'False' })) document.cookie = key + '=' + value + '; path=/; SameSite=Lax';
      const url = new URL(location.href); url.searchParams.set('scene', scene); history.replaceState(null, '', url);
      $('loading-message').textContent = 'Loading the original HyForm ' + sceneNames[scene] + '…';
      game = UnityLoader.instantiate('gameContainer', './Build/webgl.json', {
        onProgress: (_, value) => { $('progress').value = value; },
        Module: { onAbort: reason => failure(new Error('The HyForm tool stopped: ' + reason)) }
      });
    } catch (error) { failure(error); }
  }
  start();
})();
