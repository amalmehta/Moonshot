// Validation checks for the cost model. SpaceX publishes prices, not costs, so these are
// consistency checks against the few cost statements company figures have made in public.
import { falcon9Cost, F9_COST, propellantCost } from '../physics/cost.js';
import { VEHICLES } from '../data/vehicles.js';

export default function checks() {
  const f9 = VEHICLES.falcon9;
  return [
    {
      id: 'cost-f9-reused', quantity: 'Marginal cost of a reused Falcon 9 launch (booster on its ~5th flight)',
      computed: falcon9Cost({ ...F9_COST, reuses: 5 }).total, reported: 28e6, unit: 'USD', tolerance: 0.25,
      source: 'https://inverse.com/innovation/spacex-elon-musk-falcon-9-economics',
      note: 'SpaceX director Christopher Couluris: a reused launch “costs $28 million … with everything” (as reported by Inverse). Every model input is an estimate, so this checks consistency, not truth.',
    },
    {
      id: 'cost-f9-prop', quantity: 'Falcon 9 propellant cost per launch',
      computed: propellantCost(f9.stages[0].prop + f9.stages[1].prop, 'kerolox').total, reported: 200e3, unit: 'USD', tolerance: 0.3,
      source: 'https://www.designworldonline.com/elon-musk-says-falcon-9-rocket-ready-to-relaunch/',
      note: 'Musk’s ~$200k figure (circa 2011, Falcon 9 v1.0). Model: today’s Block 5 propellant load × est. bulk prices (LOX $0.15/kg, RP-1 $1/kg). Commodity prices move ±50 %.',
    },
  ];
}
