// Validation checks for the Starlink section: model output vs a published figure.
// Must be pure (no DOM) so Node tests can run it. Shape documented in js/validation/index.js.
import { R_EARTH, C_LIGHT, DEG } from '../physics/constants.js';
import {
  SHELLS_GEN1, totalSatellites, orbitalPeriod, nodalPrecession, radPerSecToDegPerDay,
  SUN_SYNC_RATE, sunSyncInclination, slantRange,
} from '../physics/starlink.js';

const FCC_GEN1 = 'https://docs.fcc.gov/public/attachments/FCC-21-48A1.pdf';
const LATENCY = 'https://www.starlink.com/public-files/StarlinkLatency.pdf';

export default function checks() {
  const a550 = R_EARTH + 550e3, a560 = R_EARTH + 560e3;
  return [
    {
      id: 'starlink-gen1-count',
      quantity: 'Gen1 constellation size (sum of the five Walker shells)',
      computed: totalSatellites(SHELLS_GEN1), reported: 4408, unit: 'satellites', tolerance: 0,
      source: FCC_GEN1,
      note: '72×22 + 72×22 + 36×20 + 6×58 + 4×43, the plane/slot counts in the FCC’s April 2021 modification order.',
    },
    {
      id: 'starlink-period-550',
      quantity: 'Orbital period of a 550 km Starlink satellite',
      computed: orbitalPeriod(a550) / 60, reported: 1440 / 15.06, unit: 'min', tolerance: 0.005,
      source: 'https://celestrak.org/NORAD/elements/table.php?GROUP=starlink&FORMAT=tle',
      note: 'Two-body circular orbit, spherical Earth. Reported: tracked 550 km satellites fly ≈15.06 revolutions/day (CelesTrak/N2YO TLE mean motion). TLE mean motion is a J2-averaged quantity, so a few-hundredths-of-a-minute difference is expected.',
    },
    {
      id: 'starlink-j2-polar',
      quantity: 'J2 nodal precession of the 560 km / 97.6° shell vs the sun-synchronous rate',
      computed: radPerSecToDegPerDay(nodalPrecession(a560, 97.6 * DEG)),
      reported: radPerSecToDegPerDay(SUN_SYNC_RATE), unit: '°/day', tolerance: 0.01,
      source: 'https://en.wikipedia.org/wiki/Sun-synchronous_orbit',
      note: `First-order secular J2 only. The exact sun-synchronous inclination at 560 km is ${(sunSyncInclination(a560) / DEG).toFixed(2)}°, so the FCC’s 97.6° shell is sun-synchronous to within a few hundredths of a degree.`,
    },
    {
      id: 'starlink-leg-zenith',
      quantity: 'Speed-of-light delay of one leg (ground ↔ satellite), satellite overhead at 550 km',
      computed: 550e3 / C_LIGHT * 1e3, reported: 1.8, unit: 'ms', tolerance: 0.03,
      source: LATENCY,
      note: 'Like-for-like: SpaceX quotes propagation as 1.8–3.6 ms per leg. The shortest leg is straight up. Measured round-trip latency (US median 25.7 ms at peak hours, 2025) is much larger because it adds scheduling, processing, gateway-to-internet backhaul and queueing; propagation is only the floor.',
    },
    {
      id: 'starlink-leg-low',
      quantity: 'Speed-of-light delay of one leg at the 25° minimum elevation (550 km)',
      computed: slantRange(550e3, 25 * DEG) / C_LIGHT * 1e3, reported: 3.6, unit: 'ms', tolerance: 0.06,
      source: LATENCY,
      note: 'Slant range 1,123 km at 25° elevation. SpaceX’s upper end (3.6 ms ≈ 1,080 km) corresponds to ≈27° elevation, or to a mix of shells; spherical Earth, straight-line propagation, no atmospheric delay.',
    },
  ];
}
