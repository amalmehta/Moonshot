// Exercises for the vehicles section (3D Vehicles page). Answers computed with js/physics/tanks.js.
export default [
  {
    id: 'vehicles-1', title: 'How full is a Falcon 9 booster?', tags: ['structures', 'propulsion'], difficulty: 1,
    prompt: 'The Falcon 9 first stage is estimated at 25.6 t dry with 395.7 t of propellant. What is its <strong>propellant mass fraction</strong> \\(m_p/(m_p+m_{dry})\\)? Give a number between 0 and 1.',
    answer: 0.9392, unit: '', tolerance: 0.005,
    hints: ['Total stage mass = dry + propellant.', '395.7 / (395.7 + 25.6).'],
    solution: '\\(\\dfrac{395.7}{395.7 + 25.6} = \\dfrac{395.7}{421.3} = 0.939\\). Almost 94 % of the stage is propellant; the tanks, engines, legs and fins together are just 6 %. Aluminium–lithium tanks that double as the airframe are what make that possible.',
  },
  {
    id: 'vehicles-2', title: 'LOX volume in the first stage', tags: ['propulsion', 'structures'], difficulty: 1,
    prompt: 'Kerolox burns at a mixture ratio \\(r = 2.36\\) (oxidiser:fuel by mass). The first stage carries 395.7 t of propellant. With LOX sub-cooled to a density of 1230 kg/m³, what volume of liquid oxygen does it carry?',
    answer: 225.96, unit: 'm³', tolerance: 0.01,
    hints: ['\\(m_{ox} = m_p\\, r/(1+r)\\).', '\\(m_{ox} = 395\\,700 \\times 2.36/3.36 = 277\\,932\\) kg; divide by the density.'],
    solution: '\\(m_{ox} = 395\\,700 \\times \\tfrac{2.36}{3.36} = 277\\,932\\) kg, so \\(V_{ox} = 277\\,932/1230 = 226\\) m³. At its normal boiling-point density (1141 kg/m³) the same LOX would take 244 m³: densification saves about 18 m³, roughly 1.7 m of tank at 3.66 m diameter.',
  },
  {
    id: 'vehicles-3', title: 'Bulk density of methalox', tags: ['propulsion', 'materials'], difficulty: 1,
    prompt: 'Find the bulk density \\(\\rho_b\\) (total propellant mass ÷ total liquid volume) of methane/LOX at mixture ratio 3.6, with \\(\\rho_{ox} = 1141\\) kg/m³ and \\(\\rho_{CH_4} = 423\\) kg/m³.',
    answer: 833.46, unit: 'kg/m³', tolerance: 0.01,
    hints: ['Take 1 kg of fuel and \\(r\\) kg of oxidiser: the mass is \\(1+r\\) kg.', 'The volume is \\(r/\\rho_{ox} + 1/\\rho_f\\).'],
    solution: '$$\\rho_b = \\frac{1+r}{r/\\rho_{ox} + 1/\\rho_f} = \\frac{4.6}{3.6/1141 + 1/423} = \\frac{4.6}{0.003155 + 0.002364} = 833\\ \\text{kg/m}^3.$$ Kerolox at its mixture ratio is about 1017 kg/m³, so methalox needs about 22 % more tank volume per kilogram. Methane wins on Isp and clean burning, but the vehicle gets bigger.',
  },
  {
    id: 'vehicles-4', title: 'Tank length from volume', tags: ['structures'], difficulty: 2,
    prompt: 'A tank stack of inner radius 4.49 m has two half-ellipsoid domes of height \\(h = R/\\sqrt2\\) and must hold 4000 m³ in total (common bulkhead, so only two domes count). How long is the stack from dome apex to dome apex?',
    answer: 65.273, unit: 'm', tolerance: 0.01,
    hints: ['Dome volume \\(\\tfrac23\\pi R^2 h\\).', 'Barrel length \\(L_b = (V - 2V_{dome})/(\\pi R^2)\\); add the two dome heights.'],
    solution: '\\(h = 4.49/\\sqrt2 = 3.175\\) m, \\(V_{dome} = \\tfrac23\\pi (4.49)^2(3.175) = 134.1\\) m³. \\(\\pi R^2 = 63.33\\) m², so \\(L_b = (4000 - 268.1)/63.33 = 58.92\\) m and \\(L = 58.92 + 2(3.175) = 65.27\\) m. That is roughly Super Heavy’s tank: add about 2 m of engines, 1 m of engine bay and a 1.8 m hot-staging ring and you are at 70 m, against a published 71 m.',
  },
  {
    id: 'vehicles-5', title: 'What a common bulkhead saves', tags: ['structures'], difficulty: 2,
    prompt: 'Compare two designs holding the same total volume at radius \\(R = 1.83\\) m with \\(\\sqrt2\\) domes (\\(h = kR\\), \\(k = 1/\\sqrt2\\)): (a) one stack with a common bulkhead (two domes); (b) two separate tanks (four domes) with a 1.0 m intertank gap between them. How much longer is design (b)?',
    answer: 1.8627, unit: 'm', tolerance: 0.01,
    hints: ['Write each total length as barrel + dome heights; the barrel is (V − n·V_dome)/πR².', 'Two extra domes add \\(2h\\) of length but hold \\(2V_{dome}\\), shortening the barrel by \\(2V_{dome}/\\pi R^2 = \\tfrac43 kR\\).'],
    solution: 'Each extra dome adds \\(kR\\) of length but holds \\(\\tfrac23\\pi kR^3\\), which shortens the barrel by \\(\\tfrac23 kR\\). Net per dome: \\(\\tfrac13 kR\\). Two extra domes plus the gap: \\(\\Delta L = \\tfrac23 kR + g = \\tfrac23(0.7071)(1.83) + 1.0 = 0.863 + 1.0 = 1.86\\) m. Add the mass of two extra domes and the intertank skirt, and you can see why both vehicles share a bulkhead (paying for it with harder insulation between −183 °C LOX and the fuel).',
  },
  {
    id: 'vehicles-6', title: 'Slender or stubby: fineness ratio', tags: ['structures', 'atmosphere'], difficulty: 1,
    prompt: 'Fineness ratio is length ÷ diameter. Falcon 9 is 70 m × 3.7 m; the Starship stack is 123.1 m × 9 m. By what factor is Falcon 9’s fineness ratio larger than Starship’s?',
    answer: 1.3832, unit: '', tolerance: 0.01,
    hints: ['70/3.7 and 123.1/9.', 'Divide the first by the second.'],
    solution: 'Falcon 9: \\(70/3.7 = 18.9\\). Starship: \\(123.1/9 = 13.7\\). Ratio \\(18.9/13.7 = 1.38\\). Falcon 9’s 3.7 m diameter was fixed by road transport, so extra propellant had to go into length, making it one of the most slender rockets flying (bending loads and slosh get harder). Starship is built at the launch site, so it could go wide.',
  },
  {
    id: 'vehicles-7', title: 'Centre of mass sinks during the burn', tags: ['structures', 'gnc'], difficulty: 3,
    prompt: 'Model the Falcon 9 first stage as: dry mass 25.6 t with its centre of mass 14 m above the engine exits; an RP-1 tank as a cylinder from 3 to 17.5 m holding 117.7 t; a LOX tank as a cylinder from 17.5 to 39.5 m holding 278 t. Liquid settles at the bottom of each tank under thrust. How far does the stage’s centre of mass move down between full tanks and 20 % propellant remaining?',
    answer: 7.6409, unit: 'm', tolerance: 0.01,
    hints: ['With fraction \\(f\\) left, each tank’s liquid fills the bottom \\(f\\) of its length, so its centroid is at \\(z_0 + fL/2\\).', '\\(z_{cm} = \\sum m_i z_i / \\sum m_i\\). Full: \\(z_{RP1} = 10.25\\), \\(z_{LOX} = 28.5\\) m. At 20 %: \\(z_{RP1} = 4.45\\), \\(z_{LOX} = 19.7\\) m.'],
    solution: 'Full: \\(\\dfrac{25.6(14) + 117.7(10.25) + 278(28.5)}{421.3} = \\dfrac{358.4 + 1206.4 + 7923}{421.3} = 22.52\\) m. At 20 %: masses 25.6, 23.54, 55.6 t at 14, 4.45, 19.7 m: \\(\\dfrac{358.4 + 104.8 + 1095.3}{104.7} = 14.88\\) m. Shift: \\(22.52 - 14.88 = 7.64\\) m downward. The heavy LOX on top drains toward the bottom of its tank, so the CoM drops toward the engines. That moves the CoM relative to the centre of pressure (stability) and changes the lever arm the engine gimbal acts on, so the guidance gains are scheduled with propellant remaining.',
  },
  {
    id: 'vehicles-8', title: 'Why a √2 dome? (derivation)', tags: ['structures', 'materials'], difficulty: 3,
    prompt: 'For a thin shell of revolution under internal pressure \\(p\\), equilibrium gives \\(\\sigma_\\phi/R_1 + \\sigma_\\theta/R_2 = p/t\\) and, from the cap above a parallel circle, \\(\\sigma_\\phi = pR_2/(2t)\\). For a half-ellipsoid with equatorial radius \\(a\\) and height \\(b\\), at the equator \\(R_2 = a\\) and \\(R_1 = b^2/a\\). Show that the hoop stress at the equator is \\(\\sigma_\\theta = \\frac{pa}{t}\\left(1 - \\frac{a^2}{2b^2}\\right)\\), and find the largest \\(a/b\\) for which the dome skin stays in tension everywhere.',
    hints: ['Substitute \\(\\sigma_\\phi = pa/(2t)\\) into the equilibrium equation with \\(R_1 = b^2/a\\).', 'Set \\(\\sigma_\\theta \\ge 0\\).'],
    solution: 'At the equator \\(\\sigma_\\phi = pa/(2t)\\). Then \\(\\sigma_\\theta = R_2\\left(\\frac pt - \\frac{\\sigma_\\phi}{R_1}\\right) = a\\left(\\frac pt - \\frac{pa}{2t}\\cdot\\frac{a}{b^2}\\right) = \\frac{pa}{t}\\left(1 - \\frac{a^2}{2b^2}\\right).\\) This is \\(\\ge 0\\) only if \\(a^2 \\le 2b^2\\), i.e. \\(a/b \\le \\sqrt2\\) (dome height \\(h = b \\ge R/\\sqrt2\\)). Shallower domes save tank length but put the equator of the dome in hoop compression, where a thin wall can wrinkle (buckle), so they need thicker skins or stiffeners. The tank model on this page uses \\(k = 1/\\sqrt2\\) as the default for that reason. At the apex both radii equal \\(a^2/b\\), so there the stress is \\(pa^2/(2bt)\\), always tensile.',
  },
];
