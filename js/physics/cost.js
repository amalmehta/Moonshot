// Launch cost models: reuse amortization, propellant cost, learning curves.
// Every dollar input is an ESTIMATE (SpaceX doesn't publish costs); defaults are documented public
// statements or press estimates, cited on the Cost page. The point is the structure, not the cents.
import { tankVolumes, PROPELLANTS } from './engine.js';

/** Default Falcon 9 cost inputs (USD, est.). */
export const F9_COST = {
  boosterBuild: 30e6,     // new first stage (~60 % of a ~$50 M vehicle build, est.)
  upperStage: 10e6,       // expendable second stage (est.)
  fairing: 6e6,           // Musk: fairing ≈ $6 M
  fairingUses: 5,         // recovered fairing halves reflown (est.)
  fairingRefurb: 0.5e6,
  boosterRefurb: 1e6,     // per reflight (est.)
  recovery: 1e6,          // drone ship + tug ops (est.)
  propellant: 0.3e6,      // see propellantCost()
  launchOps: 8e6,         // pad, range, integration, mission ops, insurance, overhead (est.)
  reuses: 20,             // flights per booster
};

/** Starship cost inputs (USD, highly uncertain; aspirational targets in brackets on the page). */
export const STARSHIP_COST = {
  boosterBuild: 90e6, shipBuild: 60e6,
  boosterReuses: 20, shipReuses: 10,
  boosterRefurb: 1e6, shipRefurb: 3e6,   // ship: tile replacement etc.
  propellant: 1.0e6, launchOps: 10e6,
};

/** Per-flight marginal cost of Falcon 9 and its breakdown. */
export function falcon9Cost(c = F9_COST) {
  const reused = c.reuses > 1;
  const parts = {
    'Booster (amortized)': c.boosterBuild / c.reuses,
    'Booster refurbishment': reused ? c.boosterRefurb * (c.reuses - 1) / c.reuses : 0,
    'Recovery operations': reused ? c.recovery : 0,
    'Second stage': c.upperStage,
    'Fairing (amortized + refurb)': c.fairing / c.fairingUses + (c.fairingUses > 1 ? c.fairingRefurb : 0),
    'Propellant': c.propellant,
    'Launch operations & overhead': c.launchOps,
  };
  return { parts, total: Object.values(parts).reduce((a, b) => a + b, 0) };
}

/** Per-flight marginal cost of a fully reusable Starship. */
export function starshipCost(c = STARSHIP_COST) {
  const parts = {
    'Booster (amortized)': c.boosterBuild / c.boosterReuses,
    'Booster refurbishment': c.boosterReuses > 1 ? c.boosterRefurb : 0,
    'Ship (amortized)': c.shipBuild / c.shipReuses,
    'Ship refurbishment (tiles etc.)': c.shipReuses > 1 ? c.shipRefurb : 0,
    'Propellant': c.propellant,
    'Launch operations & overhead': c.launchOps,
  };
  return { parts, total: Object.values(parts).reduce((a, b) => a + b, 0) };
}

/** Default commodity prices (USD/kg, est.): bulk LOX, RP-1, LNG-grade methane. */
export const COMMODITY = { lox: 0.15, rp1: 1.0, methane: 0.3 };

/** Cost of a propellant load given total mass and propellant type. */
export function propellantCost(propMass, propKey, prices = COMMODITY) {
  const p = PROPELLANTS[propKey];
  const v = tankVolumes(propMass, p);
  const fuelPrice = propKey === 'kerolox' ? prices.rp1 : propKey === 'methalox' ? prices.methane : 4.0;
  return { ox: v.oxMass * prices.lox, fuel: v.fuelMass * fuelPrice, total: v.oxMass * prices.lox + v.fuelMass * fuelPrice, oxMass: v.oxMass, fuelMass: v.fuelMass };
}

/** Wright learning curve: cost of the n-th unit with learning rate b (e.g. 0.85 → each doubling costs 85 %). */
export const learningCurveUnit = (firstUnit, n, b) => firstUnit * n ** Math.log2(b);
/** Average cost of the first n units. */
export function learningCurveAverage(firstUnit, n, b) {
  let s = 0; for (let k = 1; k <= n; k++) s += learningCurveUnit(firstUnit, k, b);
  return s / n;
}

/** Historical $/kg to LEO (FY2018 USD) from Jones (2018), NASA NTRS 20200001093. */
export const HISTORICAL_PER_KG = [
  { name: 'Space Shuttle', year: 1981, perKg: 54500 },
  { name: 'Falcon 9', year: 2010, perKg: 2720 },
  { name: 'Falcon Heavy', year: 2018, perKg: 1400 },
];
