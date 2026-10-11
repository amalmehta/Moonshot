// Two-body orbital mechanics.
import { MU_EARTH, R_EARTH } from './constants.js';

export const circularVelocity = (r, mu = MU_EARTH) => Math.sqrt(mu / r);
export const escapeVelocity = (r, mu = MU_EARTH) => Math.sqrt(2 * mu / r);
/** Vis-viva: speed at radius r on an orbit of semi-major axis a. */
export const visViva = (r, a, mu = MU_EARTH) => Math.sqrt(mu * (2 / r - 1 / a));
export const period = (a, mu = MU_EARTH) => 2 * Math.PI * Math.sqrt(a ** 3 / mu);
/** Radius of the synchronous orbit for a body rotating with sidereal period T. */
export const synchronousRadius = (T, mu = MU_EARTH) => (mu * (T / (2 * Math.PI)) ** 2) ** (1 / 3);

/** Hohmann transfer between circular orbits r1 → r2. */
export function hohmann(r1, r2, mu = MU_EARTH) {
  const a = (r1 + r2) / 2;
  const dv1 = Math.abs(visViva(r1, a, mu) - circularVelocity(r1, mu));
  const dv2 = Math.abs(circularVelocity(r2, mu) - visViva(r2, a, mu));
  return { dv1, dv2, total: dv1 + dv2, tof: period(a, mu) / 2, a };
}

/** Δv for a pure plane change of Δi at speed v. */
export const planeChange = (v, di) => 2 * v * Math.sin(di / 2);

/** Orbit elements from a 2-D or 3-D state vector (arrays). */
export function elementsFromState(r, v, mu = MU_EARTH) {
  const rm = Math.hypot(...r), vm = Math.hypot(...v);
  const energy = vm * vm / 2 - mu / rm;
  const a = -mu / (2 * energy);
  const r3 = [r[0], r[1], r[2] || 0], v3 = [v[0], v[1], v[2] || 0];
  const h = [r3[1] * v3[2] - r3[2] * v3[1], r3[2] * v3[0] - r3[0] * v3[2], r3[0] * v3[1] - r3[1] * v3[0]];
  const hm = Math.hypot(...h);
  const e = Math.sqrt(Math.max(0, 1 + 2 * energy * hm * hm / (mu * mu)));
  const rp = a * (1 - e), ra = e < 1 ? a * (1 + e) : Infinity;
  return { a, e, h: hm, energy, rp, ra, perigeeAlt: rp - R_EARTH, apogeeAlt: ra - R_EARTH };
}

/** Kepler's equation M = E − e·sinE (Newton). */
export function eccentricAnomaly(M, e) {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 50; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  return E;
}

/**
 * Loss-free Δv to reach a circular orbit of altitude h from the surface: an impulsive kick into a
 * Hohmann ellipse from the surface (perigee speed) plus circularization at apogee, minus the
 * eastward speed Earth's rotation gives for free at that latitude.
 */
export function idealOrbitDeltaV(h, latitudeRad = 0, mu = MU_EARTH) {
  const r = R_EARTH + h;
  const a = (R_EARTH + r) / 2;
  const kick = visViva(R_EARTH, a, mu);
  const circularize = circularVelocity(r, mu) - visViva(r, a, mu);
  return kick + circularize - 465.1 * Math.cos(latitudeRad);
}
