// Exercises for the Moon Mission section. Answers computed with js/physics (see the solution
// working); constants: μ⊕ = 3.986004418×10¹⁴ m³/s², μ☾ = 4.9048695×10¹² m³/s², R⊕ = 6378.137 km,
// R☾ = 1737.4 km, Earth–Moon distance a = 384,400 km, g₀ = 9.80665 m/s².
export default [
  {
    id: 'moon-1',
    title: 'Where does the Moon take over?',
    tags: ['moon', 'orbits'],
    difficulty: 1,
    prompt: `Laplace's sphere of influence of a small body of mass \\(m\\) orbiting a big one of mass \\(M\\) at distance \\(a\\) is
      $$ r_\\text{SOI} = a\\left(\\frac{m}{M}\\right)^{2/5}. $$
      Using \\(m/M = \\mu_\\mathrm{M}/\\mu_\\mathrm{E} = 0.012305\\) and \\(a = 384{,}400\\) km, how big is the Moon's sphere of influence (in km)?`,
    answer: 66194, unit: 'km', tolerance: 0.01,
    hints: ['\\(0.012305^{0.4} = e^{0.4\\ln 0.012305}\\).', '\\(\\ln 0.012305 \\approx -4.398\\), so the factor is \\(e^{-1.759} \\approx 0.1722\\).'],
    solution: `\\((m/M)^{2/5} = 0.012305^{0.4} = e^{0.4\\times(-4.3978)} = 0.17220\\), so
      \\(r_\\text{SOI} = 384{,}400 \\times 0.17220 \\approx 66{,}190\\) km, about a sixth of the way from the Moon to Earth.
      Inside this sphere it is more accurate to treat the Moon as the main attractor and Earth as the perturbation; outside, the reverse.`,
  },
  {
    id: 'moon-2',
    title: 'Orbital speed at 100 km above the Moon',
    tags: ['moon', 'orbits'],
    difficulty: 1,
    prompt: `What is the circular orbit speed 100 km above the Moon's mean surface (\\(R_\\mathrm{M} = 1737.4\\) km, \\(\\mu_\\mathrm{M} = 4.9049\\times10^{12}\\) m³/s²)? Give m/s.`,
    answer: 1633.8, unit: 'm/s', tolerance: 0.005,
    hints: ['Circular orbit: gravity supplies the centripetal force, \\(v^2/r = \\mu/r^2\\).', 'Use \\(r = R_\\mathrm{M} + 100\\text{ km} = 1.8374\\times10^6\\) m.'],
    solution: `\\(v_c = \\sqrt{\\mu_\\mathrm{M}/r} = \\sqrt{4.9049\\times10^{12} / 1.8374\\times10^{6}} = \\sqrt{2.6694\\times10^{6}} \\approx 1633.8\\) m/s,
      under a fifth of the 7.8 km/s needed in low Earth orbit. The local escape speed is \\(\\sqrt2\\,v_c \\approx 2311\\) m/s.`,
  },
  {
    id: 'moon-3',
    title: 'Why TLI is about 3.1 km/s',
    tags: ['moon', 'orbits', 'mission'],
    difficulty: 2,
    prompt: `A ship is in a circular 200 km parking orbit (\\(r_1 = 6578.137\\) km). Treat the Moon's distance as \\(r_2 = 384{,}400\\) km and ignore the Moon's gravity.
      What tangential burn puts the ship on an ellipse with perigee \\(r_1\\) and apogee \\(r_2\\) (the first burn of a Hohmann transfer)? Give m/s.`,
    answer: 3131.3, unit: 'm/s', tolerance: 0.005,
    hints: ['Semi-major axis \\(a = (r_1 + r_2)/2\\); then use vis-viva \\(v^2 = \\mu(2/r - 1/a)\\) at \\(r_1\\).', 'Subtract the circular speed \\(\\sqrt{\\mu/r_1} = 7784.3\\) m/s.'],
    solution: `\\(a = (6578.137 + 384{,}400)/2 = 195{,}489\\) km.
      Perigee speed \\(v_p = \\sqrt{\\mu_\\mathrm{E}(2/r_1 - 1/a)} = 10{,}915.6\\) m/s. Circular speed \\(v_c = 7784.3\\) m/s.
      \\(\\Delta v = 10{,}915.6 - 7784.3 \\approx 3131\\) m/s. The ship needs \\(v_p\\) only about 93 m/s short of the local escape speed
      (11,009 m/s): reaching the Moon is almost escaping Earth, which is why TLI is so close to 3.1–3.2 km/s whatever the details.`,
  },
  {
    id: 'moon-4',
    title: 'The slow way: Hohmann transfer time',
    tags: ['moon', 'orbits'],
    difficulty: 1,
    prompt: `How long does the Hohmann ellipse of the previous exercise take from perigee to apogee? Give days.`,
    answer: 4.978, unit: 'days', tolerance: 0.01,
    hints: ['Half of the ellipse period: \\(t = \\pi\\sqrt{a^3/\\mu_\\mathrm{E}}\\).'],
    solution: `\\(t = \\pi\\sqrt{(1.95489\\times10^8)^3 / 3.986\\times10^{14}} = 430{,}095\\) s \\(\\approx 4.98\\) days.
      Apollo took about 3 days: it burned a little harder (≈3.18 km/s), which shortens the trip a lot because the ship
      lingers near apogee on the minimum-energy ellipse. The integrator on this page finds a ~2.9-day free-return coast for ~3.16 km/s.`,
  },
  {
    id: 'moon-5',
    title: 'Braking into lunar orbit',
    tags: ['moon', 'orbits', 'mission'],
    difficulty: 2,
    prompt: `A ship arrives at the Moon's sphere of influence with hyperbolic excess speed \\(v_\\infty = 840\\) m/s and its hyperbola is aimed for a periselene 100 km up.
      What single retrograde burn at periselene circularizes the orbit there? Give m/s.`,
    answer: 824.7, unit: 'm/s', tolerance: 0.01,
    hints: ['Energy on the hyperbola: \\(v_p^2 = v_\\infty^2 + 2\\mu_\\mathrm{M}/r_p\\).', 'Then subtract the circular speed at \\(r_p\\) (1633.8 m/s from exercise 2).'],
    solution: `\\(2\\mu_\\mathrm{M}/r_p = 5.339\\times10^6\\) m²/s², so \\(v_p = \\sqrt{840^2 + 5.339\\times10^6} = 2458.6\\) m/s.
      \\(\\Delta v_\\text{LOI} = 2458.6 - 1633.8 \\approx 825\\) m/s. Apollo 11 used 889 m/s into a 113 × 314 km ellipse and then 48 m/s to
      trim it: 937 m/s in total, because it arrived faster (a 3-day trip has a larger \\(v_\\infty\\) than a Hohmann transfer).`,
  },
  {
    id: 'moon-6',
    title: 'Propellant for a lunar landing',
    tags: ['moon', 'propulsion'],
    difficulty: 2,
    prompt: `A lander weighs 15,000 kg when it starts its powered descent. Its engine has \\(I_{sp} = 311\\) s and the descent needs \\(\\Delta v = 2040\\) m/s.
      How much propellant (kg) does it burn?`,
    answer: 7316, unit: 'kg', tolerance: 0.01,
    hints: ['Rocket equation from the start mass: \\(m_p = m_0\\,(1 - e^{-\\Delta v / v_e})\\).', '\\(v_e = I_{sp} g_0 = 3049.9\\) m/s.'],
    solution: `\\(\\Delta v/v_e = 2040/3049.9 = 0.6689\\), \\(e^{-0.6689} = 0.5123\\), so \\(m_p = 15{,}000\\times(1-0.5123) \\approx 7316\\) kg:
      almost half the lander is descent propellant. (Apollo's LM descent stage carried about 8.2 t of propellant for a ~15 t vehicle.)`,
  },
  {
    id: 'moon-7',
    title: 'Counting tanker flights',
    tags: ['moon', 'mission', 'reuse'],
    difficulty: 2,
    prompt: `A lander must leave low Earth orbit with 1,070 t of propellant. It arrives in orbit with 130 t left from its own launch, and each tanker flight delivers 120 t.
      Ignoring boil-off, how many tanker flights are needed (a whole number)?`,
    answer: 8, unit: 'flights', tolerance: 0,
    hints: ['The shortfall is 1,070 − 130 t.', 'You can\'t fly a fraction of a tanker: round up.'],
    solution: `Shortfall \\(= 1070 - 130 = 940\\) t; \\(940/120 = 7.83\\), so 8 flights. With boil-off the early deliveries shrink while
      the later tankers fly, so slow launch cadence can add a flight or two; the planner on this page models that.`,
  },
  {
    id: 'moon-8',
    title: 'Boil-off while you wait',
    tags: ['moon', 'thermal'],
    difficulty: 1,
    prompt: `A depot holds 1,000 t of cryogenic propellant that boils off at 0.3 % per day (of what is left). How much is lost over a 40-day refilling campaign (t)?`,
    answer: 113.2, unit: 't', tolerance: 0.01,
    hints: ['Compound loss: what remains after \\(d\\) days is \\(m_0(1-b)^d\\).'],
    solution: `Remaining: \\(1000\\times 0.997^{40} = 1000\\times e^{40\\ln 0.997} = 886.8\\) t, so about 113 t is lost: roughly one whole tanker flight.
      This is why cadence and insulation matter as much as tanker size.`,
  },
  {
    id: 'moon-9',
    title: 'Derive the Oberth effect',
    tags: ['moon', 'orbits', 'propulsion'],
    difficulty: 3,
    prompt: `A ship moving at speed \\(v_0\\) at a point where the local escape speed is \\(v_\\text{esc}\\) makes an instantaneous burn \\(\\Delta v\\) along its velocity.
      Using conservation of energy, derive its speed far from the planet, \\(v_\\infty\\). Then evaluate it for a 3.4 km/s burn from a 200 km circular orbit
      (\\(v_0 = 7784\\) m/s, \\(v_\\text{esc} = 11{,}009\\) m/s), and compare it with the same burn made far from Earth.`,
    hints: ['Specific energy after the burn: \\(\\varepsilon = \\tfrac12 (v_0+\\Delta v)^2 - \\mu/r\\), and \\(\\mu/r = \\tfrac12 v_\\text{esc}^2\\).', 'Far away the potential energy is zero, so \\(\\varepsilon = \\tfrac12 v_\\infty^2\\).'],
    solution: `Energy is conserved after the burn: \\(\\tfrac12 v_\\infty^2 = \\tfrac12(v_0+\\Delta v)^2 - \\tfrac12 v_\\text{esc}^2\\), so
      $$ v_\\infty = \\sqrt{(v_0+\\Delta v)^2 - v_\\text{esc}^2}. $$
      Numbers: \\(v_0+\\Delta v = 11{,}184\\) m/s, \\(v_\\infty = \\sqrt{11{,}184^2 - 11{,}009^2} \\approx 1974\\) m/s.
      Escape alone needs \\(\\Delta v = 11{,}009 - 7784 = 3225\\) m/s, so the last 175 m/s of this burn raised \\(v_\\infty\\) from 0 to almost 2 km/s:
      the same 175 m/s spent far from Earth would add just 175 m/s. Kinetic energy grows as
      \\(v\\,\\Delta v\\), so a burn is worth most where the ship is fastest: deep in the gravity well, at perigee.`,
  },
];
