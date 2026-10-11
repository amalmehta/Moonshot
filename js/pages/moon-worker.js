// Web Worker for the Moon Mission page: runs the trajectory planning and the Apollo comparison
// (a few hundred numerical integrations, ~0.5–1 s each) off the main thread so the page never freezes.
import { planTLI, poweredDescent, ascent, deorbit, patchedConic } from '../physics/moon.js';
import checks from '../validation/moon.js';

export function computePlan({ parkingAlt, periseleneAlt, isp = 370, ascentTW = 2 }) {
  const tli = planTLI({ parkingAlt, periseleneAlt, mode: 'freeReturn', returnPerigeeAlt: 60e3 });
  const deorb = deorbit(periseleneAlt, 15e3);
  const desc = poweredDescent({ h: 15e3, lloAlt: periseleneAlt, isp });
  const asc = ascent({ targetAlt: periseleneAlt, isp, tw: ascentTW });
  const pc = patchedConic({ parkingAlt, periseleneAlt });
  return { tli, deorb, desc, asc, pc };
}

export function computeChecks() {
  return { rows: checks(), pc: patchedConic({ parkingAlt: 190e3, periseleneAlt: 110e3 }), deorb: deorbit(110e3, 15e3) };
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = (e) => {
    const { id, type, params } = e.data;
    try {
      const t0 = performance.now();
      const result = type === 'checks' ? computeChecks() : computePlan(params);
      result.ms = performance.now() - t0;
      self.postMessage({ id, type, result });
    } catch (err) {
      self.postMessage({ id, type, error: String(err?.message || err) });
    }
  };
}
