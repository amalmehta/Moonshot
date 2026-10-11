// Pure geometry helpers for the 3D vehicle viewer (no DOM, no Three.js), so Node can test them:
// nozzle contours sized from the engine model, engine-cluster layouts, and OKLCH → sRGB colour.
import { ENGINES } from '../data/vehicles.js';
import { enginePerformance } from '../physics/engine.js';

const P_SL = 101325;

/**
 * Throat and exit radii of an engine from ideal nozzle theory (engine.js, efficiency 0.97):
 * the throat area is whatever makes the model hit the published thrust (vacuum thrust if
 * given, else sea-level thrust); the exit radius follows from the area ratio ε.
 */
export function engineDims(key) {
  const e = ENGINES[key];
  let At;
  if (e.thrustVac) At = enginePerformance(e)(0).throatArea;
  else {
    const unit = enginePerformance({ ...e, throatArea: 1 })(P_SL).thrust; // thrust per m² of throat
    At = e.thrustSL / unit;
  }
  const rt = Math.sqrt(At / Math.PI);
  const re = rt * Math.sqrt(e.eps);
  return { key, rt, re, eps: e.eps, At, Ae: At * e.eps };
}

/** Rao-style nozzle angles (deg) at the throat (θn) and the exit (θe), rough fits vs ε for an 80 % bell. */
export const bellAngles = eps => ({ thetaN: 24 + 5.5 * Math.log10(eps), thetaE: 14 - 3.4 * Math.log10(eps) });

/**
 * Axisymmetric chamber + nozzle contour, injector face → exit. Points are { z, r } with z = 0 at
 * the throat and +z downstream. Pieces: cylindrical chamber (contraction ratio cr, length from
 * L* = Vc/At), 1.5·rt arc + straight converging cone, 0.382·rt throat arc, then a quadratic
 * Bézier "thrust-optimised parabola" to the exit (80 % of a 15° cone's length).
 */
export function bellProfile(rt, eps, { cr = 3, Lstar = 1.0, thetaC = 35, lengthFraction = 0.8, n = 24 } = {}) {
  const d = Math.PI / 180;
  const re = rt * Math.sqrt(eps);
  const Rc = rt * Math.sqrt(cr);
  const { thetaN, thetaE } = bellAngles(eps);
  const pts = [];
  // converging: arc of radius 1.5 rt from the throat back to angle θc, then a cone to Rc
  const a1 = 1.5 * rt, tc = thetaC * d;
  const arcEnd = { z: -a1 * Math.sin(tc), r: rt + a1 * (1 - Math.cos(tc)) };
  const coneLen = (Rc - arcEnd.r) / Math.tan(tc);
  const zConvStart = arcEnd.z - coneLen;
  const Lc = Math.max(0.2 * Rc, Lstar / cr); // ≈ Vc/Ac, ignoring the converging volume
  pts.push({ z: zConvStart - Lc, r: Rc }, { z: zConvStart, r: Rc });
  for (let i = 0; i <= 6; i++) {
    const a = tc * (1 - i / 6);
    pts.push({ z: -a1 * Math.sin(a), r: rt + a1 * (1 - Math.cos(a)) });
  }
  // diverging: throat arc to θn
  const a2 = 0.382 * rt, tn = thetaN * d, te = thetaE * d;
  for (let i = 1; i <= 4; i++) {
    const a = tn * i / 4;
    pts.push({ z: a2 * Math.sin(a), r: rt + a2 * (1 - Math.cos(a)) });
  }
  const N = pts[pts.length - 1];
  const Ln = lengthFraction * (re - rt) / Math.tan(15 * d);
  const E = { z: Ln, r: re };
  // control point = intersection of the tangent lines at N (slope tan θn) and E (slope tan θe)
  const qz = (E.r - N.r - Math.tan(te) * E.z + Math.tan(tn) * N.z) / (Math.tan(tn) - Math.tan(te));
  const Q = { z: qz, r: N.r + Math.tan(tn) * (qz - N.z) };
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push({ z: u * u * N.z + 2 * u * t * Q.z + t * t * E.z, r: u * u * N.r + 2 * u * t * Q.r + t * t * E.r });
  }
  return { points: pts, rt, re, Rc, Lc, bellLength: Ln, chamberStart: pts[0].z, length: Ln - pts[0].z, thetaN, thetaE };
}

/** n positions evenly spaced on a ring of radius r, starting at angle phase (rad). */
export function ring(n, r, phase = 0) {
  return Array.from({ length: n }, (_, i) => {
    const a = phase + 2 * Math.PI * i / n;
    return { x: r * Math.cos(a), y: r * Math.sin(a), a };
  });
}

/**
 * Falcon 9 "octaweb": 8 engines in a ring around 1 centre engine. Returns positions and the
 * largest bell radius that fits 8 around the ring inside the stage (drawBellR ≤ exitR).
 */
export function octawebLayout(stageR, exitR) {
  const gap = 0.02, s = Math.sin(Math.PI / 8);
  // outer bells touch the skirt edge: r = stageR − b − gap, and neighbours: r·sin(π/8) = b + gap/2
  const b = Math.min(exitR, ((stageR - gap) * s - gap / 2) / (1 + s));
  const r = stageR - b - gap;
  return {
    drawBellR: b, radius: r,
    engines: [{ x: 0, y: 0, a: 0, ring: 'centre' }, ...ring(8, r, Math.PI / 8).map(p => ({ ...p, ring: 'outer' }))],
  };
}

/**
 * Super Heavy's 33 Raptors: 3 inner (gimbaling), 10 middle (gimbaling), 20 outer (fixed).
 * Ring radii are chosen so bells don't overlap and the outer ring sits inside the 9 m skirt;
 * returns positions and the largest bell radius that fits (drawBellR ≤ exitR).
 */
export function superHeavyLayout(stageR, exitR) {
  const gap = 0.03;
  // biggest bell that fits 20 around an outer ring whose bells touch the skirt edge:
  // r = stageR − b − 0.05 and r·sin(π/20) = b + gap
  const s20 = Math.sin(Math.PI / 20);
  const b = Math.min(exitR, ((stageR - 0.05) * s20 - gap) / (1 + s20));
  const rOuter = stageR - b - 0.05;
  const rInner = (b + gap) / Math.sin(Math.PI / 3);              // 3 touching around the centre
  const rMid = Math.max(rInner + 2 * b + 2 * gap, (b + gap) / Math.sin(Math.PI / 10));
  return {
    drawBellR: b,
    radii: { inner: rInner, middle: rMid, outer: rOuter },
    engines: [
      ...ring(3, rInner, Math.PI / 2).map(p => ({ ...p, ring: 'inner' })),
      ...ring(10, rMid, Math.PI / 10).map(p => ({ ...p, ring: 'middle' })),
      ...ring(20, rOuter, 0).map(p => ({ ...p, ring: 'outer' })),
    ],
  };
}

/** Ship: 3 sea-level Raptors in the centre + 3 Raptor Vacuum on an outer ring, interleaved. */
export function shipLayout(stageR, slExitR, vacExitR) {
  const rVac = stageR - vacExitR - 0.15;
  const rSL = (slExitR + 0.05) / Math.sin(Math.PI / 3);
  return [
    ...ring(3, rSL, Math.PI / 2).map(p => ({ ...p, ring: 'sea-level' })),
    ...ring(3, rVac, -Math.PI / 2).map(p => ({ ...p, ring: 'vacuum' })),
  ];
}

/** Minimum centre-to-centre distance in a set of {x,y} points. */
export function minSpacing(pts) {
  let m = Infinity;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++)
    m = Math.min(m, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
  return m;
}

/** OKLCH (L 0–1, C, h°) → gamma-encoded sRGB [r, g, b] in 0–1 (clipped). */
export function oklchToSrgb(L, C, h) {
  const a = C * Math.cos(h * Math.PI / 180), b = C * Math.sin(h * Math.PI / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
  return lin.map(c => {
    c = Math.min(1, Math.max(0, c));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  });
}

/**
 * Length budget of each stage: computed engine length (nozzle model) + estimated non-tank
 * structure (LAYOUT, tanks.js) + computed tank stack, vs the published stage length.
 * tanks: { f9s1, f9s2, sh, ss } from stageTanks(); layout: LAYOUT from tanks.js.
 */
export function lengthBudget(tanks, layout, vehicles) {
  const engLen = key => { const d = engineDims(key); return bellProfile(d.rt, d.eps).length; };
  const f9 = vehicles.falcon9, ss = vehicles.starship;
  return [
    { id: 'f9s1', stage: 'Falcon 9 first stage', parts: { engine: engLen('merlin1d'), structure: layout.falcon9.engineBay, tanks: tanks.f9s1.length }, published: f9.stages[0].length },
    { id: 'f9s2', stage: 'Falcon 9 second stage', parts: { engine: engLen('mvac'), structure: 0, tanks: tanks.f9s2.length }, published: f9.stages[1].length },
    { id: 'sh', stage: 'Super Heavy booster', parts: { engine: engLen('raptor2'), structure: layout.starship.engineBay + layout.starship.hotStage, tanks: tanks.sh.length }, published: ss.stages[0].length },
    { id: 'ss', stage: 'Starship (ship)', parts: { engine: engLen('raptorVac'), structure: layout.starship.shipAft, tanks: tanks.ss.length }, published: ss.stages[1].length, partial: true },
  ].map(r => ({ ...r, total: r.parts.engine + r.parts.structure + r.parts.tanks }));
}
