// Exercises for flight physics: atmosphere, ascent losses, staging, orbits.
import { G0, MU_EARTH, R_EARTH, OMEGA_EARTH, DEG } from '../../physics/constants.js';
import { atmosphere } from '../../physics/atmosphere.js';
import { circularVelocity, hohmann, period, idealOrbitDeltaV } from '../../physics/orbit.js';
import { payloadFractionIdenticalStages } from '../../physics/rocket.js';

const r = (x, d = 3) => Number(x.toPrecision(d)).toLocaleString('en-US');

const v1 = circularVelocity(R_EARTH + 200e3);
const rot2 = OMEGA_EARTH * R_EARTH * Math.cos(28.5 * DEG);
const rho3 = atmosphere(12000).rho;
const q3 = 0.5 * rho3 * 500 ** 2;
const gl4 = G0 * 0.8 * 160 * 0.6;
const hoh5 = hohmann(R_EARTH + 200e3, 42164e3);
const pi1 = payloadFractionIdenticalStages(9400, 330, 0.08, 1);
const pi2 = payloadFractionIdenticalStages(9400, 330, 0.08, 2);
const T7 = period(R_EARTH + 550e3) / 60;
const ideal8 = idealOrbitDeltaV(200e3, 28.5 * DEG);
const H9 = 287.053 * 250 / G0;

export default [
  {
    id: 'flight-1', title: 'Orbital speed', tags: ['orbits'], difficulty: 1,
    prompt: 'How fast must you fly sideways to stay in a circular orbit 200 km above Earth’s equatorial radius (6,378.137 km)? Give m/s.',
    answer: v1, unit: 'm/s', tolerance: 0.005,
    hints: ['Gravity supplies the centripetal force: \\(\\mu/r^2 = v^2/r\\).', '\\(\\mu_\\oplus = 3.986\\times10^{14}\\) m³/s².'],
    solution: `\\(v = \\sqrt{\\mu/r} = \\sqrt{3.986\\times10^{14}/6.578\\times10^6} ≈ ${r(v1, 4)}\\) m/s, about Mach 23 at sea level. Getting <em>up</em> to 200 km is easy; going this fast sideways is the hard part.`,
  },
  {
    id: 'flight-2', title: 'Free speed from Earth’s rotation', tags: ['orbits'], difficulty: 1,
    prompt: 'Cape Canaveral is at 28.5° N. How much eastward speed does Earth’s rotation give a rocket on the pad? (\\(\\omega_\\oplus = 7.292\\times10^{-5}\\) rad/s)',
    answer: rot2, unit: 'm/s', tolerance: 0.01,
    hints: ['The pad moves on a circle of radius \\(R_\\oplus\\cos\\phi\\).'],
    solution: `\\(v = \\omega R_\\oplus \\cos 28.5° = 7.292\\times10^{-5} \\times 6.378\\times10^6 \\times 0.879 ≈ ${r(rot2)}\\) m/s, about 5 % of orbital speed, free. That’s why launches go east and why launch sites sit as close to the equator as politics allow.`,
  },
  {
    id: 'flight-3', title: 'Dynamic pressure near max-Q', tags: ['atmosphere'], difficulty: 2,
    prompt: 'At 12 km altitude a rocket moves at 500 m/s relative to the air. Using the US Standard Atmosphere (\\(\\rho_{12\\,km} ≈ ' + rho3.toFixed(4) + '\\) kg/m³), what is the dynamic pressure in kPa?',
    answer: q3 / 1000, unit: 'kPa', tolerance: 0.02,
    hints: ['\\(q = \\tfrac12\\rho v^2\\).'],
    solution: `\\(q = 0.5 \\times ${rho3.toFixed(4)} \\times 500^2 ≈ ${r(q3 / 1000)}\\) kPa. Max-Q is where rising speed and falling density balance; Falcon 9 throttles down slightly through it to keep structural loads in limits.`,
  },
  {
    id: 'flight-4', title: 'Gravity loss of a first stage', tags: ['atmosphere', 'orbits'], difficulty: 2,
    prompt: 'A first stage burns for 160 s. On average its velocity vector points 37° above horizontal (so \\(\\sin\\gamma ≈ 0.6\\)) and local gravity is ~0.8 \\(g_0\\) once the effective (gravity minus centrifugal) value is accounted for. Estimate the gravity loss \\(\\int g\\sin\\gamma\\,dt\\) in m/s.',
    answer: gl4, unit: 'm/s', tolerance: 0.03,
    hints: ['With averages, the integral is \\(\\bar g\\,\\overline{\\sin\\gamma}\\,t_b\\).'],
    solution: `\\(\\Delta v_{grav} ≈ 0.8 \\times 9.81 \\times 0.6 \\times 160 ≈ ${r(gl4)}\\) m/s. The ascent sim on this page gives ~0.8–1.1 km/s for the whole flight, the largest single loss. High thrust-to-weight shortens the burn and cuts it.`,
  },
  {
    id: 'flight-5', title: 'LEO to geostationary', tags: ['orbits'], difficulty: 2,
    prompt: 'What total Δv does a coplanar Hohmann transfer from a 200 km circular orbit to geostationary radius (42,164 km) need? Give m/s.',
    answer: hoh5.total, unit: 'm/s', tolerance: 0.01,
    hints: ['Transfer ellipse semi-major axis \\(a = (r_1+r_2)/2\\); use vis-viva \\(v = \\sqrt{\\mu(2/r - 1/a)}\\) at both ends.'],
    solution: `Burn 1: \\(${r(hoh5.dv1, 4)}\\) m/s at perigee; burn 2: \\(${r(hoh5.dv2, 4)}\\) m/s at apogee; total ≈ <strong>${r(hoh5.total, 4)} m/s</strong>, taking ${r(hoh5.tof / 3600)} h. From the Cape you also need a ~28° plane change, cheapest at apogee where you’re slow, which is why Falcon 9 leaves satellites in a “GTO” and lets them finish the job.`,
  },
  {
    id: 'flight-6', title: 'Why two stages beat one', tags: ['propulsion', 'orbits'], difficulty: 3,
    prompt: 'Every stage has \\(I_{sp}\\) = 330 s and structural coefficient \\(\\varepsilon = m_{dry}/(m_{dry}+m_{prop}) = 0.08\\). For a 9.4 km/s mission, what is the payload fraction (payload / liftoff mass, in %) with <strong>two</strong> identical-Δv stages?',
    answer: pi2 * 100, unit: '%', tolerance: 0.03,
    hints: ['Split Δv equally: each stage gives 4.7 km/s, so mass ratio \\(R = e^{4700/(330 g_0)}\\).', 'Per stage, the payload ratio \\(\\lambda = m_{above}/m_{stage}\\) satisfies \\(R = (1+\\lambda)/(\\varepsilon+\\lambda)\\), so \\(\\lambda = (1-\\varepsilon R)/(R-1)\\). The fraction is \\((\\lambda/(1+\\lambda))^2\\).'],
    solution: `\\(R = e^{4700/3236} ≈ ${r(Math.exp(4700 / (330 * G0)))}\\); \\(\\lambda ≈ ${r((1 - 0.08 * Math.exp(4700 / (330 * G0))) / (Math.exp(4700 / (330 * G0)) - 1))}\\); payload fraction ≈ <strong>${r(pi2 * 100)} %</strong>. A single stage with the same technology manages ${pi1 > 0 ? r(pi1 * 100) + ' %' : 'nothing at all (it can’t even lift its own tanks to orbit)'}. Staging throws away dead mass on the way up.`,
  },
  {
    id: 'flight-7', title: 'Period of a Starlink orbit', tags: ['orbits', 'starlink'], difficulty: 1,
    prompt: 'What is the orbital period, in minutes, of a satellite in a circular orbit at 550 km?',
    answer: T7, unit: 'min', tolerance: 0.005,
    hints: ['Kepler III: \\(T = 2\\pi\\sqrt{a^3/\\mu}\\).'],
    solution: `\\(T = 2\\pi\\sqrt{(6928.1\\text{ km})^3/\\mu} ≈ ${r(T7, 4)}\\) min, about 15 orbits a day.`,
  },
  {
    id: 'flight-8', title: 'The loss-free Δv to orbit', tags: ['orbits'], difficulty: 3,
    prompt: 'Ignoring drag and gravity losses, what Δv takes a rocket from the pad at 28.5° N to a 200 km circular orbit? Model it as an instantaneous kick at the surface onto a Hohmann ellipse plus a circularization burn, minus Earth’s rotation.',
    answer: ideal8, unit: 'm/s', tolerance: 0.01,
    hints: ['Transfer ellipse from \\(R_\\oplus\\) to \\(R_\\oplus + 200\\) km; kick = perigee speed \\(\\sqrt{\\mu(2/R_\\oplus - 1/a)}\\).', 'Subtract \\(\\omega R_\\oplus \\cos\\phi\\) ≈ 408 m/s.'],
    solution: `Kick ≈ ${r(Math.sqrt(MU_EARTH * (2 / R_EARTH - 2 / (2 * R_EARTH + 200e3))), 4)} m/s, circularization ≈ ${r(circularVelocity(R_EARTH + 200e3) - Math.sqrt(MU_EARTH * (2 / (R_EARTH + 200e3) - 2 / (2 * R_EARTH + 200e3))), 3)} m/s, minus 408 m/s ⇒ <strong>${r(ideal8, 4)} m/s</strong>. Real rockets spend ~9.3–9.5 km/s: the difference (~1.5 km/s) is gravity, drag and steering loss.`,
  },
  {
    id: 'flight-9', title: 'Scale height of the atmosphere', tags: ['atmosphere'], difficulty: 2,
    prompt: 'For an isothermal atmosphere, \\(p(z) = p_0 e^{-z/H}\\) with \\(H = RT/g\\). With \\(R\\) = 287 J/(kg·K) and an average temperature of 250 K, what is \\(H\\) in km? Then derive the formula from hydrostatics.',
    answer: H9 / 1000, unit: 'km', tolerance: 0.02,
    hints: ['Hydrostatic balance: \\(dp/dz = -\\rho g\\); ideal gas: \\(\\rho = p/(RT)\\).'],
    solution: `\\(dp/dz = -pg/(RT)\\) ⇒ \\(p = p_0 e^{-z/H}\\), \\(H = RT/g = 287 \\times 250 / 9.81 ≈ ${r(H9 / 1000)}\\) km. Every ~7 km the air thins by a factor e. By 50 km only ~0.08 % of sea-level pressure is left, which is why rockets go up first and turn sideways later.`,
  },
];
