// Background thread for the landing Monte Carlo (keeps the page responsive).
import { monteCarloLandings } from '../physics/gnc.js';

self.onmessage = e => {
  const opts = e.data;
  const all = [];
  const chunk = 10;
  for (let i = 0; i < opts.n; i += chunk) {
    all.push(...monteCarloLandings({ ...opts, start: i, count: chunk }));
    self.postMessage({ progress: all.length / opts.n });
  }
  self.postMessage({ done: all });
};
