// Exercises for the Starlink section. Shape documented in js/common.js (renderExercises).
// Every answer below was computed with js/physics/starlink.js (R⊕ = 6,378.137 km, μ = 3.986004418e14 m³/s²).
export default [
  {
    id: 'starlink-1', title: 'How long is a lap at 550 km?', tags: ['orbits', 'starlink'], difficulty: 1,
    prompt: 'A Starlink satellite flies a circular orbit 550 km above the equatorial radius \\(R_\\oplus = 6378.137\\) km. Using \\(\\mu = 3.986\\times10^{14}\\) m³/s², what is its orbital period in minutes?',
    answer: 95.65, unit: 'min', tolerance: 0.005,
    hints: ['For a circular orbit, gravity supplies the centripetal force: \\(\\mu/r^2 = v^2/r\\).', 'Then \\(T = 2\\pi r / v = 2\\pi\\sqrt{r^3/\\mu}\\) with \\(r = R_\\oplus + h\\).'],
    solution: '\\(r = 6378.137 + 550 = 6928.137\\) km. \\(v = \\sqrt{\\mu/r} = 7585\\) m/s and $$T = 2\\pi\\sqrt{\\frac{(6.928137\\times10^6)^3}{3.986\\times10^{14}}} = 5739\\ \\text{s} = 95.65\\ \\text{min}.$$ That is about 15.06 laps a day, which matches the tracked mean motion of 550 km Starlink satellites.',
  },
  {
    id: 'starlink-2', title: 'Footprint at 25° minimum elevation', tags: ['starlink', 'orbits'], difficulty: 1,
    prompt: 'A user terminal only talks to satellites at least \\(\\varepsilon = 25^\\circ\\) above its horizon. For a satellite at \\(h = 550\\) km, what is the ground radius (arc length along a spherical Earth, \\(R_\\oplus = 6378.137\\) km) of the circle of users that can see it?',
    answer: 940.7, unit: 'km', tolerance: 0.01,
    hints: ['Draw the triangle Earth centre – user – satellite. The angle at the user between the satellite and the Earth centre is \\(90^\\circ + \\varepsilon\\).', 'Law of sines gives the nadir angle \\(\\eta\\): \\(\\sin\\eta = R_\\oplus\\cos\\varepsilon/(R_\\oplus+h)\\). The angles add up: \\(\\lambda = 90^\\circ - \\varepsilon - \\eta\\).'],
    solution: '\\(\\sin\\eta = 6378.137\\cos 25^\\circ / 6928.137 = 0.8344\\Rightarrow \\eta = 56.55^\\circ\\). Then \\(\\lambda = 90^\\circ - 25^\\circ - 56.55^\\circ = 8.451^\\circ = 0.14750\\) rad, and the ground radius is \\(R_\\oplus\\lambda = 6378.137 \\times 0.14750 = 940.7\\) km. Only ~0.54% of Earth’s surface sees any one satellite.',
  },
  {
    id: 'starlink-3', title: 'Why 97.6° is sun-synchronous (derivation)', tags: ['orbits', 'starlink'], difficulty: 3,
    prompt: 'Earth’s equatorial bulge (the \\(J_2\\) term) makes an orbit’s plane precess: $$\\dot\\Omega = -\\tfrac32\\, n\\, J_2 \\left(\\frac{R_\\oplus}{a}\\right)^2 \\cos i.$$ (a) Explain physically why prograde orbits (\\(i<90^\\circ\\)) regress westward. (b) Show that a 560 km circular orbit at \\(i = 97.6^\\circ\\) precesses eastward at almost exactly the rate the Sun moves along the ecliptic, 360°/365.2422 d. (c) Solve for the exact sun-synchronous inclination at 560 km. Use \\(J_2 = 1.0826\\times10^{-3}\\).',
    hints: ['(a) The bulge pulls the satellite towards the equatorial plane near each node crossing; that torque is perpendicular to the angular momentum, so the momentum vector precesses like a gyroscope.', '(b) \\(n = \\sqrt{\\mu/a^3}\\) with \\(a = 6938.137\\) km. Convert rad/s to °/day by multiplying by \\(86400\\cdot 180/\\pi\\).', '(c) Set \\(\\dot\\Omega = 2\\pi/(365.2422\\cdot86400)\\) and solve for \\(\\cos i\\).'],
    solution: '(a) Averaged over an orbit, the bulge’s extra pull tries to rotate the orbit plane down onto the equator. The torque \\(\\boldsymbol\\tau\\) is perpendicular to \\(\\mathbf h\\), so \\(\\mathbf h\\) precesses about the polar axis instead of tipping, westward for prograde orbits (\\(\\cos i>0\\)) and eastward for retrograde ones. (b) \\(n = \\sqrt{3.986\\times10^{14}/(6.938137\\times10^6)^3} = 1.0925\\times10^{-3}\\) rad/s. \\(\\tfrac32 nJ_2(R/a)^2 = 1.4993\\times10^{-6}\\) rad/s. With \\(\\cos 97.6^\\circ = -0.1323\\): \\(\\dot\\Omega = 1.983\\times10^{-7}\\) rad/s \\(= 0.9816^\\circ\\)/day, versus the Sun’s \\(0.9856^\\circ\\)/day (0.4% apart). (c) \\(\\cos i = -1.9911\\times10^{-7}/1.4993\\times10^{-6} = -0.1328\\Rightarrow i = 97.63^\\circ\\). The polar shells keep a fixed angle to the Sun all year, so their lighting and thermal environment repeat.',
  },
  {
    id: 'starlink-4', title: 'Free-space path loss at the edge of coverage', tags: ['rf', 'starlink'], difficulty: 1,
    prompt: 'A Ku-band downlink at 11.7 GHz reaches a user at the 25° minimum elevation, a slant range of 1,123.4 km. What is the free-space path loss in dB?',
    answer: 174.82, unit: 'dB', tolerance: 0.001,
    hints: ['Power spreads over a sphere \\(4\\pi d^2\\), and a receive antenna of gain 1 has effective area \\(\\lambda^2/4\\pi\\).', '\\(L = (4\\pi d/\\lambda)^2 = (4\\pi d f/c)^2\\); take \\(10\\log_{10}\\).'],
    solution: '\\(\\lambda = c/f = 2.562\\) cm. \\(4\\pi d/\\lambda = 4\\pi(1.1234\\times10^6)/0.025623 = 5.510\\times10^8\\). \\(\\text{FSPL} = 20\\log_{10}(5.510\\times10^8) = 174.82\\) dB. Overhead (550 km) it would be 6.2 dB less, which is why the scheduler prefers high-elevation satellites.',
  },
  {
    id: 'starlink-5', title: 'Steering a beam with phase', tags: ['rf'], difficulty: 2,
    prompt: 'A linear phased array has elements spaced \\(d = \\lambda/2\\). What progressive phase shift between neighbouring elements (in degrees, give the magnitude) points the main beam \\(40^\\circ\\) off broadside?',
    answer: 115.7, unit: '°', tolerance: 0.005,
    hints: ['A wave arriving from angle \\(\\theta_0\\) reaches each element \\(d\\sin\\theta_0\\) of path later than its neighbour.', 'Cancel that path difference with a phase \\(\\beta = -kd\\sin\\theta_0\\), \\(k = 2\\pi/\\lambda\\).'],
    solution: '\\(|\\beta| = kd\\sin\\theta_0 = 2\\pi(0.5)\\sin 40^\\circ = \\pi \\times 0.6428 = 2.019\\) rad \\(= 115.7^\\circ\\). Element \\(m\\) gets phase \\(-115.7^\\circ\\,m\\) (mod 360°). No moving parts: the beam moves as fast as the phase shifters update.',
  },
  {
    id: 'starlink-6', title: 'How far apart can the elements be?', tags: ['rf'], difficulty: 2,
    prompt: 'A user-terminal array at 11.7 GHz must scan to \\(60^\\circ\\) from broadside without a grating lobe appearing in visible space. What is the largest allowed element spacing, in millimetres?',
    answer: 13.73, unit: 'mm', tolerance: 0.005,
    hints: ['The array factor repeats whenever \\(\\psi = kd(\\sin\\theta - \\sin\\theta_0)\\) changes by \\(2\\pi\\), giving extra peaks at \\(\\sin\\theta_m = \\sin\\theta_0 + m\\lambda/d\\).', 'Keep the \\(m = -1\\) lobe outside \\(\\sin\\theta \\ge -1\\): \\(d/\\lambda < 1/(1+|\\sin\\theta_0|)\\).'],
    solution: '\\(\\lambda = 25.62\\) mm. \\(d < \\lambda/(1+\\sin 60^\\circ) = 25.62/1.866 = 13.73\\) mm, i.e. \\(0.536\\lambda\\). Broadside-only arrays could use almost \\(\\lambda\\); wide scan pushes you towards \\(\\lambda/2\\) and therefore to many more elements per square metre.',
  },
  {
    id: 'starlink-7', title: 'London to New York: light in glass vs light in vacuum', tags: ['starlink', 'rf'], difficulty: 2,
    prompt: 'London (51.507°N, 0.128°W) and New York (40.713°N, 74.006°W) are 5,576 km apart along a great circle (spherical Earth). Compare (a) a perfectly straight fibre along the great circle, group index 1.47, with (b) the best possible path through a 550 km shell with a 25° minimum elevation: slant up at 25°, follow the shell’s arc, slant down at 25°. How many milliseconds does the space path save, one way?',
    answer: 6.46, unit: 'ms', tolerance: 0.02,
    hints: ['Fibre: \\(t = n\\,d/c\\).', 'Each 25° slant leg is 1,123.4 km long and covers \\(\\lambda = 8.451^\\circ\\) of ground; the arc at radius 6,928 km covers what is left of the 0.8743 rad central angle.'],
    solution: 'Fibre: \\(1.47\\times5.5765\\times10^6/c = 27.34\\) ms. Space: legs \\(2\\times1123.4 = 2246.8\\) km; remaining angle \\(0.8743 - 2(0.14750) = 0.5793\\) rad, arc \\(6928.1\\times0.5793 = 4013.6\\) km; total 6,260 km \\(\\Rightarrow 20.88\\) ms. Saving \\(= 6.46\\) ms one way (≈13 ms round trip). Real fibre routes are longer than the great circle and laser paths zig-zag between discrete satellites, so both numbers are lower bounds; the router in the lab above finds ≈21–22 ms.',
  },
  {
    id: 'starlink-8', title: 'Argon for orbit raising', tags: ['propulsion', 'starlink'], difficulty: 2,
    prompt: 'An 800 kg satellite (est.) is released at 290 km (est.) and spirals up to 550 km with an argon Hall thruster of \\(I_{sp} = 2500\\) s (est.). Treating the slow spiral as a sequence of near-circular orbits, how much propellant does it burn, in kg?',
    answer: 4.765, unit: 'kg', tolerance: 0.01,
    hints: ['For a slow tangential-thrust spiral between circular orbits with no plane change, \\(\\Delta v \\approx |v_1 - v_2|\\) (Edelbaum).', 'Then the rocket equation: \\(m_p = m_0(1 - e^{-\\Delta v/(I_{sp}g_0)})\\).'],
    solution: '\\(v_1 = \\sqrt{\\mu/6668.1\\ \\text{km}} = 7731.6\\) m/s, \\(v_2 = 7585.1\\) m/s, so \\(\\Delta v = 146.5\\) m/s (a Hohmann transfer would need almost the same here). \\(m_p = 800(1 - e^{-146.5/24517}) = 4.76\\) kg. At 170 mN the spiral takes \\(m\\Delta v/F = 800\\times146.5/0.17\\) s \\(\\approx 8\\) days of continuous thrusting; in practice it takes weeks because thrusting pauses for eclipse and phasing. Low insertion is a safety feature: a satellite that fails at 290 km re-enters within days.',
  },
  {
    id: 'starlink-9', title: 'How many satellites for continuous coverage?', tags: ['starlink', 'orbits'], difficulty: 3,
    prompt: 'Derive a lower bound on the number of satellites needed so every point on Earth always sees at least one satellite above 25° elevation at 550 km. Assume the footprints can be arranged as perfectly as a honeycomb (the inscribed hexagons tile the sphere) and ignore the curvature of the hexagons. Give the number.',
    answer: 223, unit: 'satellites', tolerance: 0.01,
    hints: ['A footprint is a spherical cap of area \\(2\\pi R^2(1-\\cos\\lambda)\\), so it covers the fraction \\((1-\\cos\\lambda)/2\\) of the sphere.', 'Circles can’t tile without overlap; the largest tile inside a circle that does tile is the regular hexagon, with area \\(\\tfrac{3\\sqrt3}{2\\pi} = 0.827\\) of the circle.'],
    solution: 'From exercise 2, \\(\\lambda = 8.451^\\circ\\), so \\(1-\\cos\\lambda = 0.010858\\) and one cap covers 0.5429% of the sphere. Each satellite effectively owns only its hexagon, \\(0.827\\) of that. $$N \\ge \\frac{2}{0.827\\,(1-\\cos\\lambda)} = 222.7 \\to 223.$$ Orbits can’t hold a static honeycomb, and the inclined shells waste footprints near their turning latitudes, so real coverage needs several times this. Starlink flies thousands because it is <em>capacity</em>-limited (users per beam), not coverage-limited, and it puts most satellites where people live (see the visible-count plot).',
  },
];
