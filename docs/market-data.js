/* Canonical HyForm Market 1 data from drone-testbed-server ateams-basic.sql. */
(function (root) {
  'use strict';
  const rows = [
    [57,7.4,5.7,"package",4],[58,6.5,4.7,"package",3],[59,7.4,4.8,"package",3],[60,6.8,5.3,"package",4],[61,6,5.1,"package",3],[62,2.8,-6,"package",1],[63,2.2,-5.6,"package",1],
    [64,1.1,-6.3,"package",4],[65,1.5,-5.9,"package",1],[66,2.1,-6.4,"package",4],[67,0.1,0.6,"package",2],[68,-0.7,1.2,"package",2],[69,1,-0.5,"package",2],[70,-1.4,-1.2,"package",3],
    [71,-0.6,0.2,"package",2],[72,-0.3,-0.4,"package",1],[73,0.4,-0.8,"package",3],[74,-0.8,-1.6,"package",2],[75,0.7,0.3,"package",2],[76,0.6,1,"package",1],[77,-1.2,-4,"package",1],
    [78,-2,-5.1,"package",3],[79,-3.8,-3.8,"package",1],[80,-1,-5.6,"package",4],[81,-1.7,-4.4,"package",2],[82,-3.2,-3.6,"package",1],[83,-1,-4.8,"package",3],[84,-1.7,-3.4,"package",2],
    [85,-3.1,-4.4,"package",3],[86,-2.4,-3.7,"package",4],[87,-6,2,"package",3],[88,-7.4,1.4,"package",1],[89,-5.2,1.2,"package",3],[90,-5.8,3,"package",2],[91,-4.6,1.9,"package",3],
    [92,-6.5,3.4,"package",4],[93,-6.6,2.4,"package",4],[94,-6.1,1.3,"package",2],[95,-6.5,0.4,"package",1],[96,-5.3,2.4,"package",4],[97,-7.2,5.5,"package",2],[98,-6.5,-6.8,"package",4],
    [99,-4.5,-6,"package",3],[100,2,3.1,"package",3],[101,6.5,-1,"package",3],[102,6.9,-0.8,"package",1],[103,-1,5.6,"food2",2],[104,-2.1,6,"food2",2],[105,-1.5,6.9,"food2",1],
    [106,-3,5.1,"food2",2],[107,-0.2,5.8,"food2",1],[108,-2.2,7,"food2",1],[109,-2.8,6.2,"food2",1],[110,-1.7,5.3,"food2",2],[111,-0.7,7.2,"food2",1],[112,-0.8,6.4,"food2",1]
  ];
  function createScenario() {
    return {
      id: 1, tag: 'Initial Scenario', version: 0,
      warehouse: { id: 1, address: { id: 113, x: -3.5, z: 0, region: 'warehouse' } },
      customers: rows.map(([id, x, z, payload, weight]) => ({
        id, address: { id, x, z, region: 'r' }, market: 1, payload, weight, selected: true
      }))
    };
  }
  const api = { createScenario };
  root.HyformMarket = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
