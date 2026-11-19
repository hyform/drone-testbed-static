/* HyForm static project format. No browser or runtime dependencies. */
(function (root) {
  'use strict';
  const BASE_CONFIG = '*aMM0+++++*bNM2+++*cMN1+++*dLM2+++*eML1+++^ab^ac^ad^ae,5,3';
  const IDS = 'abcdefghijklmnopqrstuvwxyz!@#$%&()_=[]{ }<>123456789'.replace(' ', '');
  const FORMAT = 'hyform-project';
  const VERSION = 1;
  function text(value, name, max) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid ' + name + '.');
    return value;
  }
  function number(value, name, min = 0) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > 1e12) throw new Error('Invalid ' + name + '.');
    return value;
  }
  function configuration(value) {
    const config = text(value, 'design configuration', 10000);
    const parts = config.split(',');
    if (parts.length !== 3 || !/^\d{1,3}$/.test(parts[1]) || !/^\d{1,3}$/.test(parts[2])) throw new Error('Invalid design payload or control value.');
    const [components, ...edges] = parts[0].split('^');
    const tokens = components.split('*');
    if (tokens.shift() !== '' || !tokens.length || tokens.length > IDS.length) throw new Error('Invalid design components.');
    const nodes = new Map();
    for (const token of tokens) {
      if (token.length < 4 || !IDS.includes(token[0]) || !/^[A-Z]{2}[0-4](?:\+{0,50}|-{0,50})$/.test(token.slice(1)) || nodes.has(token[0])) throw new Error('Invalid or duplicate design component.');
      nodes.set(token[0], token);
    }
    if (!nodes.has('a') || nodes.get('a').slice(1, 3) !== 'MM') throw new Error('The design must start at the central joint.');
    const seenEdges = new Set();
    for (const edge of edges) {
      if (edge.length !== 2 || edge[0] === edge[1] || !nodes.has(edge[0]) || !nodes.has(edge[1]) || seenEdges.has(edge)) throw new Error('Invalid design connection.');
      const a = nodes.get(edge[0]), b = nodes.get(edge[1]);
      if (Math.abs(a.charCodeAt(1) - b.charCodeAt(1)) + Math.abs(a.charCodeAt(2) - b.charCodeAt(2)) !== 1) throw new Error('Design connections must join adjacent joints.');
      seenEdges.add(edge);
    }
    const reached = new Set(['a']);
    for (let i = 0; i < nodes.size; i++) for (const edge of edges) {
      if (reached.has(edge[0])) reached.add(edge[1]);
      if (reached.has(edge[1])) reached.add(edge[0]);
    }
    if (reached.size !== nodes.size) throw new Error('The design has disconnected components.');
    return config;
  }
  function evaluation(value) {
    if (value == null) return null;
    return {
      config: configuration(value.config), result: text(value.result, 'evaluation result', 100),
      range: number(value.range, 'range', -1), velocity: number(value.velocity, 'velocity', -1),
      cost: number(value.cost, 'cost', -1), payload: number(value.payload, 'payload'),
      evaluatedAt: text(value.evaluatedAt, 'evaluation timestamp', 40)
    };
  }
  function vehicle(value) {
    return {
      id: number(value.id, 'design id'), tag: text(value.tag, 'design name', 100),
      config: configuration(value.config), result: text(value.result || 'Success', 'result', 100),
      range: number(value.range, 'range', -1), velocity: number(value.velocity, 'velocity', -1),
      cost: number(value.cost, 'cost', -1), payload: number(value.payload, 'payload'), valid: value.valid !== false
    };
  }
  function newProject(name = 'Untitled project') {
    const now = new Date().toISOString();
    return { format: FORMAT, version: VERSION, name, createdAt: now, updatedAt: now, draftConfig: BASE_CONFIG, lastEvaluation: null, vehicles: [] };
  }
  function validateProject(value) {
    if (!value || typeof value !== 'object' || value.format !== FORMAT) throw new Error('Choose a HyForm project (.hyform.json) file.');
    if (value.version !== VERSION) throw new Error('This project uses an unsupported format version.');
    if (!Array.isArray(value.vehicles) || value.vehicles.length > 1000) throw new Error('Invalid project design library.');
    const vehicles = value.vehicles.map(vehicle);
    if (new Set(vehicles.map(v => v.id)).size !== vehicles.length) throw new Error('The project has duplicate design identifiers.');
    return {
      format: FORMAT, version: VERSION, name: text(value.name, 'project name', 120),
      createdAt: text(value.createdAt, 'creation timestamp', 40), updatedAt: text(value.updatedAt, 'update timestamp', 40),
      draftConfig: configuration(value.draftConfig), lastEvaluation: evaluation(value.lastEvaluation), vehicles
    };
  }
  function applyLog(project, action) {
    if (typeof action !== 'string') return project;
    // The original client logs its grammar after each geometry edit.
    const match = action.match(/\*[^;\s]+,\d{1,3},\d{1,3}/);
    if (match) {
      try { project.draftConfig = configuration(match[0]); } catch (_) { /* Ignore unrelated log strings. */ }
    }
    if (action.includes('CapacityInput;')) {
      const payload = action.split('CapacityInput;')[1].split(';')[0];
      if (/^\d{1,3}$/.test(payload)) project.draftConfig = project.draftConfig.replace(/,\d+,/, ',' + payload + ',');
    }
    if (action.endsWith('ResetDesign')) project.draftConfig = BASE_CONFIG;
    const result = action.match(/Evaluated;(\*[^;]+);range=([-\d.]+);capacity=(\d+);cost=([-\d.]+);velocity=([-\d.]+)/);
    if (result) {
      // The legacy log exposes metrics but omits the simulator's stability verdict.
      // Keep that distinction explicit; the authoritative verdict stays in Unity.
      project.lastEvaluation = evaluation({ config: result[1], result: 'MetricsRecorded', range: +result[2], payload: +result[3], cost: +result[4], velocity: +result[5], evaluatedAt: new Date().toISOString() });
    }
    return project;
  }
  const api = { BASE_CONFIG, FORMAT, VERSION, configuration, vehicle, evaluation, newProject, validateProject, applyLog };
  root.HyformProject = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
