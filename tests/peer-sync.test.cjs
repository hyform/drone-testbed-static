const test = require('node:test');
const assert = require('node:assert/strict');
const peer = require('../docs/peer-sync.js');
const model = require('../docs/project-model.js');

test('manual WebRTC connection codes round-trip without project data', () => {
  const description = { type: 'offer', sdp: 'v=0\r\na=fingerprint:sha-256 00:11\r\n' };
  const code = peer.encodeDescription(description);
  assert.deepEqual(peer.decodeDescription(code, 'offer'), description);
  assert.doesNotMatch(code, /hyform-project/);
  assert.throws(() => peer.decodeDescription(code, 'answer'), /answer code/);
  assert.throws(() => peer.decodeDescription('not-a-code'), /valid HyForm connection code/);
});

test('peer project messages are bounded and carry versioned snapshots', () => {
  const project = model.newProject('Direct transfer');
  const message = peer.projectMessage(project);
  const parsed = peer.parseProjectMessage(message);
  assert.equal(parsed.format, 'hyform-peer-project');
  assert.equal(parsed.version, 1);
  assert.deepEqual(model.validateProject(parsed.project), project);
  assert.throws(() => peer.parseProjectMessage(JSON.stringify({ format: 'other' })), /unsupported/);
  assert.throws(() => peer.parseProjectMessage(peer.controlMessage('request-project')), /unsupported/);
  assert.throws(() => peer.controlMessage('delete-project'), /Unsupported peer request/);
  assert.throws(() => peer.parseProjectMessage('x'.repeat(peer.MAX_PROJECT_BYTES + 1)), /too large/);
});

test('activity packets are scoped to a HyForm workspace', () => {
  const packet = peer.parseMessage(peer.activityMessage('designer;Evaluate;test', 'design'));
  assert.equal(packet.kind, 'activity');
  assert.equal(packet.scene, 'design');
  assert.throws(() => peer.activityMessage('', 'design'), /activity record/);
  assert.throws(() => peer.activityMessage('event', 'admin'), /workspace/);
});

test('chat packets validate identity, channel, and bounded content', () => {
  const packet = peer.parseMessage(peer.chatMessage({
    id: 'message-1', channel: 'team:1', senderId: 'member-1',
    senderName: 'Designer 1', body: 'Ready to evaluate.'
  }));
  assert.equal(packet.kind, 'chat');
  assert.equal(packet.channel, 'team:1');
  assert.equal(packet.body, 'Ready to evaluate.');
  assert.throws(() => peer.chatMessage({ id: 'message-2', channel: 'team:1', senderId: 'member-1', senderName: 'Designer 1', body: '' }), /chat message/);
  assert.throws(() => peer.chatMessage({ id: 'message-3', channel: 'team:1', senderId: 'member-1', senderName: 'Designer 1', body: 'x'.repeat(4001) }), /chat message/);
});

test('participant configuration carries only the assigned channels', () => {
  const packet = peer.parseMessage(peer.configMessage({
    member: { id: 'member-1', name: 'Designer 1', teamId: 'team-1', teamName: 'Alpha', role: 'Design' },
    channels: [
      { id: 'all', label: 'All participants · Announcements', kind: 'all' },
      { id: 'team:team-1', label: 'Alpha · Session', kind: 'team' },
      { id: 'role:team-1:design', label: 'Alpha · Design', kind: 'position' },
      { id: 'direct:member-1', label: 'Help · Experimenter', kind: 'help' }
    ]
  }));
  assert.equal(packet.kind, 'config');
  assert.deepEqual(packet.channels.map(channel => channel.kind), ['all', 'team', 'position', 'help']);
  assert.throws(() => peer.configMessage({ member: packet.member, channels: Array.from({ length: 21 }, (_, index) => ({ id: 'c' + index, label: 'Channel', kind: 'team' })) }), /configuration/);
});
