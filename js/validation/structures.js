// Validation checks for hardware & materials.
import { wallThickness, yieldAt, MATERIALS } from '../physics/structures.js';

export const STARSHIP_TANK = { pressure: 6e5, radius: 4.5, temperature: 90, safetyFactor: 1.4, weldEfficiency: 0.75 };

export default function checks() {
  const s = STARSHIP_TANK;
  const t = wallThickness(s.pressure, s.radius, yieldAt(MATERIALS.steel, s.temperature) * 1e6, s.safetyFactor, s.weldEfficiency);
  return [
    {
      id: 'struct-starship-wall', quantity: 'Starship stainless tank wall thickness (hoop stress, 6 bar, 9 m diameter)',
      computed: t * 1000, reported: 4.0, unit: 'mm', tolerance: 0.2, source: 'wikiStarship',
      note: 'Inputs are estimates: ~6 bar ullage pressure, cold-worked steel yield at LOX temperature, factor of safety 1.4, weld efficiency 0.75. The reported ~4 mm (3.6–4 mm) wall is itself a public estimate. Axial and bending loads, which the hoop-only model ignores, also push real walls thicker.',
    },
    {
      id: 'struct-steel-density', quantity: 'Austenitic stainless steel density',
      computed: MATERIALS.steel.density, reported: 7930, unit: 'kg/m³', tolerance: 0.01, source: 'https://www.nickelinstitute.org/',
      note: 'Handbook value for 304-type steel (≈ 7.9–8.0 g/cm³). Included as a sanity check on the material table.',
    },
  ];
}
