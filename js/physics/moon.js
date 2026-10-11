// Earth → Moon mission physics. Pure functions, no DOM (runs in Node, a Web Worker or the page).
//
// Model (planar, Earth-centred inertial frame, SI units):
//  • The Moon moves on a circular orbit of radius MOON_SMA at the rate n = √((μ⊕+μ☾)/a³).
//  • The spacecraft feels Earth's gravity, the Moon's gravity, and the "indirect" term: the frame
//    is centred on Earth, and Earth itself is accelerated toward the Moon, so we subtract that
//    acceleration (otherwise the frame would not be inertial and the Moon would pull the
//    spacecraft "too hard" when far from it).
//  • Equations of motion are integrated with an adaptive Dormand–Prince RK5(4) integrator.
//  • Burns are impulsive (instantaneous Δv), except the lunar descent and ascent, which are
//    integrated as constant-thrust burns over a spherical, airless, non-rotating Moon.
// Everything the Sun does (and Earth's oblateness, the Moon's 5° inclination and its eccentric
// orbit) is left out; see the page text for what that costs.
import { MU_EARTH, MU_MOON, R_EARTH, R_MOON, MOON_SMA, G0, DAY } from './constants.js';
import { hohmann, visViva, circularVelocity, period } from './orbit.js';

/** Moon mean motion (rad/s) for a circular two-body orbit: n² a³ = μ⊕ + μ☾. */
export const MOON_N = Math.sqrt((MU_EARTH + MU_MOON) / MOON_SMA ** 3);
export const MOON_PERIOD = 2 * Math.PI / MOON_N;          // ≈ 27.28 d (sidereal month)
export const MOON_SPEED = MOON_N * MOON_SMA;               // ≈ 1.02 km/s
/** Laplace sphere-of-influence radius r = a (m/M)^(2/5). */
export const soiRadius = (a = MOON_SMA, muSmall = MU_MOON, muBig = MU_EARTH) => a * (muSmall / muBig) ** 0.4;

/** Moon state [x, y, vx, vy] at time t when its angle at t = 0 is phase0. */
export function moonState(t, phase0 = 0) {
  const th = phase0 + MOON_N * t, c = Math.cos(th), s = Math.sin(th);
  return [MOON_SMA * c, MOON_SMA * s, -MOON_SPEED * s, MOON_SPEED * c];
}

/** Right-hand side of the restricted problem in the Earth-centred frame, written into `out`. */
export function makeDerivs(phase0 = 0, { moon = true } = {}) {
  const k = MU_MOON / MOON_SMA ** 3;                          // indirect term magnitude / a (|rM| = a constant)
  return (t, y, out) => {
    const x = y[0], yy = y[1];
    const r2 = x * x + yy * yy, r3 = r2 * Math.sqrt(r2);
    let ax = -MU_EARTH * x / r3, ay = -MU_EARTH * yy / r3;
    if (moon) {
      const th = phase0 + MOON_N * t, mx = MOON_SMA * Math.cos(th), my = MOON_SMA * Math.sin(th);
      const dx = x - mx, dy = yy - my, d2 = dx * dx + dy * dy, d3 = d2 * Math.sqrt(d2);
      ax += -MU_MOON * dx / d3 - k * mx;                       // direct pull − Earth's acceleration toward the Moon
      ay += -MU_MOON * dy / d3 - k * my;
    }
    out[0] = y[2]; out[1] = y[3]; out[2] = ax; out[3] = ay;
    return out;
  };
}

// ---------------------------------------------------------------------------
// Dormand–Prince RK5(4)7M (the "ode45" pair). 5th-order solution propagated, 4th-order embedded
// solution used only for the error estimate; FSAL (first stage of the next step = last of this one).
const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const A = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
];
const B = A[6];
const E = [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40];   // b − b*

/** One Dormand–Prince step from (t, y) with stage-1 derivative k1. Returns {y, err[], k7}. */
function dpStep(f, t, y, h, k1, n, K, tmp) {
  K[0] = k1;
  for (let s = 1; s < 7; s++) {
    const a = A[s];
    for (let i = 0; i < n; i++) {
      let acc = y[i];
      for (let j = 0; j < s; j++) acc += h * a[j] * K[j][i];
      tmp[i] = acc;
    }
    K[s] = f(t + C[s] * h, tmp, new Array(n));
  }
  // stage 7 was evaluated at the 5th-order solution itself (A[6] = B), so tmp holds y_new
  const ynew = tmp.slice(), err = new Array(n);
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (let s = 0; s < 7; s++) e += E[s] * K[s][i];
    err[i] = h * e;
  }
  return { y: ynew, err, k7: K[6] };
}

/**
 * Adaptive RK45 (Dormand–Prince) from t0 to t1.
 * opts: rtol, atol (number or per-component array), h0, hmax, maxSteps,
 *       events: [{ g(t, y) → number, direction: +1 | −1 | 0, terminal: bool, after?: t }]
 *       (an event fires when g crosses zero in `direction`; it is located by bisection on the step size)
 * Returns { t: [], y: [[]], events: [{index, t, y}], status: 'done' | 'event' | 'maxSteps', nfev }.
 */
export function rk45(f, t0, y0, t1, opts = {}) {
  const n = y0.length;
  const { rtol = 1e-9, hmax = Infinity, maxSteps = 200000, events = [] } = opts;
  const atol = Array.isArray(opts.atol) ? opts.atol : new Array(n).fill(opts.atol ?? 1e-6);
  const dir = Math.sign(t1 - t0) || 1;
  let t = t0, y = y0.slice();
  let h = Math.min(opts.h0 ?? Math.abs(t1 - t0) / 100, hmax) * dir;
  let k1 = f(t, y, new Array(n));
  let nfev = 1;
  const T = [t], Y = [y.slice()], fired = [];
  const K = new Array(7), tmp = new Array(n);
  let gPrev = events.map(ev => ev.g(t, y));
  let status = 'done';
  for (let step = 0; step < maxSteps; step++) {
    if ((t1 - t) * dir <= 0) break;
    if ((t + h - t1) * dir > 0) h = t1 - t;
    const res = dpStep(f, t, y, h, k1, n, K, tmp);
    nfev += 6;
    let errN = 0;
    for (let i = 0; i < n; i++) {
      const sc = atol[i] + rtol * Math.max(Math.abs(y[i]), Math.abs(res.y[i]));
      errN = Math.max(errN, Math.abs(res.err[i]) / sc);
    }
    if (!Number.isFinite(errN)) { h *= 0.25; continue; }
    if (errN > 1) { h *= Math.max(0.2, 0.9 * errN ** -0.2); continue; }
    // accepted: check events on [t, t+h]
    const tn = t + h;
    let stop = false;
    for (let e = 0; e < events.length; e++) {
      const ev = events[e];
      const g1 = ev.g(tn, res.y);
      const g0 = gPrev[e];
      const crosses = (g0 < 0 && g1 >= 0 && ev.direction !== -1) || (g0 > 0 && g1 <= 0 && ev.direction !== 1);
      if (crosses && !(ev.after !== undefined && tn * dir < ev.after * dir)) {
        // bisection on the sub-step length using fresh DP steps from (t, y)
        let lo = 0, hi = h, yHit = res.y;
        for (let it = 0; it < 48; it++) {
          const mid = (lo + hi) / 2;
          const r = dpStep(f, t, y, mid, k1, n, new Array(7), new Array(n));
          nfev += 6;
          const gm = ev.g(t + mid, r.y);
          if (Math.sign(gm) === Math.sign(g0) || gm === 0 && g0 === 0) lo = mid; else { hi = mid; yHit = r.y; }
          if (Math.abs(hi - lo) < 1e-6 * Math.abs(h) + 1e-9) break;
        }
        fired.push({ index: e, t: t + hi, y: yHit.slice() });
        if (ev.terminal) {
          T.push(t + hi); Y.push(yHit.slice());
          status = 'event'; stop = true; break;
        }
      }
      gPrev[e] = g1;
    }
    if (stop) break;
    t = tn; y = res.y; k1 = res.k7;
    T.push(t); Y.push(y.slice());
    opts.onStep?.(t, y);
    h *= Math.min(5, Math.max(0.2, 0.9 * Math.max(errN, 1e-10) ** -0.2));
    if (Math.abs(h) > hmax) h = hmax * dir;
    if (step === maxSteps - 1) status = 'maxSteps';
  }
  return { t: T, y: Y, events: fired, status, nfev };
}

const ATOL = [1e-3, 1e-3, 1e-6, 1e-6];   // 1 mm, 1 µm/s

/**
 * Propagate a spacecraft state [x, y, vx, vy] (Earth-centred, SI) from t0 to t1.
 * opts: phase0 (Moon angle at t = 0), stopAt: 'perilune' | 'perigee' | null, after (s, ignore
 * stop events before this time), stopOnImpact (default true), rtol.
 * Returns { t, y, events, status, perilune?, perigee?, impact? }.
 */
export function propagate(state, t0, t1, opts = {}) {
  const { phase0 = 0, stopAt = null, after = t0, stopOnImpact = true, rtol = 1e-10 } = opts;
  const f = makeDerivs(phase0, { moon: opts.moon !== false });
  const rel = (t, y) => { const m = moonState(t, phase0); return [y[0] - m[0], y[1] - m[1], y[2] - m[2], y[3] - m[3]]; };
  const events = [];
  const names = [];
  // closest approach to the Moon: d/dt |r − rM|² crosses zero upward
  events.push({ g: (t, y) => { const q = rel(t, y); return q[0] * q[2] + q[1] * q[3]; }, direction: 1, terminal: stopAt === 'perilune', after });
  names.push('perilune');
  events.push({ g: (t, y) => y[0] * y[2] + y[1] * y[3], direction: 1, terminal: stopAt === 'perigee', after });
  names.push('perigee');
  if (stopOnImpact) {
    events.push({ g: (t, y) => Math.hypot(y[0], y[1]) - R_EARTH, direction: -1, terminal: true });
    names.push('earthImpact');
    events.push({ g: (t, y) => { const q = rel(t, y); return Math.hypot(q[0], q[1]) - R_MOON; }, direction: -1, terminal: true });
    names.push('moonImpact');
  }
  const out = rk45(f, t0, state, t1, { rtol, atol: ATOL, events, hmax: opts.hmax ?? 6 * 3600 });
  const res = { ...out, phase0 };
  for (const ev of out.events) {
    const name = names[ev.index];
    if (name === 'perilune' && !res.perilune) res.perilune = { t: ev.t, y: ev.y, ...lunarRel(ev.t, ev.y, phase0) };
    if (name === 'perigee' && !res.perigee) res.perigee = { t: ev.t, y: ev.y, r: Math.hypot(ev.y[0], ev.y[1]) };
    if (name.endsWith('Impact')) res.impact = { body: name === 'earthImpact' ? 'Earth' : 'Moon', t: ev.t };
  }
  return res;
}

/** Moon-relative distance, speed and (signed, z) specific angular momentum. hz < 0 ⇒ retrograde about the Moon. */
export function lunarRel(t, y, phase0) {
  const m = moonState(t, phase0);
  const dx = y[0] - m[0], dy = y[1] - m[1], dvx = y[2] - m[2], dvy = y[3] - m[3];
  return { r: Math.hypot(dx, dy), v: Math.hypot(dvx, dvy), hz: dx * dvy - dy * dvx };
}

/** Circular parking-orbit state at t = 0, at angle 0, moving counter-clockwise (the Moon's sense). */
export function parkingState(alt, dv = 0) {
  const r = R_EARTH + alt, v = Math.sqrt(MU_EARTH / r) + dv;
  return [r, 0, 0, v];
}

// ---------------------------------------------------------------------------
// Trans-lunar injection targeting.
//
// The burn is a tangential impulse Δv at the point (r₀, 0) of a circular parking orbit at t = 0.
// The unknowns are Δv and the Moon's lead angle λ (its angle ahead of the burn point at t = 0).
// One target — perilune altitude on the chosen side of the Moon — leaves a one-parameter family,
// so a second condition picks the member:
//   • mode 'freeReturn' (default, like Apollo 8–11): after swinging around the Moon, the
//     unpowered trajectory comes back to Earth with perigee altitude `returnPerigeeAlt`.
//   • mode 'tof': the coast from TLI to perilune takes `tof` seconds.
// Strategy: an outer 1-D secant/bisection on Δv; inside it, a coarse scan over λ followed by a
// bracketed root solve for the signed perilune radius. Each trial is one integration (~1–3 ms).

const signedPerilune = (res) => {
  const p = res.perilune;
  if (!p) return null;
  return Math.sign(p.hz || 1) * p.r;
};

/** Coast from TLI to perilune for one (Δv, λ). Returns the propagate() result. */
export function coast(parkingAlt, dv, lambda, { tmax = 8 * DAY, rtol = 1e-10 } = {}) {
  return propagate(parkingState(parkingAlt, dv), 0, tmax, { phase0: lambda, stopAt: 'perilune', after: 3600, stopOnImpact: false, rtol });
}

function bisectRoot(fn, a, b, fa, fb, tol, maxIt = 60) {
  // Illinois-modified regula falsi: fast and keeps the bracket.
  let side = 0;
  for (let i = 0; i < maxIt; i++) {
    const c = (a * fb - b * fa) / (fb - fa);
    const fc = fn(c);
    if (!Number.isFinite(fc)) return null;
    if (Math.abs(b - a) < tol || fc === 0) return c;
    if (fc * fb > 0) { b = c; fb = fc; if (side === -1) fa /= 2; side = -1; }
    else { a = c; fa = fc; if (side === 1) fb /= 2; side = 1; }
  }
  return (a + b) / 2;
}

/**
 * For a fixed TLI Δv, find the lead angle λ that puts perilune at signed radius `target`
 * (negative = retrograde pass). Returns { lambda, res } or null if no λ reaches it.
 */
export function solveLeadAngle(parkingAlt, dv, target, { scan = 48, lo = 0, hi = 2 * Math.PI, rtol = 1e-9 } = {}) {
  const evalAt = (lam) => {
    const res = coast(parkingAlt, dv, lam, { rtol });
    const s = signedPerilune(res);
    return { res, f: s === null ? NaN : s - target };
  };
  // Coarse scan: signed perilune vs λ only makes sense near the Moon, so look for a sign change
  // between neighbouring samples that are both within ~3 SOI of the Moon (a far miss flips sign trivially).
  const lim = 3 * soiRadius();
  let prev = null, best = null;
  for (let i = 0; i <= scan; i++) {
    const lam = lo + (hi - lo) * i / scan;
    const cur = { lam, ...evalAt(lam) };
    if (prev && Number.isFinite(prev.f) && Number.isFinite(cur.f) && Math.sign(prev.f) !== Math.sign(cur.f) &&
        Math.abs(prev.f + target) < lim && Math.abs(cur.f + target) < lim) {
      const root = bisectRoot(l => evalAt(l).f, prev.lam, cur.lam, prev.f, cur.f, 1e-9);
      if (root !== null) {
        const fin = evalAt(root);
        // prefer the root whose perilune comes soonest (the direct transfer, not a later revolution)
        if (Math.abs(fin.f) < 2000 && (!best || fin.res.perilune.t < best.res.perilune.t)) best = { lambda: root, res: fin.res };
      }
    }
    prev = cur;
  }
  return best;
}

/** After perilune, coast on and report the unpowered return perigee (free-return check). */
export function returnLeg(perilune, phase0, { tmax = 8 * DAY } = {}) {
  const res = propagate(perilune.y, perilune.t, perilune.t + tmax, { phase0, stopAt: 'perigee', after: perilune.t + 3600, stopOnImpact: false, rtol: 1e-10 });
  return res.perigee ? { ...res, returnPerigee: res.perigee.r, returnTime: res.perigee.t } : { ...res, returnPerigee: Infinity };
}

/**
 * Plan the trans-lunar injection.
 * opts: parkingAlt = 200 km, periseleneAlt = 100 km, retrograde = true, mode = 'freeReturn' | 'tof',
 *       returnPerigeeAlt = 60 km (free-return target), tof = 3 d (tof mode).
 * Returns { dv, lambda, tof, perilune {r, v, alt, vCirc}, loiDv, coastPath, freeReturn?, nProp, ms }.
 */
export function planTLI(opts = {}) {
  const t0 = Date.now();
  const { parkingAlt = 200e3, periseleneAlt = 100e3, retrograde = true, mode = 'freeReturn', returnPerigeeAlt = 60e3, tof = 3 * DAY } = opts;
  const target = (retrograde ? -1 : 1) * (R_MOON + periseleneAlt);
  const r0 = R_EARTH + parkingAlt;
  const hoh = hohmann(r0, MOON_SMA);
  let nProp = 0;

  // λ search: warm-started from the last solution when there is one (the root moves smoothly
  // with Δv), otherwise a coarse scan around the patched-conic guess, then the whole circle.
  let lastLam = null;
  const solveFor = (dv) => {
    let sol = null;
    if (lastLam !== null) {
      for (const w of [0.02, 0.06, 0.15]) {
        sol = solveLeadAngle(parkingAlt, dv, target, { scan: 2, lo: lastLam - w, hi: lastLam + w });
        nProp += 12;
        if (sol) break;
      }
    }
    if (!sol) {
      // Earth-only ellipse with this Δv (perigee r0): time to climb to the Moon's distance
      const v0 = Math.sqrt(MU_EARTH / r0) + dv;
      const a = 1 / (2 / r0 - v0 * v0 / MU_EARTH);
      let tGuess = 3 * DAY;
      if (a > 0) {
        const e = 1 - r0 / a;
        const cosE = (1 - MOON_SMA / a) / e;
        if (Math.abs(cosE) <= 1) { const En = Math.acos(cosE); tGuess = (En - e * Math.sin(En)) * Math.sqrt(a ** 3 / MU_EARTH); }
        else tGuess = period(a) / 2;
      }
      const lam0 = Math.PI - MOON_N * tGuess;              // Moon arrives where the ship crosses its orbit
      sol = solveLeadAngle(parkingAlt, dv, target, { scan: 16, lo: lam0 - 0.6, hi: lam0 + 0.6 });
      nProp += 40;
      if (!sol) { sol = solveLeadAngle(parkingAlt, dv, target, { scan: 48 }); nProp += 100; }
    }
    if (sol) lastLam = sol.lambda;
    return sol;
  };

  let dv, sol, ret = null;
  if (mode === 'tof') {
    const fTof = d => { const s = solveFor(d); return s ? s.res.perilune.t - tof : NaN; };
    let a = hoh.dv1 + 2, b = hoh.dv1 + 150;
    let fa = fTof(a);
    while (!(fa > 0) && a < b) { a += 10; fa = fTof(a); }
    let fb = fTof(b);
    if (!(fa > 0 && fb < 0)) throw new Error('planTLI: could not bracket the coast time');
    dv = bisectRoot(fTof, a, b, fa, fb, 1e-4, 40);
    sol = solveFor(dv);
  } else {
    // free return: find Δv whose (perilune-targeted) trajectory comes back to the target perigee
    const rTarget = R_EARTH + returnPerigeeAlt;
    const fRet = d => {
      const s = solveFor(d);
      if (!s) return NaN;
      const rl = returnLeg(s.res.perilune, s.lambda);
      nProp++;
      return Math.log(Math.min(rl.returnPerigee, 1e10) / rTarget);
    };
    // the return perigee falls as Δv rises past the minimum-energy value; scan to bracket the root
    let prev = null, br = null;
    for (let d = hoh.dv1 - 15; d <= hoh.dv1 + 120; d += 15) {
      const f = fRet(d);
      if (prev && Number.isFinite(prev.f) && Number.isFinite(f) && Math.sign(f) !== Math.sign(prev.f)) { br = [prev.d, d, prev.f, f]; break; }
      prev = { d, f };
    }
    if (!br) throw new Error('planTLI: no free-return solution bracketed');
    dv = bisectRoot(fRet, br[0], br[1], br[2], br[3], 1e-4, 40);
    sol = solveFor(dv);
    ret = returnLeg(sol.res.perilune, sol.lambda);
  }
  const p = sol.res.perilune;
  const vCirc = Math.sqrt(MU_MOON / p.r);
  return {
    mode, parkingAlt, periseleneAlt, retrograde,
    dv, lambda: sol.lambda, tof: p.t,
    perilune: { t: p.t, y: p.y, r: p.r, alt: p.r - R_MOON, v: p.v, vCirc, hz: p.hz },
    loiDv: p.v - vCirc,
    coastPath: { t: sol.res.t, y: sol.res.y },
    freeReturn: ret ? { perigeeAlt: ret.returnPerigee - R_EARTH, t: ret.returnTime, path: { t: ret.t, y: ret.y } } : null,
    nProp, ms: Date.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// Patched conics: the hand-calculation the integrator is checked against.
/**
 * Hohmann-like transfer from a circular parking orbit to the Moon's distance, ignoring the Moon's
 * gravity until its sphere of influence, then a hyperbola about the Moon (v∞ = Moon speed − apogee
 * speed, simplified by matching at the Moon's centre distance rather than at the SOI boundary).
 */
export function patchedConic({ parkingAlt = 200e3, periseleneAlt = 100e3 } = {}) {
  const r0 = R_EARTH + parkingAlt;
  const h = hohmann(r0, MOON_SMA);
  const vApogee = visViva(MOON_SMA, h.a);
  const vInf = MOON_SPEED - vApogee;
  const rp = R_MOON + periseleneAlt;
  const vPeri = Math.sqrt(vInf * vInf + 2 * MU_MOON / rp);
  const vCirc = circularVelocity(rp, MU_MOON);
  return {
    tliDv: h.dv1, tof: h.tof, vApogee, vInf, vPeri, vCirc, loiDv: vPeri - vCirc,
    soi: soiRadius(), vPark: circularVelocity(r0), vEscLeo: Math.sqrt(2 * MU_EARTH / r0),
  };
}

/** The Oberth effect: speed gained far away from a burn of Δv at speed v0 on an orbit with escape speed vEsc there. */
export function oberthVinf(v0, dv, vEsc) {
  const e = (v0 + dv) ** 2 - vEsc ** 2;
  return e > 0 ? Math.sqrt(e) : 0;
}

// ---------------------------------------------------------------------------
// Lunar descent and ascent (Moon-centred, planar, polar coordinates).

/**
 * Hohmann deorbit from a circular orbit of altitude h1 to perilune altitude h2.
 * Returns { dv, vPeri, tof } (tof = half the ellipse period).
 */
export function deorbit(h1 = 100e3, h2 = 15e3) {
  const r1 = R_MOON + h1, r2 = R_MOON + h2, a = (r1 + r2) / 2;
  const dv = circularVelocity(r1, MU_MOON) - visViva(r1, a, MU_MOON);
  return { dv, vPeri: visViva(r2, a, MU_MOON), tof: Math.PI * Math.sqrt(a ** 3 / MU_MOON), a };
}

/**
 * Integrate a constant-thrust gravity-turn burn about the Moon. Polar state [r, θ, vr, vθ, m].
 * thrustDir: −1 → thrust opposite the velocity (braking); +1 → along the velocity (ascent).
 * stop(t, state) → true ends the burn. Fixed-step RK4 at dt (s). Returns { t[], s[] }.
 */
function gravityTurn(s0, accel0, isp, thrustDir, stop, dt = 0.25, tmax = 3600) {
  const ve = isp * G0, F = accel0 * s0[4];        // thrust from initial thrust acceleration
  const f = (s) => {
    const [r, , vr, vt, m] = s;
    const v = Math.hypot(vr, vt) || 1e-9;
    const aT = F / m;
    const g = MU_MOON / (r * r);
    return [vr, vt / r,
      vt * vt / r - g + thrustDir * aT * vr / v,
      -vr * vt / r + thrustDir * aT * vt / v,
      -F / ve];
  };
  const T = [0], S = [s0.slice()];
  let s = s0.slice(), t = 0;
  while (t < tmax) {
    const k1 = f(s), k2 = f(s.map((x, i) => x + dt / 2 * k1[i])), k3 = f(s.map((x, i) => x + dt / 2 * k2[i])), k4 = f(s.map((x, i) => x + dt * k3[i]));
    const ns = s.map((x, i) => x + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    const stopFrac = stop(t + dt, ns, s);
    if (stopFrac !== false && stopFrac !== undefined) {
      // linear interpolation to the stopping point inside the step
      const fr = typeof stopFrac === 'number' ? stopFrac : 1;
      s = s.map((x, i) => x + fr * (ns[i] - x)); t += fr * dt;
      T.push(t); S.push(s);
      break;
    }
    s = ns; t += dt;
    T.push(t); S.push(s.slice());
  }
  return { t: T, s: S, F };
}

/**
 * Powered descent: from perilune of the deorbit ellipse (altitude h, horizontal speed v0),
 * brake with constant thrust opposite the velocity (a gravity turn). The thrust level is
 * solved (bisection) so that speed reaches zero exactly at the surface.
 * Returns { dv, t, accel0, tw (initial lunar T/W), path {t[], alt[], downrange[], speed[]}, massRatio }.
 */
export function poweredDescent({ h = 15e3, lloAlt = 100e3, v0 = null, isp = 370, m0 = 1, final = 0 } = {}) {
  const r0 = R_MOON + h;
  const vStart = v0 ?? deorbit(lloAlt, h).vPeri;
  const gMoon = MU_MOON / R_MOON ** 2;
  const run = (accel0) => gravityTurn([r0, 0, 0, vStart, m0], accel0, isp, -1, (t, s, prev) => {
    const v = Math.hypot(s[2], s[3]);
    if (s[0] <= R_MOON) return Math.max(0, Math.min(1, (prev[0] - R_MOON) / (prev[0] - s[0])));
    if (s[4] < 0.05 * m0) return 1;                                      // out of propellant: counts as a crash
    const vPrev = Math.hypot(prev[2], prev[3]);
    if (v <= final + 0.05) return 1;
    if (v > vPrev && vPrev < 40) return vPrev / (vPrev + v);               // speed bottomed out inside this step
    return false;
  }, 0.5, 1500);
  // f(accel) = altitude at the moment the ship stops (or −impact speed if it hits first)
  const score = (a) => {
    const out = run(a), s = out.s[out.s.length - 1];
    const alt = s[0] - R_MOON, v = Math.hypot(s[2], s[3]);
    return alt > 1 && s[4] >= 0.05 * m0 ? alt : -Math.max(v, 1e-3);
  };
  let lo = 0.5 * gMoon, hi = 12 * gMoon;
  for (let i = 0; i < 36; i++) { const mid = (lo + hi) / 2; if (score(mid) > 0) hi = mid; else lo = mid; }
  const out = run(hi);
  const sEnd = out.s[out.s.length - 1];
  const dv = isp * G0 * Math.log(m0 / sEnd[4]);
  return {
    dv, t: out.t[out.t.length - 1], accel0: hi, tw: hi / gMoon, impactSpeed: Math.hypot(sEnd[2], sEnd[3]),
    gravityLoss: dv - vStart,
    path: {
      t: out.t,
      alt: out.s.map(s => s[0] - R_MOON),
      downrange: out.s.map(s => s[1] * R_MOON),
      speed: out.s.map(s => Math.hypot(s[2], s[3])),
      theta: out.s.map(s => s[1]),
      r: out.s.map(s => s[0]),
      dv: out.s.map(s => isp * G0 * Math.log(m0 / s[4])),
    },
  };
}

/**
 * Ascent: a short vertical rise, a small pitch-over kick, then a constant-thrust gravity turn
 * until the coasting orbit's apolune reaches `targetAlt`. The kick angle is solved so the
 * engine cuts off flying horizontally (flight-path angle 0), i.e. at perilune of the
 * insertion orbit; a final burn at apolune circularizes. Returns { dv, burn, circ, cutoffAlt, tw }.
 */
export function ascent({ targetAlt = 100e3, isp = 370, tw = 2.0, vertical = 10 } = {}) {
  const gMoon = MU_MOON / R_MOON ** 2;
  const ra = R_MOON + targetAlt;
  const apo = (s) => {                              // apolune radius of the coasting orbit
    const [r, , vr, vt] = s; const v2 = vr * vr + vt * vt;
    const a = 1 / (2 / r - v2 / MU_MOON); const h = r * vt; const e = Math.sqrt(Math.max(0, 1 - h * h / (MU_MOON * a)));
    return a > 0 ? a * (1 + e) : Infinity;
  };
  const run = (kick) => {
    // vertical rise lasting `vertical` seconds is folded into the initial condition (speed ≈ (T/W−1)·g·t)
    const v0 = (tw - 1) * gMoon * vertical;
    const s0 = [R_MOON + 0.5 * v0 * vertical, 0, v0 * Math.cos(kick), v0 * Math.sin(kick), 1];
    return gravityTurn(s0, tw * gMoon, isp, +1, (t, s, prev) => {
      if (s[0] < R_MOON) return 1;
      const A1 = apo(s), A0 = apo(prev);
      if (A1 >= ra) return Math.max(0, Math.min(1, (ra - A0) / (A1 - A0)));
      return false;
    }, 0.5, 1500);
  };
  // flight-path angle at cutoff: positive = still climbing; we want 0 (cut off at perilune)
  const gamma = (kick) => { const out = run(kick); const s = out.s[out.s.length - 1]; return s[0] < R_MOON ? -1 : Math.atan2(s[2], s[3]); };
  let lo = 0.001, hi = 0.6;    // larger kick → flatter earlier
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (gamma(mid) > 0) lo = mid; else hi = mid; }
  const out = run(lo), s = out.s[out.s.length - 1];
  const vertDv = tw * gMoon * vertical;              // Δv spent in the vertical rise
  const burn = vertDv + isp * G0 * Math.log(1 / s[4]);
  // circularize at apolune
  const r = s[0], v2 = s[2] ** 2 + s[3] ** 2, a = 1 / (2 / r - v2 / MU_MOON);
  const circ = circularVelocity(ra, MU_MOON) - visViva(ra, a, MU_MOON);
  return { dv: burn + Math.max(0, circ), burn, circ, cutoffAlt: r - R_MOON, kick: lo, tw, ideal: idealLunarAscent(targetAlt) };
}

/** Loss-free surface → circular orbit (Hohmann from the surface), the lunar version of orbit.idealOrbitDeltaV. */
export function idealLunarAscent(h = 100e3) {
  const r = R_MOON + h, a = (R_MOON + r) / 2;
  return visViva(R_MOON, a, MU_MOON) + circularVelocity(r, MU_MOON) - visViva(r, a, MU_MOON);
}

// ---------------------------------------------------------------------------
// Mission planner: Starship-HLS-like profile (simplified to a direct low-lunar-orbit mission).

/**
 * Propellant accounting, working backwards from the end of the mission.
 * legs: [{ name, dv } | { name, coastDays }] in flight order (after refilling in LEO); a leg may
 * carry `unload` (kg dropped at the end of that leg, e.g. cargo left on the surface).
 * Returns { legs: [{…, mStart, mEnd, prop, boil}], propNeeded, mAtTli }.
 */
export function propellantBudget({ legs, dry, payload, isp, boilPerDay = 0 }) {
  const out = legs.map(l => ({ ...l }));
  let m = dry + payload;                       // mass at the end of the last leg
  for (let i = out.length - 1; i >= 0; i--) {
    const l = out[i];
    m += l.unload || 0;                        // mass unloaded at this point (e.g. cargo left on the surface)
    l.mEnd = m;
    if (l.dv !== undefined) {
      m = m * Math.exp(l.dv / (isp * G0));
      l.prop = m - l.mEnd; l.boil = 0;
    } else {
      // boil-off: the propellant present at the start shrinks by (1 − b) per day
      const propEnd = m - dry - payload;
      const propStart = propEnd / (1 - boilPerDay) ** l.coastDays;
      l.boil = propStart - propEnd; l.prop = 0;
      m = dry + payload + propStart;
    }
    l.mStart = m;
  }
  return { legs: out, propNeeded: m - dry - payload, mStart: m };
}

/**
 * How many tanker flights fill the ship to `need` kg in LEO, given the ship's own residual
 * propellant on arrival, tanker delivered mass, launch cadence (days) and boil-off (fraction/day).
 * Earlier deliveries boil off for longer. Returns { n, timeline: [prop after each tanker], days, feasible }.
 */
export function tankerCount({ need, residual = 0, delivered = 120e3, cadenceDays = 5, boilPerDay = 0, capacity = 1500e3, maxN = 60 }) {
  let p = Math.min(residual, capacity);
  const timeline = [p];
  if (p >= need) return { n: 0, timeline, days: 0, feasible: need <= capacity };
  for (let n = 1; n <= maxN; n++) {
    p = p * (1 - boilPerDay) ** cadenceDays;
    p = Math.min(capacity, p + delivered);
    timeline.push(p);
    if (p >= need) return { n, timeline, days: n * cadenceDays, feasible: need <= capacity };
  }
  return { n: Infinity, timeline, days: Infinity, feasible: false };
}

/**
 * Whole-mission plan for a Starship-HLS-like lander flying a simplified direct LLO profile.
 * tli: planTLI() result; desc: poweredDescent(); asc: ascent(); deorb: deorbit().
 * p: { dry, payload, isp, capacity, delivered, cadenceDays, boilPerDay, mccDv, hoverDv, lloDays,
 *      surfaceDays, includeAscent, launchStages (booster+ship, bottom-first), dvToLeo, boosterReserve }.
 */
export function planMission(tli, desc, deorb, asc, p) {
  const g = p.isp * G0;
  const legs = [
    { key: 'tli', name: 'Trans-lunar injection', dv: tli.dv },
    { key: 'coast', name: 'Coast to the Moon', coastDays: tli.tof / DAY },
    { key: 'mcc', name: 'Mid-course corrections (est.)', dv: p.mccDv },
    { key: 'loi', name: 'Lunar orbit insertion', dv: tli.loiDv },
    { key: 'llo', name: 'Wait in low lunar orbit', coastDays: p.lloDays },
    { key: 'doi', name: 'Deorbit to 15 km perilune', dv: deorb.dv },
    { key: 'pdi', name: 'Powered descent (gravity turn)', dv: desc.dv },
    { key: 'hover', name: 'Final approach & hover allowance (est.)', dv: p.hoverDv, unload: p.includeAscent ? p.payload : 0 },
  ];
  if (p.includeAscent) {
    legs.push({ key: 'surface', name: 'Surface stay', coastDays: p.surfaceDays });
    legs.push({ key: 'ascent', name: 'Ascent to low lunar orbit', dv: asc.dv });
  }
  const finalPayload = p.includeAscent ? 0 : p.payload;
  const budget = propellantBudget({ legs, dry: p.dry, payload: finalPayload, isp: p.isp, boilPerDay: p.boilPerDay });
  const dvTotal = legs.reduce((a, l) => a + (l.dv || 0), 0);
  // what the ship has left in LEO after launching on Super Heavy: the booster keeps a reserve
  // (boostback + landing, est.), the ship burns whatever the remaining Δv to LEO needs.
  const [boost, ship] = p.launchStages;
  const reserve = p.boosterReserve ?? 0.1;
  const m0b = boost.dry + boost.prop + p.dry + ship.prop + p.payload;
  const dvBoost = boost.isp * G0 * Math.log(m0b / (m0b - boost.prop * (1 - reserve)));
  const shipNeeds = Math.max(0, p.dvToLeo - dvBoost);
  const m0s = p.dry + ship.prop + p.payload;
  const mAfter = m0s / Math.exp(shipNeeds / (ship.isp * G0));
  const residual = Math.max(0, mAfter - p.dry - p.payload);
  const tank = tankerCount({ need: budget.propNeeded, residual, delivered: p.delivered, cadenceDays: p.cadenceDays, boilPerDay: p.boilPerDay, capacity: p.capacity });
  const fullMass = p.dry + p.payload + p.capacity;
  return {
    legs: budget.legs, propNeeded: budget.propNeeded, dvTotal,
    residual, reachesOrbit: mAfter > p.dry + p.payload, dvBoost, shipNeeds,
    tankers: tank.n, tankTimeline: tank.timeline, campaignDays: tank.days,
    feasible: budget.propNeeded <= p.capacity && Number.isFinite(tank.n),
    dvAvailableFull: g * Math.log(fullMass / (p.dry + p.payload)),
  };
}
