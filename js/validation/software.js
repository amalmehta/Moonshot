// Validation checks for the software section: model output vs a published figure. Maths self-checks
// (Kalman, TMR, ZEM/ZEV) live in tests/software.test.mjs. Pure (no DOM). Shape documented in js/validation/index.js.
import { simulateLanding } from '../physics/gnc.js';

export default function checks() {
  const nominal = simulateLanding({ seed: 1, wind: 0, gust: 0, noise: 0, x0: 0, vx0: 0 });
  return [
    {
      id: 'software-landing-burn-duration',
      quantity: 'Falcon 9 single-engine landing-burn duration (calm, nominal)',
      computed: nominal.burnTime, reported: 32.5, unit: 's', tolerance: 0.25,
      source: 'https://spaceflight101.com/?p=8846',
      note: 'Reported: 30–35 s (Spaceflight101 flight-data reconstructions of 2016 single-engine landings, e.g. Jason-3; 33 s for ORBCOMM-2), midpoint used. Model: 2-D point mass from 6 km at terminal velocity, ~35 t at the start (Blackmore 2016), Cd = 1 (est.), ignition scheduled for ~62% of full thrust. Start altitude/speed and the real throttle plan are not public, so ±25%.',
    },
  ];
}
