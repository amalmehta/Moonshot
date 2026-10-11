// Every "model vs published figure" check in the project. Used by validation.html and by
// tests/validation.test.mjs, so the page and the test suite can never disagree.
//
// Each section module default-exports checks() → [{
//   id: 'unique-id', quantity: 'Human-readable name', computed: number, reported: number,
//   unit: 'm/s', tolerance: 0.05 /* max allowed |computed−reported|/|reported| */,
//   source: 'key in SOURCES (js/data/vehicles.js) or a URL', note: 'what the model assumes / why it differs',
// }]
import vehicles from './vehicles.js';
import propulsion from './propulsion.js';
import flight from './flight.js';
import structures from './structures.js';
import software from './software.js';
import starlink from './starlink.js';
import cost from './cost.js';
import moon from './moon.js';

export const SECTIONS = { propulsion, flight, vehicles, structures, software, starlink, cost, moon };

export function runAll() {
  const rows = [];
  for (const [section, fn] of Object.entries(SECTIONS)) {
    for (const c of fn()) {
      const error = (c.computed - c.reported) / Math.abs(c.reported);
      rows.push({ section, ...c, error, pass: Math.abs(error) <= c.tolerance });
    }
  }
  return rows;
}
