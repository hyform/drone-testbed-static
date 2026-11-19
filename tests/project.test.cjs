const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../docs/project-model.js');
const market = require('../docs/market-data.js');

test('project files round-trip drafts, evaluated metrics, and the design library', () => {
  const p = model.newProject('Baseline study');
  p.draftConfig = model.BASE_CONFIG.replace(',5,', ',6,');
  p.vehicles.push({ id: 1, tag: 'Baseline', config: model.BASE_CONFIG, result: 'Success', range: 10, velocity: 20, cost: 3470, payload: 5, valid: true });
  model.applyLog(p, 'designer;Evaluated;' + p.draftConfig + ';range=9.50;capacity=6;cost=3470;velocity=19.90');
  assert.deepEqual(model.validateProject(JSON.parse(JSON.stringify(p))), p);
  assert.equal(p.lastEvaluation.result, 'MetricsRecorded');
});
test('geometry, capacity, undo, and reset logs preserve the current draft', () => {
  const p = model.newProject();
  model.applyLog(p, 'designer;CapacityInput;8');
  assert.equal(p.draftConfig, model.BASE_CONFIG.replace(',5,', ',8,'));
  const changed = model.BASE_CONFIG.replace('bNM2+++', 'bNM2++++');
  model.applyLog(p, 'designer;ScaleUp;' + changed + ';(1,0)');
  assert.equal(p.draftConfig, changed);
  model.applyLog(p, 'designer;Undo:' + model.BASE_CONFIG);
  assert.equal(p.draftConfig, model.BASE_CONFIG);
  model.applyLog(p, 'designer;CapacityInput;7');
  model.applyLog(p, 'designer;ResetDesign');
  assert.equal(p.draftConfig, model.BASE_CONFIG);
});
test('invalid imports fail before replacing the active project', () => {
  for (const change of [
    p => p.version = 2,
    p => p.draftConfig = '*aMM0*bNM2^az,5,3',
    p => p.draftConfig = '*aMM0*bPM2^ab,5,3',
    p => p.draftConfig = '*aMM0*bNM2,5,3',
    p => p.draftConfig = '*aMM0*aMM1,5,3',
    p => p.vehicles = [{id: 1, tag: 'bad', config: model.BASE_CONFIG, range: Infinity, velocity: 20, cost: 3, payload: 5}],
    p => p.vehicles = [{id: 1, tag: 'unknown result', config: model.BASE_CONFIG, range: 10, velocity: 20, cost: 3, payload: 5}],
    p => p.lastEvaluation = { config: model.BASE_CONFIG, result: 'Success', range: NaN }
  ]) {
    const p = model.newProject(); change(p);
    assert.throws(() => model.validateProject(p));
  }
});
test('imports strip arbitrary properties and reject duplicate design identifiers', () => {
  const p = model.newProject(); p.untrusted = '<script>';
  assert.equal(model.validateProject(p).untrusted, undefined);
  const v = {id:1,tag:'one',config:model.BASE_CONFIG,result:'Success',range:10,velocity:20,cost:3470,payload:5,valid:true};
  p.vehicles = [v, {...v}];
  assert.throws(() => model.validateProject(p), /duplicate design identifiers/);
});
test('failed physics metrics are never upgraded to a successful flight', () => {
  const p = model.newProject();
  model.applyLog(p, 'designer;Evaluated;' + model.BASE_CONFIG + ';range=-1.00;capacity=5;cost=3470;velocity=0.00');
  assert.equal(p.lastEvaluation.range, -1);
  assert.notEqual(p.lastEvaluation.result, 'Success');
});

test('version 1 projects without planning fields remain compatible', () => {
  const legacy = model.newProject('Legacy design');
  delete legacy.scenario;
  delete legacy.plans;
  const restored = model.validateProject(legacy);
  assert.equal(restored.scenario, null);
  assert.deepEqual(restored.plans, []);
});

test('the canonical local market and submitted plans round-trip in project files', () => {
  const scenario = market.createScenario();
  assert.equal(scenario.customers.length, 56);
  assert.deepEqual(scenario.warehouse.address, { id: 113, x: -3.5, z: 0, region: 'warehouse' });
  assert.equal(scenario.customers.filter(customer => customer.payload === 'food2').length, 10);

  const p = model.newProject('Delivery study');
  const vehicle = model.vehicle({ id: 1, tag: 'Baseline', config: model.BASE_CONFIG, result: 'Success', range: 10, velocity: 20, cost: 3470, payload: 5, valid: true });
  p.vehicles.push(vehicle); p.scenario = scenario;
  p.plans.push({
    id: 1, tag: 'North route', valid: true, scenario,
    paths: [{ id: 1, vehicle, warehouse: scenario.warehouse, customers: [{ ...scenario.customers[0], deliverytime: 0 }], leavetime: 0, returntime: 0 }]
  });
  const restored = model.validateProject(JSON.parse(JSON.stringify(p)));
  assert.equal(restored.plans[0].paths[0].vehicle.tag, 'Baseline');
  assert.equal(restored.plans[0].paths[0].customers[0].id, 57);
});
