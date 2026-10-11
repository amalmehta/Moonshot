// Propellant-tank geometry: how much volume a stage's propellant needs, and how long a
// cylinder-plus-domes tank of the stage's diameter must be to hold it. Pure (no DOM), so
// Node tests and the Validation page can use it. Used by the 3D cutaway on vehicles.html.
//
// Model: one tank stack per stage = bottom dome + fuel/oxidiser barrels + top dome, with the
// two tanks separated by a common bulkhead (a dome that bulges into the lower tank, so it moves
// volume from one tank to the other but adds no length). Domes are half-ellipsoids of height
// k·R. Liquids fill to (1 − ullage) of each tank. Propellant split by mixture ratio from
// PROPELLANTS (engine.js), densities optionally "densified" (sub-cooled), as both vehicles fly.
import { PROPELLANTS, tankVolumes, bulkDensity } from './engine.js';

/** Densified (sub-cooled) propellant densities, kg/m³. Estimates, not SpaceX figures. */
export const DENSIFIED = {
  // Falcon 9 FT: LOX at about −207 °C (~66 K), RP-1 chilled to about −7 °C
  kerolox: { densityOx: 1230, densityFuel: 825 },
  // Starship: LOX and CH₄ sub-cooled roughly 10–20 K below their boiling points
  methalox: { densityOx: 1200, densityFuel: 440 },
};

/** √2 : 1 ellipsoidal dome (h = R/√2): the shallowest dome with no compressive hoop stress under internal pressure. */
export const DOME_K = Math.SQRT1_2;
export const ULLAGE = 0.03;

/** Volume of a half-ellipsoid dome of radius R and height kR. */
export const domeVolume = (R, k = DOME_K) => (2 / 3) * Math.PI * R ** 3 * k;
export const cylinderVolume = (R, L) => Math.PI * R * R * L;

/** Propellant object (from PROPELLANTS), optionally densified. */
export function propellant(key, densified = true) {
  const p = PROPELLANTS[key];
  return densified ? { ...p, ...DENSIFIED[key] } : p;
}

/**
 * Length of a closed tank stack (two domes + barrel) that holds volume V at radius R.
 * Returns { length, barrel, domeHeight, domesOnly } — domesOnly means V fits inside the
 * two domes alone (barrel clamped at 0; length then overstates what's needed).
 */
export function tankStackLength(V, R, k = DOME_K) {
  const h = k * R;
  const barrel = (V - 2 * domeVolume(R, k)) / (Math.PI * R * R);
  return { length: Math.max(0, barrel) + 2 * h, barrel: Math.max(0, barrel), domeHeight: h, domesOnly: barrel < 0 };
}

/**
 * Size a stage's tanks.
 * stage: { prop (kg), diameter (m) }, propKey: 'kerolox' | 'methalox'.
 * opts: { densified=true, ullage=0.03, k=DOME_K, wall=0.006 (m, shell thickness), loxOnTop=true }
 * Returns tank masses, volumes and a bottom-up layout of the stack, z measured from the bottom dome apex:
 *   { ox:{mass, volume, tankVolume}, fuel:{…}, R, h, length, barrel,
 *     lower:'fuel'|'ox', split (z of the common-bulkhead rim), segments:[{kind, z0, z1}] }
 */
export function stageTanks(stage, propKey, opts = {}) {
  const { densified = true, ullage = ULLAGE, k = DOME_K, wall = 0.006, loxOnTop = true } = opts;
  const p = propellant(propKey, densified);
  const v = tankVolumes(stage.prop, p);
  const R = stage.diameter / 2 - wall;
  const oxTank = v.ox / (1 - ullage), fuelTank = v.fuel / (1 - ullage);
  const total = oxTank + fuelTank;
  const s = tankStackLength(total, R, k);
  const lowerKind = loxOnTop ? 'fuel' : 'ox';
  const lowerV = loxOnTop ? fuelTank : oxTank;
  // Lower tank = bottom dome + barrel up to the bulkhead rim − common dome bulging down into it.
  // So lowerV = domeV + πR²·zRim' − domeV  ⇒  rim height above the barrel start = lowerV / πR².
  const A = Math.PI * R * R;
  const split = s.domeHeight + lowerV / A;
  return {
    ox: { mass: v.oxMass, volume: v.ox, tankVolume: oxTank },
    fuel: { mass: v.fuelMass, volume: v.fuel, tankVolume: fuelTank },
    R, h: s.domeHeight, k, length: s.length, barrel: s.barrel, totalVolume: total, ullage,
    lower: lowerKind, upper: loxOnTop ? 'ox' : 'fuel', split,
    bulkDensity: bulkDensity(p), densities: { ox: p.densityOx, fuel: p.densityFuel },
    segments: [
      { kind: lowerKind, z0: 0, z1: split },
      { kind: loxOnTop ? 'ox' : 'fuel', z0: split, z1: s.length },
    ],
  };
}

/**
 * Centre of mass (height above the stage bottom) with propellant fraction f remaining.
 * Each tank is treated as an equivalent cylinder of its volume; liquid settles at the bottom
 * of each tank under thrust and drains from the top of the liquid column.
 * tanks: [{ z0 (bottom of the equivalent cylinder), length, mass (full) }], dry: { mass, z }.
 */
export function centreOfMass(tanks, dry, f) {
  let m = dry.mass, mz = dry.mass * dry.z;
  for (const t of tanks) {
    const mt = t.mass * f;
    m += mt; mz += mt * (t.z0 + f * t.length / 2);
  }
  return mz / m;
}

/** Equivalent-cylinder tanks for centreOfMass from a stageTanks() result, offset by zBase. */
export function equivalentTanks(t, zBase = 0) {
  const A = Math.PI * t.R * t.R;
  const lowerLen = (t.lower === 'fuel' ? t.fuel.tankVolume : t.ox.tankVolume) / A;
  const upperLen = (t.upper === 'fuel' ? t.fuel.tankVolume : t.ox.tankVolume) / A;
  const lowerMass = t.lower === 'fuel' ? t.fuel.mass : t.ox.mass;
  const upperMass = t.upper === 'fuel' ? t.fuel.mass : t.ox.mass;
  return [
    { kind: t.lower, z0: zBase, length: lowerLen, mass: lowerMass },
    { kind: t.upper, z0: zBase + lowerLen, length: upperLen, mass: upperMass },
  ];
}

export const finenessRatio = (length, diameter) => length / diameter;
/** Propellant mass fraction of a stage. */
export const propellantFraction = s => s.prop / (s.prop + s.dry);
/** Liftoff mass from stage sums (+ fairing and payload if given). */
export const stackMass = (v, payload = 0) =>
  v.stages.reduce((a, s) => a + s.dry + s.prop, 0) + (v.fairing?.mass ?? 0) + payload;

/**
 * Non-tank lengths used to lay the stages out (m). All estimates: SpaceX doesn't publish them.
 * engineBay: thrust structure above the engines' gimbal plane (engine length is computed from
 * the nozzle model and added separately); interstage / hotStage: length of the ring between stages.
 */
export const LAYOUT = {
  falcon9: { engineBay: 1.0, interstage: 6.5 },
  starship: { engineBay: 1.2, hotStage: 1.8, shipAft: 1.0 },
};
