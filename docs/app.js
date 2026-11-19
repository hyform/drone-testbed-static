/* Static shell for the original HyForm Unity WebGL tools. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const scene = document.body.dataset.scene || 'design';
  let game, ready = false, starting = false, peerConnected = false, collectionEnabled = false, project, peer, incomingProject, participantConfig, refreshTimer, peerSendTimer, toastTimer, nameSaveTimer, evaluationPhase = 'design';
  const chatMessages = [];
  const buttons = ['new-project', 'load-project', 'save-project'];
  const sceneNames = { design: 'designer and flight simulator', ops: 'operations planner', business: 'business planner' };

  function status(message, error = false) {
    clearTimeout(toastTimer); $('status').textContent = message; $('status').classList.toggle('error', error); $('status').classList.remove('quiet');
    if (!error && ready) toastTimer = setTimeout(() => $('status').classList.add('quiet'), 5500);
  }
  function saveState(message, state = 'saved') {
    const element = $('save-state'); if (!element) return;
    element.textContent = message; element.dataset.state = state;
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
    panel('project-panel', false, false);
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
    updateWorkflow();
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
      if ($('library-empty')) $('library-empty').hidden = project.vehicles.length !== 0;
    }
  }
  function updateWorkflow() {
    if (!$('workflow-card')) return;
    const designs = project.vehicles.length, plans = project.plans.length;
    let kicker, title, message, href, action;
    if (scene === 'design' && designs === 0) {
      kicker = 'START HERE'; title = 'Submit a flight-ready design';
      message = 'Evaluate a design, then submit a successful flight to make that drone available for route planning.';
      href = '#help'; action = 'Open design help';
    } else if (scene === 'design') {
      kicker = 'NEXT STEP'; title = 'Plan delivery routes';
      message = designs.toLocaleString() + (designs === 1 ? ' saved design is' : ' saved designs are') + ' ready in Operations.';
      href = './ops.html'; action = 'Open Operations';
    } else if (scene === 'ops' && designs === 0) {
      kicker = 'DESIGN NEEDED'; title = 'Save a successful drone first';
      message = 'Operations needs at least one submitted design before you can assign a vehicle to a route.';
      href = './designer.html'; action = 'Open Design';
    } else if (scene === 'ops' && plans === 0) {
      kicker = 'CURRENT STEP'; title = 'Build and submit a route plan';
      message = designs.toLocaleString() + (designs === 1 ? ' design is' : ' designs are') + ' ready. Assign customers, check the constraints, and submit the plan.';
      href = '#help'; action = 'Open operations help';
    } else if (scene === 'ops') {
      kicker = 'NEXT STEP'; title = 'Compare business outcomes';
      message = plans.toLocaleString() + (plans === 1 ? ' submitted plan is' : ' submitted plans are') + ' ready in Business.';
      href = './business.html'; action = 'Open Business';
    } else if (plans === 0) {
      kicker = 'PLAN NEEDED'; title = 'Submit an operations plan first';
      message = 'Business can compare delivery, cost, and profit outcomes after a route plan has been submitted.';
      href = './ops.html'; action = 'Open Operations';
    } else {
      kicker = 'READY TO COMPARE'; title = plans.toLocaleString() + (plans === 1 ? ' submitted plan' : ' submitted plans');
      message = 'Select plans in the original HyForm business view to compare delivery, cost, and profit outcomes.';
      href = '#help'; action = 'Open business help';
    }
    $('workflow-kicker').textContent = kicker; $('workflow-title').textContent = title;
    $('workflow-message').textContent = message; $('workflow-link').textContent = action;
    $('workflow-link').setAttribute('href', href);
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
        ready = true; $('loading').hidden = true; saveState('Saved locally');
        buttons.forEach(id => $(id).disabled = false);
        await refresh();
        if (scene === 'design') status('Ready · changes are autosaved in this browser. Save a project file for a durable copy.');
        else if (scene === 'ops' && project.vehicles.length === 0) status('Operations is ready · submit a successful flight in Design to add a drone for route planning.');
        else status((scene === 'ops' ? 'Operations' : 'Business planning') + ' is ready · changes are autosaved in this browser.');
      } catch (error) { failure(error); }
    }, 500);
  }
  function peerStatus(message, state = '') {
    $('peer-status').textContent = message; $('peer-status').dataset.state = state;
  }
  function peerState(next) {
    const messages = {
      gathering: 'Finding a direct route between browsers…',
      'offer-ready': 'Offer ready. Send My code, then paste the answer you receive.',
      'answer-ready': 'Answer ready. Send My code back to the browser that created the offer.',
      connecting: 'Connecting directly…', connected: 'Connected directly',
      disconnected: 'The direct connection was interrupted.', failed: 'Could not establish a direct connection.', closed: 'Not connected'
    };
    peerStatus(messages[next] || 'Preparing direct connection…', next);
    const connected = next === 'connected';
    peerConnected = connected;
    if (!connected && next !== 'connecting') collectionEnabled = false;
    $('peer-setup').hidden = connected; $('peer-connected').hidden = !connected;
    $('peer-toggle').textContent = connected ? 'Connected' : 'Connect';
    $('peer-toggle').dataset.connected = connected ? 'true' : 'false';
    if (!connected && ['disconnected', 'failed', 'closed'].includes(next)) {
      $('chat-status').textContent = 'Experimenter connection ended. Reconnect to send or receive chat.';
      $('participant-channel').disabled = true; $('participant-message').disabled = true; $('participant-chat-form').querySelector('button').disabled = true;
    } else if (connected && !participantConfig) $('chat-status').textContent = 'Connected. Waiting for the experimenter’s channel setup…';
  }
  function peerError(error) {
    peerStatus(error.message || String(error), 'error'); status(error.message || String(error), true);
  }
  function ensurePeer() {
    if (peer) return peer;
    peer = HyformPeer.create({
      onState: peerState,
      onError: peerError,
      onConfig: value => {
        participantConfig = { member: value.member, channels: value.channels };
        const select = $('participant-channel'); select.replaceChildren();
        for (const channel of value.channels) {
          const option = document.createElement('option'); option.value = channel.id; option.textContent = channel.label; select.append(option);
        }
        select.disabled = false; $('participant-message').disabled = false; $('participant-chat-form').querySelector('button').disabled = false;
        $('chat-status').textContent = value.member.name + ' · ' + value.member.teamName + ' · ' + value.member.role;
        renderParticipantChat();
      },
      onChat: message => {
        if (!participantConfig?.channels.some(channel => channel.id === message.channel)) return;
        chatMessages.push(message); if (chatMessages.length > 1000) chatMessages.shift();
        if ($('chat-panel').hidden || $('participant-channel').value !== message.channel) $('chat-toggle').dataset.unread = 'true';
        renderParticipantChat();
      },
      onProjectRequest: async () => {
        try {
          if (!$('peer-allow-collection').checked) {
            peerStatus('The experimenter requested data. Enable experimenter data collection, then ask them to request again.', 'received');
            return;
          }
          collectionEnabled = true;
          peer.sendProject(HyformProject.validateProject(await HyformStore.read()));
          peerStatus('Experimenter data collection is active for this connection.', 'connected');
        } catch (error) { peerError(error); }
      },
      onProject: value => {
        try {
          incomingProject = HyformProject.validateProject(value);
          $('peer-incoming-name').textContent = incomingProject.name;
          $('peer-incoming-summary').textContent = incomingProject.vehicles.length.toLocaleString() + ' saved design' + (incomingProject.vehicles.length === 1 ? '' : 's') + ' · ' + incomingProject.plans.length.toLocaleString() + ' submitted plan' + (incomingProject.plans.length === 1 ? '' : 's');
          $('peer-incoming').hidden = false; panel('peer-panel', true);
          peerStatus('Project received. Review it before replacing your local project.', 'received');
        } catch (error) { peerError(new Error('The incoming project was rejected: ' + error.message)); }
      }
    });
    return peer;
  }
  function renderParticipantChat() {
    const list = $('participant-messages'), channel = $('participant-channel').value;
    list.replaceChildren();
    const visible = chatMessages.filter(message => message.channel === channel);
    if (!visible.length) {
      const empty = document.createElement('li'); empty.className = 'chat-empty'; empty.textContent = 'No messages in this channel yet.'; list.append(empty); return;
    }
    for (const message of visible) {
      const item = document.createElement('li');
      if (message.senderId === participantConfig?.member.id) item.className = 'participant-message-own';
      const meta = document.createElement('span'); meta.className = 'participant-message-meta'; meta.textContent = message.senderName + ' · ' + new Date(message.sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const body = document.createElement('span'); body.className = 'participant-message-body'; body.textContent = message.body;
      item.append(meta, body); list.append(item);
    }
    list.scrollTop = list.scrollHeight;
  }
  function resetParticipantChat() {
    participantConfig = null; chatMessages.length = 0;
    $('participant-channel').replaceChildren(new Option('No channels'));
    $('participant-channel').disabled = true; $('participant-message').disabled = true; $('participant-chat-form').querySelector('button').disabled = true;
    $('chat-status').textContent = 'Waiting for an experimenter connection.'; $('chat-toggle').dataset.unread = 'false'; renderParticipantChat();
  }
  function panel(id, open, manageFocus = true) {
    const selected = $(id), wasOpen = !selected.hidden;
    const toggles = { help: 'help-toggle', 'project-panel': 'project-toggle', 'peer-panel': 'peer-toggle', 'chat-panel': 'chat-toggle' };
    for (const other of Object.keys(toggles)) {
      const expanded = other === id && open; $(other).hidden = !expanded;
      $(toggles[other]).setAttribute('aria-expanded', String(expanded));
    }
    if (!manageFocus) return;
    const toggle = $(toggles[id]);
    if (open) requestAnimationFrame(() => selected.querySelector('button, a')?.focus());
    else if (wasOpen && document.activeElement?.closest('#' + id)) toggle.focus();
  }
  $('help-toggle').addEventListener('click', () => panel('help', $('help').hidden));
  $('help-close').addEventListener('click', () => panel('help', false));
  $('project-toggle').addEventListener('click', () => panel('project-panel', $('project-panel').hidden));
  $('project-close').addEventListener('click', () => panel('project-panel', false));
  $('peer-toggle').addEventListener('click', () => panel('peer-panel', $('peer-panel').hidden));
  $('peer-close').addEventListener('click', () => panel('peer-panel', false));
  $('chat-toggle').addEventListener('click', () => { const open = $('chat-panel').hidden; panel('chat-panel', open); if (open) $('chat-toggle').dataset.unread = 'false'; });
  $('chat-close').addEventListener('click', () => panel('chat-panel', false));
  $('participant-channel').addEventListener('change', () => { $('chat-toggle').dataset.unread = 'false'; renderParticipantChat(); });
  $('participant-chat-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const body = $('participant-message').value.trim(); if (!body || !participantConfig) return;
      ensurePeer().sendChat({ id: crypto.randomUUID(), channel: $('participant-channel').value, senderId: participantConfig.member.id, senderName: participantConfig.member.name, body });
      $('participant-message').value = '';
    } catch (error) { peerError(error); }
  });
  $('peer-create-offer').addEventListener('click', async () => {
    try {
      resetParticipantChat();
      peerStatus('Creating an offer…', 'working');
      $('peer-local-code').value = await ensurePeer().createOffer();
      $('peer-copy').disabled = false; $('peer-local-code').focus(); $('peer-local-code').select();
    } catch (error) { peerError(error); }
  });
  $('peer-answer').addEventListener('click', async () => {
    try {
      resetParticipantChat();
      peerStatus('Creating an answer…', 'working');
      $('peer-local-code').value = await ensurePeer().answerOffer($('peer-remote-code').value);
      $('peer-copy').disabled = false; $('peer-local-code').focus(); $('peer-local-code').select();
    } catch (error) { peerError(error); }
  });
  $('peer-accept').addEventListener('click', async () => {
    try { await ensurePeer().acceptAnswer($('peer-remote-code').value); }
    catch (error) { peerError(error); }
  });
  $('peer-copy').addEventListener('click', async () => {
    try {
      if (!$('peer-local-code').value) throw new Error('Create a connection code first.');
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText($('peer-local-code').value);
      else { $('peer-local-code').focus(); $('peer-local-code').select(); if (!document.execCommand('copy')) throw new Error('Copy the selected code manually.'); }
      peerStatus('My code was copied. Send it to the other person.', 'ready');
    } catch (error) { peerError(error); }
  });
  $('peer-send').addEventListener('click', async () => {
    try {
      await saveName();
      ensurePeer().sendProject(HyformProject.validateProject(await HyformStore.read()));
      peerStatus('Current project sent directly.', 'connected'); status('Project sent directly to the connected browser.');
    } catch (error) { peerError(error); }
  });
  $('peer-disconnect').addEventListener('click', () => { if (peer) peer.close(); peer = null; });
  $('peer-allow-collection').addEventListener('change', event => {
    if (!event.target.checked) {
      collectionEnabled = false;
      if (peerConnected) peerStatus('Experimenter data collection is paused. Individual mode remains active.', 'connected');
    } else if (peerConnected) peerStatus('Collection permission enabled. The experimenter can now request the project.', 'connected');
  });
  $('peer-dismiss').addEventListener('click', () => { incomingProject = null; $('peer-incoming').hidden = true; });
  $('peer-apply').addEventListener('click', async () => {
    if (!incomingProject) return;
    if (!await confirmChange('Replace your project with “' + incomingProject.name + '”?', 'Save your current project file first if you want to keep a separate copy. Applying the incoming project ends this direct connection.')) return;
    await HyformStore.update(() => incomingProject); location.reload();
  });
  $('fullscreen-toggle').addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch (_) { status('Full screen is unavailable in this browser window. The workspace already fills the available space.'); }
  });
  document.addEventListener('fullscreenchange', () => $('fullscreen-toggle').textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen');
  async function saveName() {
    clearTimeout(nameSaveTimer); nameSaveTimer = null; saveState('Saving…', 'saving');
    const name = $('project-name').value.trim() || 'Untitled project';
    try {
      await HyformStore.update(p => { p.name = name; p.updatedAt = new Date().toISOString(); return p; });
      if (!$('project-name').value.trim()) $('project-name').value = name;
      saveState('Saved locally'); return name;
    } catch (error) { saveState('Save failed', 'error'); throw error; }
  }
  function scheduleNameSave() {
    clearTimeout(nameSaveTimer); saveState('Saving…', 'saving');
    nameSaveTimer = setTimeout(() => saveName().catch(error => status(error.message, true)), 350);
  }
  $('project-name').addEventListener('input', scheduleNameSave);
  $('project-name').addEventListener('blur', () => { if (nameSaveTimer) saveName().catch(error => status(error.message, true)); });
  $('workflow-link').addEventListener('click', event => {
    if ($('workflow-link').getAttribute('href') !== '#help') return;
    event.preventDefault(); panel('help', true);
  });
  // Prevent the legacy Unity runtime from consuming keys meant for HTML controls.
  for (const type of ['keydown', 'keyup', 'keypress']) window.addEventListener(type, event => {
    if (type === 'keydown' && event.key === 'Escape' && !$('confirmation').open) {
      const openPanel = ['help', 'project-panel', 'peer-panel', 'chat-panel'].find(id => !$(id).hidden);
      if (openPanel) { event.preventDefault(); event.stopImmediatePropagation(); panel(openPanel, false); return; }
    }
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
          saveState('Saved locally');
          const action = event.data.action || '';
          if (scene === 'design') {
            if (action.startsWith('designer;Evaluated;')) setEvaluationPhase('results');
            else if (action.startsWith('designer;Evaluate;')) setEvaluationPhase('running');
            else if (action === 'designer;DesignMode') setEvaluationPhase('design');
          }
          if (peerConnected && collectionEnabled) {
            try { if (action) peer.sendActivity(action, scene); } catch (error) { peerError(error); }
            clearTimeout(peerSendTimer);
            peerSendTimer = setTimeout(async () => {
              try { peer.sendProject(HyformProject.validateProject(await HyformStore.read())); }
              catch (error) { peerError(error); }
            }, 400);
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
