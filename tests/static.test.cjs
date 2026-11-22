const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
test('all locally linked page assets are included in the portable release', () => {
  for (const file of ['index.html', 'designer.html', 'ops.html', 'business.html', 'experimenter.html', 'about.html']) {
    const html = fs.readFileSync(path.join(root, 'docs', file), 'utf8');
    for (const match of html.matchAll(/(?:src|href)="(\.\/[^"?#]+)"/g)) assert.ok(fs.existsSync(path.join(root, 'docs', match[1])), `${file}: missing ${match[1]}`);
    assert.doesNotMatch(html, /<script[^>]+src="https?:/);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'docs/index.html'), 'utf8'), /UnityLoader/);
});
test('the wrapper exposes distinct local tools and a non-overlapping evaluation dock', () => {
  const designer = fs.readFileSync(path.join(root, 'docs/designer.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'docs/app.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'docs/studio.css'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'docs/service-worker.js'), 'utf8');
  assert.match(designer, /id="evaluation-dock"/);
  assert.match(designer, /id="back-to-design"/);
  assert.match(app, /designer;Evaluate;/);
  assert.match(app, /designer;Evaluated;/);
  assert.doesNotMatch(app, /result\s*=\s*['"]Success/);
  assert.match(css, /\.designer-main\.evaluation-active \.canvas-wrap\{bottom:/);
  assert.match(worker, /BRIDGE_VERSION = 2/);
  assert.doesNotMatch(worker, /caches\.(?:open|match|keys)/);
  for (const endpoint of ['/repo/scenario/', '/repo/planshort/', '/repo/plan/']) assert.ok(worker.includes(endpoint));
  for (const endpoint of ['/ai/designer1/', '/ai/opsplan/']) assert.ok(worker.includes(endpoint));
  assert.match(app, /use_ai: 'True'/);
  assert.ok(fs.statSync(path.join(root, 'docs/ai/designerAI.csv')).size > 100000);
});
test('each workspace exposes local save feedback and a contextual workflow handoff', () => {
  const app = fs.readFileSync(path.join(root, 'docs/app.js'), 'utf8');
  for (const file of ['designer.html', 'ops.html', 'business.html']) {
    const html = fs.readFileSync(path.join(root, 'docs', file), 'utf8');
    assert.match(html, /id="save-state"[^>]+aria-live="polite"/);
    assert.match(html, /id="workflow-card"/);
    assert.match(html, /id="workflow-link"/);
  }
  assert.match(app, /Saved locally/);
  assert.match(app, /Open Operations/);
  assert.match(app, /Open Business/);
  assert.match(app, /event\.key === 'Escape'/);
});
test('individual mode is independent and experimenter collection is explicit', () => {
  const experimenter = fs.readFileSync(path.join(root, 'docs/experimenter.html'), 'utf8');
  const experimenterApp = fs.readFileSync(path.join(root, 'docs/experimenter.js'), 'utf8');
  for (const file of ['designer.html', 'ops.html', 'business.html']) {
    const html = fs.readFileSync(path.join(root, 'docs', file), 'utf8');
    assert.match(html, /id="peer-toggle"/);
    assert.match(html, /id="peer-allow-collection" type="checkbox"/);
    assert.doesNotMatch(html, /peer-allow-collection" type="checkbox" checked/);
  }
  assert.match(experimenter, /id="member-template"/);
  assert.match(experimenter, /id="add-team-form"/);
  assert.match(experimenter, /id="chat-channel"/);
  assert.match(experimenter, /class="member-team"/);
  assert.match(experimenter, /class="member-role"/);
  assert.match(experimenter, /Create offer/);
  assert.match(experimenterApp, /requestProject\(\)/);
  assert.match(experimenterApp, /hyform-experiment-data/);
  assert.match(experimenterApp, /hyform-team-experiment-data/);
  assert.match(experimenterApp, /All participants · Announcements/);
  assert.match(experimenterApp, /Session/);
  assert.match(experimenterApp, /Help ·/);
  assert.match(experimenterApp, /channelRecipients/);
});
test('the original compiled simulator is unchanged', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'upstream-assets.json')));
  for (const file of manifest.files) {
    const bytes = fs.readFileSync(path.join(root, 'docs/Build', file.file));
    assert.equal(bytes.length, file.bytes);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), file.sha256, file.file);
  }
});
test('the shipped example is a valid project with a distinct unfinished draft', () => {
  const model = require('../docs/project-model.js');
  const p = model.validateProject(JSON.parse(fs.readFileSync(path.join(root, 'example.hyform.json'))));
  assert.equal(p.vehicles.length, 1);
  assert.notEqual(p.draftConfig, p.vehicles[0].config);
  assert.equal(p.lastEvaluation.payload, 6);
});
