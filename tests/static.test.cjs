const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
test('all locally linked page assets are included in the portable release', () => {
  for (const file of ['index.html', 'designer.html', 'ops.html', 'business.html', 'about.html']) {
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
  assert.match(worker, /hyform-static-6/);
  for (const endpoint of ['/repo/scenario/', '/repo/planshort/', '/repo/plan/']) assert.ok(worker.includes(endpoint));
});
test('every service-worker release asset exists', () => {
  const worker = fs.readFileSync(path.join(root, 'docs/service-worker.js'), 'utf8');
  const assets = worker.match(/const ASSETS = \[(.*?)\];/s)[1].matchAll(/'\.\/([^']*)'/g);
  for (const [, file] of assets) assert.ok(fs.existsSync(path.join(root, 'docs', file)), `missing cached asset: ${file}`);
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
