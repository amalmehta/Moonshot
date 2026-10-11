// Ideal rocket-nozzle theory (quasi-1-D, isentropic, frozen composition, calorically perfect gas).
// This is the textbook model of Sutton & Biblarz ch. 3; real engines land a few % below it.
import { G0, R_UNIVERSAL } from './constants.js';

/** A/A* as a function of Mach number. */
export function areaRatioFromMach(M, g) {
  return (1 / M) * ((2 / (g + 1)) * (1 + (g - 1) / 2 * M * M)) ** ((g + 1) / (2 * (g - 1)));
}

/** Inverse of areaRatioFromMach (bisection). supersonic=true picks the M>1 branch. */
export function machFromAreaRatio(eps, g, supersonic = true) {
  if (eps <= 1) return 1;
  let lo = supersonic ? 1 : 1e-6, hi = supersonic ? 100 : 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const f = areaRatioFromMach(mid, g) - eps;
    // A/A* rises with M on the supersonic branch and falls on the subsonic one
    if ((f > 0) === supersonic) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Static-to-stagnation pressure ratio p/pc at Mach M. */
export const pressureRatio = (M, g) => (1 + (g - 1) / 2 * M * M) ** (-g / (g - 1));
/** Static-to-stagnation temperature ratio T/Tc at Mach M. */
export const temperatureRatio = (M, g) => 1 / (1 + (g - 1) / 2 * M * M);

/** Characteristic velocity c* = sqrt(R·Tc/γ) / (2/(γ+1))^((γ+1)/(2(γ−1))). */
export function cStar(Tc, molarMass, g) {
  const R = R_UNIVERSAL / molarMass;
  return Math.sqrt(R * Tc / g) / (2 / (g + 1)) ** ((g + 1) / (2 * (g - 1)));
}

/** Thrust coefficient C_F for exit/chamber and ambient/chamber pressure ratios. */
export function thrustCoefficient(g, peOverPc, paOverPc, eps) {
  const momentum = Math.sqrt((2 * g * g / (g - 1)) * (2 / (g + 1)) ** ((g + 1) / (g - 1)) * (1 - peOverPc ** ((g - 1) / g)));
  return momentum + (peOverPc - paOverPc) * eps;
}

/** Ideal exhaust velocity for full expansion to pe (m/s). */
export function exitVelocity(Tc, molarMass, g, peOverPc) {
  const R = R_UNIVERSAL / molarMass;
  return Math.sqrt(2 * g / (g - 1) * R * Tc * (1 - peOverPc ** ((g - 1) / g)));
}

/**
 * Combustion-product properties at typical mixture ratios. Tc is the approximate NASA CEA
 * chamber temperature. γ and molar mass are *effective* values that make this one-γ ideal
 * model stand in for shifting equilibrium. Each pair was fitted to ONE engine only
 * (kerolox: Merlin 1D sea-level + vacuum Isp; methalox: Raptor 2 sea-level + vacuum Isp) at
 * efficiency 0.97. The other engines are then genuine predictions, checked on the Validation page.
 * Hydrolox is not fitted (CEA-like values).
 */
export const PROPELLANTS = {
  kerolox: { name: 'RP-1 / LOX', of: 2.36, Tc: 3670, molarMass: 23.7, gamma: 1.200, densityFuel: 810, densityOx: 1141 },
  methalox: { name: 'CH₄ / LOX', of: 3.6, Tc: 3600, molarMass: 23.6, gamma: 1.115, densityFuel: 423, densityOx: 1141 },
  hydrolox: { name: 'LH₂ / LOX', of: 6.0, Tc: 3500, molarMass: 13.5, gamma: 1.21, densityFuel: 71, densityOx: 1141 },
};

/** Bulk density of a propellant combination at mixture ratio O/F. */
export function bulkDensity(p, of = p.of) {
  return (1 + of) / (of / p.densityOx + 1 / p.densityFuel);
}

/**
 * Full engine performance.
 * e: { prop (key or object), pc (Pa), eps (area ratio), thrustVac? or throatArea?, efficiency? (Isp multiplier, default 0.97) }
 * Returns a function of ambient pressure pa → { isp, thrust, cf, mdot, pe, Me, Te, ve, separated }
 */
export function enginePerformance(e) {
  const p = typeof e.prop === 'string' ? PROPELLANTS[e.prop] : e.prop;
  const g = e.gamma ?? p.gamma, Tc = e.Tc ?? p.Tc, mw = e.molarMass ?? p.molarMass;
  const eta = e.efficiency ?? 0.97;
  const Me = machFromAreaRatio(e.eps, g);
  const peOverPc = pressureRatio(Me, g);
  const cs = cStar(Tc, mw, g);
  // Size the throat from vacuum thrust if given.
  const cfVac = thrustCoefficient(g, peOverPc, 0, e.eps);
  const At = e.throatArea ?? (e.thrustVac ? e.thrustVac / (e.pc * cfVac * eta) : 0.1);
  return function at(pa = 0) {
    const cf = thrustCoefficient(g, peOverPc, pa / e.pc, e.eps);
    const thrust = e.pc * At * cf * eta;
    const mdot = e.pc * At / cs;
    return {
      cf, cStar: cs, thrust, mdot,
      isp: thrust / (mdot * G0),
      pe: peOverPc * e.pc, Me, Te: Tc * temperatureRatio(Me, g),
      ve: exitVelocity(Tc, mw, g, peOverPc),
      throatArea: At, exitArea: At * e.eps,
      // Summerfield criterion: flow separates in the nozzle when pe < ~0.4 pa
      separated: peOverPc * e.pc < 0.4 * pa,
    };
  };
}

/** Optimum area ratio (pe = pa) for a chamber pressure and ambient pressure. */
export function optimalAreaRatio(pc, pa, g) {
  if (pa <= 0) return Infinity;
  const M = Math.sqrt(2 / (g - 1) * ((pc / pa) ** ((g - 1) / g) - 1));
  return areaRatioFromMach(M, g);
}

/** Tank volume for a propellant load (m³) split by mixture ratio. */
export function tankVolumes(propMass, p, of = p.of) {
  const ox = propMass * of / (1 + of), fuel = propMass / (1 + of);
  return { ox: ox / p.densityOx, fuel: fuel / p.densityFuel, oxMass: ox, fuelMass: fuel };
}
