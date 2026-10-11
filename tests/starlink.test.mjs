import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/physics/starlink.js';
import { R_EARTH, DEG, C_LIGHT, MU_EARTH } from '../js/physics/constants.js';
import exercises from '../js/data/exercises/starlink.js';
// js/common.js touches the DOM at import, so mirror its tag keys here
const TAGS = Object.fromEntries('nozzles engines propulsion combustion materials structures thermal cost reuse starlink rf atmosphere orbits mission moon software gnc ai reliability'.split(' ').map(k => [k, 1]));

const close = (a, b, rel = 1e-9, msg) => assert.ok(Math.abs(a - b) <= rel * Math.max(Math.abs(b), 1e-30), msg || `${a} ≉ ${b}`);

test('Gen1 shells sum to the FCC total; Gen2 geometry is 3 × 28 × 120', () => {
  assert.equal(S.totalSatellites(S.SHELLS_GEN1), 4408);
  assert.equal(S.totalSatellites(S.SHELLS_GEN2), 10080);
  assert.equal(S.walkerNotation(S.SHELLS_GEN1[0]), '53°:1584/72/1');
});

test('positions stay on their circular orbits and Walker planes are evenly spaced', () => {
  const c = S.buildConstellation(S.SHELLS_GEN1);
  for (const t of [0, 1234.5, 86400]) {
    const p = S.positionsAt(c, t);
    for (let n = 0; n < c.N; n += 97) close(Math.hypot(p[3 * n], p[3 * n + 1], p[3 * n + 2]), c.r[n], 1e-12);
  }
  // plane 1 of shell 0 is 360/72 = 5° of RAAN after plane 0
  close(c.raan0[22] - c.raan0[0], 5 * DEG, 1e-12);
  // ECI and ECEF differ only by Earth's rotation: same radius, z unchanged
  const a = S.positionsAt(c, 500, undefined, { frame: 'eci' }), b = S.positionsAt(c, 500, undefined, { frame: 'ecef' });
  for (let n = 0; n < c.N; n += 211) close(a[3 * n + 2], b[3 * n + 2], 1e-9);
});

test('without J2 a satellite returns to the same inertial point after one period', () => {
  const c = S.buildConstellation([S.SHELLS_GEN1[0]]);
  const T = S.orbitalPeriod(c.r[0]);
  const p0 = S.positionsAt(c, 0, undefined, { frame: 'eci', j2: false });
  const p1 = S.positionsAt(c, T, undefined, { frame: 'eci', j2: false });
  for (let k = 0; k < 30; k++) assert.ok(Math.abs(p0[k] - p1[k]) < 1e-3);
});

test('J2 precession: sign, zero at 90°, sun-synchronous inclination', () => {
  const a = R_EARTH + 550e3;
  assert.ok(S.nodalPrecession(a, 53 * DEG) < 0, 'prograde orbits regress');
  assert.ok(S.nodalPrecession(a, 120 * DEG) > 0, 'retrograde orbits advance');
  assert.ok(Math.abs(S.nodalPrecession(a, 90 * DEG)) < 1e-20);
  const iSSO = S.sunSyncInclination(R_EARTH + 560e3);
  close(S.nodalPrecession(R_EARTH + 560e3, iSSO), S.SUN_SYNC_RATE, 1e-9);
  assert.ok(Math.abs(iSSO / DEG - 97.6) < 0.1);
  close(S.radPerSecToDegPerDay(S.SUN_SYNC_RATE), 0.98565, 1e-4);
});

test('coverage geometry: zenith and horizon limits, consistency of λ, slant range and elevation', () => {
  const h = 550e3;
  close(S.slantRange(h, Math.PI / 2), h, 1e-9);
  assert.ok(Math.abs(S.earthCentralAngle(h, Math.PI / 2)) < 1e-12);
  close(S.earthCentralAngle(h, 0), Math.acos(R_EARTH / (R_EARTH + h)), 1e-12);
  // place a satellite at central angle λ from the user: its elevation must come back as 25°
  const e = 25 * DEG, lam = S.earthCentralAngle(h, e), r = R_EARTH + h;
  const g = [R_EARTH, 0, 0], s = [r * Math.cos(lam), r * Math.sin(lam), 0];
  close(S.elevation(g, s), e, 1e-9);
  close(Math.hypot(s[0] - g[0], s[1] - g[1]), S.slantRange(h, e), 1e-9);
  assert.equal(S.satellitesForCoverage(h, e), 223);
});

test('visible count is symmetric in latitude and peaks near the shell inclination', () => {
  const c = S.buildConstellation([S.SHELLS_GEN1[0]]);
  const lats = [-50, -20, 0, 20, 50, 80];
  const v = S.visibleVsLatitude(c, lats, { times: 3, lons: 8 });
  close(v.mean[0], v.mean[4], 0.15);
  close(v.mean[1], v.mean[3], 0.15);
  assert.ok(v.mean[4] > v.mean[2], '50° sees more than the equator');
  assert.ok(v.mean[5] < 0.5, '53° shell barely reaches 80° latitude');
});

test('array factor: unity at the steered angle, nulls at ψ = 2π/N, grating lobes beyond λ/2', () => {
  const N = 16, d = 0.5, t0 = 30 * DEG;
  close(S.arrayFactor(N, d, t0, t0), 1, 1e-12);
  // first null: sinθ = sinθ0 + λ/(N d)
  const tn = Math.asin(Math.sin(t0) + 1 / (N * d));
  assert.ok(S.arrayFactor(N, d, t0, tn) < 1e-9);
  for (let th = -89; th <= 89; th += 0.5) assert.ok(S.arrayFactor(N, d, t0, th * DEG) <= 1 + 1e-12);
  assert.equal(S.gratingLobes(0.5, 0).length, 0);
  assert.ok(S.gratingLobeFree(0.5, 89 * DEG));
  assert.ok(!S.gratingLobeFree(0.7, 60 * DEG));
  const gl = S.gratingLobes(0.8, 40 * DEG);
  assert.equal(gl.length, 1);
  close(S.arrayFactor(N, 0.8, 40 * DEG, gl[0]), 1, 1e-6);
  close(S.steeringPhase(0.5, 40 * DEG) / DEG, -115.7018, 1e-5);
  assert.ok(S.beamwidth(32, 0.5, 0) < S.beamwidth(16, 0.5, 0));
  assert.ok(S.beamwidth(16, 0.5, 50 * DEG) > S.beamwidth(16, 0.5, 0));
  close(S.scanLossDb(60 * DEG), 3.0103, 1e-4);
});

test('link budget: FSPL scaling, kT, Shannon consistency', () => {
  close(S.fsplDb(2e6, 11.7e9) - S.fsplDb(1e6, 11.7e9), 20 * Math.log10(2), 1e-12);
  close(S.BOLTZMANN_DB, -228.599, 1e-5);
  const lb = S.linkBudget({ f: 11.7e9, eirpDbw: 34, range: 1e6, gtDbK: 10, bandwidth: 240e6, lossDb: 1 });
  close(lb.snrDb, lb.cn0 - 10 * Math.log10(240e6), 1e-12);
  close(lb.capacity, 240e6 * Math.log2(1 + 10 ** (lb.snrDb / 10)), 1e-12);
  // at capacity, Eb/N0 equals the Shannon limit for that spectral efficiency
  close(lb.ebn0Db, lb.ebn0MinDb, 1e-9);
  // EIRP back-solved from a PFD limit reproduces that PFD
  const eirp = S.eirpFromPfd(-140, 4e3, 550e3, 240e6);
  close(eirp - 10 * Math.log10(4 * Math.PI * 550e3 ** 2) - 10 * Math.log10(240e6 / 4e3), -140, 1e-12);
});

test('latency: fibre vs vacuum vs space paths', () => {
  const d = 5576e3;
  close(S.fiberLatency(d) / S.vacuumLatency(d), S.N_FIBER, 1e-12);
  const best = S.spaceLatencyBest(d, 550e3, 25 * DEG), simple = S.spaceLatencyIdeal(d, 550e3);
  assert.ok(best > S.vacuumLatency(d) && best < simple);
  // continuity of the best path at θ = 2λ
  const lam = S.earthCentralAngle(550e3, 25 * DEG);
  close(S.spaceLatencyBest(2 * lam * R_EARTH * (1 - 1e-9), 550e3, 25 * DEG), S.spaceLatencyBest(2 * lam * R_EARTH * (1 + 1e-9), 550e3, 25 * DEG), 1e-6);
  // crossover: simple up-over-down path ties fibre at the break-even distance
  const x = S.spaceBeatsFiberDistance(550e3);
  close(S.spaceLatencyIdeal(x, 550e3), S.fiberLatency(x), 1e-9);
});

test('laser route London → New York is physical: slower than vacuum, faster than fibre', () => {
  const c = S.buildConstellation(S.SHELLS_GEN1);
  const L = { lat: 51.5074, lon: -0.1278 }, N = { lat: 40.7128, lon: -74.006 };
  const d = S.centralAngle(L.lat, L.lon, N.lat, N.lon) * R_EARTH;
  const r = S.laserRoute(c, 0, 0, L, N);
  assert.ok(r, 'a route exists');
  assert.ok(r.latency > S.spaceLatencyBest(d, 550e3, 25 * DEG) * 0.98);
  assert.ok(r.latency < S.fiberLatency(d));
  close(r.length / C_LIGHT, r.latency, 1e-12);
});

test('electric propulsion and drag decay', () => {
  close(S.spiralDeltaV(290e3, 550e3), S.spiralDeltaV(550e3, 290e3), 1e-12);
  assert.equal(S.spiralDeltaV(550e3, 550e3), 0);
  const dv = 146.46, m = S.propellantMass(800, dv, 2500);
  close(800 / (800 - m), Math.exp(dv / (2500 * 9.80665)), 1e-12);
  assert.ok(S.thermosphereDensity(300e3) > S.thermosphereDensity(550e3));
  close(S.thermosphereDensity(500e3), 6.967e-13, 1e-9);
  const low = S.decayLifetime(300e3, 18).days, high = S.decayLifetime(550e3, 18).days;
  assert.ok(low < 30 && high > 365, `300 km: ${low} d, 550 km: ${high} d`);
  assert.ok(S.decayLifetime(550e3, 18, { solar: 3 }).days < high, 'solar max shortens life');
  close(Math.sqrt(MU_EARTH / (R_EARTH + 550e3)), 7585.09, 1e-5);
});

test('exercise metadata is well formed', () => {
  const ids = new Set();
  for (const ex of exercises) {
    assert.ok(!ids.has(ex.id)); ids.add(ex.id);
    for (const t of ex.tags) assert.ok(TAGS[t], `unknown tag ${t}`);
    assert.ok([1, 2, 3].includes(ex.difficulty));
  }
  assert.ok(exercises.length >= 6 && exercises.length <= 9);
  assert.ok(exercises.some(e => e.answer === undefined), 'at least one derivation');
});
