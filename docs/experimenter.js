/* Local multi-team experimenter console for manual WebRTC sessions. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const members = new Map(), teams = new Map(), peers = new Map(), cards = new Map(), connected = new Set();
  const messages = [], messageIds = new Set();
  const ROLES = ['Design', 'Operations', 'Business', 'Observer'];

  function status(message, error = false) { $('experimenter-status').textContent = message; $('experimenter-status').classList.toggle('error', error); }
  function updateTotals() {
    $('team-count').textContent = teams.size.toLocaleString(); $('member-count').textContent = members.size.toLocaleString(); $('connected-count').textContent = connected.size.toLocaleString();
    $('empty-roster').hidden = members.size !== 0;
  }
  function filename(value) { return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'hyform-session'; }
  function download(name, value) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function isIndividual(member) { return !member.teamId || member.teamId.startsWith('individual:'); }
  function teamFor(member) {
    if (isIndividual(member)) return { id: 'individual:' + member.id, name: 'Individual', individual: true };
    return teams.get(member.teamId) || { id: member.teamId, name: 'Unassigned team', individual: false };
  }
  function memberChannels(member) {
    const team = teamFor(member), channels = [{ id: 'all', label: 'All participants · Announcements', kind: 'all' }];
    if (!team.individual) {
      channels.push({ id: 'team:' + team.id, label: team.name + ' · Session', kind: 'team' });
      channels.push({ id: 'role:' + team.id + ':' + member.role.toLowerCase(), label: team.name + ' · ' + member.role, kind: 'position' });
    }
    channels.push({ id: 'direct:' + member.id, label: 'Help · Experimenter', kind: 'help' });
    return channels;
  }
  function configFor(member) {
    const team = teamFor(member);
    return { member: { id: member.id, name: member.name, teamId: team.id, teamName: team.name, role: member.role }, channels: memberChannels(member) };
  }
  function channelRecipients(channel) {
    if (channel === 'all') return [...members.keys()];
    if (channel.startsWith('direct:')) return [channel.slice('direct:'.length)];
    if (channel.startsWith('team:')) return [...members.values()].filter(member => member.teamId === channel.slice('team:'.length)).map(member => member.id);
    if (channel.startsWith('role:')) {
      const parts = channel.split(':'); return [...members.values()].filter(member => member.teamId === parts[1] && member.role.toLowerCase() === parts.slice(2).join(':')).map(member => member.id);
    }
    return [];
  }
  function allChannels() {
    const values = [{ id: 'all', label: 'All participants · Announcements' }];
    for (const team of teams.values()) {
      values.push({ id: 'team:' + team.id, label: team.name + ' · Session' });
      for (const role of ROLES) values.push({ id: 'role:' + team.id + ':' + role.toLowerCase(), label: team.name + ' · ' + role });
    }
    for (const member of members.values()) values.push({ id: 'direct:' + member.id, label: 'Help · ' + member.name });
    return values;
  }
  function refreshChatChannels() {
    const select = $('chat-channel'), current = select.value, channels = allChannels(); select.replaceChildren();
    for (const channel of channels) { const option = document.createElement('option'); option.value = channel.id; option.textContent = channel.label; select.append(option); }
    select.disabled = members.size === 0; $('chat-message').disabled = members.size === 0; $('chat-form').querySelector('button').disabled = members.size === 0;
    if (channels.some(channel => channel.id === current)) select.value = current;
    renderChat();
  }
  function renderChat() {
    const list = $('chat-messages'), channel = $('chat-channel').value; list.replaceChildren();
    const visible = messages.filter(message => message.channel === channel);
    if (!visible.length) { const empty = document.createElement('li'); empty.className = 'chat-empty'; empty.textContent = members.size ? 'No messages in this channel yet.' : 'Add and connect participants to start channelized chat.'; list.append(empty); return; }
    for (const message of visible) {
      const item = document.createElement('li'); if (message.senderId === 'experimenter') item.className = 'chat-message-experimenter';
      const meta = document.createElement('span'); meta.className = 'chat-message-meta'; meta.textContent = message.senderName + ' · ' + new Date(message.sentAt).toLocaleString();
      const body = document.createElement('span'); body.className = 'chat-message-body'; body.textContent = message.body;
      item.append(meta, body); list.append(item);
    }
    list.scrollTop = list.scrollHeight;
  }
  async function recordMessage(message) {
    if (messageIds.has(message.id)) return;
    messageIds.add(message.id); messages.push(message); messages.sort((left, right) => left.sentAt.localeCompare(right.sentAt));
    await HyformExperimenterStore.putMessage(message); renderChat();
  }
  function relayMessage(message) {
    for (const memberId of channelRecipients(message.channel)) {
      if (!connected.has(memberId)) continue;
      try { peers.get(memberId)?.sendChat(message); } catch (error) { status(error.message, true); }
    }
  }
  function sendMemberConfig(member) {
    const peer = peers.get(member.id); if (!peer || !connected.has(member.id)) return;
    peer.sendConfig(configFor(member));
    const allowed = new Set(memberChannels(member).map(channel => channel.id));
    for (const message of messages.filter(message => allowed.has(message.channel)).slice(-100)) peer.sendChat(message);
  }
  function setConnection(member, state) {
    const card = cards.get(member.id); if (!card) return;
    const label = card.querySelector('.connection-state');
    const names = { gathering: 'Finding route…', 'offer-ready': 'Offer ready', connecting: 'Connecting…', connected: 'Connected', disconnected: 'Disconnected', failed: 'Connection failed', closed: 'Not connected' };
    label.textContent = names[state] || 'Preparing…'; label.className = 'connection-state' + (state === 'connected' ? ' connected' : state === 'failed' ? ' error' : '');
    if (state === 'connected') {
      connected.add(member.id); card.querySelector('.request-project').disabled = false; card.querySelector('.disconnect').disabled = false;
      try { sendMemberConfig(members.get(member.id)); } catch (error) { status(error.message, true); }
      setTimeout(() => { try { peers.get(member.id)?.requestProject(); status('Connected to ' + member.name + ' and requested their latest project.'); } catch (error) { status(error.message, true); } }, 250);
    } else {
      connected.delete(member.id); card.querySelector('.request-project').disabled = true; card.querySelector('.disconnect').disabled = true;
    }
    updateTotals();
  }
  function updateSnapshot(member) {
    const card = cards.get(member.id); if (!card) return;
    const hasProject = !!member.project, team = teamFor(member);
    card.querySelector('.assignment-label').textContent = team.name + ' · ' + member.role;
    card.querySelector('.design-count').textContent = hasProject ? member.project.vehicles.length.toLocaleString() : '—';
    card.querySelector('.plan-count').textContent = hasProject ? member.project.plans.length.toLocaleString() : '—';
    card.querySelector('.event-count').textContent = (member.events || []).length.toLocaleString();
    card.querySelector('.snapshot-state').textContent = hasProject ? 'Latest: “' + member.project.name + '” · ' + new Date(member.receivedAt).toLocaleString() : 'No project snapshot collected.';
    for (const selector of ['.download-project', '.open-project']) card.querySelector(selector).disabled = !hasProject;
    card.querySelector('.download-data').disabled = !hasProject && !(member.events || []).length;
  }
  function peerFor(member) {
    if (peers.has(member.id)) return peers.get(member.id);
    const peer = HyformPeer.create({
      onState: state => setConnection(member, state),
      onError: error => status(member.name + ': ' + error.message, true),
      onProject: async value => {
        try {
          const project = HyformProject.validateProject(value);
          const next = await HyformExperimenterStore.update(member.id, current => ({ ...current, project, receivedAt: new Date().toISOString() }));
          members.set(member.id, next); member = next; updateSnapshot(next); status('Collected a validated project snapshot from ' + next.name + '.');
        } catch (error) { status('Rejected data from ' + member.name + ': ' + error.message, true); }
      },
      onActivity: async event => {
        try {
          const next = await HyformExperimenterStore.update(member.id, current => ({ ...current, events: [...(current.events || []), { scene: event.scene, action: event.action, sentAt: event.sentAt }].slice(-5000) }));
          members.set(member.id, next); member = next; updateSnapshot(next);
        } catch (error) { status(member.name + ': ' + error.message, true); }
      },
      onChat: async value => {
        try {
          const current = members.get(member.id), allowed = new Set(memberChannels(current).map(channel => channel.id));
          if (!allowed.has(value.channel)) throw new Error('This participant is not assigned to that channel.');
          const message = { id: value.id, channel: value.channel, senderId: current.id, senderName: current.name, body: value.body, sentAt: value.sentAt };
          await recordMessage(message); relayMessage(message);
        } catch (error) { status(member.name + ': ' + error.message, true); }
      }
    });
    peers.set(member.id, peer); return peer;
  }
  function copyCode(textarea) {
    if (!textarea.value) throw new Error('Create an offer first.');
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(textarea.value);
    textarea.focus(); textarea.select(); if (!document.execCommand('copy')) throw new Error('Copy the selected offer manually.'); return Promise.resolve();
  }
  function fillTeamSelect(select, member) {
    select.replaceChildren(); const individual = document.createElement('option'); individual.value = 'individual'; individual.textContent = 'Individual / no team'; select.append(individual);
    for (const team of teams.values()) { const option = document.createElement('option'); option.value = team.id; option.textContent = team.name; select.append(option); }
    select.value = isIndividual(member) ? 'individual' : member.teamId;
  }
  function renderTeamControls() {
    const list = $('team-list'); list.replaceChildren();
    for (const team of teams.values()) {
      const chip = document.createElement('span'); chip.className = 'team-chip';
      const label = document.createElement('span'); label.textContent = team.name;
      const exportButton = document.createElement('button'); exportButton.textContent = 'Export'; exportButton.setAttribute('aria-label', 'Export ' + team.name);
      exportButton.addEventListener('click', () => {
        const teamMembers = [...members.values()].filter(member => member.teamId === team.id), ids = new Set(teamMembers.map(member => member.id));
        const teamMessages = messages.filter(message => message.channel === 'team:' + team.id || message.channel.startsWith('role:' + team.id + ':') || (message.channel.startsWith('direct:') && ids.has(message.channel.slice(7))));
        download(filename(team.name) + '-experiment-data.json', { format: 'hyform-team-experiment-data', version: 1, team, exportedAt: new Date().toISOString(), members: teamMembers, messages: teamMessages });
      });
      const removeButton = document.createElement('button'); removeButton.textContent = '×'; removeButton.setAttribute('aria-label', 'Remove ' + team.name);
      removeButton.addEventListener('click', async () => {
        if ([...members.values()].some(member => member.teamId === team.id)) { status('Reassign or remove ' + team.name + ' participants before removing the team.', true); return; }
        await Promise.all([HyformExperimenterStore.removeTeam(team.id), HyformExperimenterStore.removeMessagesForTeam(team.id)]);
        for (let index = messages.length - 1; index >= 0; index--) {
          if (messages[index].channel === 'team:' + team.id || messages[index].channel.startsWith('role:' + team.id + ':')) { messageIds.delete(messages[index].id); messages.splice(index, 1); }
        }
        teams.delete(team.id); renderTeamControls(); refreshChatChannels(); updateTotals();
      });
      chip.append(label, exportButton, removeButton); list.append(chip);
    }
    const addSelect = $('member-team'), current = addSelect.value; fillTeamSelect(addSelect, { id: 'new', teamId: current === 'individual' ? 'individual:new' : current });
    for (const member of members.values()) { const card = cards.get(member.id); if (card) { fillTeamSelect(card.querySelector('.member-team'), member); updateSnapshot(member); } }
  }
  async function changeAssignment(member, card) {
    const selection = card.querySelector('.member-team').value, role = card.querySelector('.member-role').value;
    const next = { ...members.get(member.id), teamId: selection === 'individual' ? 'individual:' + member.id : selection, role };
    await HyformExperimenterStore.put(next); members.set(member.id, next); member = next; updateSnapshot(next); refreshChatChannels();
    if (connected.has(next.id)) sendMemberConfig(next);
    status(next.name + ' is assigned to ' + teamFor(next).name + ' · ' + next.role + '.');
  }
  function addCard(member) {
    members.set(member.id, member);
    const card = $('member-template').content.firstElementChild.cloneNode(true); cards.set(member.id, card);
    card.querySelector('.member-name').textContent = member.name; $('member-grid').append(card);
    fillTeamSelect(card.querySelector('.member-team'), member); card.querySelector('.member-role').value = member.role; updateSnapshot(member); updateTotals(); refreshChatChannels();
    card.querySelector('.member-team').addEventListener('change', () => changeAssignment(member, card).catch(error => status(error.message, true)));
    card.querySelector('.member-role').addEventListener('change', () => changeAssignment(member, card).catch(error => status(error.message, true)));
    card.querySelector('.create-offer').addEventListener('click', async () => {
      try { setConnection(member, 'gathering'); card.querySelector('.local-code').value = await peerFor(member).createOffer(); card.querySelector('.copy-code').disabled = false; card.querySelector('.local-code').focus(); card.querySelector('.local-code').select(); status('Offer ready for ' + member.name + '.'); }
      catch (error) { status(member.name + ': ' + error.message, true); }
    });
    card.querySelector('.copy-code').addEventListener('click', async () => { try { await copyCode(card.querySelector('.local-code')); status('Offer copied for ' + member.name + '.'); } catch (error) { status(error.message, true); } });
    card.querySelector('.accept-answer').addEventListener('click', async () => { try { await peerFor(member).acceptAnswer(card.querySelector('.remote-code').value); } catch (error) { status(member.name + ': ' + error.message, true); } });
    card.querySelector('.request-project').addEventListener('click', () => { try { peerFor(member).requestProject(); status('Requested the latest project from ' + member.name + '.'); } catch (error) { status(error.message, true); } });
    card.querySelector('.disconnect').addEventListener('click', () => { peers.get(member.id)?.close(); peers.delete(member.id); });
    card.querySelector('.download-project').addEventListener('click', () => download(filename(member.name) + '.hyform.json', members.get(member.id).project));
    card.querySelector('.download-data').addEventListener('click', () => {
      const current = members.get(member.id), allowed = new Set(memberChannels(current).map(channel => channel.id));
      download(filename(current.name) + '-experiment-data.json', { format: 'hyform-experiment-data', version: 2, member: current, exportedAt: new Date().toISOString(), latestProject: current.project || null, events: current.events || [], messages: messages.filter(message => allowed.has(message.channel)) });
    });
    card.querySelector('.open-project').addEventListener('click', async () => {
      const current = members.get(member.id); if (!current.project || !confirm('Open “' + current.project.name + '” in Design? This replaces the project currently stored in this browser.')) return;
      await HyformStore.update(() => HyformProject.validateProject(current.project)); location.href = './designer.html';
    });
    card.querySelector('.remove-member').addEventListener('click', async () => {
      if (!confirm('Remove ' + member.name + ' and their locally collected data from this roster?')) return;
      peers.get(member.id)?.close(); peers.delete(member.id); connected.delete(member.id);
      await Promise.all([HyformExperimenterStore.remove(member.id), HyformExperimenterStore.removeMessagesForMember(member.id)]);
      for (let index = messages.length - 1; index >= 0; index--) {
        if (messages[index].senderId === member.id || messages[index].channel === 'direct:' + member.id) { messageIds.delete(messages[index].id); messages.splice(index, 1); }
      }
      members.delete(member.id); cards.delete(member.id); card.remove(); renderTeamControls(); refreshChatChannels(); updateTotals(); status(member.name + ' was removed from the local roster.');
    });
  }
  $('add-team-form').addEventListener('submit', async event => {
    event.preventDefault(); const name = $('team-name').value.trim(); if (!name) return;
    const team = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
    try { await HyformExperimenterStore.putTeam(team); teams.set(team.id, team); $('team-name').value = ''; renderTeamControls(); refreshChatChannels(); updateTotals(); status(name + ' was added.'); }
    catch (error) { status(error.message, true); }
  });
  $('add-member-form').addEventListener('submit', async event => {
    event.preventDefault(); const name = $('member-name').value.trim(); if (!name) return;
    const id = crypto.randomUUID(), selected = $('member-team').value;
    const member = { id, name, teamId: selected === 'individual' ? 'individual:' + id : selected, role: $('member-role').value, createdAt: new Date().toISOString(), receivedAt: null, project: null, events: [] };
    try { await HyformExperimenterStore.put(member); addCard(member); $('member-name').value = ''; $('member-name').focus(); status(name + ' was added to ' + teamFor(member).name + '.'); }
    catch (error) { status(error.message, true); }
  });
  $('chat-channel').addEventListener('change', renderChat);
  $('chat-form').addEventListener('submit', async event => {
    event.preventDefault(); const body = $('chat-message').value.trim(); if (!body) return;
    const message = { id: crypto.randomUUID(), channel: $('chat-channel').value, senderId: 'experimenter', senderName: 'Experimenter', body, sentAt: new Date().toISOString() };
    try { await recordMessage(message); relayMessage(message); $('chat-message').value = ''; } catch (error) { status(error.message, true); }
  });
  Promise.all([HyformExperimenterStore.listTeams(), HyformExperimenterStore.list(), HyformExperimenterStore.listMessages()]).then(async ([savedTeams, savedMembers, savedMessages]) => {
    savedTeams.forEach(team => teams.set(team.id, team));
    for (let member of savedMembers) {
      if (!member.teamId || !member.role) { member = { ...member, teamId: 'individual:' + member.id, role: member.role || 'Observer' }; await HyformExperimenterStore.put(member); }
      addCard(member);
    }
    for (const message of savedMessages) { if (!messageIds.has(message.id)) { messageIds.add(message.id); messages.push(message); } }
    messages.sort((left, right) => left.sentAt.localeCompare(right.sentAt)); renderTeamControls(); refreshChatChannels(); updateTotals();
  }).catch(error => status(error.message, true));
})();
