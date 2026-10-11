// Exercises for the propulsion section. Answers are computed with the same physics code the site uses.
import { G0 } from '../../physics/constants.js';
import { deltaV, massFlow } from '../../physics/rocket.js';
import { machFromAreaRatio, optimalAreaRatio, cStar, bulkDensity, PROPELLANTS, pressureRatio } from '../../physics/engine.js';

const r = (x, d = 3) => Number(x.toPrecision(d)).toLocaleString('en-US');

const thrust1 = 300 * 311 * G0;
const dv2 = deltaV(348, 4.47, 1);
const me3 = machFromAreaRatio(16, 1.2);
const pe3 = pressureRatio(me3, 1.2) * 9.7e6;
const eps4 = optimalAreaRatio(9.7e6, 101325, 1.2);
const cs5 = cStar(3600, 23.6, 1.115);
const mdotOx = 650 * 3.6 / 4.6;
const pump6 = mdotOx * 45e6 / (1141 * 0.75) / 1e6;
const rho7 = bulkDensity(PROPELLANTS.methalox);
const mdot8 = massFlow(845e3, 282);
const time8 = 395700 * 0.88 / (9 * mdot8);

export default [
  {
    id: 'propulsion-1', title: 'Thrust from mass flow', tags: ['propulsion', 'engines'], difficulty: 1,
    prompt: 'A Merlin 1D in vacuum burns \\(\\dot m = 300\\) kg/s at a vacuum specific impulse of 311 s. What thrust does it make, in kN?',
    answer: thrust1 / 1e3, unit: 'kN', tolerance: 0.01,
    hints: ['Specific impulse is thrust per unit weight-flow: \\(I_{sp} = F / (\\dot m g_0)\\).', 'Use \\(g_0 = 9.80665\\) m/s².'],
    solution: `\\(F = \\dot m\\, I_{sp}\\, g_0 = 300 \\times 311 \\times 9.80665 = ${r(thrust1, 4)}\\) N ≈ <strong>${r(thrust1 / 1e3)} kN</strong>, which matches the published 914 kN vacuum thrust.`,
  },
  {
    id: 'propulsion-2', title: 'Second-stage Δv', tags: ['propulsion'], difficulty: 1,
    prompt: 'Falcon 9’s second stage (MVac, \\(I_{sp} = 348\\) s) starts its burn 4.47 times heavier than it ends. How much Δv does it deliver, in m/s?',
    answer: dv2, unit: 'm/s', tolerance: 0.01,
    hints: ['Tsiolkovsky: \\(\\Delta v = I_{sp} g_0 \\ln(m_0/m_f)\\).'],
    solution: `\\(\\Delta v = 348 \\times 9.80665 \\times \\ln 4.47 = ${r(dv2, 4)}\\) m/s, more than half of orbital speed from one small stage.`,
  },
  {
    id: 'propulsion-3', title: 'Exit Mach number of a sea-level nozzle', tags: ['nozzles'], difficulty: 2,
    prompt: 'A nozzle has area ratio \\(\\varepsilon = A_e/A_t = 16\\) and the exhaust behaves like a gas with \\(\\gamma = 1.2\\). Find the supersonic exit Mach number.',
    answer: me3, unit: '', tolerance: 0.01,
    hints: ['Use the area–Mach relation \\(\\frac{A}{A^*} = \\frac{1}{M}\\left[\\frac{2}{\\gamma+1}\\left(1+\\frac{\\gamma-1}{2}M^2\\right)\\right]^{\\frac{\\gamma+1}{2(\\gamma-1)}}\\).', 'It can’t be inverted in closed form. Bisect between M = 1 and M = 10.'],
    solution: `Solving the area–Mach relation numerically gives <strong>M<sub>e</sub> ≈ ${r(me3)}</strong>. With \\(p_c\\) = 97 bar the exit pressure is \\(p_e = p_c(1+\\tfrac{\\gamma-1}{2}M_e^2)^{-\\gamma/(\\gamma-1)} ≈ ${r(pe3 / 1e3)}\\) kPa, below sea-level pressure, so the Merlin is slightly over-expanded at liftoff.`,
  },
  {
    id: 'propulsion-4', title: 'Optimum expansion at sea level', tags: ['nozzles'], difficulty: 2,
    prompt: 'For \\(p_c = 9.7\\) MPa and \\(\\gamma = 1.2\\), what area ratio makes \\(p_e = 101.325\\) kPa exactly (optimum expansion at sea level)?',
    answer: eps4, unit: '', tolerance: 0.02,
    hints: ['First find the Mach number where \\(p/p_c = 101325/9.7\\times10^6\\): \\(M = \\sqrt{\\frac{2}{\\gamma-1}\\left[(p_c/p_e)^{(\\gamma-1)/\\gamma}-1\\right]}\\).', 'Then plug that Mach number into the area–Mach relation.'],
    solution: `\\(M = ${r(Math.sqrt(2 / 0.2 * ((9.7e6 / 101325) ** (0.2 / 1.2) - 1)))}\\), giving \\(\\varepsilon ≈ ${r(eps4)}\\). Merlin uses 16, slightly over-expanded at sea level but better on average across the climb, as long as the flow doesn’t separate (Summerfield: \\(p_e \\gtrsim 0.4\\,p_a\\)).`,
  },
  {
    id: 'propulsion-5', title: 'Characteristic velocity of methalox', tags: ['combustion'], difficulty: 2,
    prompt: 'Compute \\(c^*\\) for methalox chamber gas with \\(T_c = 3600\\) K, effective molar mass 23.6 kg/kmol and \\(\\gamma = 1.115\\).',
    answer: cs5, unit: 'm/s', tolerance: 0.01,
    hints: ['\\(c^* = \\dfrac{\\sqrt{\\gamma R T_c}}{\\gamma\\sqrt{\\left(\\frac{2}{\\gamma+1}\\right)^{\\frac{\\gamma+1}{\\gamma-1}}}}\\), with \\(R = 8314.46/\\mathcal{M}\\).'],
    solution: `\\(R = 8314.46/23.6 = ${r(8314.46 / 23.6, 4)}\\) J/(kg·K) → <strong>\\(c^* ≈ ${r(cs5, 4)}\\) m/s</strong>. \\(c^*\\) measures combustion quality alone; the nozzle multiplies it by \\(C_F\\) to give exhaust velocity.`,
  },
  {
    id: 'propulsion-6', title: 'How big is a Raptor’s oxygen pump?', tags: ['engines'], difficulty: 2,
    prompt: 'A Raptor burns about 650 kg/s at O/F = 3.6. The oxygen pump raises LOX (ρ = 1141 kg/m³) by 45 MPa at 75 % efficiency. What shaft power does it need, in MW?',
    answer: pump6, unit: 'MW', tolerance: 0.02,
    hints: ['Oxygen share of the flow: \\(\\dot m_{ox} = \\dot m\\,\\frac{O/F}{1+O/F}\\).', 'Hydraulic power is \\(\\dot V\\,\\Delta p = \\frac{\\dot m}{\\rho}\\Delta p\\); divide by efficiency.'],
    solution: `\\(\\dot m_{ox} = 650 \\times 3.6/4.6 = ${r(mdotOx)}\\) kg/s, so \\(P = \\frac{${r(mdotOx)}}{1141}\\cdot\\frac{45\\times10^6}{0.75} ≈ ${r(pump6)}\\) MW, roughly a small power station in a machine the size of a beer keg. That’s why staged-combustion turbines run on high-pressure preburner gas.`,
  },
  {
    id: 'propulsion-7', title: 'Bulk density: why methane tanks are big', tags: ['combustion', 'propulsion'], difficulty: 1,
    prompt: 'LOX is 1141 kg/m³ and liquid methane 423 kg/m³. What is the bulk density of the propellant load at O/F = 3.6?',
    answer: rho7, unit: 'kg/m³', tolerance: 0.01,
    hints: ['Add the volumes: per (1 + O/F) kg of propellant there are O/F kg of LOX and 1 kg of fuel.'],
    solution: `\\(\\rho_{bulk} = \\dfrac{1+3.6}{3.6/1141 + 1/423} ≈ ${r(rho7)}\\) kg/m³, compared with ~1,020 for kerolox and ~360 for hydrolox. Methane sits between: denser than hydrogen (smaller tanks), cleaner and higher Isp than kerosene.`,
  },
  {
    id: 'propulsion-8', title: 'First-stage burn time', tags: ['engines', 'propulsion'], difficulty: 2,
    prompt: 'Nine Merlin 1Ds at full sea-level thrust (845 kN each, \\(I_{sp}\\) = 282 s) burn 88 % of Falcon 9’s ~395.7 t first-stage propellant (the rest is the landing reserve). Using sea-level mass flow throughout, how long is the burn, in seconds?',
    answer: time8, unit: 's', tolerance: 0.02,
    hints: ['Mass flow per engine: \\(\\dot m = F/(I_{sp} g_0)\\).', 'Mass flow doesn’t change with altitude at fixed throttle; only thrust does.'],
    solution: `\\(\\dot m = 845\\,000/(282 \\times 9.80665) = ${r(mdot8)}\\) kg/s per engine; \\(t = 0.88 \\times 395\\,700 / (9 \\times ${r(mdot8)}) ≈ ${r(time8)}\\) s. Webcasts show MECO around T+2:25–2:40, consistent once you include the max-Q throttle bucket.`,
  },
  {
    id: 'propulsion-9', title: 'Derive the rocket equation', tags: ['propulsion'], difficulty: 3,
    prompt: 'Starting from conservation of momentum for a rocket of mass \\(m\\) ejecting mass \\(dm\\) at exhaust speed \\(v_e\\) relative to itself, with no external forces, derive \\(\\Delta v = v_e \\ln(m_0/m_f)\\). Then say what changes when gravity acts during a vertical burn.',
    hints: ['Momentum before: \\(m v\\). After: \\((m - dm)(v + dv) + dm\\,(v - v_e)\\).', 'Drop second-order terms and integrate \\(dv = -v_e\\,dm/m\\).'],
    solution: `Equate momenta: \\(m v = (m-dm)(v+dv) + dm(v-v_e)\\) ⇒ \\(m\\,dv = v_e\\,dm_{ejected}\\). The rocket’s mass changes by \\(dm_{rocket} = -dm\\), so \\(dv = -v_e\\,dm_{rocket}/m\\). Integrating from \\(m_0\\) to \\(m_f\\): \\(\\Delta v = v_e\\ln(m_0/m_f)\\). With gravity during a vertical burn of duration \\(t_b\\): \\(\\Delta v = v_e\\ln(m_0/m_f) - g\\,t_b\\). This is the <em>gravity loss</em>, and the reason rockets want high thrust-to-weight early.`,
  },
];
