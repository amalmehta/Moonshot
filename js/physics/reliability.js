// Reliability math for redundant systems. Pure module (no DOM).
// Assumption throughout unless stated: failures are independent. Real systems also have
// common-cause failures (one engine's failure damaging its neighbours, a shared software bug),
// which these formulas do NOT capture and which usually dominate once redundancy is added.

/** Binomial coefficient C(n, k), exact for the sizes used here (n ≤ ~1000). */
export function binom(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let c = 1;
  for (let i = 1; i <= k; i++) c = c * (n - k + i) / i;
  return c;
}
/** P(exactly j of n independent units work), each working with probability R. */
export const binomPmf = (n, j, R) => binom(n, j) * R ** j * (1 - R) ** (n - j);
/** k-of-n reliability: P(at least k of n units work). */
export function kOfN(k, n, R) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let s = 0;
  for (let j = k; j <= n; j++) s += binomPmf(n, j, R);
  return Math.min(1, s);
}
/** Triple modular redundancy with a perfect voter: 2-of-3 = 3R² − 2R³. */
export const tmr = R => 3 * R * R - 2 * R ** 3;
/** TMR including the voter's own reliability Rv (the voter is a single point of failure). */
export const tmrWithVoter = (R, Rv) => Rv * tmr(R);
/** Series system: all must work. */
export const series = Rs => Rs.reduce((p, r) => p * r, 1);
/** Parallel system: at least one works. */
export const parallel = Rs => 1 - Rs.reduce((p, r) => p * (1 - r), 1);
/** Exponential (constant failure rate λ) reliability at time t. */
export const expReliability = (lambda, t) => Math.exp(-lambda * t);
/**
 * Mean time to failure of TMR with exponential units: ∫(3e^{−2λt} − 2e^{−3λt})dt = 5/(6λ)
 * — LOWER than a single unit's 1/λ, even though TMR is far better for short missions.
 */
export const tmrMTTF = lambda => 5 / (6 * lambda);
/** Value of R below which TMR is worse than a single unit (3R² − 2R³ = R ⇒ R = ½). */
export const TMR_CROSSOVER = 0.5;

/**
 * Engine-out capability. nEngines each fail independently with probability pFail during the burn;
 * the mission survives if at most `tolerated` engines fail. Returns P(success).
 */
export const engineOutSuccess = (nEngines, tolerated, pFail) => kOfN(nEngines - tolerated, nEngines, 1 - pFail);
/** Probability that at least one of n engines fails (what engine-out protects against). */
export const anyFailure = (n, pFail) => 1 - (1 - pFail) ** n;

// ---------------------------------------------------------------------------
// Voting logic (bit level), as used by the fault-injection demo.
/** Bitwise 2-of-3 majority of three 32-bit words. */
export const majority3 = (a, b, c) => ((a & b) | (b & c) | (a & c)) >>> 0;
/** Flip bit `bit` of a 32-bit word. */
export const flipBit = (x, bit) => (x ^ (1 << bit)) >>> 0;

/**
 * Redundant flight computers, each a "string" of two cores computing the same command.
 * strings: [{ core1, core2, alive }] — returns what each string outputs (null = it fell silent
 * because its cores disagreed: the self-check) and the final command from the voter.
 * Voter rule: majority of the strings still talking; with two left they must agree; with one, use it.
 */
export function redundantVote(strings) {
  const outputs = strings.map(s => (s.alive === false ? null : (s.core1 === s.core2 ? s.core1 >>> 0 : null)));
  const live = outputs.filter(v => v !== null);
  let command = null, status;
  if (live.length === 3) {
    command = majority3(live[0], live[1], live[2]);
    const agree = live.filter(v => v === command).length;
    status = agree === 3 ? 'all three agree' : 'outvoted one string';
  } else if (live.length === 2) {
    if (live[0] === live[1]) { command = live[0]; status = 'two strings agree'; } else status = 'two strings disagree: no safe command';
  } else if (live.length === 1) { command = live[0]; status = 'single string left (no redundancy)'; } else status = 'all strings silent';
  return { outputs, command, status };
}

/** P(a TMR set of dual-core strings fails) given per-core upset probability q, independent:
 *  a string is "good" (cores agree and are correct) w.p. (1−q)²; we need ≥ 2 good strings for a
 *  majority, or the remaining ones to still agree. Conservative: success = P(≥2 good strings). */
export const dualCoreTmrSuccess = q => kOfN(2, 3, (1 - q) ** 2);
