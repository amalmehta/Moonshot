// Exercises for hardware, materials and thermal protection.
import { hoopStress, wallThickness, bucklingStress, suttonGraves, radiativeEquilibriumT, allenEggersPeakDecel, tankShellMass, MATERIALS, yieldAt, specificStrength } from '../../physics/structures.js';
import { atmosphere } from '../../physics/atmosphere.js';

const r = (x, d = 3) => Number(x.toPrecision(d)).toLocaleString('en-US');

const s1 = hoopStress(6e5, 4.5, 0.004) / 1e6;
const t2 = wallThickness(3.5e5, 1.85, 530e6, 1.4) * 1000;
const steelHot = specificStrength(MATERIALS.steel, 700), alHot = specificStrength(MATERIALS.alli, 700);
const sc4 = bucklingStress(193e9, 0.004, 4.5) / 1e6;
const rho5 = atmosphere(70e3).rho;
const q5 = suttonGraves(rho5, 7000, 1) / 1e4;
const T6 = radiativeEquilibriumT(q5 * 1e4 / Math.sqrt(4.5), 0.85) - 273.15;
const a7 = allenEggersPeakDecel(11000, 6.5 * Math.PI / 180) / 9.80665;
const mSteel = tankShellMass(4.5, 30, 0.004, 7900) / 1000;
const tAl8 = 0.004 * yieldAt(MATERIALS.steel, 90) / yieldAt(MATERIALS.alli, 90);
const mAl8 = tankShellMass(4.5, 30, tAl8, 2710) / 1000;

export default [
  {
    id: 'structures-1', title: 'Hoop stress in Starship’s tank', tags: ['structures'], difficulty: 1,
    prompt: 'A 9 m-diameter tank with a 4 mm stainless wall is pressurized to 6 bar (gauge). What is the hoop stress in MPa?',
    answer: s1, unit: 'MPa', tolerance: 0.01,
    hints: ['Cut the cylinder lengthwise: pressure force \\(p\\cdot 2r L\\) is resisted by two walls \\(2\\sigma t L\\).'],
    solution: `\\(\\sigma = pr/t = 6\\times10^5 \\times 4.5 / 0.004 = ${r(s1)}\\) MPa, roughly half the yield strength of cold-worked stainless at cryogenic temperature. The rest is margin for safety factor, welds, and the axial and bending loads of flight.`,
  },
  {
    id: 'structures-2', title: 'Falcon 9 tank wall', tags: ['structures', 'materials'], difficulty: 1,
    prompt: 'Falcon 9’s 3.7 m tanks (radius 1.85 m) run at ~3.5 bar. With Al-Li 2195 (yield ≈ 530 MPa at room temperature) and a safety factor of 1.4, what minimum wall thickness does hoop stress require, in mm?',
    answer: t2, unit: 'mm', tolerance: 0.02,
    hints: ['\\(t = p r \\cdot SF / \\sigma_y\\).'],
    solution: `\\(t = 3.5\\times10^5 \\times 1.85 \\times 1.4 / 530\\times10^6 ≈ ${r(t2)}\\) mm. The real skins are thicker and machined with an isogrid/orthogrid pattern, because axial compression (buckling) rather than pressure sizes much of an aluminium stage.`,
  },
  {
    id: 'structures-3', title: 'Why steel survives re-entry heat', tags: ['materials', 'thermal'], difficulty: 2,
    prompt: 'At 700 K (≈ 430 °C), what is the ratio of the specific strength (yield/density) of cold-worked stainless to that of Al-Li 2195, using this site’s material table?',
    answer: steelHot / alHot, unit: '×', tolerance: 0.03,
    hints: ['Read yield at 700 K from the chart on this page, divide by density for each.'],
    solution: `Steel: ${r(steelHot)} kN·m/kg; Al-Li: ${r(alHot)} kN·m/kg ⇒ ratio ≈ <strong>${r(steelHot / alHot)}</strong>. At room temperature aluminium wins on strength per kilogram. Once hot it has basically gone soft, so a steel ship needs a much lighter heat shield (only on the windward side).`,
  },
  {
    id: 'structures-4', title: 'Buckling of a thin steel cylinder', tags: ['structures'], difficulty: 2,
    prompt: 'Estimate the axial buckling stress (MPa) of a 9 m-diameter, 4 mm steel cylinder (E = 193 GPa, ν = 0.3) using the classical formula with a knock-down factor of 0.3.',
    answer: sc4, unit: 'MPa', tolerance: 0.02,
    hints: ['\\(\\sigma_{cr} = \\gamma\\,\\dfrac{E t}{R\\sqrt{3(1-\\nu^2)}}\\), with \\(\\gamma = 0.3\\).'],
    solution: `\\(\\sigma_{cr} = 0.3 \\times 193\\times10^9 \\times 0.004 / (4.5 \\times 1.652) ≈ ${r(sc4)}\\) MPa, tiny next to its yield strength. Thin tanks are “balloons”: internal pressure pre-tensions the wall, which is why stages are kept pressurized even when empty and why stacking an unpressurized Starship is risky.`,
  },
  {
    id: 'structures-5', title: 'Re-entry heat flux', tags: ['thermal'], difficulty: 2,
    prompt: `Using Sutton–Graves, \\(q = 1.7415\\times10^{-4}\\sqrt{\\rho/R_n}\\,v^3\\), find the stagnation heat flux in W/cm² for a 1 m nose radius at 7 km/s and 70 km altitude (\\(\\rho ≈ ${rho5.toExponential(3)}\\) kg/m³).`,
    answer: q5, unit: 'W/cm²', tolerance: 0.02,
    hints: ['Compute in W/m², then divide by 10⁴.'],
    solution: `\\(q = 1.7415\\times10^{-4}\\sqrt{${rho5.toExponential(3)}/1}\\,(7000)^3 ≈ ${r(q5)}\\) W/cm². Heat flux scales with \\(v^3\\) and \\(1/\\sqrt{R_n}\\). Blunt is good: a broad belly-first entry (large effective radius) heats far less than a sharp nose.`,
  },
  {
    id: 'structures-6', title: 'How hot do the tiles get?', tags: ['thermal'], difficulty: 2,
    prompt: 'Starship enters belly-first, so take an effective nose radius of 4.5 m (same speed and altitude as the previous exercise). If the tile surface re-radiates all incoming heat with emissivity 0.85, what equilibrium temperature does it reach, in °C?',
    answer: T6, unit: '°C', tolerance: 0.02,
    hints: ['Scale the previous flux by \\(1/\\sqrt{4.5}\\).', 'Radiative equilibrium: \\(\\varepsilon\\sigma T^4 = q\\).'],
    solution: `\\(q ≈ ${r(q5 / Math.sqrt(4.5))}\\) W/cm² ⇒ \\(T = (q/\\varepsilon\\sigma)^{1/4} ≈ ${r(T6 + 273.15)}\\) K ≈ <strong>${r(T6)} °C</strong>. That’s far beyond steel’s limit, which is why the windward side carries ceramic tiles. The cold side stays below a few hundred °C.`,
  },
  {
    id: 'structures-7', title: 'Lunar-return deceleration', tags: ['thermal', 'moon'], difficulty: 3,
    prompt: 'A capsule returns from the Moon at 11 km/s with a flight-path angle of 6.5° below horizontal. Using Allen–Eggers ballistic entry (\\(H\\) = 7.2 km), estimate the peak deceleration in g.',
    answer: a7, unit: 'g', tolerance: 0.03,
    hints: ['\\(a_{max} = \\dfrac{v_e^2 \\sin\\gamma}{2 e H}\\). Remarkably, it doesn’t depend on mass or drag.'],
    solution: `\\(a_{max} = 11000^2 \\sin 6.5° / (2e \\times 7200) ≈ ${r(a7 * 9.80665)}\\) m/s² ≈ <strong>${r(a7)} g</strong>, which is lethal. Real capsules (and Starship) fly a <em>lifting</em> entry, using lift to stay high and stretch the deceleration out to ~4–7 g.`,
  },
  {
    id: 'structures-8', title: 'Steel vs aluminium tank mass', tags: ['materials', 'structures'], difficulty: 3,
    prompt: 'A 9 m-diameter tank with a 30 m barrel and hemispherical domes is built in 4 mm steel. An Al-Li version must carry the same hoop stress at LOX temperature (90 K), so its wall scales by the ratio of yield strengths. Using this site’s yield table, what is the Al-Li tank mass in tonnes?',
    answer: mAl8, unit: 't', tolerance: 0.03,
    hints: ['\\(t_{Al} = t_{steel}\\,\\sigma_{y,steel}/\\sigma_{y,Al}\\) at 90 K.', 'Shell mass = (barrel area + sphere area) × t × ρ.'],
    solution: `At 90 K steel yields at ${r(yieldAt(MATERIALS.steel, 90))} MPa and Al-Li at ${r(yieldAt(MATERIALS.alli, 90))} MPa, so \\(t_{Al} = ${r(tAl8 * 1000)}\\) mm. Masses: steel ${r(mSteel)} t vs Al-Li <strong>${r(mAl8)} t</strong>. Cold, aluminium is lighter. SpaceX still chose steel because it doesn’t need an insulating heat shield on the leeward side, survives hot staging and aero heating, costs ~1/20th as much, and is easy to weld outdoors.`,
  },
  {
    id: 'structures-9', title: 'Derive the thin-wall pressure vessel stresses', tags: ['structures'], difficulty: 2,
    prompt: 'Show that a thin cylinder under internal pressure has hoop stress \\(pr/t\\) and axial stress \\(pr/(2t)\\). Why do tanks burst along their length?',
    hints: ['Free-body: slice along a diameter for hoop; slice across the axis for axial.'],
    solution: 'Hoop: pressure on the projected area \\(2rL\\) gives force \\(2prL\\), carried by two wall sections of area \\(tL\\): \\(\\sigma_h = pr/t\\). Axial: pressure on the end cap \\(\\pi r^2\\) is carried by the ring \\(2\\pi r t\\): \\(\\sigma_a = pr/(2t)\\). Hoop stress is twice axial, so cracks open along the length (a split sausage). Spherical domes see \\(pr/(2t)\\) everywhere, which is why domes can be thinner.',
  },
];
