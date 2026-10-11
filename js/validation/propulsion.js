// Validation checks for the propulsion section: nozzle theory vs published engine figures.
// The kerolox/methalox gas properties were fitted to Merlin 1D and Raptor 2 ONLY (see engine.js),
// so those two engines are calibration, not evidence. Every row below is a prediction for an engine
// the fit never saw.
import { enginePerformance, bulkDensity, PROPELLANTS } from '../physics/engine.js';
import { ENGINES } from '../data/vehicles.js';

const perf = key => {
  const e = ENGINES[key];
  return enginePerformance({ ...e, thrustVac: e.thrustVac ?? e.thrustSL * 1.07 });
};

export default function checks() {
  return [
    {
      id: 'prop-mvac-isp', quantity: 'Merlin Vacuum vacuum Isp (predicted from Merlin 1D fit, ε = 165)',
      computed: perf('mvac')(0).isp, reported: ENGINES.mvac.ispVac, unit: 's', tolerance: 0.03, source: 'f9',
      note: 'Same gas model, bigger nozzle. Ideal theory with frozen γ under-predicts very high area ratios slightly (real flow keeps recombining).',
    },
    {
      id: 'prop-rvac-isp', quantity: 'Raptor Vacuum vacuum Isp (predicted from Raptor 2 fit, ε ≈ 90 est.)',
      computed: perf('raptorVac')(0).isp, reported: ENGINES.raptorVac.ispVac, unit: 's', tolerance: 0.05, source: 'wikiRaptor',
      note: 'Both the area ratio and the 380 s figure are public estimates; one-γ theory misses shifting-equilibrium gains at large ε.',
    },
    {
      id: 'prop-r3-sl', quantity: 'Raptor 3 sea-level Isp (predicted, pc = 350 bar)',
      computed: perf('raptor3')(101325).isp, reported: ENGINES.raptor3.ispSL, unit: 's', tolerance: 0.02, source: 'wikiRaptor',
      note: 'Higher chamber pressure → larger pressure ratio at the same ε → more Isp at sea level.',
    },
    {
      id: 'prop-r3-vac', quantity: 'Raptor 3 vacuum Isp (predicted)',
      computed: perf('raptor3')(0).isp, reported: ENGINES.raptor3.ispVac, unit: 's', tolerance: 0.02, source: 'wikiRaptor',
      note: 'Sea-level nozzle in vacuum: Isp rises only by the pressure-thrust term.',
    },
    {
      id: 'prop-kerolox-density', quantity: 'RP-1/LOX bulk density at O/F 2.36',
      computed: bulkDensity(PROPELLANTS.kerolox), reported: 1030, unit: 'kg/m³', tolerance: 0.03, source: 'sutton',
      note: 'Common textbook bulk density for RP-1/LOX ≈ 1.03 g/cm³ at normal boiling-point LOX. Falcon 9 subcools (densifies) its propellants, so the real figure is higher.',
    },
  ];
}
