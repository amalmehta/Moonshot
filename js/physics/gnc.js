// Guidance, navigation and control (GNC) from first principles. Pure module (no DOM) so Node
// tests can import it. Contents:
//   - seeded random numbers (every sim is reproducible from a seed)
//   - Kalman filters: scalar gain/steady state, and a 2-state (position, velocity) filter driven
//     by an accelerometer and corrected by position fixes
//   - a thrust-vector-control attitude loop (PID on an unstable "inverted pendulum" rocket)
//   - ZEM/ZEV optimal feedback guidance
//   - a 2-D Falcon 9 first-stage landing-burn simulator (point mass, drag, wind, sensors, nav
//     filter, guidance, throttle and tilt limits) plus a fast Monte Carlo driver.
import { G0 } from './constants.js';
import { atmosphere } from './atmosphere.js';
import { ENGINES, VEHICLES } from '../data/vehicles.js';

// ---------------------------------------------------------------------------
// Seeded random numbers
/** Mulberry32: tiny, fast 32-bit PRNG. Returns () => uniform in [0, 1). */
export function mulberry32(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Seeded generator with uniform() and normal() (Box–Muller). */
export function rng(seed) {
  const u = mulberry32(seed);
  let spare = null;
  return {
    uniform: u,
    normal() {
      if (spare !== null) { const s = spare; spare = null; return s; }
      let a = 0; while (a === 0) a = u();
      const b = u();
      const r = Math.sqrt(-2 * Math.log(a));
      spare = r * Math.sin(2 * Math.PI * b);
      return r * Math.cos(2 * Math.PI * b);
    },
  };
}

// ---------------------------------------------------------------------------
// Kalman filter, scalar
/** Kalman gain for a scalar state with prior variance P and measurement variance R. */
export const kalmanGain = (P, R) => P / (P + R);
/** Fuse a prior (x, P) with a measurement (z, R): returns { x, P, K }. */
export function scalarUpdate(x, P, z, R) {
  const K = kalmanGain(P, R);
  return { x: x + K * (z - x), P: (1 - K) * P, K };
}
/**
 * Steady state of the scalar random-walk filter x_{k+1} = x_k + w (var Q), z = x + v (var R).
 * The prior variance obeys P⁻ = P⁻R/(P⁻+R) + Q  ⇒  P⁻² − QP⁻ − QR = 0.
 */
export function scalarSteadyState(Q, R) {
  const Pprior = (Q + Math.sqrt(Q * Q + 4 * Q * R)) / 2;
  const K = Pprior / (Pprior + R);
  return { Pprior, K, Ppost: (1 - K) * Pprior };
}
/** Iterate the same scalar filter n times from P0 (to show convergence to the steady state). */
export function scalarIterate(Q, R, P0, n) {
  let P = P0; const K = [];
  for (let i = 0; i < n; i++) { const Pm = P + Q; const k = Pm / (Pm + R); K.push(k); P = (1 - k) * Pm; }
  return { P, K };
}

/**
 * One-axis navigation filter, state [p, v], covariance [[a, b], [b, c]].
 * Predict: integrate the accelerometer reading (plus known gravity) — process noise comes
 * from accelerometer noise σa entering through B = [dt²/2, dt].
 * Update: a position measurement z with variance R (H = [1, 0]).
 */
export class KF1D {
  constructor({ p = 0, v = 0, Pp = 100, Pv = 1, sigmaAcc = 0.1 } = {}) {
    this.p = p; this.v = v; this.a = Pp; this.b = 0; this.c = Pv; this.sa2 = sigmaAcc * sigmaAcc;
  }
  predict(acc, dt) {
    this.p += this.v * dt + 0.5 * acc * dt * dt;
    this.v += acc * dt;
    const { a, b, c } = this;
    // P = F P Fᵀ + Q,  F = [[1, dt], [0, 1]],  Q = σa² B Bᵀ
    const q = this.sa2;
    this.a = a + 2 * dt * b + dt * dt * c + q * dt ** 4 / 4;
    this.b = b + dt * c + q * dt ** 3 / 2;
    this.c = c + q * dt * dt;
  }
  update(z, R) {
    const S = this.a + R;
    const k1 = this.a / S, k2 = this.b / S;
    const r = z - this.p;
    this.p += k1 * r; this.v += k2 * r;
    const { a, b, c } = this;
    this.a = (1 - k1) * a; this.b = (1 - k1) * b; this.c = c - k2 * b;
    return { k1, k2, innovation: r };
  }
}

/**
 * Three-state filter [p, v, b]: like KF1D but also estimates the accelerometer bias b
 * (true acceleration = reading − b). An un-modelled bias makes any filter drift; estimating it
 * is standard practice in inertial navigation.
 */
export class KFBias {
  constructor({ p = 0, v = 0, Pp = 100, Pv = 1, Pb = 0.01, sigmaAcc = 0.1, sigmaBiasWalk = 1e-4 } = {}) {
    this.x = [p, v, 0];
    this.P = [[Pp, 0, 0], [0, Pv, 0], [0, 0, Pb]];
    this.sa2 = sigmaAcc * sigmaAcc; this.sb2 = sigmaBiasWalk * sigmaBiasWalk;
  }
  get p() { return this.x[0]; }
  predict(acc, dt) {
    const [p, v, b] = this.x;
    const a = acc - b;
    this.x = [p + v * dt + 0.5 * a * dt * dt, v + a * dt, b];
    // P = F P Fᵀ + Q with F = [[1, dt, −dt²/2], [0, 1, −dt], [0, 0, 1]], written out (no allocation-heavy matrix code)
    const P = this.P, h = -dt * dt / 2;
    const p00 = P[0][0], p01 = P[0][1], p02 = P[0][2], p11 = P[1][1], p12 = P[1][2], p22 = P[2][2];
    // rows of F·P
    const a00 = p00 + dt * p01 + h * p02, a01 = p01 + dt * p11 + h * p12, a02 = p02 + dt * p12 + h * p22;
    const a11 = p11 - dt * p12, a12 = p12 - dt * p22;
    const n00 = a00 + dt * a01 + h * a02, n01 = a01 - dt * a02, n02 = a02;
    const n11 = a11 - dt * a12, n12 = a12, n22 = p22;
    const q = this.sa2, B0 = dt * dt / 2, B1 = dt;
    const m00 = n00 + q * B0 * B0, m01 = n01 + q * B0 * B1, m11 = n11 + q * B1 * B1, m22 = n22 + this.sb2 * dt;
    this.P = [[m00, m01, n02], [m01, m11, n12], [n02, n12, m22]];
  }
  update(z, R) {
    const S = this.P[0][0] + R;
    const K = [this.P[0][0] / S, this.P[1][0] / S, this.P[2][0] / S];
    const r = z - this.x[0];
    this.x = this.x.map((xi, i) => xi + K[i] * r);
    const row0 = this.P[0].slice();
    this.P = this.P.map((row, i) => row.map((pij, j) => pij - K[i] * row0[j]));
  }
}

/**
 * Altimeter + IMU fusion demo (1-D vertical). Truth: a vehicle hopping with a smooth
 * acceleration profile. The IMU (accelerometer) reads true acceleration + bias + white noise at
 * `imuRate`; the altimeter reads true altitude + white noise at `altRate`.
 * Returns time series for truth, raw altimeter fixes, IMU-only dead reckoning, and the filter.
 */
export function simulateAltimeterFusion({
  seed = 1, duration = 30, imuRate = 100, altRate = 5, sigmaAlt = 4, sigmaAcc = 0.15, accBias = 0.05,
  filterSigmaAcc = null, estimateBias = true,
} = {}) {
  const R = rng(seed);
  const dt = 1 / imuRate;
  const every = Math.max(1, Math.round(imuRate / altRate));
  const acc = t => 1.2 * Math.sin(0.35 * t) + 0.6 * Math.sin(0.9 * t + 1);
  let z = 100, v = 0;
  let drZ = 100, drV = 0; // dead reckoning (IMU only)
  const p0 = 100 + sigmaAlt * R.normal();
  const kf = estimateBias
    ? new KFBias({ p: p0, v: 0, Pp: sigmaAlt ** 2, Pv: 0.25, Pb: 0.1 ** 2, sigmaAcc: filterSigmaAcc ?? sigmaAcc })
    : new KF1D({ p: p0, v: 0, Pp: sigmaAlt ** 2, Pv: 0.25, sigmaAcc: filterSigmaAcc ?? sigmaAcc });
  const out = { t: [], truth: [], dead: [], est: [], sigma: [], bias: [], tm: [], meas: [] };
  const n = Math.round(duration / dt);
  for (let i = 0; i <= n; i++) {
    const t = i * dt;
    if (i % 5 === 0) { out.t.push(t); out.truth.push(z); out.dead.push(drZ); out.est.push(kf.p); out.sigma.push(Math.sqrt(estimateBias ? kf.P[0][0] : kf.a)); out.bias.push(estimateBias ? kf.x[2] : 0); }
    // sensors at time t
    const aMeas = acc(t) + accBias + sigmaAcc * R.normal();
    if (i % every === 0 && i > 0) {
      const zm = z + sigmaAlt * R.normal();
      out.tm.push(t); out.meas.push(zm);
      kf.update(zm, sigmaAlt * sigmaAlt);
    }
    // propagate truth exactly (acceleration is smooth; midpoint rule)
    const am = acc(t + dt / 2);
    z += v * dt + 0.5 * am * dt * dt; v += am * dt;
    drZ += drV * dt + 0.5 * aMeas * dt * dt; drV += aMeas * dt;
    kf.predict(aMeas, dt);
  }
  const rms = arr => Math.sqrt(arr.reduce((s, e) => s + e * e, 0) / arr.length);
  const estErr = out.est.map((e, i) => e - out.truth[i]);
  const half = Math.floor(estErr.length / 2);
  const measErr = out.meas.map((m, i) => m - truthAt(out, out.tm[i]));
  return { ...out, rmsEst: rms(estErr.slice(half)), rmsMeas: rms(measErr), finalDeadErr: out.dead.at(-1) - out.truth.at(-1) };
}
function truthAt(out, t) { const i = Math.min(out.t.length - 1, Math.round(t / (out.t[1] - out.t[0]))); return out.truth[i]; }

// ---------------------------------------------------------------------------
// Attitude control: a thrust-vector-controlled rocket is an inverted pendulum.
//   I θ̈ = M_aero θ − T ℓ sin δ + M_gust
// θ: tilt from vertical, δ: engine gimbal angle, ℓ: gimbal-to-CG lever arm.
// Controller: δ_cmd = Kp θ + Ki ∫θ dt + Kd θ̇ (rad/rad), saturated at the gimbal limit, and the
// actuator follows δ_cmd with a first-order lag τ.
export function simulateTVC({
  Kp = 2, Ki = 0.2, Kd = 1.2, gimbalLimitDeg = 5, theta0Deg = 4, duration = 12, dt = 0.002,
  thrust = 600e3, lever = 15, inertia = 4.2e6, aeroDestab = 0.6 /* s⁻², M_aero/I */, tau = 0.05,
  gustTorque = 3e5, gustStart = 6, gustLength = 1,
} = {}) {
  const b = thrust * lever / inertia; // angular acceleration per radian of gimbal
  const lim = gimbalLimitDeg * Math.PI / 180;
  let th = theta0Deg * Math.PI / 180, w = 0, integ = 0, delta = 0;
  const out = { t: [], theta: [], delta: [], b };
  const n = Math.round(duration / dt);
  let saturatedTime = 0;
  for (let i = 0; i <= n; i++) {
    const t = i * dt;
    if (i % 10 === 0) { out.t.push(t); out.theta.push(th * 180 / Math.PI); out.delta.push(delta * 180 / Math.PI); }
    const cmdRaw = Kp * th + Ki * integ + Kd * w;
    const cmd = Math.max(-lim, Math.min(lim, cmdRaw));
    if (cmd !== cmdRaw) saturatedTime += dt; else integ += th * dt; // simple anti-windup
    delta += (cmd - delta) * dt / tau;
    const gust = t >= gustStart && t < gustStart + gustLength ? gustTorque / inertia : 0;
    const alpha = aeroDestab * th - b * Math.sin(delta) + gust;
    w += alpha * dt; th += w * dt;
    if (Math.abs(th) > Math.PI / 2) { out.t.push(t); out.theta.push(th * 180 / Math.PI); out.delta.push(delta * 180 / Math.PI); return { ...out, diverged: true, saturatedTime }; }
  }
  return { ...out, diverged: false, saturatedTime, finalTheta: th * 180 / Math.PI };
}

// ---------------------------------------------------------------------------
// ZEM/ZEV guidance. For a point mass in uniform gravity g with control acceleration u, the
// minimum-∫|u|²dt transfer to (r_f, v_f) in time t_go has the closed-loop solution
//   u = 6 ZEM / t_go² − 2 ZEV / t_go,
// ZEM = r_f − (r + v t_go + ½ g t_go²)  (zero-effort miss),  ZEV = v_f − (v + g t_go).
// Vectors are arrays of any dimension.
export function zemZev(r, v, rf, vf, tgo, g) {
  const zem = r.map((ri, i) => rf[i] - (ri + v[i] * tgo + 0.5 * g[i] * tgo * tgo));
  const zev = v.map((vi, i) => vf[i] - (vi + g[i] * tgo));
  const a = zem.map((m, i) => 6 * m / (tgo * tgo) - 2 * zev[i] / tgo);
  return { zem, zev, a };
}
/**
 * Fly the unconstrained vacuum point mass with ZEM/ZEV feedback over a fixed final time T.
 * Returns the final state (should equal rf, vf to integration error) and the control effort.
 */
export function flyZemZev({ r0, v0, rf, vf, T, g = [0, -G0], dt = 1e-3 }) {
  let r = r0.slice(), v = v0.slice(), t = 0, effort = 0;
  const path = { t: [], r: [], a: [] };
  while (T - t > 1e-9) {
    const h = Math.min(dt, T - t);
    const tgo = T - t;
    const { a } = zemZev(r, v, rf, vf, tgo, g);
    // the optimal control is linear in time, so evaluate it at mid-step for 2nd-order accuracy
    const rm = r.map((ri, i) => ri + v[i] * h / 2 + 0.25 * (a[i] + g[i]) * h * h / 2);
    const vm = v.map((vi, i) => vi + (a[i] + g[i]) * h / 2);
    const am = tgo - h / 2 > 1e-9 ? zemZev(rm, vm, rf, vf, tgo - h / 2, g).a : a;
    for (let i = 0; i < r.length; i++) { r[i] += v[i] * h + 0.5 * (am[i] + g[i]) * h * h; v[i] += (am[i] + g[i]) * h; }
    effort += am.reduce((s, x) => s + x * x, 0) * h;
    path.t.push(t); path.r.push(r.slice()); path.a.push(am.slice());
    t += h;
  }
  return { r, v, effort, path };
}
/** Analytic minimum of ∫|u|² for the same problem (1-D per axis, summed): checks the law is optimal. */
export function zemZevOptimalEffort({ r0, v0, rf, vf, T, g = [0, -G0] }) {
  const { zem, zev } = zemZev(r0, v0, rf, vf, T, g);
  // u(t) = c0 + c1 t is optimal; ∫u² = 4|ZEV|²/T − 12 ZEM·ZEV/T² + 12|ZEM|²/T³
  let J = 0;
  for (let i = 0; i < zem.length; i++) J += 12 * zem[i] ** 2 / T ** 3 - 12 * zem[i] * zev[i] / T ** 2 + 4 * zev[i] ** 2 / T;
  return J;
}

// ---------------------------------------------------------------------------
// Booster landing simulator
const M1D = ENGINES.merlin1d;
const F9S1 = VEHICLES.falcon9.stages[0];
export const BOOSTER = {
  dry: F9S1.dry,                     // kg (est., Wikipedia)
  propAtStart: 9000,                 // kg of propellant when the sim starts (est.; gives ~35 t, Blackmore 2016)
  thrustVac: M1D.thrustVac,          // N, one Merlin 1D
  thrustSL: M1D.thrustSL,
  ispVac: M1D.ispVac,
  minThrottle: M1D.throttleMin,      // ~0.40 (est.)
  exitArea: (M1D.thrustVac - M1D.thrustSL) / 101325, // m², from T_vac − T_SL = p0·A_e
  diameter: F9S1.diameter,
  cd: 1.0,                           // est. axial drag coefficient, engines-first with grid fins
  maxTiltDeg: 12,                    // thrust-vector tilt limit from vertical (vehicle attitude + gimbal), est.
  gridFinLD: 0.15,                   // lateral aero force / drag available from grid fins (est.)
};
BOOSTER.area = Math.PI * (BOOSTER.diameter / 2) ** 2;

/** Thrust (N) and mass flow (kg/s) of one engine at throttle thr and altitude z. */
export function engineAt(thr, z, b = BOOSTER) {
  const pa = atmosphere(z).p;
  const mdot = thr * b.thrustVac / (b.ispVac * G0);
  return { thrust: Math.max(0, thr * b.thrustVac - pa * b.exitArea), mdot };
}
/** Terminal (drag = weight) falling speed at altitude z for mass m. */
export function terminalVelocity(m, z, b = BOOSTER) {
  return Math.sqrt(2 * m * G0 / (atmosphere(z).rho * b.cd * b.area));
}
/** Thrust-to-weight at minimum throttle near sea level for mass m: > 1 ⇒ cannot hover. */
export const minThrottleTW = (m, b = BOOSTER) => engineAt(b.minThrottle, 0, b).thrust / (m * G0);

export const LANDING_CRITERIA = { vz: 4, vx: 2, miss: 10 }; // m/s, m/s, m — see the page for why

/**
 * 2-D landing burn: x downrange from the ship (m), z altitude above the deck (m).
 * opts:
 *   seed, wind (mean, m/s, + blows toward +x), gust (σ of gusts, m/s), noise (sensor-noise scale,
 *   1 = nominal), x0 (initial lateral offset, m), vx0, z0, ignitionAlt (null = guidance decides),
 *   guidance (true = closed-loop ZEM/ZEV; false = open-loop: planned throttle, no steering),
 *   ignitionFraction (target fraction of max thrust used to schedule ignition), record (bool).
 */
export function simulateLanding(opts = {}) {
  const o = {
    seed: 1, wind: 5, gust: 2, noise: 1, x0: 150, vx0: -4, z0: 6000, ignitionAlt: null, guidance: true,
    ignitionFraction: 0.62, vfTarget: 1.0, aimBelow: 0.5, hGate: 30, aTerm: 3, gateSwitch: 0.3, record: false, dt: 0.01, booster: BOOSTER, ...opts,
  };
  const b = o.booster;
  const R = rng(o.seed);
  const dt = o.dt;
  let m = b.dry + b.propAtStart;
  let prop = b.propAtStart;
  // start at the local terminal velocity (the stage has been falling through thickening air)
  let x = o.x0, z = o.z0, vx = o.vx0, vz = -terminalVelocity(m, o.z0, b);
  const v0 = Math.hypot(vx, vz);
  // wind: steady mean × power-law profile + Ornstein–Uhlenbeck gust (τ = 3 s)
  let gustV = o.gust * R.normal();
  const windAt = zz => o.wind * Math.min(1.6, Math.pow(Math.max(zz, 10) / 10, 1 / 7) / 1.4) + gustV;
  // sensors (σ scaled by `noise`)
  const s = o.noise;
  const sGps = 2.5 * s, sAccel = 0.05 * s;
  const bias = [0.02 * s * R.normal(), 0.02 * s * R.normal()];
  const sAlt = zz => (0.2 + 0.004 * zz) * s;
  const navX = new KF1D({ p: x + 4 * s * R.normal(), v: vx + 0.5 * s * R.normal(), Pp: Math.max(1e-4, 16 * s * s), Pv: Math.max(1e-4, 0.25 * s * s), sigmaAcc: Math.max(0.02, sAccel * 1.5) });
  const navZ = new KF1D({ p: z + 4 * s * R.normal(), v: vz + 0.5 * s * R.normal(), Pp: Math.max(1e-4, 16 * s * s), Pv: Math.max(1e-4, 0.25 * s * s), sigmaAcc: Math.max(0.02, sAccel * 1.5) });

  let lit = false, out = false, tIgn = null, zIgn = null, vIgn = null, thr = 0, ux = 0, cutoffReason = null;
  let cmdThr = 0, cmdUx = 0, cmdUz = 0, phaseA = true; // held guidance outputs (thrust accel components)
  let finAx = 0;
  const trace = o.record ? { t: [], x: [], z: [], vx: [], vz: [], thr: [], tilt: [], m: [], xe: [], ze: [], lit: [], wind: [] } : null;
  let t = 0, step = 0, maxQ = 0;
  // loop cadences: guidance 50 Hz, GPS & gust update 10 Hz, altimeter & trace 20 Hz, IMU every step
  const nG = Math.max(1, Math.round(0.02 / dt)), nGps = Math.max(1, Math.round(0.1 / dt)), nAlt = Math.max(1, Math.round(0.05 / dt));
  let w = windAt(z);
  // Guidance off = open loop: replay the throttle-vs-time plan of a calm, noise-free, on-target
  // guided landing from the same altitude. Perfect if reality matches the plan; nothing corrects it if not.
  const plan = o.guidance ? null : nominalPlan(o.z0, b);

  while (t < 300) {
    const atm = atmosphere(z);
    // --- guidance & ignition logic at 50 Hz, using the navigation estimate
    if (step % nG === 0) {
      const xe = navX.p, ze = navZ.p, vxe = navX.v, vze = navZ.v;
      const he = Math.max(ze, 0.01);
      const atmE = atmosphere(Math.max(ze, 0));
      const rhoE = atmE.rho;
      const spE = Math.hypot(vxe, vze);
      const dragAccE = 0.5 * rhoE * spE * spE * b.cd * b.area / m; // estimated drag decel (no wind knowledge)
      const tMax = b.thrustVac - atmE.p * b.exitArea;
      if (!lit && !out) {
        // ignition: required thrust acceleration ≈ (v² − v_f²)/2h + g − ⅓·drag (drag ∝ v² averages to ⅓ over a constant-decel burn)
        const need = (vze * vze - o.vfTarget ** 2) / (2 * he) + G0 - dragAccE / 3;
        const trigger = o.ignitionAlt != null ? ze <= o.ignitionAlt
          : o.guidance ? need >= o.ignitionFraction * tMax / m : t >= plan.tIgn - 1e-9;
        if (trigger && vze < 0) { lit = true; tIgn = t; zIgn = z; vIgn = Math.hypot(vx, vz); }
        // before ignition: grid fins steer toward the ship (lift ≤ L/D × drag)
        if (o.guidance) {
          const tg = he / Math.max(5, -vze);
          const want = -(6 * xe / (tg * tg) + 4 * vxe / tg);
          const cap = b.gridFinLD * dragAccE;
          finAx = Math.max(-cap, Math.min(cap, want));
        } else finAx = 0;
      }
      if (lit && !out) {
        finAx = 0;
        if (o.guidance) {
          {
            // Two targets flown with the same ZEM/ZEV law: first a "gate" hGate above the deck,
            // reached at the speed from which a gentle terminal deceleration aTerm brings the stage
            // to vf; then the deck itself (aimed aimBelow metres "through" it so sensor noise can't
            // make the stage stop just above it — with T/W > 1 at minimum throttle it can't hover).
            const vGate = Math.sqrt(o.vfTarget ** 2 + 2 * o.aTerm * o.hGate);
            // switch to the deck target (and stay there) once the gate is < 1 s away: ZEM/ZEV
            // commands grow like 1/t_go², so we never fly it all the way into a waypoint
            if (phaseA && (ze - o.hGate) / Math.max(0.5, -vze) < o.gateSwitch) phaseA = false;
            const ha = phaseA ? ze - o.hGate : Math.max(0.05, ze + o.aimBelow);
            const vfz = phaseA ? vGate : o.vfTarget;
            const vzMag = Math.max(0.5, -vze);
            const tgo = Math.max(0.2, 2 * ha / (vzMag + vfz));
            const { a } = zemZev([xe, ha], [vxe, vze], [0, 0], [0, -vfz], tgo, [0, -G0]);
            // thrust must supply the guidance acceleration minus what drag already provides
            const dax = spE > 0 ? -dragAccE * vxe / spE : 0, daz = spE > 0 ? -dragAccE * vze / spE : 0;
            let ax = a[0] - dax, az = Math.max(0.1, a[1] - daz);
            const tilt = Math.tan(b.maxTiltDeg * Math.PI / 180);
            ax = Math.max(-tilt * az, Math.min(tilt * az, ax));
            cmdUx = ax; cmdUz = az;
            const F = m * Math.hypot(ax, az);
            cmdThr = (F + atm.p * b.exitArea) / b.thrustVac;
          }
        } else {
          const k = Math.round((t - tIgn) / (nG * dt));
          cmdThr = plan.thr[Math.min(k, plan.thr.length - 1)]; cmdUx = 0; cmdUz = 1;
        }
        thr = Math.max(b.minThrottle, Math.min(1, cmdThr));
        if (o.planOut) o.planOut.push(thr);
        ux = cmdUx / Math.hypot(cmdUx, cmdUz); // sine of tilt
        // cannot hover: if the vehicle has stopped and is climbing at minimum throttle, shut down
        if (vz > 0.5 && z > 0.5) { out = true; cutoffReason = 'Stopped above the deck: at minimum throttle T/W > 1, so it climbed and the engine was shut down'; }
      }
    }
    if (out) thr = 0;
    // --- truth dynamics
    if (step % nGps === 0) { gustV += (-gustV / 3) * 0.1 + o.gust * Math.sqrt(2 * 0.1 / 3) * R.normal(); w = windAt(z); }
    const rvx = vx - w, rvz = vz;
    const sp = Math.hypot(rvx, rvz);
    const q = 0.5 * atm.rho * sp * sp;
    maxQ = Math.max(maxQ, q);
    const D = q * b.cd * b.area;
    let Fx = sp > 0 ? -D * rvx / sp : 0, Fz = sp > 0 ? -D * rvz / sp : 0;
    Fx += finAx * m;
    let mdot = 0;
    if (lit && thr > 0 && prop > 0) {
      const e = { thrust: Math.max(0, thr * b.thrustVac - atm.p * b.exitArea), mdot: thr * b.thrustVac / (b.ispVac * G0) };
      const cz = Math.sqrt(Math.max(0, 1 - ux * ux));
      Fx += e.thrust * ux; Fz += e.thrust * cz; mdot = e.mdot;
    } else if (lit && prop <= 0 && !out) { out = true; cutoffReason = 'Ran out of propellant'; }
    const axT = Fx / m, azT = Fz / m - G0;
    // sensors: IMU measures specific force (non-gravitational acceleration)
    navX.predict(axT + bias[0] + sAccel * R.normal(), dt);
    // (the accelerometer reads specific force azT + g; the filter adds the known gravity −g back)
    navZ.predict((azT + G0 + bias[1] + sAccel * R.normal()) - G0, dt);
    // integrate (semi-implicit Euler, dt = 10 ms)
    vx += axT * dt; vz += azT * dt;
    x += vx * dt; z += vz * dt;
    const dm = Math.min(prop, mdot * dt); prop -= dm; m -= dm;
    t += dt; step++;
    if (step % nGps === 0) { navX.update(x + sGps * R.normal(), Math.max(1e-6, sGps * sGps)); navZ.update(z + sGps * R.normal(), Math.max(1e-6, sGps * sGps)); }
    if (step % nAlt === 0 && z < 3000) { const sa = sAlt(z); navZ.update(z + sa * R.normal(), Math.max(1e-6, sa * sa)); }
    if (trace && step % nAlt === 0) {
      trace.t.push(t); trace.x.push(x); trace.z.push(z); trace.vx.push(vx); trace.vz.push(vz); trace.thr.push(lit && !out ? thr : 0);
      trace.tilt.push(Math.asin(Math.max(-1, Math.min(1, ux))) * 180 / Math.PI); trace.m.push(m); trace.xe.push(navX.p); trace.ze.push(navZ.p); trace.lit.push(lit && !out); trace.wind.push(w);
    }
    if (z <= 0) break;
  }
  // touchdown: interpolate back to z = 0 for the final state
  const touch = { vz: -vz, vx: Math.abs(vx), miss: Math.abs(x), x, t, propLeft: prop };
  const c = LANDING_CRITERIA;
  const fails = [];
  if (cutoffReason) fails.push(cutoffReason);
  if (touch.vz > c.vz) fails.push(`Vertical speed ${touch.vz.toFixed(1)} m/s > ${c.vz} m/s`);
  if (touch.vx > c.vx) fails.push(`Horizontal speed ${touch.vx.toFixed(1)} m/s > ${c.vx} m/s`);
  if (touch.miss > c.miss) fails.push(`Missed the target by ${touch.miss.toFixed(1)} m > ${c.miss} m`);
  if (!lit) fails.push('Engine never lit');
  return {
    ...touch, success: fails.length === 0, fails, cutoffReason, ignitionTime: tIgn,
    ignitionAlt: zIgn, ignitionSpeed: vIgn,
    burnTime: tIgn != null ? t - tIgn : 0, propUsed: b.propAtStart - prop, propFraction: prop / (b.dry + b.propAtStart),
    startSpeed: v0, startMass: b.dry + b.propAtStart, maxQ, trace,
  };
}

const planCache = new Map();
/** Throttle-vs-time plan (50 Hz samples from ignition) of the calm, noise-free, on-target guided landing. */
export function nominalPlan(z0 = 6000, b = BOOSTER) {
  const key = z0 + '|' + b.propAtStart;
  if (!planCache.has(key)) {
    const thr = [];
    const r = simulateLanding({ z0, wind: 0, gust: 0, noise: 0, x0: 0, vx0: 0, guidance: true, booster: b, planOut: thr });
    planCache.set(key, { tIgn: r.ignitionTime, thr });
  }
  return planCache.get(key);
}

/** Run n landings with random wind, gusts, offsets and sensor noise; returns summaries only.
 *  Uses a 20 ms physics step by default (2× faster; results statistically indistinguishable from 10 ms). */
export function monteCarloLandings({ n = 200, seed = 1, windMax = 10, gust = 3, noise = 1, offsetMax = 300, guidance = true, ignitionAlt = null, start = 0, count = n, dt = 0.02 } = {}) {
  const res = [];
  for (let i = start; i < Math.min(n, start + count); i++) {
    const R = rng(seed * 7919 + i * 104729);
    const r = simulateLanding({
      seed: seed * 1000 + i + 1, wind: (2 * R.uniform() - 1) * windMax, gust: gust * R.uniform(), noise: noise * (0.5 + R.uniform()),
      x0: (2 * R.uniform() - 1) * offsetMax, vx0: 6 * (2 * R.uniform() - 1), guidance, ignitionAlt, dt,
    });
    res.push({ x: r.x, vz: r.vz, vx: r.vx, miss: r.miss, success: r.success, propLeft: r.propLeft, burnTime: r.burnTime, fails: r.fails });
  }
  return res;
}

/** Closed-form constant-deceleration ("suicide burn") stopping distance: h = v² / (2(a_T − g)). */
export const suicideBurnAltitude = (v, thrustAccel, g = G0) => v * v / (2 * (thrustAccel - g));
