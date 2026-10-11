// Validation checks for the software section: model output vs a published figure or a closed-form
// identity. Pure (no DOM). Shape documented in js/validation/index.js.
import { simulateLanding, scalarIterate, scalarSteadyState, flyZemZev, zemZevOptimalEffort } from '../physics/gnc.js';
import { kOfN, tmr } from '../physics/reliability.js';

export default function checks() {
  const nominal = simulateLanding({ seed: 1, wind: 0, gust: 0, noise: 0, x0: 0, vx0: 0 });
  const R = 0.95;
  const it = scalarIterate(0.01, 4, 100, 400);
  const ss = scalarSteadyState(0.01, 4);
  const zz = { r0: [300, 2000], v0: [10, -150], rf: [0, 0], vf: [0, 0], T: 25 };
  return [
    {
      id: 'software-landing-burn-duration',
      quantity: 'Falcon 9 single-engine landing-burn duration (calm, nominal)',
      computed: nominal.burnTime, reported: 32.5, unit: 's', tolerance: 0.25,
      source: 'https://spaceflight101.com/?p=8846',
      note: 'Reported: 30–35 s (Spaceflight101 flight-data reconstructions of 2016 single-engine landings, e.g. Jason-3; 33 s for ORBCOMM-2), midpoint used. Model: 2-D point mass from 6 km at terminal velocity, ~35 t at the start (Blackmore 2016), Cd = 1 (est.), ignition scheduled for ~62% of full thrust. Start altitude/speed and the real throttle plan are not public, so ±25%.',
    },
    {
      id: 'software-tmr-identity',
      quantity: 'TMR reliability: binomial 2-of-3 sum vs closed form 3R² − 2R³ (R = 0.95)',
      computed: kOfN(2, 3, R), reported: tmr(R), unit: '', tolerance: 1e-12,
      source: 'https://en.wikipedia.org/wiki/Triple_modular_redundancy',
      note: 'Analytic identity (independent failures, perfect voter): checks the k-of-n code. Both give 0.99275.',
    },
    {
      id: 'software-kalman-steady-state',
      quantity: 'Scalar Kalman gain after 400 steps vs closed-form Riccati steady state (Q = 0.01, R = 4)',
      computed: it.K.at(-1), reported: ss.K, unit: '', tolerance: 1e-9,
      source: 'https://doi.org/10.1115/1.3662552',
      note: 'Kalman (1960). The iterated predict/update recursion must converge to the root of P² − QP − QR = 0 regardless of the starting variance (here P₀ = 100).',
    },
    {
      id: 'software-zemzev-optimal',
      quantity: 'ZEM/ZEV feedback: simulated control effort ∫|u|²dt vs the analytic minimum',
      computed: flyZemZev(zz).effort, reported: zemZevOptimalEffort(zz), unit: 'm²/s³', tolerance: 1e-4,
      source: 'https://scholar.hit.edu.cn/en/publications/applications-of-generalized-zero-effort-miss-zero-effort-velocity/',
      note: 'Vacuum point mass, no thrust limits (Guo, Hawkins & Wie 2013). Recomputing the law every 1 ms reproduces the open-loop optimal effort, confirming it is the energy-optimal feedback.',
    },
  ];
}
