// 2-D ascent simulator: point mass in Earth's equatorial plane (inertial frame), US-1976 atmosphere
// co-rotating with Earth, gravity turn for stage 1, closed-loop insertion guidance for stage 2.
// It exists to show *where the Δv goes* (gravity, drag and steering losses) and why staging works,
// not to reproduce a real trajectory to the metre.
import { G0, MU_EARTH, R_EARTH, OMEGA_EARTH, DEG } from './constants.js';
import { atmosphere } from './atmosphere.js';
import { elementsFromState } from './orbit.js';

/**
 * Vehicle config for the simulator. Stages bottom-first:
 * { name, dry, prop, thrustSL, thrustVac, ispSL, ispVac, area (m²), cd, reserve (fraction kept for landing) }
 * Upper stages have thrustSL/ispSL ignored (they light in near-vacuum).
 */
export function presetFromVehicle(v, opts = {}) {
  const { ENGINES } = opts;
  return {
    name: v.name,
    stages: v.stages.map((s, i) => {
      const e = ENGINES?.[s.engines] || {};
      const vac = s.thrustVac ?? (s.thrustSL ? s.thrustSL * (s.ispVac / s.ispSL) : 0);
      return {
        name: s.name, dry: s.dry, prop: s.prop,
        thrustSL: s.thrustSL ?? vac, thrustVac: vac,
        ispSL: s.ispSL ?? e.ispSL ?? s.isp, ispVac: s.ispVac ?? e.ispVac ?? s.isp,
        area: Math.PI * (s.diameter / 2) ** 2, cd: 0.4,
        reserve: i === 0 ? (opts.boosterReserve ?? 0) : 0,
        jettison: s.jettison || 0,
      };
    }),
  };
}

/**
 * Run the ascent.
 * cfg: { stages, payload, targetAlt, latitude (deg), pitchKickTime, pitchKickAngle (deg), qLimit (Pa, throttle bucket),
 *        gLimit (max axial accel in g; throttles down), coastAfterMeco (s), dt }
 * Returns { history: {t,alt,downrange,speed,q,accel,mass,pitch,stage}[], events, losses, orbit, success }
 */
export function simulateAscent(cfg) {
  const {
    stages, payload = 0, targetAlt = 200e3, latitude = 28.5,
    pitchKickTime = 8, pitchKickAngle = 3.5, pitchKickDuration = 6,
    qLimit = Infinity, gLimit = Infinity, coastAfterMeco = 4, dt = 0.1, maxTime = 1200,
    fairingAlt = 110e3,
  } = cfg;
  const rTarget = R_EARTH + targetAlt;
  const lat = latitude * DEG;
  // Launch site on the +y axis; Earth's rotation gives an eastward (−x → +x) speed at that latitude.
  // Working in the plane of the launch latitude circle is a simplification (no plane-change cost).
  const surfaceSpeed = OMEGA_EARTH * R_EARTH * Math.cos(lat);
  let x = 0, y = R_EARTH, vx = surfaceSpeed, vy = 0;
  let t = 0, stageIdx = 0;
  let propLeft = stages[0].prop;
  let fairing = stages.reduce((a, s) => a + (s.jettison || 0), 0);
  const upperMass = i => stages.slice(i + 1).reduce((a, s) => a + s.dry + s.prop, 0);
  let mass = stages[0].dry + stages[0].prop + upperMass(0) + payload + fairing;
  const events = [{ t: 0, name: 'Liftoff' }];
  const history = [];
  const losses = { gravity: 0, drag: 0, steering: 0, idealDv: 0 };
  let maxQ = { q: 0, t: 0, alt: 0 };
  let coastUntil = -1;
  let success = false;
  let lastPitch = 90;

  const sample = (stage, pitch, q, accel, alt, downrange, speed) =>
    history.push({ t, alt, downrange, speed, q, accel, mass, pitch, stage });

  while (t < maxTime) {
    const r = Math.hypot(x, y);
    const alt = r - R_EARTH;
    if (alt < -1) { events.push({ t, name: 'Crashed' }); break; }
    const ux = x / r, uy = y / r;             // local vertical
    const ex = uy, ey = -ux;                   // local horizontal (prograde, eastward)
    const vr = vx * ux + vy * uy, vt = vx * ex + vy * ey;
    const atm = atmosphere(alt);
    // The atmosphere co-rotates with Earth: its velocity is ω×r (eastward = +x at the launch site).
    const wx = OMEGA_EARTH * Math.cos(lat) * y, wy = -OMEGA_EARTH * Math.cos(lat) * x;
    const ax_rel = vx - wx, ay_rel = vy - wy;
    const vrel = Math.hypot(ax_rel, ay_rel);
    const q = 0.5 * atm.rho * vrel * vrel;
    const speed = Math.hypot(vx, vy);
    if (q > maxQ.q) maxQ = { q, t, alt };

    const st = stages[stageIdx];
    const burning = st && t >= coastUntil && propLeft > st.prop * (st.reserve || 0) + 1e-6;
    let thrust = 0, isp = 0, pitch = lastPitch, throttle = 1;

    if (burning) {
      const pFrac = Math.min(1, atm.p / 101325);
      thrust = st.thrustVac - (st.thrustVac - st.thrustSL) * pFrac;
      isp = st.ispVac - (st.ispVac - st.ispSL) * pFrac;
      // throttle bucket through max-Q and an acceleration limit
      if (q > qLimit) throttle = Math.max(0.6, qLimit / q);
      if (thrust * throttle / mass > gLimit * G0) throttle = Math.max(0.4, gLimit * G0 * mass / thrust);
      thrust *= throttle;

      if (stageIdx === 0) {
        // vertical rise → pitch kick → gravity turn (thrust along air-relative velocity)
        if (t < pitchKickTime) pitch = 90;
        else if (t < pitchKickTime + pitchKickDuration) pitch = 90 - pitchKickAngle * (t - pitchKickTime) / pitchKickDuration;
        else {
          const rr = ax_rel * ux + ay_rel * uy, rt = ax_rel * ex + ay_rel * ey;
          pitch = Math.min(lastPitch, Math.atan2(rr, rt) / DEG);
        }
      } else {
        // Upper stage: 1-D ZEM/ZEV optimal guidance in the radial direction, a_r = 6·ZEM/t² − 2·ZEV/t,
        // driving altitude → target and radial speed → 0 by the time horizontal speed reaches circular.
        // The rest of the thrust goes horizontal. tgo is re-estimated every step.
        const vCirc = Math.sqrt(MU_EARTH / rTarget);
        const aT = thrust / mass;
        const mdot = thrust / (isp * G0);
        const tBurnLeft = Math.max(5, (propLeft - st.prop * (st.reserve || 0)) / mdot);
        const tgo = Math.max(10, Math.min(tBurnLeft, (vCirc - vt) / Math.max(aT, 1e-3)));
        const gEff = MU_EARTH / (r * r) - vt * vt / r; // gravity minus centrifugal
        const zem = rTarget - (r + vr * tgo), zev = 0 - vr;
        const aRcmd = 6 * zem / (tgo * tgo) - 2 * zev / tgo + gEff;
        const s = Math.max(-0.9, Math.min(0.9, aRcmd / aT));
        pitch = Math.asin(s) / DEG;
      }
      lastPitch = pitch;
    }

    const pr = pitch * DEG;
    const tx = Math.cos(pr) * ex + Math.sin(pr) * ux, ty = Math.cos(pr) * ey + Math.sin(pr) * uy;
    const g = MU_EARTH / (r * r);
    const area = st ? st.area : 1;
    const cd = st ? st.cd : 0.4;
    const D = q * cd * area;
    const dragx = vrel > 0 ? -D * ax_rel / vrel : 0, dragy = vrel > 0 ? -D * ay_rel / vrel : 0;
    const axTot = (thrust * tx + dragx) / mass - g * ux, ayTot = (thrust * ty + dragy) / mass - g * uy;

    if (Math.round(t / dt) % 10 === 0) sample(stageIdx, pitch, q, Math.hypot(axTot + g * ux, ayTot + g * uy) / G0, alt, R_EARTH * Math.atan2(x, y), speed);

    // loss bookkeeping: project onto velocity direction
    if (speed > 1 && thrust > 0) {
      const vhx = vx / speed, vhy = vy / speed;
      losses.gravity += g * (ux * vhx + uy * vhy) * dt;
      losses.drag += D / mass * dt;
      losses.steering += thrust / mass * (1 - (tx * vhx + ty * vhy)) * dt;
      losses.idealDv += thrust / mass * dt;
    }

    // semi-implicit Euler (symplectic) is plenty at dt = 0.1 s for this purpose
    vx += axTot * dt; vy += ayTot * dt;
    x += vx * dt; y += vy * dt;
    if (thrust > 0) { const dm = thrust / (isp * G0) * dt; mass -= dm; propLeft -= dm; }
    t += dt;

    if (fairing > 0 && alt > fairingAlt) { mass -= fairing; fairing = 0; events.push({ t, name: 'Fairing separation' }); }

    // orbit check during upper-stage burn
    if (stageIdx > 0 && burning) {
      const el = elementsFromState([x, y], [vx, vy]);
      if (el.perigeeAlt > Math.min(targetAlt - 10e3, 150e3) && el.e < 0.02) { events.push({ t, name: 'Orbit insertion (SECO)' }); success = true; break; }
    }
    // staging
    if (st && t >= coastUntil && propLeft <= st.prop * (st.reserve || 0) + 1e-6) {
      if (stageIdx === stages.length - 1) { events.push({ t, name: 'Upper stage out of propellant' }); break; }
      events.push({ t, name: stageIdx === 0 ? 'MECO / stage separation' : `Stage ${stageIdx + 1} burnout` });
      mass -= st.dry + propLeft;
      stageIdx++;
      propLeft = stages[stageIdx].prop;
      coastUntil = t + coastAfterMeco;
      events.push({ t: coastUntil, name: `Stage ${stageIdx + 1} ignition` });
    }
  }
  const r = Math.hypot(x, y);
  sample(stageIdx, lastPitch, 0, 0, r - R_EARTH, R_EARTH * Math.atan2(x, y), Math.hypot(vx, vy));
  const orbit = elementsFromState([x, y], [vx, vy]);
  return {
    history, events, losses, maxQ, orbit, success,
    finalMass: mass, propRemaining: propLeft, time: t, surfaceSpeed,
  };
}

/** Largest payload that still reaches orbit in the simulator (bisection on success). */
export function simulatedMaxPayload(cfg, hi = 200000) {
  let lo = 0;
  if (!simulateAscent({ ...cfg, payload: 0 }).success) return 0;
  while (simulateAscent({ ...cfg, payload: hi }).success) hi *= 2;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (simulateAscent({ ...cfg, payload: mid }).success) lo = mid; else hi = mid;
  }
  return lo;
}
