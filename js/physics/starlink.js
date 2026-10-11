// Starlink from first principles: Walker constellations, J2 precession, coverage geometry,
// phased-array antennas, link budgets, laser-link routing, electric-propulsion orbit raising
// and drag decay. Pure functions, no DOM, so Node tests can import everything here.
import { MU_EARTH, R_EARTH, OMEGA_EARTH, C_LIGHT, K_BOLTZMANN, G0, DEG, DAY } from './constants.js';

export const J2 = 1.08262668e-3;            // Earth's oblateness coefficient (EGM2008)
export const N_FIBER = 1.47;                // group index of silica fibre (≈1.467 at 1550 nm)
export const TROPICAL_YEAR = 365.2422 * DAY;
export const SUN_SYNC_RATE = 2 * Math.PI / TROPICAL_YEAR; // rad/s, ≈ 0.9856°/day

// ---------------------------------------------------------------------------
// Shells. Gen1: FCC 21-48 (April 2021 modification), 4,408 satellites.
// Gen2: FCC 22-91 (Dec 2022) authorised up to 7,500 satellites in the 525/530/535 km shells;
// the plane counts (28 planes × 120) are from SpaceX's amended Gen2 application, so the
// fully-populated geometry shown here (10,080) is larger than what was authorised at first.
// The Walker phasing factor F is not in the filings; F = 1 is an assumption (labelled "est.").
// `h` is a hue from the Starlink tag family (TAGS.starlink 190, TAGS.rf 205) and `l` a lightness.
export const SHELLS_GEN1 = [
  { id: 'g1a', name: '550 km · 53°',   alt: 550e3, inc: 53.0, planes: 72, perPlane: 22, F: 1, gen: 1, family: '53° mid-latitude', h: 190, l: 0.80 },
  { id: 'g1b', name: '540 km · 53.2°', alt: 540e3, inc: 53.2, planes: 72, perPlane: 22, F: 1, gen: 1, family: '53° mid-latitude', h: 190, l: 0.62 },
  { id: 'g1c', name: '570 km · 70°',   alt: 570e3, inc: 70.0, planes: 36, perPlane: 20, F: 1, gen: 1, family: '70° high-latitude', h: 205, l: 0.74 },
  { id: 'g1d', name: '560 km · 97.6° (6×58)', alt: 560e3, inc: 97.6, planes: 6, perPlane: 58, F: 1, gen: 1, family: '97.6° polar', h: 218, l: 0.78 },
  { id: 'g1e', name: '560 km · 97.6° (4×43)', alt: 560e3, inc: 97.6, planes: 4, perPlane: 43, F: 1, gen: 1, family: '97.6° polar', h: 218, l: 0.60 },
];
export const SHELLS_GEN2 = [
  { id: 'g2a', name: 'Gen2 525 km · 53°', alt: 525e3, inc: 53, planes: 28, perPlane: 120, F: 1, gen: 2, family: 'Gen2 low-inclination', h: 178, l: 0.84 },
  { id: 'g2b', name: 'Gen2 530 km · 43°', alt: 530e3, inc: 43, planes: 28, perPlane: 120, F: 1, gen: 2, family: 'Gen2 low-inclination', h: 178, l: 0.70 },
  { id: 'g2c', name: 'Gen2 535 km · 33°', alt: 535e3, inc: 33, planes: 28, perPlane: 120, F: 1, gen: 2, family: 'Gen2 low-inclination', h: 178, l: 0.56 },
];
export const shellCount = s => s.planes * s.perPlane;
export const totalSatellites = shells => shells.reduce((n, s) => n + shellCount(s), 0);
/** Walker notation i:T/P/F. */
export const walkerNotation = s => `${s.inc}°:${shellCount(s)}/${s.planes}/${s.F}`;

// ---------------------------------------------------------------------------
// Orbits
export const orbitalPeriod = a => 2 * Math.PI * Math.sqrt(a ** 3 / MU_EARTH);
export const meanMotion = a => Math.sqrt(MU_EARTH / a ** 3);
/** Secular nodal precession dΩ/dt (rad/s) from J2: −(3/2) n J2 (R/p)² cos i. */
export function nodalPrecession(a, incRad, e = 0) {
  const p = a * (1 - e * e);
  return -1.5 * meanMotion(a) * J2 * (R_EARTH / p) ** 2 * Math.cos(incRad);
}
/** Secular drift of the argument of latitude u = ω + M for a near-circular orbit (rad/s). */
export function argLatitudeRate(a, incRad) {
  const n = meanMotion(a), k = 0.75 * n * J2 * (R_EARTH / a) ** 2, c2 = Math.cos(incRad) ** 2;
  return n + k * (5 * c2 - 1) + k * (3 * c2 - 1);
}
/** Inclination (rad) that makes a circular orbit at radius a sun-synchronous. */
export function sunSyncInclination(a) {
  const c = -SUN_SYNC_RATE / (1.5 * meanMotion(a) * J2 * (R_EARTH / a) ** 2);
  return Math.abs(c) > 1 ? NaN : Math.acos(c);
}
export const radPerSecToDegPerDay = w => w / DEG * DAY;

/**
 * Lay out a set of Walker-delta shells as a struct-of-arrays constellation.
 * Plane j has RAAN Ω_j = 2πj/P; satellite k in it has argument of latitude u = 2πk/S + 2πFj/T.
 */
export function buildConstellation(shells) {
  const N = totalSatellites(shells);
  const c = {
    N, shells,
    shell: new Uint8Array(N), plane: new Uint16Array(N), slot: new Uint16Array(N),
    r: new Float64Array(N), raan0: new Float64Array(N), u0: new Float64Array(N),
    raanDot: new Float64Array(N), uDot: new Float64Array(N), cosI: new Float64Array(N), sinI: new Float64Array(N),
    shellStart: [],
  };
  let n = 0;
  shells.forEach((s, si) => {
    c.shellStart.push(n);
    const a = R_EARTH + s.alt, inc = s.inc * DEG, T = shellCount(s);
    const wO = nodalPrecession(a, inc), wU = argLatitudeRate(a, inc);
    for (let j = 0; j < s.planes; j++) {
      for (let k = 0; k < s.perPlane; k++, n++) {
        c.shell[n] = si; c.plane[n] = j; c.slot[n] = k; c.r[n] = a;
        c.raan0[n] = 2 * Math.PI * j / s.planes;
        c.u0[n] = 2 * Math.PI * k / s.perPlane + 2 * Math.PI * s.F * j / T;
        c.raanDot[n] = wO; c.uDot[n] = wU; c.cosI[n] = Math.cos(inc); c.sinI[n] = Math.sin(inc);
      }
    }
  });
  c.shellStart.push(n);
  return c;
}

/**
 * Positions at time t (s) into `out` (length 3N), scaled by `scale` (default: metres).
 * frame 'ecef' rotates by Earth's sidereal angle θ = ω⊕ t so the ground stays fixed;
 * 'eci' leaves the inertial frame. Circular orbits + secular J2 drift (no other perturbations).
 */
export function positionsAt(c, t, out = new Float64Array(3 * c.N), { scale = 1, frame = 'ecef', j2 = true } = {}) {
  const th = frame === 'ecef' ? OMEGA_EARTH * t : 0;
  for (let n = 0; n < c.N; n++) {
    const O = c.raan0[n] + (j2 ? c.raanDot[n] : 0) * t - th;
    const u = c.u0[n] + (j2 ? c.uDot[n] : meanMotion(c.r[n])) * t;
    const cO = Math.cos(O), sO = Math.sin(O), cu = Math.cos(u), su = Math.sin(u), r = c.r[n] * scale;
    out[3 * n] = r * (cO * cu - sO * su * c.cosI[n]);
    out[3 * n + 1] = r * (sO * cu + cO * su * c.cosI[n]);
    out[3 * n + 2] = r * (su * c.sinI[n]);
  }
  return out;
}

/** Earth-fixed unit vector (spherical Earth) for latitude/longitude in degrees. */
export function groundUnit(latDeg, lonDeg) {
  const la = latDeg * DEG, lo = lonDeg * DEG;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

// ---------------------------------------------------------------------------
// Coverage geometry (spherical Earth). ε = elevation of the satellite above the user's horizon.
/** Earth central angle λ between user and sub-satellite point at elevation ε. */
export function earthCentralAngle(h, elevRad) {
  return Math.acos(R_EARTH * Math.cos(elevRad) / (R_EARTH + h)) - elevRad;
}
/** Slant range user → satellite at elevation ε. */
export function slantRange(h, elevRad) {
  const r = R_EARTH + h;
  return Math.sqrt(r * r - (R_EARTH * Math.cos(elevRad)) ** 2) - R_EARTH * Math.sin(elevRad);
}
/** Elevation (rad) of a satellite at position s seen from ground point g (both metres, same frame). */
export function elevation(g, s) {
  const d = [s[0] - g[0], s[1] - g[1], s[2] - g[2]];
  const gm = Math.hypot(...g), dm = Math.hypot(...d);
  return Math.asin((d[0] * g[0] + d[1] * g[1] + d[2] * g[2]) / (gm * dm));
}
/** Footprint: ground radius (arc), cap area and the fraction of Earth's surface it covers. */
export function footprint(h, elevRad) {
  const lam = earthCentralAngle(h, elevRad);
  const area = 2 * Math.PI * R_EARTH ** 2 * (1 - Math.cos(lam));
  return { lambda: lam, radius: R_EARTH * lam, area, fraction: (1 - Math.cos(lam)) / 2 };
}
/**
 * Rough lower bound on satellites for continuous single coverage of the whole globe:
 * circles must overlap to tile, and the largest gap-free tile is the inscribed hexagon,
 * which keeps 3√3/(2π) ≈ 0.827 of each circle's area. N ≈ 4πR² / (0.827 · A_cap).
 */
export const HEX_EFFICIENCY = 3 * Math.sqrt(3) / (2 * Math.PI);
export function satellitesForCoverage(h, elevRad, foldCoverage = 1) {
  return Math.ceil(foldCoverage / (footprint(h, elevRad).fraction * HEX_EFFICIENCY));
}

/**
 * Numerical coverage statistics from the constellation itself. Returns a sampler
 * `(latDeg) → { mean, min }`: the average and worst number of satellites above elevation ε
 * seen from that latitude, over `times` instants and `lons` longitudes. Satellites are
 * counted when their central angle from the user is within their shell's λ (equivalent to
 * elevation ≥ ε). Positions are prepared once, so each latitude costs O(times·lons·N);
 * callers can spread latitudes across frames to keep the page responsive.
 */
export function visibilitySampler(c, { elevDeg = 25, times = 6, lons = 16 } = {}) {
  const cosLam = c.shells.map(s => Math.cos(earthCentralAngle(s.alt, elevDeg * DEG)));
  const thr = Float64Array.from(c.shell, si => cosLam[si]);
  const T0 = orbitalPeriod(R_EARTH + 550e3);
  const snaps = [];
  const pos = new Float64Array(3 * c.N);
  for (let ti = 0; ti < times; ti++) {
    // spread over ~1.6 periods with an irrational offset so samples don't alias with the pattern
    positionsAt(c, (ti + 0.37) * T0 / times * 1.618, pos, { frame: 'eci' });
    const unit = new Float64Array(3 * c.N);
    for (let n = 0; n < c.N; n++) {
      const x = pos[3 * n], y = pos[3 * n + 1], z = pos[3 * n + 2], m = Math.hypot(x, y, z);
      unit[3 * n] = x / m; unit[3 * n + 1] = y / m; unit[3 * n + 2] = z / m;
    }
    snaps.push(unit);
  }
  return latDeg => {
    let sum = 0, min = Infinity;
    snaps.forEach((unit, ti) => {
      for (let k = 0; k < lons; k++) {
        const g = groundUnit(latDeg, (360 * k) / lons + ti * 7.3);
        let cnt = 0;
        for (let n = 0; n < c.N; n++) {
          if (unit[3 * n] * g[0] + unit[3 * n + 1] * g[1] + unit[3 * n + 2] * g[2] >= thr[n]) cnt++;
        }
        sum += cnt; if (cnt < min) min = cnt;
      }
    });
    return { mean: sum / (times * lons), min };
  };
}
/** Convenience: visibility statistics for an array of latitudes. */
export function visibleVsLatitude(c, lats, opts) {
  const f = visibilitySampler(c, opts);
  const r = lats.map(f);
  return { mean: r.map(x => x.mean), min: r.map(x => x.min) };
}

/** Satellites visible from ground point g (metres, same frame as pos) above elevMin; sorted by slant range. */
export function visibleFrom(pos, N, g, elevMinRad) {
  const out = [];
  const gm = Math.hypot(g[0], g[1], g[2]);
  const sinMin = Math.sin(elevMinRad);
  for (let n = 0; n < N; n++) {
    const dx = pos[3 * n] - g[0], dy = pos[3 * n + 1] - g[1], dz = pos[3 * n + 2] - g[2];
    const dm = Math.hypot(dx, dy, dz);
    const s = (dx * g[0] + dy * g[1] + dz * g[2]) / (gm * dm);
    if (s >= sinMin) out.push({ n, range: dm, elev: Math.asin(s) });
  }
  return out.sort((a, b) => a.range - b.range);
}

// ---------------------------------------------------------------------------
// Phased arrays (uniform linear array, isotropic elements, uniform amplitude).
/** Progressive phase between neighbouring elements to steer to θ0: β = −k d sin θ0 (rad). */
export const steeringPhase = (dOverLambda, steerRad) => -2 * Math.PI * dOverLambda * Math.sin(steerRad);
/** Normalised array factor |AF(θ)| ∈ [0,1]: |sin(Nψ/2) / (N sin(ψ/2))|, ψ = k d (sin θ − sin θ0). */
export function arrayFactor(N, dOverLambda, steerRad, thetaRad) {
  const psi = 2 * Math.PI * dOverLambda * (Math.sin(thetaRad) - Math.sin(steerRad));
  const den = N * Math.sin(psi / 2);
  if (Math.abs(den) < 1e-12) return 1;
  return Math.abs(Math.sin(N * psi / 2) / den);
}
/** Half-power beamwidth (rad), large-N approximation: 0.886 λ / (N d cos θ0). */
export const beamwidth = (N, dOverLambda, steerRad) => 0.886 / (N * dOverLambda * Math.cos(steerRad));
/** No grating lobe in real space for any scan up to θ0 iff d/λ < 1/(1 + |sin θ0|). */
export const gratingLobeFree = (dOverLambda, steerRad) => dOverLambda < 1 / (1 + Math.abs(Math.sin(steerRad)));
/** Angles (rad) of grating lobes: sin θ_m = sin θ0 + m λ/d, |sin θ_m| ≤ 1, m ≠ 0. */
export function gratingLobes(dOverLambda, steerRad) {
  const out = [];
  for (let m = -10; m <= 10; m++) {
    if (!m) continue;
    const s = Math.sin(steerRad) + m / dOverLambda;
    if (Math.abs(s) <= 1) out.push(Math.asin(s));
  }
  return out;
}
/** Scan loss in dB for an element pattern cos^q θ (q≈1 is the projected-aperture loss). */
export const scanLossDb = (steerRad, q = 1) => -10 * q * Math.log10(Math.max(Math.cos(steerRad), 1e-9));
/** Broadside directivity of a 2-D array of Nel elements at λ/2 spacing ≈ π·Nel (aperture 4πA/λ², A = Nel(λ/2)²). */
export const planarArrayGainDbi = (Nel, eta = 1) => 10 * Math.log10(Math.PI * Nel * eta);
/** Dish/aperture gain η (πD/λ)². */
export const apertureGainDbi = (D, f, eta = 0.6) => 10 * Math.log10(eta * (Math.PI * D * f / C_LIGHT) ** 2);

// ---------------------------------------------------------------------------
// Link budget
export const db = x => 10 * Math.log10(x);
export const undb = x => 10 ** (x / 10);
/** Free-space path loss (dB): 20 log10(4π d f / c). */
export const fsplDb = (d, f) => 20 * Math.log10(4 * Math.PI * d * f / C_LIGHT);
export const BOLTZMANN_DB = db(K_BOLTZMANN); // −228.6 dBW/(K·Hz)
/**
 * One-way link: C/N0 = EIRP − FSPL − L + G/T − 10log10 k.
 * p: { f (Hz), eirpDbw, range (m), gtDbK, bandwidth (Hz), lossDb, rateBps? }
 */
export function linkBudget(p) {
  const fspl = fsplDb(p.range, p.f);
  const cn0 = p.eirpDbw - fspl - (p.lossDb || 0) + p.gtDbK - BOLTZMANN_DB;
  const snrDb = cn0 - db(p.bandwidth);
  const capacity = p.bandwidth * Math.log2(1 + undb(snrDb));
  const rate = p.rateBps || capacity;
  const ebn0Db = cn0 - db(rate);
  // Shannon limit on Eb/N0 at spectral efficiency η = R/B: (2^η − 1)/η
  const eta = rate / p.bandwidth;
  const ebn0MinDb = db((2 ** eta - 1) / eta);
  return { fspl, cn0, snrDb, capacity, ebn0Db, ebn0MinDb, spectralEfficiency: capacity / p.bandwidth };
}
/** EIRP (dBW) that just meets a PFD limit (dBW/m² in refBw Hz) at range d over bandwidth B. */
export const eirpFromPfd = (pfdDbwM2, refBw, d, B) => pfdDbwM2 + db(4 * Math.PI * d * d) + db(B / refBw);

// ---------------------------------------------------------------------------
// Latency
/** Great-circle central angle (rad) between two lat/lon points (deg). */
export function centralAngle(lat1, lon1, lat2, lon2) {
  const a = groundUnit(lat1, lon1), b = groundUnit(lat2, lon2);
  return Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
}
export const fiberLatency = (dist, routeFactor = 1, n = N_FIBER) => dist * routeFactor * n / C_LIGHT;
export const vacuumLatency = dist => dist / C_LIGHT;
/**
 * Simple "up, over, down" space path for ground distance `dist`: straight up to altitude h,
 * along the shell's arc at radius R+h, straight down. Easy to reason about, but not a bound:
 * real routes slant their first and last legs towards each other.
 */
export function spaceLatencyIdeal(dist, h) {
  const th = dist / R_EARTH;
  return (2 * h + (R_EARTH + h) * th) / C_LIGHT;
}
/**
 * Best case through a shell with a minimum elevation ε: the first and last legs slant at ε
 * (each one covers the footprint angle λ of ground), the rest follows the shell's arc.
 * If the two ends share one footprint (θ ≤ 2λ) it is a single satellite bent pipe.
 */
export function spaceLatencyBest(dist, h, elevRad) {
  const th = dist / R_EARTH, lam = earthCentralAngle(h, elevRad), r = R_EARTH + h;
  if (th <= 2 * lam) {
    // satellite midway: two equal legs, each spanning θ/2 of ground
    const leg = Math.sqrt(R_EARTH ** 2 + r * r - 2 * R_EARTH * r * Math.cos(th / 2));
    return 2 * leg / C_LIGHT;
  }
  return (2 * slantRange(h, elevRad) + r * (th - 2 * lam)) / C_LIGHT;
}
/** Ground distance above which the ideal space path beats straight fibre: θ > 2h / (R(n−1) − h). */
export const spaceBeatsFiberDistance = (h, n = N_FIBER) => R_EARTH * 2 * h / (R_EARTH * (n - 1) - h);

/**
 * Shortest laser path between two ground points through one Walker shell at time t,
 * on a "+Grid" laser topology (each satellite linked to its two in-plane neighbours
 * and the same-slot satellite in each adjacent plane). Dijkstra on ~1,600 nodes.
 * Returns { length (m), latency (s), hops, path:[sat indices], up, down } or null.
 */
export function laserRoute(c, shellIndex, t, A, B, elevMinDeg = 25) {
  const s = c.shells[shellIndex];
  const start = c.shellStart[shellIndex], M = shellCount(s);
  const pos = positionsAt(c, t);
  const gA = groundUnit(A.lat, A.lon).map(v => v * R_EARTH), gB = groundUnit(B.lat, B.lon).map(v => v * R_EARTH);
  const em = elevMinDeg * DEG;
  const local = n => n - start;
  const P = (i) => [pos[3 * (start + i)], pos[3 * (start + i) + 1], pos[3 * (start + i) + 2]];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const upA = visibleFrom(pos, c.N, gA, em).filter(v => c.shell[v.n] === shellIndex);
  const downB = visibleFrom(pos, c.N, gB, em).filter(v => c.shell[v.n] === shellIndex);
  if (!upA.length || !downB.length) return null;
  const idx = (j, k) => ((j + s.planes) % s.planes) * s.perPlane + ((k + s.perPlane) % s.perPlane);
  const D = new Float64Array(M).fill(Infinity), prev = new Int32Array(M).fill(-1), done = new Uint8Array(M);
  for (const v of upA) { D[local(v.n)] = v.range; }
  const downMap = new Map(downB.map(v => [local(v.n), v.range]));
  // simple O(M²) Dijkstra is fine for M ≈ 1,600 (no heap needed)
  let best = Infinity, bestEnd = -1;
  for (;;) {
    let u = -1, du = Infinity;
    for (let i = 0; i < M; i++) if (!done[i] && D[i] < du) { du = D[i]; u = i; }
    if (u < 0 || du >= best) break;
    done[u] = 1;
    if (downMap.has(u) && du + downMap.get(u) < best) { best = du + downMap.get(u); bestEnd = u; }
    const j = Math.floor(u / s.perPlane), k = u % s.perPlane, pu = P(u);
    // +Grid: fore/aft in-plane, and the same slot in each adjacent plane (across the seam,
    // plane P−1 → 0, that partner is ~F slots out of phase, so the link is simply longer)
    for (const v of [idx(j, k + 1), idx(j, k - 1), idx(j + 1, k), idx(j - 1, k)]) {
      if (done[v]) continue;
      const nd = du + dist(pu, P(v));
      if (nd < D[v]) { D[v] = nd; prev[v] = u; }
    }
  }
  if (bestEnd < 0) return null;
  const path = [];
  for (let v = bestEnd; v >= 0; v = prev[v]) path.unshift(start + v);
  return { length: best, latency: best / C_LIGHT, hops: path.length - 1, path, pos, gA, gB };
}

// ---------------------------------------------------------------------------
// Bus: electric-propulsion orbit raising and drag decay
/** Low-thrust, coplanar spiral between circular orbits: Δv ≈ |v1 − v2| (Edelbaum with Δi = 0). */
export const spiralDeltaV = (h1, h2) => Math.abs(Math.sqrt(MU_EARTH / (R_EARTH + h1)) - Math.sqrt(MU_EARTH / (R_EARTH + h2)));
/** Propellant burned from a start mass m0 for Δv at Isp (rocket equation). */
export const propellantMass = (m0, dv, isp) => m0 * (1 - Math.exp(-dv / (isp * G0)));
/** Spiral time at constant thrust F (ignoring the small mass change): t ≈ m Δv / F. */
export const spiralTime = (m, dv, F) => m * dv / F;

// Exponential thermosphere, mean solar activity (Vallado, Fundamentals of Astrodynamics, Table 8-4).
// [base altitude km, base density kg/m³, scale height km]
const EXP_ATM = [
  [100, 5.297e-7, 5.877], [110, 9.661e-8, 7.263], [120, 2.438e-8, 9.473], [130, 8.484e-9, 12.636],
  [140, 3.845e-9, 16.149], [150, 2.070e-9, 22.523], [180, 5.464e-10, 29.740], [200, 2.789e-10, 37.105],
  [250, 7.248e-11, 45.546], [300, 2.418e-11, 53.628], [350, 9.518e-12, 53.298], [400, 3.725e-12, 58.515],
  [450, 1.585e-12, 60.828], [500, 6.967e-13, 63.822], [600, 1.454e-13, 71.835], [700, 3.614e-14, 88.667],
  [800, 1.170e-14, 124.64], [900, 5.245e-15, 181.05], [1000, 3.019e-15, 268.00],
];
/** Thermospheric density (kg/m³) at altitude h (m), 100–1,000+ km; multiply by `solar` for activity (≈0.3–3). */
export function thermosphereDensity(h, solar = 1) {
  const km = h / 1000;
  let i = EXP_ATM.length - 1;
  while (i > 0 && km < EXP_ATM[i][0]) i--;
  const [h0, rho0, H] = EXP_ATM[i];
  return solar * rho0 * Math.exp(-(km - h0) / H);
}
/**
 * Drag decay of a circular orbit: da/dt = −ρ √(μ a) / B, with ballistic coefficient B = m/(C_D A).
 * Integrated with a daily step (RK2) until altitude hEnd. Returns { days, trace: [{t (days), h (m)}] }.
 */
export function decayLifetime(h0, B, { hEnd = 150e3, solar = 1, maxDays = 365 * 40 } = {}) {
  const rate = a => -thermosphereDensity(a - R_EARTH, solar) * Math.sqrt(MU_EARTH * a) / B;
  let a = R_EARTH + h0, t = 0;
  const trace = [{ t: 0, h: h0 }];
  while (a - R_EARTH > hEnd && t < maxDays * DAY) {
    // adaptive step: never let one step drop more than ~2 km
    const r1 = rate(a);
    let dt = Math.min(DAY, 2000 / Math.max(1e-12, -r1));
    const r2 = rate(a + r1 * dt);
    a += 0.5 * (r1 + r2) * dt; t += dt;
    if (trace.length < 4000 && (t - trace[trace.length - 1].t * DAY) >= Math.max(DAY, t / 400)) trace.push({ t: t / DAY, h: a - R_EARTH });
  }
  trace.push({ t: t / DAY, h: a - R_EARTH });
  return { days: t / DAY, trace };
}
