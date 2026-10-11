// Unit tests for js/physics/gnc.js and js/physics/reliability.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rng, kalmanGain, scalarUpdate, scalarSteadyState, scalarIterate, KF1D, simulateAltimeterFusion,
  simulateTVC, zemZev, flyZemZev, zemZevOptimalEffort, simulateLanding, monteCarloLandings,
  minThrottleTW, BOOSTER, terminalVelocity, suicideBurnAltitude, engineAt,
} from '../js/physics/gnc.js';
import {
  binom, kOfN, tmr, tmrMTTF, engineOutSuccess, anyFailure, majority3, flipBit, redundantVote, series, parallel,
} from '../js/physics/reliability.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (tol ${tol})`);

test('seeded RNG is deterministic and roughly standard normal', () => {
  const a = rng(42), b = rng(42);
  for (let i = 0; i < 10; i++) assert.equal(a.normal(), b.normal());
  const r = rng(7); let s = 0, s2 = 0; const n = 20000;
  for (let i = 0; i < n; i++) { const x = r.normal(); s += x; s2 += x * x; }
  close(s / n, 0, 0.03, 'mean'); close(s2 / n, 1, 0.04, 'variance');
});

test('scalar Kalman update weights by inverse variance', () => {
  assert.equal(kalmanGain(16, 9), 0.64);
  const u = scalarUpdate(1000, 16, 1005, 9);
  close(u.x, 1003.2, 1e-12); close(u.P, 5.76, 1e-12);
  // posterior equals the inverse-variance weighted mean
  close(u.x, (1000 / 16 + 1005 / 9) / (1 / 16 + 1 / 9), 1e-9);
  close(1 / u.P, 1 / 16 + 1 / 9, 1e-12);
});

test('scalar Kalman gain converges to the Riccati steady state from any start', () => {
  const ss = scalarSteadyState(0.5, 2);
  for (const P0 of [0, 1, 1000]) close(scalarIterate(0.5, 2, P0, 200).K.at(-1), ss.K, 1e-12, `P0=${P0}`);
  // fixed point: P⁻ = P⁻R/(P⁻+R) + Q
  close(ss.Pprior, ss.Pprior * 2 / (ss.Pprior + 2) + 0.5, 1e-12);
});

test('2-state Kalman filter: covariance stays symmetric positive and shrinks with measurements', () => {
  const kf = new KF1D({ Pp: 100, Pv: 10, sigmaAcc: 0.1 });
  for (let i = 0; i < 500; i++) { kf.predict(0, 0.01); if (i % 10 === 0) kf.update(0, 1); }
  assert.ok(kf.a > 0 && kf.c > 0 && kf.a * kf.c - kf.b * kf.b > 0);
  assert.ok(kf.a < 1, 'position variance below a single measurement');
});

test('altimeter + IMU fusion beats the raw altimeter and does not drift like dead reckoning', () => {
  const r = simulateAltimeterFusion({ seed: 3, sigmaAlt: 4, duration: 60 });
  assert.ok(r.rmsEst < 0.6 * r.rmsMeas, `filter rms ${r.rmsEst} vs altimeter ${r.rmsMeas}`);
  assert.ok(Math.abs(r.finalDeadErr) > 3 * r.rmsEst, 'IMU-only estimate drifts (accelerometer bias)');
  close(r.bias.at(-1), 0.05, 0.015, 'estimated accelerometer bias');
  const noBias = simulateAltimeterFusion({ seed: 3, sigmaAlt: 4, duration: 60, estimateBias: false });
  assert.ok(noBias.rmsEst > 2 * r.rmsEst, 'ignoring the bias makes the filter worse');
});

test('TVC loop: stabilises the unstable pendulum with reasonable gains, diverges with Kp too low', () => {
  const ok = simulateTVC({});
  assert.equal(ok.diverged, false); assert.ok(Math.abs(ok.finalTheta) < 0.5);
  // need Kp·b > a for static stability
  const b = ok.b;
  const bad = simulateTVC({ Kp: 0.5 * 0.6 / b, Ki: 0, Kd: 0.5, duration: 30 });
  assert.equal(bad.diverged, true);
  // a tiny gimbal limit cannot hold a large initial tilt
  assert.equal(simulateTVC({ gimbalLimitDeg: 0.2, theta0Deg: 15, duration: 20 }).diverged, true);
});

test('ZEM/ZEV: zero command when already on the coasting trajectory to the target', () => {
  const g = [0, -9.81], r = [10, 100], v = [2, -5], T = 4;
  const rf = [r[0] + v[0] * T, r[1] + v[1] * T - 0.5 * 9.81 * T * T], vf = [v[0], v[1] - 9.81 * T];
  const { a } = zemZev(r, v, rf, vf, T, g);
  close(a[0], 0, 1e-12); close(a[1], 0, 1e-12);
});

test('ZEM/ZEV lands a vacuum point mass exactly (unconstrained) with optimal effort', () => {
  const p = { r0: [300, 2000], v0: [10, -150], rf: [0, 0], vf: [0, 0], T: 25 };
  const out = flyZemZev(p);
  close(out.r[0], 0, 1e-4, 'x'); close(out.r[1], 0, 1e-4, 'z');
  close(out.v[0], 0, 1e-4, 'vx'); close(out.v[1], 0, 1e-4, 'vz');
  close(out.effort / zemZevOptimalEffort(p), 1, 1e-5, 'effort');
  // 3-D works too
  const o3 = flyZemZev({ r0: [100, -50, 1500], v0: [0, 3, -90], rf: [0, 0, 0], vf: [0, 0, -1], T: 20, g: [0, 0, -1.62] });
  close(o3.r[2], 0, 1e-4); close(o3.v[2], -1, 1e-4);
});

test('booster physics sanity: thrust, terminal velocity, hover impossibility', () => {
  close(engineAt(1, 0).thrust, BOOSTER.thrustSL, 1, 'sea-level thrust');
  close(engineAt(1, 200000).thrust, BOOSTER.thrustVac, 1, 'vacuum thrust');
  const vt = terminalVelocity(30000, 0);
  assert.ok(vt > 150 && vt < 300, `terminal velocity ${vt}`);
  assert.ok(minThrottleTW(BOOSTER.dry + 500) > 1, 'cannot hover near touchdown');
  close(suicideBurnAltitude(250, 24, 9.81), 2202.255, 1e-3);
});

test('landing sim is deterministic for a seed and lands in nominal conditions', () => {
  const a = simulateLanding({ seed: 5 }), b = simulateLanding({ seed: 5 });
  assert.deepEqual([a.x, a.vz, a.vx, a.t], [b.x, b.vz, b.vx, b.t]);
  for (const seed of [1, 2, 3]) {
    const r = simulateLanding({ seed });
    assert.ok(r.success, `seed ${seed}: ${r.fails.join('; ')}`);
    assert.ok(r.propLeft > 0 && r.propLeft < BOOSTER.propAtStart);
  }
  const calm = simulateLanding({ wind: 0, gust: 0, noise: 0, x0: 0, vx0: 0 });
  assert.ok(calm.success); assert.ok(calm.miss < 0.5); assert.ok(calm.vz < 2.5);
});

test('landing sim fails when lit too late, and open loop misses in wind', () => {
  const late = simulateLanding({ seed: 1, ignitionAlt: 1200 });
  assert.equal(late.success, false); assert.ok(late.vz > 20);
  const open = simulateLanding({ seed: 1, guidance: false, wind: 6 });
  assert.equal(open.success, false);
  const openCalm = simulateLanding({ guidance: false, wind: 0, gust: 0, noise: 0, x0: 0, vx0: 0 });
  assert.ok(openCalm.success, 'open loop works when reality matches the plan');
});

test('Monte Carlo: guided landings mostly succeed', () => {
  const mc = monteCarloLandings({ n: 30, seed: 2 });
  const rate = mc.filter(r => r.success).length / mc.length;
  assert.ok(rate >= 0.9, `success rate ${rate}`);
});

test('reliability formulas', () => {
  assert.equal(binom(33, 3), 5456);
  for (const R of [0.1, 0.5, 0.9, 0.999]) close(kOfN(2, 3, R), tmr(R), 1e-14);
  close(tmr(0.5), 0.5, 1e-15, 'crossover');
  assert.ok(tmr(0.4) < 0.4 && tmr(0.9) > 0.9);
  close(kOfN(1, 4, 0.7), parallel([0.7, 0.7, 0.7, 0.7]), 1e-14);
  close(kOfN(4, 4, 0.7), series([0.7, 0.7, 0.7, 0.7]), 1e-14);
  close(engineOutSuccess(9, 1, 0.005), 0.99912076, 1e-7);
  close(anyFailure(33, 0.003), 0.094392, 1e-6);
  close(tmrMTTF(1), 5 / 6, 1e-15);
  // sums of binomial terms add to 1
  close(kOfN(0, 20, 0.3), 1, 1e-15);
});

test('voting: majority masks a single bit flip; dual-core self-check silences a bad string', () => {
  const w = 0xdeadbeef >>> 0;
  assert.equal(majority3(flipBit(w, 7), w, w), w);
  assert.equal(majority3(flipBit(w, 7), flipBit(w, 3), w), w, 'different bits in two words still out-voted per bit');
  const s = [{ core1: w, core2: w }, { core1: w, core2: w }, { core1: flipBit(w, 1), core2: w }];
  const v = redundantVote(s);
  assert.equal(v.outputs[2], null); assert.equal(v.command, w);
  // both cores of one string corrupted identically: cross-check passes, voter catches it
  const v2 = redundantVote([{ core1: w, core2: w }, { core1: w, core2: w }, { core1: flipBit(w, 9), core2: flipBit(w, 9) }]);
  assert.equal(v2.command, w);
  // two strings silent: the last one flies alone
  const v3 = redundantVote([{ core1: 1, core2: 2 }, { core1: 3, core2: 4 }, { core1: w, core2: w }]);
  assert.equal(v3.command, w);
});
