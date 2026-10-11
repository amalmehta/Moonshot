// Unit tests for the tank-geometry model and the 3D geometry helpers (no DOM / Three.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { domeVolume, cylinderVolume, tankStackLength, stageTanks, centreOfMass, equivalentTanks, propellant, stackMass, DOME_K } from '../js/physics/tanks.js';
import { engineDims, bellProfile, octawebLayout, superHeavyLayout, shipLayout, minSpacing, oklchToSrgb, ring } from '../js/three/geometry-math.js';
import { VEHICLES, ENGINES } from '../js/data/vehicles.js';
import { bulkDensity } from '../js/physics/engine.js';
import checks from '../js/validation/vehicles.js';

const close = (a, b, rel = 1e-9) => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test('hemispherical domes: two of them make a sphere', () => {
  const R = 2;
  close(2 * domeVolume(R, 1), 4 / 3 * Math.PI * R ** 3);
});

test('tank stack length inverts the volume formula', () => {
  const R = 1.8, k = DOME_K;
  for (const L of [5, 20, 60]) {
    const V = cylinderVolume(R, L) + 2 * domeVolume(R, k);
    const s = tankStackLength(V, R, k);
    close(s.barrel, L);
    close(s.length, L + 2 * k * R);
    assert.equal(s.domesOnly, false);
  }
  assert.equal(tankStackLength(1, 1.8).domesOnly, true);
});

test('stage tanks: volumes add up, mixture ratio respected, layout spans the stack', () => {
  const s = VEHICLES.falcon9.stages[0];
  const t = stageTanks(s, 'kerolox', { densified: false, ullage: 0 });
  close(t.ox.mass + t.fuel.mass, s.prop);
  close(t.ox.mass / t.fuel.mass, 2.36);
  close(s.prop / (t.ox.volume + t.fuel.volume), bulkDensity(propellant('kerolox', false)));
  const A = Math.PI * t.R ** 2;
  // lower tank holds exactly its volume: barrel up to the bulkhead rim (domes cancel)
  close((t.split - t.h) * A, t.fuel.tankVolume, 1e-9);
  // total stack holds both tanks
  close(t.barrel * A + 2 * domeVolume(t.R, t.k), t.totalVolume, 1e-9);
  assert.equal(t.segments[0].z0, 0);
  close(t.segments[1].z1, t.length);
});

test('densifying and ullage move tank length the right way', () => {
  const s = VEHICLES.starship.stages[0];
  const base = stageTanks(s, 'methalox').length;
  assert.ok(stageTanks(s, 'methalox', { densified: false }).length > base);
  assert.ok(stageTanks(s, 'methalox', { ullage: 0.08 }).length > base);
  assert.ok(stageTanks(s, 'methalox', { k: 0.4 }).length < base); // flatter domes → shorter
});

test('tanks fit inside the published stage lengths', () => {
  for (const [v, key] of [[VEHICLES.falcon9, 'kerolox'], [VEHICLES.starship, 'methalox']])
    for (const s of v.stages) assert.ok(stageTanks(s, key).length < s.length, s.name);
});

test('centre of mass: full / empty limits and monotone descent', () => {
  const tanks = [{ z0: 0, length: 10, mass: 100 }, { z0: 10, length: 10, mass: 300 }];
  const dry = { mass: 50, z: 8 };
  close(centreOfMass(tanks, dry, 0), 8);
  close(centreOfMass(tanks, dry, 1), (50 * 8 + 100 * 5 + 300 * 15) / 450);
  let prev = Infinity;
  for (let f = 1; f >= 0; f -= 0.1) { const z = centreOfMass(tanks, dry, f); assert.ok(z <= prev + 1e-12); prev = z; }
  const eq = equivalentTanks(stageTanks(VEHICLES.falcon9.stages[0], 'kerolox'));
  close(eq[1].z0, eq[0].length);
});

test('stack mass sums stages and fairing', () => {
  const f9 = VEHICLES.falcon9;
  close(stackMass(f9), 25600 + 395700 + 3900 + 92670 + 1900);
  close(stackMass(f9, 1000) - stackMass(f9), 1000);
});

test('nozzle sizing reproduces the area ratio and published thrust scale', () => {
  for (const k of ['merlin1d', 'mvac', 'raptor2', 'raptorVac']) {
    const d = engineDims(k);
    close((d.re / d.rt) ** 2, ENGINES[k].eps, 1e-12);
    assert.ok(d.rt > 0.08 && d.rt < 0.2, `${k} throat radius ${d.rt}`);
  }
});

test('bell profile: throat is the minimum, exit radius matches ε, bell diverges monotonically', () => {
  const rt = 0.12, eps = 34;
  const p = bellProfile(rt, eps);
  const rs = p.points.map(q => q.r);
  close(Math.min(...rs), rt, 1e-9);
  close(p.points.at(-1).r, rt * Math.sqrt(eps), 1e-9);
  const div = p.points.filter(q => q.z >= 0);
  for (let i = 1; i < div.length; i++) {
    assert.ok(div[i].z > div[i - 1].z);
    assert.ok(div[i].r >= div[i - 1].r);
  }
  close(p.points[0].r, rt * Math.sqrt(3), 1e-9); // contraction ratio 3
});

test('engine clusters: 1 + 8, 3 + 10 + 20 and 3 + 3, no overlaps, inside the skirt', () => {
  const m = engineDims('merlin1d'), r = engineDims('raptor2'), v = engineDims('raptorVac');
  const oct = octawebLayout(1.85, m.re);
  assert.equal(oct.engines.length, 9);
  assert.equal(oct.engines.filter(e => e.ring === 'outer').length, 8);
  assert.ok(minSpacing(oct.engines) >= 2 * oct.drawBellR);
  for (const e of oct.engines) assert.ok(Math.hypot(e.x, e.y) + oct.drawBellR <= 1.85);

  const sh = superHeavyLayout(4.5, r.re);
  const count = ring => sh.engines.filter(e => e.ring === ring).length;
  assert.deepEqual([count('inner'), count('middle'), count('outer'), sh.engines.length], [3, 10, 20, 33]);
  assert.ok(minSpacing(sh.engines) >= 2 * sh.drawBellR - 1e-9);
  assert.ok(sh.drawBellR <= r.re);
  for (const e of sh.engines) assert.ok(Math.hypot(e.x, e.y) + sh.drawBellR <= 4.5 + 1e-9);

  const ship = shipLayout(4.5, r.re, v.re);
  assert.equal(ship.length, 6);
  for (const e of ship) assert.ok(Math.hypot(e.x, e.y) + (e.ring === 'vacuum' ? v.re : r.re) <= 4.5);
});

test('ring: evenly spaced on the circle', () => {
  const pts = ring(20, 3);
  for (const p of pts) close(Math.hypot(p.x, p.y), 3);
  close(minSpacing(pts), 2 * 3 * Math.sin(Math.PI / 20), 1e-9);
});

test('OKLCH → sRGB: white, black, and a grey stay neutral', () => {
  oklchToSrgb(1, 0, 0).forEach(c => close(c, 1, 1e-6));
  oklchToSrgb(0, 0, 0).forEach(c => close(c, 0, 1e-9));
  const [r, g, b] = oklchToSrgb(0.6, 0, 123);
  close(r, g, 1e-6); close(g, b, 1e-6);
  const red = oklchToSrgb(0.63, 0.26, 29); // ≈ sRGB red
  assert.ok(red[0] > 0.95 && red[1] < 0.1 && red[2] < 0.1);
});

test('validation rows are finite and well formed', () => {
  for (const c of checks()) {
    assert.ok(Number.isFinite(c.computed) && Number.isFinite(c.reported), c.id);
    assert.ok(c.tolerance > 0 && c.source && c.note, c.id);
  }
});
