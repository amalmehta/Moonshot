// Validation checks for flight physics: atmosphere tables, orbital speed, and the ascent simulator's
// payload-to-orbit against SpaceX's published capability.
import { atmosphere } from '../physics/atmosphere.js';
import { circularVelocity, period } from '../physics/orbit.js';
import { R_EARTH } from '../physics/constants.js';
import { presetFromVehicle, simulatedMaxPayload, simulateAscent } from '../physics/ascent.js';
import { VEHICLES, ENGINES, DV_TO_LEO } from '../data/vehicles.js';

// Tuned once by sweeping the pitch-kick angle for maximum payload (see docs/SYSTEM-DESIGN.md).
export const F9_ASCENT = { pitchKickAngle: 4, qLimit: 35000, targetAlt: 200e3, latitude: 28.5 };

let cache;
function f9Payloads() {
  if (cache) return cache;
  const expendable = simulatedMaxPayload({ ...presetFromVehicle(VEHICLES.falcon9, { ENGINES }), ...F9_ASCENT }, 50000);
  const reusable = simulatedMaxPayload({ ...presetFromVehicle(VEHICLES.falcon9, { ENGINES, boosterReserve: 0.12 }), ...F9_ASCENT }, 50000);
  const nominal = simulateAscent({ ...presetFromVehicle(VEHICLES.falcon9, { ENGINES }), ...F9_ASCENT, payload: 15000 });
  cache = { expendable, reusable, nominal };
  return cache;
}

export default function checks() {
  const { expendable, reusable, nominal } = f9Payloads();
  return [
    { id: 'atm-11km', quantity: 'Pressure at 11 km (US Standard Atmosphere 1976 table)', computed: atmosphere(11019.1).p, reported: 22632.1, unit: 'Pa', tolerance: 0.002, source: 'ussa', note: 'Geometric 11,019 m = geopotential 11,000 m, the tropopause.' },
    { id: 'atm-20km', quantity: 'Density at 20 km (USSA 1976 table)', computed: atmosphere(20000).rho, reported: 0.08891, unit: 'kg/m³', tolerance: 0.005, source: 'ussa', note: 'Isothermal stratosphere layer.' },
    { id: 'atm-50km', quantity: 'Temperature at 50 km (USSA 1976 table)', computed: atmosphere(50000).T, reported: 270.65, unit: 'K', tolerance: 0.005, source: 'ussa', note: 'Stratopause plateau.' },
    { id: 'orbit-iss', quantity: 'Orbital period at 420 km (ISS altitude)', computed: period(R_EARTH + 420e3) / 60, reported: 92.9, unit: 'min', tolerance: 0.01, source: 'https://www.nasa.gov/international-space-station/space-station-facts-and-figures/', note: 'Kepler’s third law, spherical Earth, circular orbit.' },
    { id: 'orbit-v200', quantity: 'Circular speed at 200 km', computed: circularVelocity(R_EARTH + 200e3), reported: 7784, unit: 'm/s', tolerance: 0.002, source: 'sutton', note: 'v = √(μ/r).' },
    { id: 'ascent-dv', quantity: 'Total Δv spent reaching LEO (Falcon 9 sim, 15 t payload)', computed: nominal.losses.idealDv + nominal.surfaceSpeed, reported: DV_TO_LEO.typical, unit: 'm/s', tolerance: 0.06, source: 'sutton', note: 'Sim Δv = ∫F/m dt, plus the eastward speed Earth gives for free so it compares like-for-like with the textbook ~9.3–9.5 km/s budget.' },
    { id: 'f9-exp', quantity: 'Falcon 9 payload to LEO, expendable (ascent sim)', computed: expendable, reported: VEHICLES.falcon9.payloadLEO, unit: 'kg', tolerance: 0.12, source: 'f9', note: 'Stage masses are public estimates; the sim is 2-D, uses a simple gravity turn and ignores the 28.5° plane geometry and engine-out margins, so it runs optimistic.' },
    { id: 'f9-reuse', quantity: 'Falcon 9 payload to LEO, booster recovered at sea (12 % propellant reserve)', computed: reusable, reported: VEHICLES.falcon9.payloadLEOReusable, unit: 'kg', tolerance: 0.10, source: 'wikiF9', note: 'Reported figure is the est. Starlink-batch mass. Landing reserve fraction is itself an estimate (boostback-free drone-ship landing).' },
  ];
}
