/* Static shell for the original HyForm Unity WebGL designer. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let game, ready = false, starting = false, project, refreshTimer, toastTimer;
  const buttons = ['new-project', 'load-project', 'save-project'];
  function status(message, error = false) {
    clearTimeout(toastTimer); $('status').textContent = message; $('status').classList.toggle('error', error); $('status').classList.remove('quiet');
    if (!error && ready) toastTimer = setTimeout(() => $('status').classList.add('quiet'), 5500);
  }
  function failure(error) {
    $('loading').hidden = false; $('loading').classList.add('error');
    $('loading').querySelector('h2').textContent = 'The designer could not start';
    $('loading-message').textContent = error.message || String(error);
    status(error.message || String(error), true);
  }
  function metric(id, value, unit) {
    $(id).textContent = value == null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 2 }) + (unit ? ' ' + unit : '');
  }
  async function refresh() {
    project = await HyformStore.read();
    if (document.activeElement !== $('project-name')) $('project-name').value = project.name;
    $('design-count').textContent = project.vehicles.length + ' library design' + (project.vehicles.length === 1 ? '' : 's');
    const result = project.lastEvaluation;
    const current = result && result.config === project.draftConfig;
    $('evaluation-state').textContent = result ? (current ? 'Current design' : 'Previous design') + ' · recorded flight metrics; stability result appears in the designer.' : 'Evaluate a design to see its flight performance.';
    metric('range', result && result.range >= 0 ? result.range : null, 'mi'); metric('payload', result?.payload, 'lb'); metric('cost', result && result.cost >= 0 ? result.cost : null, 'USD'); metric('velocity', result && result.velocity >= 0 ? result.velocity : null, 'mph');
    $('library').replaceChildren();
    for (const vehicle of project.vehicles) {
      const button = document.createElement('button'); button.textContent = 'Open ' + vehicle.tag; button.disabled = !ready;
      button.addEventListener('click', async () => {
        await HyformStore.update(p => { p.draftConfig = vehicle.config; return p; });
        location.reload();
      });
      $('library').append(button);
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
        if (project.draftConfig !== HyformProject.BASE_CONFIG) game.SendMessage('GUI', 'fromstring', project.draftConfig);
        ready = true; $('loading').hidden = true;
        buttons.forEach(id => $(id).disabled = false);
        await refresh(); status('Ready · changes are autosaved in this browser. Download a project file to keep or share your work.');
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
    catch (_) { status('Full screen is unavailable in this browser window. The designer already fills the available space.'); }
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
    if (event.target instanceof HTMLInputElement) event.stopImmediatePropagation();
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
      status('Project file downloaded · includes your current design, library, and latest evaluation.');
    } catch (error) { status(error.message, true); }
  });
  $('load-project').addEventListener('click', () => $('project-file').click());
  $('project-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Project files must be smaller than 5 MB.');
      const incoming = HyformProject.validateProject(JSON.parse(await file.text()));
      if (!await confirmChange('Open “' + incoming.name + '”?', 'Download your current project first if you want to keep a separate copy.')) return;
      await HyformStore.update(() => incoming); location.reload();
    } catch (error) { status('Could not open project: ' + error.message + ' Your current project is unchanged.', true); }
    finally { event.target.value = ''; }
  });
  $('new-project').addEventListener('click', async () => {
    if (!await confirmChange('Start a new project?', 'Download your current project first if you want to keep a separate copy.')) return;
    await HyformStore.update(() => HyformProject.newProject()); location.reload();
  });
  async function start() {
    try {
      if (!('serviceWorker' in navigator) || !window.isSecureContext) throw new Error('Open HyForm over HTTPS or localhost in a browser with service worker support.');
      await HyformStore.update(p => p); await refresh();
      $('loading-message').textContent = 'Preparing the browser’s local workspace…';
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data.type === 'engine-started') engineStarted();
        else if (event.data.type === 'project-changed') queueRefresh();
      });
      await navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' });
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
      for (const [key, value] of Object.entries({ username: 'local_designer', csrftoken: 'local', use_ai: 'False', is_tutorial: 'False' })) document.cookie = key + '=' + value + '; path=/; SameSite=Lax';
      const url = new URL(location.href); url.searchParams.set('scene', 'design'); history.replaceState(null, '', url);
      $('loading-message').textContent = 'Loading the original HyForm designer and flight simulator…';
      game = UnityLoader.instantiate('gameContainer', './Build/webgl.json', {
        onProgress: (_, value) => { $('progress').value = value; },
        Module: { onAbort: reason => failure(new Error('The flight simulator stopped: ' + reason)) }
      });
    } catch (error) { failure(error); }
  }
  start();
})();
