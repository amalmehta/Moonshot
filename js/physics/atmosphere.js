// U.S. Standard Atmosphere 1976 (0–86 km, 7 layers), with an exponential tail above.
import { G0, R_EARTH } from './constants.js';

const R_AIR = 287.053;      // J/(kg·K)
const GAMMA_AIR = 1.4;
// base geopotential altitude (m), base temperature (K), lapse rate (K/m)
const LAYERS = [
  [0, 288.15, -0.0065],
  [11000, 216.65, 0],
  [20000, 216.65, 0.001],
  [32000, 228.65, 0.0028],
  [47000, 270.65, 0],
  [51000, 270.65, -0.0028],
  [71000, 214.65, -0.002],
  [84852, 186.946, 0],
];
// base pressures computed once from the hydrostatic equation
const P_BASE = [101325];
for (let i = 1; i < LAYERS.length; i++) {
  const [h0, T0, L] = LAYERS[i - 1];
  const h1 = LAYERS[i][0];
  const p0 = P_BASE[i - 1];
  P_BASE.push(L === 0 ? p0 * Math.exp(-G0 * (h1 - h0) / (R_AIR * T0)) : p0 * (T0 / (T0 + L * (h1 - h0))) ** (G0 / (R_AIR * L)));
}

/** Atmosphere at geometric altitude z (m): { T (K), p (Pa), rho (kg/m³), a (m/s) }. */
export function atmosphere(z) {
  if (z < 0) z = 0;
  const h = R_EARTH * z / (R_EARTH + z); // geopotential altitude
  if (h > 84852) {
    // beyond the 1976 tables' lower block: an exponential fit (scale height ~5.9 km) good enough for drag
    const T = 186.946;
    const p = P_BASE[7] * Math.exp(-(h - 84852) / 5900);
    return { T, p, rho: p / (R_AIR * T), a: Math.sqrt(GAMMA_AIR * R_AIR * T) };
  }
  let i = LAYERS.length - 1;
  while (h < LAYERS[i][0]) i--;
  const [h0, T0, L] = LAYERS[i];
  const T = T0 + L * (h - h0);
  const p = L === 0 ? P_BASE[i] * Math.exp(-G0 * (h - h0) / (R_AIR * T0)) : P_BASE[i] * (T0 / T) ** (G0 / (R_AIR * L));
  return { T, p, rho: p / (R_AIR * T), a: Math.sqrt(GAMMA_AIR * R_AIR * T) };
}

/** Dynamic pressure q = ½ρv². */
export const dynamicPressure = (z, v) => 0.5 * atmosphere(z).rho * v * v;
