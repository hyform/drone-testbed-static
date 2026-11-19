/* Manual, serverless WebRTC project transfer for HyForm. */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HyformPeer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const CODE_FORMAT = 'hyform-webrtc';
  const PROJECT_FORMAT = 'hyform-peer-project';
  const CONTROL_FORMAT = 'hyform-peer-control';
  const ACTIVITY_FORMAT = 'hyform-peer-activity';
  const CHAT_FORMAT = 'hyform-peer-chat';
  const CONFIG_FORMAT = 'hyform-peer-config';
  const VERSION = 1;
  const MAX_CODE_BYTES = 200 * 1024;
  const MAX_PROJECT_BYTES = 5 * 1024 * 1024;
  const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

  function bytes(value) { return new TextEncoder().encode(value).byteLength; }
  function base64url(value) {
    const encoded = new TextEncoder().encode(value);
    let binary = '';
    for (let offset = 0; offset < encoded.length; offset += 8192) {
      binary += String.fromCharCode(...encoded.subarray(offset, offset + 8192));
    }
    return root.btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  }
  function unbase64url(value) {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
    const binary = root.atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
    return new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
  }
  function encodeDescription(description) {
    if (!description || !['offer', 'answer'].includes(description.type) || typeof description.sdp !== 'string' || !description.sdp) {
      throw new Error('The browser did not create a valid connection description.');
    }
    return base64url(JSON.stringify({ format: CODE_FORMAT, version: VERSION, type: description.type, sdp: description.sdp }));
  }
  function decodeDescription(code, expectedType) {
    if (typeof code !== 'string' || !code.trim() || bytes(code.trim()) > MAX_CODE_BYTES) throw new Error('The connection code is missing or too large.');
    let value;
    try { value = JSON.parse(unbase64url(code.trim())); }
    catch (_) { throw new Error('This is not a valid HyForm connection code.'); }
    if (!value || value.format !== CODE_FORMAT || value.version !== VERSION || !['offer', 'answer'].includes(value.type)
      || typeof value.sdp !== 'string' || !value.sdp || bytes(value.sdp) > MAX_CODE_BYTES) {
      throw new Error('This is not a supported HyForm connection code.');
    }
    if (expectedType && value.type !== expectedType) throw new Error('Paste a HyForm ' + expectedType + ' code here.');
    return { type: value.type, sdp: value.sdp };
  }
  function projectMessage(project) {
    const message = JSON.stringify({ format: PROJECT_FORMAT, version: VERSION, sentAt: new Date().toISOString(), project });
    if (bytes(message) > MAX_PROJECT_BYTES) throw new Error('The project is too large to send.');
    return message;
  }
  function controlMessage(type) {
    if (type !== 'request-project') throw new Error('Unsupported peer request.');
    return JSON.stringify({ format: CONTROL_FORMAT, version: VERSION, type, sentAt: new Date().toISOString() });
  }
  function activityMessage(action, scene) {
    if (typeof action !== 'string' || !action || bytes(action) > 20 * 1024) throw new Error('The activity record is invalid.');
    if (!['design', 'ops', 'business'].includes(scene)) throw new Error('The activity workspace is invalid.');
    return JSON.stringify({ format: ACTIVITY_FORMAT, version: VERSION, action, scene, sentAt: new Date().toISOString() });
  }
  function cleanText(value, name, max) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid ' + name + '.');
    return value.trim();
  }
  function chatMessage(value) {
    const message = {
      format: CHAT_FORMAT, version: VERSION,
      id: cleanText(value.id, 'chat message id', 100), channel: cleanText(value.channel, 'chat channel', 200),
      senderId: cleanText(value.senderId, 'chat sender id', 120), senderName: cleanText(value.senderName, 'chat sender name', 120),
      body: cleanText(value.body, 'chat message', 4000), sentAt: value.sentAt || new Date().toISOString()
    };
    if (typeof message.sentAt !== 'string' || message.sentAt.length > 40) throw new Error('Invalid chat timestamp.');
    return JSON.stringify(message);
  }
  function configMessage(value) {
    const member = value?.member, channels = value?.channels;
    if (!member || !Array.isArray(channels) || channels.length > 20) throw new Error('Invalid participant configuration.');
    const normalized = {
      format: CONFIG_FORMAT, version: VERSION,
      member: {
        id: cleanText(member.id, 'participant id', 120), name: cleanText(member.name, 'participant name', 120),
        teamId: cleanText(member.teamId, 'team id', 120), teamName: cleanText(member.teamName, 'team name', 120),
        role: cleanText(member.role, 'participant position', 50)
      },
      channels: channels.map(channel => ({ id: cleanText(channel.id, 'channel id', 200), label: cleanText(channel.label, 'channel label', 120), kind: cleanText(channel.kind, 'channel kind', 30) })),
      sentAt: new Date().toISOString()
    };
    return JSON.stringify(normalized);
  }
  function parseMessage(message) {
    if (typeof message !== 'string' || bytes(message) > MAX_PROJECT_BYTES) throw new Error('The incoming project is too large.');
    let value;
    try { value = JSON.parse(message); } catch (_) { throw new Error('The peer sent invalid project data.'); }
    if (value?.format === PROJECT_FORMAT && value.version === VERSION && typeof value.sentAt === 'string' && value.project) return { kind: 'project', ...value };
    if (value?.format === CONTROL_FORMAT && value.version === VERSION && value.type === 'request-project' && typeof value.sentAt === 'string') return { kind: 'control', ...value };
    if (value?.format === ACTIVITY_FORMAT && value.version === VERSION && typeof value.sentAt === 'string'
      && typeof value.action === 'string' && value.action && bytes(value.action) <= 20 * 1024 && ['design', 'ops', 'business'].includes(value.scene)) return { kind: 'activity', ...value };
    if (value?.format === CHAT_FORMAT && value.version === VERSION) return { kind: 'chat', ...JSON.parse(chatMessage(value)) };
    if (value?.format === CONFIG_FORMAT && value.version === VERSION) return { kind: 'config', ...JSON.parse(configMessage(value)) };
    throw new Error('The peer sent an unsupported HyForm message.');
  }
  function parseProjectMessage(message) {
    const value = parseMessage(message);
    if (value.kind !== 'project') throw new Error('The peer sent an unsupported HyForm message.');
    return value;
  }
  function waitForIce(connection, timeout = 8000) {
    if (connection.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise(resolve => {
      const timer = setTimeout(finish, timeout);
      function finish() {
        clearTimeout(timer);
        connection.removeEventListener('icegatheringstatechange', changed);
        resolve();
      }
      function changed() { if (connection.iceGatheringState === 'complete') finish(); }
      connection.addEventListener('icegatheringstatechange', changed);
    });
  }
  function create(options = {}) {
    const PeerConnection = options.RTCPeerConnection || root.RTCPeerConnection;
    if (!PeerConnection) throw new Error('This browser does not support WebRTC peer connections.');
    let connection = null, channel = null;
    const onState = options.onState || (() => {});
    const onProject = options.onProject || (() => {});
    const onProjectRequest = options.onProjectRequest || (() => {});
    const onActivity = options.onActivity || (() => {});
    const onChat = options.onChat || (() => {});
    const onConfig = options.onConfig || (() => {});
    const onError = options.onError || (() => {});

    function state(value) { onState(value); }
    function reset(notify = false) {
      if (channel) { channel.onopen = channel.onclose = channel.onerror = channel.onmessage = null; channel.close(); }
      if (connection) connection.close();
      channel = null; connection = null;
      if (notify) state('closed');
    }
    function attachChannel(next) {
      channel = next;
      channel.onopen = () => state('connected');
      channel.onclose = () => state('disconnected');
      channel.onerror = () => onError(new Error('The direct connection encountered an error.'));
      channel.onmessage = event => {
        try {
          const packet = parseMessage(event.data);
          if (packet.kind === 'project') onProject(packet.project, packet.sentAt);
          else if (packet.kind === 'activity') onActivity(packet);
          else if (packet.kind === 'chat') onChat(packet);
          else if (packet.kind === 'config') onConfig(packet);
          else onProjectRequest(packet.sentAt);
        } catch (error) { onError(error); }
      };
    }
    function makeConnection() {
      connection = new PeerConnection({ iceServers: options.iceServers || DEFAULT_ICE_SERVERS });
      connection.onconnectionstatechange = () => {
        const current = connection?.connectionState;
        // The peer connection can report connected before its data channel is
        // open. Treat the channel's open event as the only usable-connection
        // signal so callers never send configuration into a half-open channel.
        if (current === 'failed') state('failed');
        else if (current === 'disconnected') state('disconnected');
        else if (current === 'connecting') state('connecting');
      };
      return connection;
    }
    async function createOffer() {
      reset();
      const peer = makeConnection();
      attachChannel(peer.createDataChannel('hyform-project', { ordered: true }));
      await peer.setLocalDescription(await peer.createOffer());
      state('gathering');
      await waitForIce(peer, options.iceTimeout);
      state('offer-ready');
      return encodeDescription(peer.localDescription);
    }
    async function answerOffer(code) {
      const offer = decodeDescription(code, 'offer');
      reset();
      const peer = makeConnection();
      peer.ondatachannel = event => attachChannel(event.channel);
      await peer.setRemoteDescription(offer);
      await peer.setLocalDescription(await peer.createAnswer());
      state('gathering');
      await waitForIce(peer, options.iceTimeout);
      state('answer-ready');
      return encodeDescription(peer.localDescription);
    }
    async function acceptAnswer(code) {
      if (!connection || connection.localDescription?.type !== 'offer') throw new Error('Create an offer before using an answer.');
      await connection.setRemoteDescription(decodeDescription(code, 'answer'));
      state('connecting');
    }
    function sendProject(project) {
      if (!channel || channel.readyState !== 'open') throw new Error('Connect to the other browser before sending a project.');
      channel.send(projectMessage(project));
    }
    function requestProject() {
      if (!channel || channel.readyState !== 'open') throw new Error('Connect to the other browser before requesting a project.');
      channel.send(controlMessage('request-project'));
    }
    function sendActivity(action, scene) {
      if (!channel || channel.readyState !== 'open') throw new Error('Connect to the experimenter before sending activity.');
      channel.send(activityMessage(action, scene));
    }
    function sendChat(value) {
      if (!channel || channel.readyState !== 'open') throw new Error('Connect to the experimenter before sending chat.');
      channel.send(chatMessage(value));
    }
    function sendConfig(value) {
      if (!channel || channel.readyState !== 'open') throw new Error('Connect to the participant before sending configuration.');
      channel.send(configMessage(value));
    }
    return { createOffer, answerOffer, acceptAnswer, sendProject, requestProject, sendActivity, sendChat, sendConfig, close: () => reset(true) };
  }

  return { MAX_PROJECT_BYTES, encodeDescription, decodeDescription, projectMessage, controlMessage, activityMessage, chatMessage, configMessage, parseMessage, parseProjectMessage, create };
});
