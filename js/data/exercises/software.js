// Exercises for the software section (flight software, GNC, reliability). Every numeric answer was
// computed with js/physics/gnc.js and js/physics/reliability.js. Shape documented in js/common.js.
export default [
  {
    id: 'software-1', title: 'One Kalman update', tags: ['gnc'], difficulty: 1,
    prompt: `Integrating the IMU predicts the booster's altitude as \\(\\hat z^- = 1000\\) m with standard deviation 4 m. The radar altimeter then reads \\(z = 1005\\) m with standard deviation 3 m. What is the fused (posterior) altitude estimate?`,
    answer: 1003.2, unit: 'm', tolerance: 0.0005,
    hints: ['The Kalman gain for a scalar is \\(K = P^-/(P^- + R)\\), with variances, not standard deviations.', '\\(P^- = 16\\), \\(R = 9\\).'],
    solution: `\\(K = 16/(16+9) = 0.64\\). Then \\(\\hat z^+ = \\hat z^- + K(z - \\hat z^-) = 1000 + 0.64 \\times 5 = 1003.2\\) m.
      The posterior variance is \\((1-K)P^- = 0.36 \\times 16 = 5.76\\ \\text{m}^2\\), i.e. σ = 2.4 m: smaller than either source alone. The filter trusts the more certain source more (here the altimeter, so K > ½).`,
  },
  {
    id: 'software-2', title: 'Nine engines, one may fail', tags: ['reliability', 'engines'], difficulty: 1,
    prompt: `Suppose each of nine first-stage engines independently completes the ascent burn with probability \\(R = 0.995\\). The vehicle can still reach orbit if at most one engine shuts down. What is the probability of a successful ascent (as far as engines are concerned)?`,
    answer: 0.99912, unit: '', tolerance: 0.00002,
    hints: ['Success = 9 work, or exactly 8 work.', '\\(P = R^9 + 9R^8(1-R)\\).'],
    solution: `\\(R^9 = 0.95589\\) and \\(9R^8(1-R) = 9 \\times 0.96069 \\times 0.005 = 0.04323\\). Sum: <strong>0.99912</strong>.
      Without engine-out capability you would need all nine: 0.9559. Tolerating one failure cuts the loss probability from 4.4% to 0.09%, a factor of about 50. This assumes failures are independent; an engine that fails explosively and damages its neighbour breaks the assumption, which is why engine bays have shielding between engines.`,
  },
  {
    id: 'software-3', title: 'Triple modular redundancy', tags: ['reliability', 'software'], difficulty: 2,
    prompt: `A single flight computer survives a mission with probability \\(R = 0.99\\). Three identical computers vote (2-of-3, perfect voter). What is the probability that the voted system fails?`,
    answer: 2.98e-4, unit: '', tolerance: 0.005,
    hints: ['The system works if at least two of three work: \\(R_{TMR} = R^3 + 3R^2(1-R) = 3R^2 - 2R^3\\).', 'Failure probability = \\(1 - R_{TMR}\\) ≈ \\(3(1-R)^2\\) for R close to 1.'],
    solution: `\\(R_{TMR} = 3(0.99)^2 - 2(0.99)^3 = 2.9403 - 1.940598 = 0.999702\\), so the failure probability is <strong>2.98 × 10⁻⁴</strong>, about 34 times smaller than the single computer's 0.01.
      The approximation \\(1 - R_{TMR} \\approx 3(1-R)^2 = 3 \\times 10^{-4}\\) shows why: the system needs two independent failures. But if \\(R < 0.5\\), \\(3R^2 - 2R^3 < R\\) and TMR is <em>worse</em> than one computer, because there are more parts that can fail.`,
  },
  {
    id: 'software-4', title: 'When to light the engine', tags: ['gnc', 'propulsion'], difficulty: 1,
    prompt: `A booster falls vertically at 250 m/s. Its engine, once lit, gives a constant thrust acceleration of 24 m/s² (ignore drag and the mass change; g = 9.81 m/s²). At what altitude must it light so that it reaches zero speed exactly at the ground?`,
    answer: 2202.3, unit: 'm', tolerance: 0.003,
    hints: ['Net deceleration = thrust acceleration − g.', 'Constant deceleration a from speed v to rest covers \\(h = v^2/(2a)\\).'],
    solution: `Net deceleration \\(a = 24 - 9.81 = 14.19\\) m/s². \\(h = v^2/(2a) = 62{,}500/28.38 = \\) <strong>2202 m</strong>, and the burn lasts \\(v/a = 17.6\\) s.
      Light 0.5 s late and the booster is 125 m lower when it starts braking with nothing in reserve at full thrust. Real guidance therefore plans the burn at part throttle so it can brake harder if needed, and re-solves the problem many times per second.`,
  },
  {
    id: 'software-5', title: 'Why a Falcon 9 cannot hover', tags: ['gnc', 'engines'], difficulty: 1,
    prompt: `One Merlin 1D gives 845 kN at sea level and can throttle down to about 40% (est.). Near touchdown the booster's mass is about 28 t. What is its thrust-to-weight ratio at minimum throttle? (g = 9.80665 m/s²)`,
    answer: 1.231, unit: '', tolerance: 0.003,
    hints: ['T/W = (0.40 × 845 kN)/(m g).'],
    solution: `\\(T_{min} = 0.40 \\times 845 = 338\\) kN; weight = 28,000 × 9.80665 = 274.6 kN; T/W = <strong>1.23</strong>.
      Since T/W > 1 even at minimum throttle, the booster accelerates <em>upward</em> if it reaches zero speed above the deck: it cannot hover. It must reach zero velocity at zero altitude (the "hoverslam"). Hovering would need a mass above 338,000/9.80665 ≈ 34.5 t, which the booster only has early in the landing burn while it still carries propellant.`,
  },
  {
    id: 'software-6', title: 'ZEM/ZEV command', tags: ['gnc'], difficulty: 2,
    prompt: `A lander is at \\(\\mathbf r = (40, 500)\\) m (downrange, altitude) moving at \\(\\mathbf v = (-2, -60)\\) m/s, with \\(t_{go} = 12\\) s to go and \\(\\mathbf g = (0, -9.81)\\) m/s². Targeting rest at the origin, compute the vertical component of the ZEM/ZEV control acceleration \\(\\mathbf a = 6\\,\\mathrm{ZEM}/t_{go}^2 - 2\\,\\mathrm{ZEV}/t_{go}\\).`,
    answer: 8.9767, unit: 'm/s²', tolerance: 0.002,
    hints: ['\\(\\mathrm{ZEM} = \\mathbf r_f - (\\mathbf r + \\mathbf v t_{go} + \\tfrac12 \\mathbf g t_{go}^2)\\), \\(\\mathrm{ZEV} = \\mathbf v_f - (\\mathbf v + \\mathbf g t_{go})\\).', 'Vertical: \\(\\mathrm{ZEM}_z = -(500 - 720 - 706.32) = 926.32\\) m.'],
    solution: `Vertical: \\(\\mathrm{ZEM}_z = 0 - (500 - 60 \\cdot 12 - \\tfrac12 \\cdot 9.81 \\cdot 144) = 926.32\\) m, \\(\\mathrm{ZEV}_z = 0 - (-60 - 117.72) = 177.72\\) m/s.
      \\(a_z = 6 \\cdot 926.32/144 - 2 \\cdot 177.72/12 = 38.597 - 29.62 = \\) <strong>8.98 m/s²</strong>. Gravity is already accounted for inside ZEM and ZEV, so this is the whole thrust acceleration the engine must supply.
      Horizontal: \\(\\mathrm{ZEM}_x = -(40 - 24) = -16\\), \\(\\mathrm{ZEV}_x = 2\\), \\(a_x = -0.667 - 0.333 = -1.0\\) m/s². Thrust tilt = atan(1.0/8.98) ≈ 6.4°.`,
  },
  {
    id: 'software-7', title: 'Aliasing a bending mode', tags: ['gnc', 'software'], difficulty: 2,
    prompt: `A rocket's first structural bending mode vibrates at 5 Hz and shows up in the rate-gyro signal. If the flight computer samples the gyro at 8 Hz without an anti-aliasing filter, at what apparent frequency does the bending mode appear in the sampled data?`,
    answer: 3, unit: 'Hz', tolerance: 0.001,
    hints: ['Sampling at \\(f_s\\) folds any frequency above \\(f_s/2\\) back into \\([0, f_s/2]\\).', 'Alias = \\(|f - k f_s|\\) for the integer k that lands it in range.'],
    solution: `Nyquist frequency \\(f_s/2 = 4\\) Hz < 5 Hz, so the mode aliases to \\(|5 - 8| = \\) <strong>3 Hz</strong>, right where a rigid-body attitude loop with ~1–2 Hz bandwidth would try to "correct" it, pumping energy into the structure.
      Cures: sample much faster than twice the highest frequency present (GNC loops run at tens to hundreds of Hz), low-pass filter before sampling, and put notch filters on known bending modes. The exact rates SpaceX uses are not public.`,
  },
  {
    id: 'software-8', title: '33 engines vs 9', tags: ['reliability', 'engines'], difficulty: 2,
    prompt: `Each engine fails during ascent with probability \\(p = 0.003\\), independently. A 33-engine booster can tolerate up to 2 failed engines. What is the probability of losing the ascent (3 or more failures)?`,
    answer: 1.377e-4, unit: '', tolerance: 0.01,
    hints: ['P(loss) = 1 − [P(0) + P(1) + P(2)], each a binomial term \\(\\binom{33}{j}p^j(1-p)^{33-j}\\).', 'Or, since p is small, P(loss) ≈ P(exactly 3) = \\(\\binom{33}{3}p^3(1-p)^{30}\\).'],
    solution: `\\(P(0) = 0.997^{33} = 0.90561\\), \\(P(1) = 33p(1-p)^{32} = 0.08992\\), \\(P(2) = 528p^2(1-p)^{31} = 0.004330\\). Sum = 0.99986, so P(loss) = <strong>1.38 × 10⁻⁴</strong>.
      Compare nine engines tolerating one: 3.2 × 10⁻⁴. More engines means more failures (P(at least one) is 9.4% for 33 vs 2.7% for 9), so the design only pays off if engine-out tolerance grows with engine count, and only while failures stay independent.`,
  },
  {
    id: 'software-9', title: 'Derive ZEM/ZEV from optimal control', tags: ['gnc'], difficulty: 3,
    prompt: `For \\(\\dot{\\mathbf r} = \\mathbf v\\), \\(\\dot{\\mathbf v} = \\mathbf u + \\mathbf g\\) (constant g), minimise \\(J = \\tfrac12\\int_t^{t_f} |\\mathbf u|^2\\,d\\tau\\) subject to fixed \\(\\mathbf r(t_f) = \\mathbf r_f\\), \\(\\mathbf v(t_f) = \\mathbf v_f\\). Show that the optimal control at the current time is \\(\\mathbf u = 6\\,\\mathrm{ZEM}/t_{go}^2 - 2\\,\\mathrm{ZEV}/t_{go}\\).`,
    hints: ['Hamiltonian \\(H = \\tfrac12|\\mathbf u|^2 + \\boldsymbol\\lambda_r\\cdot\\mathbf v + \\boldsymbol\\lambda_v\\cdot(\\mathbf u + \\mathbf g)\\). The costates give \\(\\dot{\\boldsymbol\\lambda}_r = 0\\), \\(\\dot{\\boldsymbol\\lambda}_v = -\\boldsymbol\\lambda_r\\), so \\(\\mathbf u = -\\boldsymbol\\lambda_v\\) is linear in time.', 'Write \\(\\mathbf u(\\tau) = \\mathbf c_0 + \\mathbf c_1 (\\tau - t)\\), integrate twice over \\(t_{go}\\), and match the two terminal conditions.'],
    solution: `With \\(s = \\tau - t\\) and \\(\\mathbf u = \\mathbf c_0 + \\mathbf c_1 s\\): the extra velocity the control must add is \\(\\mathbf c_0 T + \\mathbf c_1 T^2/2 = \\mathrm{ZEV}\\) and the extra position is \\(\\mathbf c_0 T^2/2 + \\mathbf c_1 T^3/6 = \\mathrm{ZEM}\\) (T = t_go), because ZEM and ZEV are exactly the misses if u = 0 from now on.
      Solving the 2×2 system: \\(\\mathbf c_1 = (6\\,\\mathrm{ZEV}\\,T - 12\\,\\mathrm{ZEM})/T^3\\) and \\(\\mathbf c_0 = 6\\,\\mathrm{ZEM}/T^2 - 2\\,\\mathrm{ZEV}/T\\). The command applied now is \\(\\mathbf u(t) = \\mathbf c_0\\). Recomputing it every cycle turns the open-loop optimum into a feedback law. The minimum cost is \\(J = 6|\\mathrm{ZEM}|^2/T^3 - 6\\,\\mathrm{ZEM}\\cdot\\mathrm{ZEV}/T^2 + 2|\\mathrm{ZEV}|^2/T\\) (the code checks the simulated effort against this).`,
  },
];
