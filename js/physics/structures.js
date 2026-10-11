// Structures, materials and thermal protection: thin-wall pressure vessels, shell buckling,
// material properties vs temperature, and re-entry heating.
import { SIGMA_SB } from './constants.js';

/**
 * Representative material properties (typical handbook values; SpaceX's alloys are proprietary).
 * yield: [[T (K), yield strength (MPa)], …], interpolated linearly. maxService: rough max use temperature (K).
 * hue is the TAGS-family hue used to colour-code the material in charts.
 */
export const MATERIALS = {
  steel: {
    name: 'Cold-worked austenitic stainless (301/304L-class)', short: 'Stainless steel', density: 7900, E: 193e3, maxService: 1100, hue: 72,
    yield: [[20, 1500], [77, 1350], [293, 950], [600, 780], [900, 550], [1100, 300], [1300, 120]],
    note: 'Gets stronger and tougher when cryogenically cold; keeps useful strength to ~800 °C. Cheap (~$3–4/kg), weldable in a tent.',
  },
  alli: {
    name: 'Aluminium–lithium 2195', short: 'Al-Li 2195', density: 2710, E: 76e3, maxService: 450, hue: 86,
    yield: [[20, 680], [77, 620], [293, 530], [400, 400], [450, 300], [520, 130], [600, 40]],
    note: 'Falcon 9 tanks. Light and strong at cryo, but loses strength fast above ~150 °C, so it needs a heat shield or a short hot phase.',
  },
  ti: {
    name: 'Titanium Ti-6Al-4V', short: 'Titanium', density: 4430, E: 114e3, maxService: 700, hue: 100,
    yield: [[20, 1600], [77, 1450], [293, 880], [500, 650], [700, 450], [900, 150]],
    note: 'Falcon 9 grid fins (cast and machined titanium replaced aluminium, which ablated). Expensive.',
  },
  cfrp: {
    name: 'Carbon-fibre composite (quasi-isotropic)', short: 'Carbon fibre', density: 1600, E: 70e3, maxService: 420, hue: 60,
    yield: [[20, 600], [293, 600], [400, 450], [450, 150], [500, 20]],
    note: 'Lightest at room temperature; resin softens ~150–200 °C; microcracking/leaks at cryo. SpaceX abandoned it for Starship in 2019.',
  },
};

/** Linear interpolation of a material's yield strength (MPa) at temperature T (K). */
export function yieldAt(mat, T) {
  const ys = mat.yield;
  if (T <= ys[0][0]) return ys[0][1];
  for (let i = 1; i < ys.length; i++) if (T <= ys[i][0]) {
    const [t0, y0] = ys[i - 1], [t1, y1] = ys[i];
    return y0 + (y1 - y0) * (T - t0) / (t1 - t0);
  }
  return Math.max(0, ys.at(-1)[1]);
}

/** Specific strength (yield/density) in kN·m/kg at temperature T. */
export const specificStrength = (mat, T) => yieldAt(mat, T) * 1e6 / mat.density / 1e3;

/** Hoop stress in a thin cylinder: σ = p r / t. */
export const hoopStress = (p, r, t) => p * r / t;
/**
 * Wall thickness so hoop stress stays below allowable / safety factor, with the allowable derated by
 * the weld joint efficiency (welds are weaker than parent metal; pressure-vessel codes use ~0.7–1.0).
 */
export const wallThickness = (p, r, allowable, safetyFactor = 1.25, weldEfficiency = 1) => p * r * safetyFactor / (allowable * weldEfficiency);

/**
 * Classical axial buckling stress of a thin cylinder (Lorenz–Timoshenko), with an empirical
 * knock-down factor for imperfections (NASA SP-8007 style). σ_cr = γ · E t / (R √(3(1−ν²)))
 */
export function bucklingStress(E, t, R, nu = 0.3, knockdown = 0.3) {
  return knockdown * E * t / (R * Math.sqrt(3 * (1 - nu * nu)));
}

/**
 * Mass of a cylindrical tank wall (barrel only) plus two hemispherical domes.
 */
export function tankShellMass(r, length, t, density) {
  const barrel = 2 * Math.PI * r * length * t;
  const domes = 4 * Math.PI * r * r * t;
  return (barrel + domes) * density;
}

/**
 * Sutton–Graves stagnation-point convective heat flux (W/m²): q = k √(ρ/R_n) v³, k = 1.7415e-4 (Earth air, SI).
 */
export const suttonGraves = (rho, v, noseRadius, k = 1.7415e-4) => k * Math.sqrt(rho / noseRadius) * v ** 3;

/** Radiative-equilibrium wall temperature (K): εσT⁴ = q. */
export const radiativeEquilibriumT = (q, emissivity = 0.85) => (q / (emissivity * SIGMA_SB)) ** 0.25;

/**
 * Ballistic-entry estimate (Allen–Eggers): peak deceleration for entry speed v_e and flight-path angle γ
 * in an exponential atmosphere with scale height H: a_max = v_e² sin γ / (2 e H).
 */
export const allenEggersPeakDecel = (vEntry, gammaRad, H = 7200) => vEntry ** 2 * Math.sin(gammaRad) / (2 * Math.E * H);

/** Ballistic coefficient β = m / (C_D A). */
export const ballisticCoefficient = (m, cd, area) => m / (cd * area);
