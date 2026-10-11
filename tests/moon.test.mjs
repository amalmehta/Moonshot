// Unit tests for js/physics/moon.js: integrator accuracy and invariants, TLI targeting, descent/ascent, planner.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rk45, makeDerivs, propagate, planTLI, patchedConic, soiRadius, moonState, MOON_N, MOON_PERIOD, MOON_SPEED,
  deorbit, poweredDescent, ascent, idealLunarAscent, propellantBudget, tankerCount, oberthVinf, parkingState,
} from '../js/physics/moon.js';
import { MU_EARTH, MU_MOON, R_EARTH, R_MOON, MOON_SMA, G0, DAY } from '../js/physics/constants.js';

const energy = y => (y[2] ** 2 + y[3] ** 2) / 2 - MU_EARTH / Math.hypot(y[0], y[1]);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (±${tol})`);

test('RK45 conserves energy and closes an eccentric two-body orbit over 50 periods', () => {
  const rp = R_EARTH + 300e3, ra = 4 * rp, a = (rp + ra) / 2;
  const vp = Math.sqrt(MU_EARTH * (2 / rp - 1 / a));
  const y0 = [rp, 0, 0, vp];
  const T = 2 * Math.PI * Math.sqrt(a ** 3 / MU_EARTH);
  const f = makeDerivs(0, { moon: false });
  const out = rk45(f, 0, y0, 50 * T, { rtol: 1e-11, atol: [1e-4, 1e-4, 1e-7, 1e-7] });
  const E0 = energy(y0);
  let worst = 0;
  for (const y of out.y) worst = Math.max(worst, Math.abs((energy(y) - E0) / E0));
  assert.ok(worst < 1e-8, `relative energy drift ${worst}`);
  const yEnd = out.y[out.y.length - 1];
  near(Math.hypot(yEnd[0] - y0[0], yEnd[1] - y0[1]), 0, 2000, 'returns to perigee after 50 periods (m)');
});

test('RK45 matches the exact solution of a harmonic oscillator', () => {
  const f = (t, y, o) => { o[0] = y[1]; o[1] = -y[0]; return o; };
  const out = rk45(f, 0, [1, 0], 20, { rtol: 1e-10, atol: 1e-12 });
  const y = out.y[out.y.length - 1];
  near(y[0], Math.cos(20), 1e-8); near(y[1], -Math.sin(20), 1e-8);
});

test('events locate perigee passages at whole periods', () => {
  const rp = R_EARTH + 500e3, a = 2 * rp;
  const T = 2 * Math.PI * Math.sqrt(a ** 3 / MU_EARTH);
  const y0 = [rp, 0, 0, Math.sqrt(MU_EARTH * (2 / rp - 1 / a))];
  const res = propagate(y0, 0, 3.5 * T, { moon: false, stopAt: 'perigee', after: 0.5 * T });
  near(res.perigee.t, T, 1e-3, 'perigee time (s)');
  near(res.perigee.r, rp, 1, 'perigee radius (m)');
});

test('integration with the Moon is time-reversible (forward then backward returns to the start)', () => {
  const y0 = parkingState(200e3, 3150);
  const phase0 = 2.3, t1 = 2 * DAY;
  const fwd = propagate(y0, 0, t1, { phase0, stopOnImpact: false, rtol: 1e-12 });
  const yEnd = fwd.y[fwd.y.length - 1];
  const back = propagate(yEnd, t1, 0, { phase0, stopOnImpact: false, rtol: 1e-12 });
  const y = back.y[back.y.length - 1];
  near(Math.hypot(y[0] - y0[0], y[1] - y0[1]), 0, 50, 'position error after round trip (m)');
});

test('Moon ephemeris: circular, period from μ⊕+μ☾, indirect term keeps a far-away probe near-Keplerian', () => {
  near(MOON_PERIOD / DAY, 27.28, 0.02, 'sidereal month (d)');
  const m = moonState(MOON_PERIOD / 4, 0);
  near(m[0], 0, 1e-3 * MOON_SMA); near(m[1], MOON_SMA, 1); near(Math.hypot(m[2], m[3]), MOON_SPEED, 1e-9);
  // On the far side of Earth from the Moon, the tidal (direct + indirect) acceleration is tiny compared with the direct pull alone.
  const f = makeDerivs(0), out = new Array(4);
  const r = 7000e3; f(0, [-r, 0, 0, 0], out);
  const tidal = Math.abs(out[2] - MU_EARTH / r ** 2);
  const direct = MU_MOON / (MOON_SMA + r) ** 2;
  assert.ok(tidal < 0.05 * direct, `tidal ${tidal} vs direct ${direct}`);
});

test('sphere of influence ≈ 66,100 km', () => near(soiRadius() / 1e3, 66100, 300));

test('patched conics: Hohmann TLI ≈ 3.13 km/s from 200 km, ~5-day transfer', () => {
  const pc = patchedConic({ parkingAlt: 200e3, periseleneAlt: 100e3 });
  near(pc.tliDv, 3131, 3); near(pc.tof / DAY, 4.98, 0.02);
  assert.ok(pc.loiDv > 700 && pc.loiDv < 900);
});

let freeReturn;
test('planTLI (free return) reaches the target perilune altitude and comes back to Earth', () => {
  freeReturn = planTLI({ parkingAlt: 200e3, periseleneAlt: 100e3 });
  near(freeReturn.perilune.alt, 100e3, 100, 'perilune altitude (m)');
  assert.ok(freeReturn.perilune.hz < 0, 'retrograde pass');
  near(freeReturn.freeReturn.perigeeAlt, 60e3, 2e3, 'return perigee altitude (m)');
  assert.ok(freeReturn.dv > 3100 && freeReturn.dv < 3250, `TLI Δv ${freeReturn.dv}`);
  assert.ok(freeReturn.tof > 2.5 * DAY && freeReturn.tof < 3.5 * DAY, `coast ${freeReturn.tof / DAY} d`);
  assert.ok(freeReturn.ms < 3000, `planning took ${freeReturn.ms} ms`);
  // the integrated answer should sit a little above the Hohmann (minimum-energy) estimate
  assert.ok(freeReturn.dv > patchedConic().tliDv);
});

test('planTLI (fixed coast time) hits both targets; prograde and retrograde passes are mirror-like', () => {
  const retro = planTLI({ mode: 'tof', tof: 3 * DAY, periseleneAlt: 150e3 });
  near(retro.tof, 3 * DAY, 60); near(retro.perilune.alt, 150e3, 100);
  const pro = planTLI({ mode: 'tof', tof: 3 * DAY, periseleneAlt: 150e3, retrograde: false });
  near(pro.perilune.alt, 150e3, 100);
  assert.ok(pro.perilune.hz > 0 && retro.perilune.hz < 0);
  // passing either side of the Moon costs nearly the same Δv and arrives at nearly the same speed
  near(pro.dv, retro.dv, 15, 'TLI Δv (m/s)');
  near(pro.perilune.v, retro.perilune.v, 40, 'arrival speed (m/s)');
  assert.ok(Math.abs(pro.lambda - retro.lambda) < 0.1, 'lead angles differ only slightly');
});

test('raising the perilune target raises it in the solution (monotone targeting)', () => {
  const low = planTLI({ mode: 'tof', tof: 3 * DAY, periseleneAlt: 50e3 });
  const high = planTLI({ mode: 'tof', tof: 3 * DAY, periseleneAlt: 1000e3 });
  near(low.perilune.alt, 50e3, 100); near(high.perilune.alt, 1000e3, 100);
  assert.ok(high.loiDv < low.loiDv, 'circularizing higher costs less');
});

test('descent: Hohmann deorbit is small; gravity-turn landing stops at the surface with Δv above orbital speed', () => {
  const d = deorbit(100e3, 15e3);
  assert.ok(d.dv > 15 && d.dv < 25, `deorbit ${d.dv}`);
  const pd = poweredDescent({ h: 15e3, isp: 370 });
  assert.ok(pd.impactSpeed < 3, `touchdown speed ${pd.impactSpeed}`);
  assert.ok(pd.gravityLoss > 0 && pd.gravityLoss < 300, `gravity loss ${pd.gravityLoss}`);
  near(pd.path.alt[pd.path.alt.length - 1], 0, 50, 'ends at the surface');
});

test('ascent costs more than the loss-free Hohmann ascent but not absurdly more', () => {
  const a = ascent({ targetAlt: 100e3, isp: 370, tw: 2 });
  const ideal = idealLunarAscent(100e3);
  assert.ok(a.dv > ideal && a.dv < ideal + 400, `ascent ${a.dv} vs ideal ${ideal}`);
  assert.ok(a.cutoffAlt > 5e3, 'does not skim the surface');
});

test('propellant budget: single burn = rocket equation; zero boil-off adds nothing; tankers round up', () => {
  const isp = 370, dry = 100e3;
  const one = propellantBudget({ legs: [{ name: 'burn', dv: 3000 }], dry, payload: 0, isp });
  near(one.propNeeded, dry * (Math.exp(3000 / (isp * G0)) - 1), 1e-6);
  const two = propellantBudget({ legs: [{ name: 'burn', dv: 3000 }, { name: 'coast', coastDays: 5 }, { name: 'b2', dv: 1000 }], dry, payload: 0, isp, boilPerDay: 0 });
  near(two.propNeeded, dry * (Math.exp(4000 / (isp * G0)) - 1), 1e-6, 'burns compose');
  const boil = propellantBudget({ legs: [{ name: 'burn', dv: 3000 }, { name: 'coast', coastDays: 5 }, { name: 'b2', dv: 1000 }], dry, payload: 0, isp, boilPerDay: 0.01 });
  assert.ok(boil.propNeeded > two.propNeeded);
  assert.equal(tankerCount({ need: 1070e3, residual: 130e3, delivered: 120e3 }).n, 8);
  assert.ok(tankerCount({ need: 1070e3, residual: 130e3, delivered: 120e3, boilPerDay: 0.005, cadenceDays: 7 }).n > 8);
  assert.equal(tankerCount({ need: 2000e3, residual: 0, delivered: 150e3, capacity: 1500e3 }).feasible, false);
});

test('Oberth: a burn deep in the well yields more v∞ than the same Δv far away', () => {
  const v0 = Math.sqrt(MU_EARTH / (R_EARTH + 200e3)), vesc = Math.SQRT2 * v0;
  near(oberthVinf(v0, 3400, vesc), 1974, 2);
  assert.equal(oberthVinf(v0, 1000, vesc), 0);
});
