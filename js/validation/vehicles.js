// Validation checks for the vehicles section: model output vs a published figure.
// Must be pure (no DOM) so Node tests can run it. Shape documented in js/validation/index.js.
import { VEHICLES } from '../data/vehicles.js';
import { stageTanks, stackMass, LAYOUT } from '../physics/tanks.js';
import { lengthBudget } from '../three/geometry-math.js';

export default function checks() {
  const f9 = VEHICLES.falcon9, ss = VEHICLES.starship;
  const tanks = {
    f9s1: stageTanks(f9.stages[0], 'kerolox'),
    f9s2: stageTanks(f9.stages[1], 'kerolox'),
    sh: stageTanks(ss.stages[0], 'methalox'),
    ss: stageTanks(ss.stages[1], 'methalox', { loxOnTop: false }),
  };
  const b = Object.fromEntries(lengthBudget(tanks, LAYOUT, VEHICLES).map(r => [r.id, r]));
  const lenNote = (r, extra) => `Tank stack ${r.parts.tanks.toFixed(1)} m (densified propellant, 3 % ullage, √2 domes, common bulkhead) + engine ${r.parts.engine.toFixed(1)} m (nozzle model) + ${r.parts.structure.toFixed(1)} m engine bay/ring (est.). ${extra}`;
  return [
    {
      id: 'veh-f9s1-length', quantity: 'Falcon 9 first-stage length from tank sizing', computed: b.f9s1.total, reported: f9.stages[0].length, unit: 'm', tolerance: 0.08, source: 'wikiF9',
      note: lenNote(b.f9s1, 'Propellant mass is itself an estimate; COPVs, the LOX transfer tube and the leg/fin attach structure are ignored, and the engine-bay allowance is a guess (±1 m).'),
    },
    {
      id: 'veh-f9s2-length', quantity: 'Falcon 9 second-stage length from tank sizing', computed: b.f9s2.total, reported: f9.stages[1].length, unit: 'm', tolerance: 0.08, source: 'wikiF9',
      note: lenNote(b.f9s2, 'MVac is modelled as fully below the tank; in reality its powerhead nests under the aft dome, so the model runs long.'),
    },
    {
      id: 'veh-sh-length', quantity: 'Super Heavy length from tank sizing', computed: b.sh.total, reported: ss.stages[0].length, unit: 'm', tolerance: 0.06, source: 'wikiStarship',
      note: lenNote(b.sh, 'V2 propellant load (3 400 t) is an estimate; the methane downcomer and engine-bay height are not modelled.'),
    },
    {
      id: 'veh-f9-liftoff', quantity: 'Falcon 9 liftoff mass from stage sums (no payload)', computed: stackMass(f9), reported: f9.liftoffMass, unit: 'kg', tolerance: 0.07, source: 'f9',
      note: 'Sum of estimated stage dry + propellant masses and the fairing. The published 549 t presumably includes a payload/adapter allowance and propellant margins; the sum runs ~5 % low.',
    },
    {
      id: 'veh-ss-liftoff', quantity: 'Starship + Super Heavy liftoff mass from stage sums', computed: stackMass(ss), reported: ss.liftoffMass, unit: 'kg', tolerance: 0.08, source: 'wikiStarship',
      note: 'Sum of estimated stage dry + propellant masses (no payload). The ~5 000 t liftoff figure is itself a rounded public estimate, and V2 loads vary by flight.',
    },
  ];
}
