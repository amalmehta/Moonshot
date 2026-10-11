// The Tsiolkovsky rocket equation and multi-stage sizing.
import { G0 } from './constants.js';

/** Effective exhaust velocity from specific impulse (s → m/s). */
export const exhaustVelocity = isp => isp * G0;

/** Δv = Isp·g0·ln(m0/mf). */
export const deltaV = (isp, m0, mf) => isp * G0 * Math.log(m0 / mf);

/** Mass ratio m0/mf needed for a Δv. */
export const massRatio = (dv, isp) => Math.exp(dv / (isp * G0));

/** Propellant needed to give `dv` to a vehicle whose burnout mass is `mf`. */
export const propellantFor = (dv, isp, mf) => mf * (massRatio(dv, isp) - 1);

/** Propellant burned to give `dv` to a vehicle that starts at mass `m0`. */
export const propellantFromStart = (dv, isp, m0) => m0 * (1 - 1 / massRatio(dv, isp));

/** Thrust-to-weight ratio at Earth's surface. */
export const twr = (thrust, mass) => thrust / (mass * G0);

/** Mass flow from thrust and Isp: ṁ = F / (Isp·g0). */
export const massFlow = (thrust, isp) => thrust / (isp * G0);

/**
 * Δv of a serial-staged stack.
 * stages: bottom-first [{ name, dry, prop, isp, reserve? (fraction of prop kept for landing), jettison? (mass dropped at ignition of this stage, e.g. fairing) }]
 * Everything above a stage rides along as its payload.
 * Returns { total, stages:[{name, m0, mf, dv}] }.
 */
export function stackDeltaV(stages, payload) {
  const out = [];
  let total = 0;
  for (let i = 0; i < stages.length; i++) {
    let above = payload;
    for (let j = i + 1; j < stages.length; j++) above += stages[j].dry + stages[j].prop + (stages[j].jettison || 0);
    const s = stages[i];
    const m0 = s.dry + s.prop + (s.jettison || 0) + above;
    const usable = s.prop * (1 - (s.reserve || 0));
    // jettisoned mass (fairing) is assumed dropped about a third of the way through the burn
    const mf = m0 - usable - (s.jettison || 0);
    const dv = s.jettison
      ? deltaV(s.isp, m0, m0 - usable / 3) + deltaV(s.isp, m0 - usable / 3 - s.jettison, mf)
      : deltaV(s.isp, m0, mf);
    out.push({ name: s.name, m0, mf, dv });
    total += dv;
  }
  return { total, stages: out };
}

/** Largest payload for which the stack still delivers `dvRequired` (bisection). */
export function maxPayload(stages, dvRequired) {
  let lo = 0, hi = stages.reduce((a, s) => a + s.dry + s.prop, 0);
  if (stackDeltaV(stages, 0).total < dvRequired) return 0;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (stackDeltaV(stages, mid).total >= dvRequired) lo = mid; else hi = mid;
  }
  return lo;
}

/**
 * Optimal Δv split for N stages with identical Isp and structural coefficient ε
 * (classic result: equal Δv per stage). Returns the payload fraction π = m_payload/m_0.
 */
export function payloadFractionIdenticalStages(dvTotal, isp, eps, n) {
  const R = massRatio(dvTotal / n, isp);          // per-stage mass ratio
  const lambda = (1 - eps * R) / (R - 1);          // payload ratio per stage: m_above / m_stage
  if (lambda <= 0) return 0;
  const perStage = lambda / (1 + lambda);
  return perStage ** n;
}
