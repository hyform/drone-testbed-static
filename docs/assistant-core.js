/* Browser ports of the two assistant services used by the original HyForm study. */
(function (root) {
  'use strict';

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function parseDesignerCsv(text) {
    const rows = [];
    for (const line of String(text).trim().split(/\r?\n/).slice(1)) {
      const match = line.match(/^([^,]+),([^,]+),([^,]+),([^,]+),"(.*)"$/);
      if (!match) continue;
      const row = {
        range: finite(match[1], -1), cost: finite(match[2], -1), payload: finite(match[3], -1),
        velocity: finite(match[4], -1), config: match[5]
      };
      if (row.range >= 0 && row.cost >= 0 && row.payload >= 0 && row.velocity >= 0 && row.config) rows.push(row);
    }
    return rows;
  }

  function designerCandidates(rows, current, count = 5, random = Math.random) {
    if (!Array.isArray(rows) || !rows.length) throw new Error('The historical designer library is unavailable.');
    const maxRange = Math.max(...rows.map(row => row.range));
    const maxCost = Math.max(...rows.map(row => row.cost));
    const ranked = rows.map(row => ({
      ...row,
      distance: Math.pow((row.range - finite(current.range)) / maxRange, 2) + Math.pow((row.cost - finite(current.cost)) / maxCost, 2)
    })).sort((a, b) => a.distance - b.distance).slice(0, 100);
    // The deployed service shuffled its best 100 RNN-generated designs, then returned five.
    for (let i = ranked.length - 1; i > 0; i--) {
      const j = Math.max(0, Math.min(i, Math.floor(random() * (i + 1))));
      [ranked[i], ranked[j]] = [ranked[j], ranked[i]];
    }
    return ranked.slice(0, Math.max(1, count));
  }

  function distance(a, b) {
    return Math.hypot(finite(a.x) - finite(b.x), finite(a.z) - finite(b.z));
  }

  function timeWindow(customer) {
    return customer.payload === 'package' ? [0, 24] : [4, 6];
  }

  function candidateStep(state, customer, vehicle, warehouse) {
    const segment = distance(state.position, customer.address);
    const travelDistance = state.travelDistance + segment;
    const arrivalOffset = state.travelTime + segment / vehicle.velocity;
    const [windowStart, windowEnd] = timeWindow(customer);
    const startMin = Math.max(state.startMin, windowStart - arrivalOffset, 0);
    const startMax = Math.min(state.startMax, windowEnd - arrivalOffset, 24);
    const routeDistance = travelDistance + distance(customer.address, warehouse);
    const returnTime = startMin + routeDistance / vehicle.velocity;
    if (state.payload + customer.weight > vehicle.payload || routeDistance > vehicle.range || startMin > startMax || returnTime > 30) return null;
    return { customer, segment, travelDistance, arrivalOffset, startMin, startMax, routeDistance, returnTime };
  }

  function planOperations(scenario, vehicles) {
    if (!scenario || !scenario.warehouse || !Array.isArray(scenario.customers)) throw new Error('The historical operations scenario is unavailable.');
    if (!Array.isArray(vehicles) || !vehicles.length) throw new Error('Select at least one submitted design for the operations fleet.');
    const warehouse = scenario.warehouse.address;
    let unsatisfied = scenario.customers.filter(customer => customer.selected).map(customer => ({
      ...customer, weight: finite(customer.weight), address: { x: finite(customer.address.x), z: finite(customer.address.z) }
    }));
    const paths = [];
    for (const source of vehicles) {
      const vehicle = { ...source, range: finite(source.range), velocity: finite(source.velocity), payload: finite(source.payload), cost: finite(source.cost) };
      if (vehicle.range <= 0 || vehicle.velocity <= 0 || vehicle.payload <= 0) {
        paths.push({ vehicle, customerIds: [], distance: 0, payload: 0, startTime: 0, returnTime: 0 });
        continue;
      }
      let state = { position: warehouse, travelDistance: 0, travelTime: 0, payload: 0, startMin: 0, startMax: 24 };
      const customerIds = [];
      while (unsatisfied.length) {
        const feasible = unsatisfied.map(customer => candidateStep(state, customer, vehicle, warehouse)).filter(Boolean);
        if (!feasible.length) break;
        // The original solver gave food deliveries a threefold drop penalty, then minimized travel time.
        feasible.sort((a, b) => {
          const foodA = a.customer.payload === 'food2' ? 0 : 1;
          const foodB = b.customer.payload === 'food2' ? 0 : 1;
          return foodA - foodB || a.segment - b.segment || a.customer.id - b.customer.id;
        });
        const pick = feasible[0];
        customerIds.push(pick.customer.id);
        state = {
          position: pick.customer.address, travelDistance: pick.travelDistance, travelTime: pick.arrivalOffset,
          payload: state.payload + pick.customer.weight, startMin: pick.startMin, startMax: pick.startMax
        };
        unsatisfied = unsatisfied.filter(customer => customer.id !== pick.customer.id);
      }
      const returnDistance = customerIds.length ? distance(state.position, warehouse) : 0;
      const routeDistance = state.travelDistance + returnDistance;
      paths.push({
        vehicle, customerIds, distance: routeDistance, payload: state.payload,
        startTime: state.startMin, returnTime: state.startMin + routeDistance / vehicle.velocity
      });
    }
    const selectedCustomers = scenario.customers.filter(customer => customer.selected);
    const deliveredIds = new Set(paths.flatMap(path => path.customerIds));
    const delivered = selectedCustomers.filter(customer => deliveredIds.has(customer.id));
    return {
      algorithm: 'hyform-opsplan-browser-v1', scenarioId: scenario.id, scenarioTag: scenario.tag,
      scenarioVersion: scenario.version, generatedAt: new Date().toISOString(), paths,
      selectedCustomers: selectedCustomers.length, deliveredCustomers: delivered.length,
      unmetCustomerIds: selectedCustomers.filter(customer => !deliveredIds.has(customer.id)).map(customer => customer.id),
      totalDistance: paths.reduce((total, path) => total + path.distance, 0),
      startupCost: vehicles.reduce((total, vehicle) => total + finite(vehicle.cost), 0),
      deliveredWeight: delivered.reduce((total, customer) => total + finite(customer.weight), 0),
      foodCustomers: delivered.filter(customer => customer.payload === 'food2').length
    };
  }

  const api = { parseDesignerCsv, designerCandidates, planOperations, distance };
  root.HyformAssistants = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
