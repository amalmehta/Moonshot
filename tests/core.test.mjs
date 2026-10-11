// Unit tests for the shared physics core: rocket equation, nozzle theory, atmosphere, orbits, ascent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { G0, MU_EARTH, R_EARTH } from '../js/physics/constants.js';
import { deltaV, massRatio, propellantFor, propellantFromStart, stackDeltaV, maxPayload, payloadFractionIdenticalStages } from '../js/physics/rocket.js';
import { areaRatioFromMach, machFromAreaRatio, pressureRatio, cStar, thrustCoefficient, enginePerformance, optimalAreaRatio } from '../js/physics/engine.js';
import { atmosphere } from '../js/physics/atmosphere.js';
import { circularVelocity, escapeVelocity, hohmann, period, elementsFromState, eccentricAnomaly, synchronousRadius } from '../js/physics/orbit.js';
import { simulateAscent, presetFromVehicle } from '../js/physics/ascent.js';
import { VEHICLES, ENGINES } from '../js/data/vehicles.js';

const close = (a, b, rel = 1e-9, msg) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel + 1e-12, msg ?? `${a} ≉ ${b}`);

test('rocket equation round-trips', () => {
  const dv = deltaV(300, 1000, 400);
  close(dv, 300 * G0 * Math.log(2.5));
  close(massRatio(dv, 300), 2.5);
  close(propellantFor(dv, 300, 400), 600);
  close(propellantFromStart(dv, 300, 1000), 600);
});

test('stack Δv adds per stage and payload search inverts it', () => {
  const stages = [{ name: 'a', dry: 20e3, prop: 300e3, isp: 290 }, { name: 'b', dry: 4e3, prop: 80e3, isp: 340 }];
  const { total, stages: s } = stackDeltaV(stages, 10e3);
  close(total, s[0].dv + s[1].dv);
  close(s[1].m0, 94e3);
  const p = maxPayload(stages, total);
  close(p, 10e3, 1e-6);
});

test('identical stages: one stage of ε=0 matches the rocket equation', () => {
  const pi = payloadFractionIdenticalStages(5000, 300, 0, 1);
  close(pi, 1 / massRatio(5000, 300));
  assert.ok(payloadFractionIdenticalStages(9400, 300, 0.08, 2) > payloadFractionIdenticalStages(9400, 300, 0.08, 1));
});

test('isentropic relations: Mach 1 is the throat, inversion is exact', () => {
  close(areaRatioFromMach(1, 1.2), 1);
  for (const eps of [2, 16, 165]) close(areaRatioFromMach(machFromAreaRatio(eps, 1.2), 1.2), eps, 1e-8);
  const sub = machFromAreaRatio(4, 1.4, false);
  assert.ok(sub < 1);
  close(areaRatioFromMach(sub, 1.4), 4, 1e-8);
  // γ = 1.4, M = 2: p/p0 = 0.1278 (standard tables)
  close(pressureRatio(2, 1.4), 0.12780, 1e-3);
});

test('thrust coefficient: optimum expansion has no pressure term, vacuum > sea level', () => {
  const g = 1.2, eps = 16;
  const pr = pressureRatio(machFromAreaRatio(eps, g), g);
  close(thrustCoefficient(g, pr, pr, eps), thrustCoefficient(g, pr, 0, eps) - pr * eps);
  const e = enginePerformance({ prop: 'kerolox', pc: 9.7e6, eps: 16, thrustVac: 914e3 });
  assert.ok(e(0).isp > e(101325).isp);
  close(e(0).thrust, 914e3, 1e-9);
  // c* is independent of nozzle and ambient
  close(e(0).cStar, cStar(3670, 23.7, 1.2));
  assert.ok(optimalAreaRatio(9.7e6, 101325, 1.2) > 5 && optimalAreaRatio(9.7e6, 101325, 1.2) < 20);
});

test('atmosphere matches USSA-1976 anchor values', () => {
  const s = atmosphere(0);
  close(s.p, 101325); close(s.T, 288.15); close(s.rho, 1.225, 1e-3); close(s.a, 340.29, 1e-3);
  close(atmosphere(11019.1).p, 22632, 2e-3);
  assert.ok(atmosphere(100e3).rho < 1e-6);
  // monotone pressure
  let last = Infinity;
  for (let z = 0; z <= 120e3; z += 500) { const p = atmosphere(z).p; assert.ok(p < last); last = p; }
});

test('two-body orbit relations', () => {
  const r = R_EARTH + 400e3;
  close(escapeVelocity(r), Math.SQRT2 * circularVelocity(r));
  close(synchronousRadius(86164.0905), 42164e3, 1e-4);
  const h = hohmann(R_EARTH + 200e3, 42164e3);
  close(h.total, 3935, 5e-3); // LEO → GEO, coplanar, ≈ 3.9 km/s
  const el = elementsFromState([r, 0], [0, circularVelocity(r)]);
  close(el.a, r, 1e-9); assert.ok(el.e < 1e-9);
  close(period(r), 2 * Math.PI * Math.sqrt(r ** 3 / MU_EARTH));
  const E = eccentricAnomaly(1.0, 0.5);
  close(E - 0.5 * Math.sin(E), 1.0, 1e-12);
});

test('ascent sim: Falcon 9 reaches orbit with 15 t, staging and max-Q happen in order', () => {
  const r = simulateAscent({ ...presetFromVehicle(VEHICLES.falcon9, { ENGINES }), payload: 15000, pitchKickAngle: 4, qLimit: 35000 });
  assert.ok(r.success, 'reached orbit');
  const names = r.events.map(e => e.name);
  assert.ok(names.indexOf('MECO / stage separation') < names.indexOf('Orbit insertion (SECO)'));
  assert.ok(r.maxQ.t > 40 && r.maxQ.t < 90, `max-Q at ${r.maxQ.t}s`);
  assert.ok(r.maxQ.q < 45000);
  assert.ok(r.orbit.perigeeAlt > 140e3);
  assert.ok(r.losses.gravity > 500 && r.losses.gravity < 2000);
});

test('ascent sim: absurd payload fails', () => {
  const r = simulateAscent({ ...presetFromVehicle(VEHICLES.falcon9, { ENGINES }), payload: 80000, pitchKickAngle: 4 });
  assert.equal(r.success, false);
});
