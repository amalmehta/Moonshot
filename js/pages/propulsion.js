// Propulsion page: rocket-equation explorer, nozzle lab, turbopump power balance.
import { renderExercises, bindRange, fmt, cssVar, onSettings, $ } from '../common.js';
import { linePlot } from '../plot.js';
import { deltaV } from '../physics/rocket.js';
import { enginePerformance, PROPELLANTS, bulkDensity, machFromAreaRatio } from '../physics/engine.js';
import { atmosphere } from '../physics/atmosphere.js';
import { ENGINES, SOURCES } from '../data/vehicles.js';
import exercises from '../data/exercises/propulsion.js';

// ---------- propellant table ----------
const PROP_ROWS = [
  ['kerolox', 'Falcon 9 (Merlin)', 'Dense, storable fuel, mature; but cokes'],
  ['methalox', 'Starship (Raptor)', 'Clean, reusable, Mars-makeable'],
  ['hydrolox', 'Shuttle main engines, SLS, Centaur', 'Highest Isp, but bulky and leaky'],
];
const typicalVacIsp = { kerolox: '~311–348 s', methalox: '~350–380 s', hydrolox: '~450–465 s' };
$('#prop-table').innerHTML = PROP_ROWS.map(([k, used, why]) => {
  const p = PROPELLANTS[k];
  return `<tr><td>${p.name}</td><td class="num">${p.of}</td><td class="num">${fmt(p.Tc, 4)}</td><td class="num">${fmt(bulkDensity(p), 3)}</td><td class="num">${typicalVacIsp[k]}</td><td>${used}</td><td>${why}</td></tr>`;
}).join('');

// ---------- rocket equation explorer ----------
const reIsp = $('#re-isp'), reMr = $('#re-mr');
const mrs = Array.from({ length: 120 }, (_, i) => 1 + i * 0.2);
const ISP_REF = [['Kerolox 311 s', 311], ['Methalox 380 s', 380], ['Hydrolox 452 s', 452]];
const rePlot = linePlot($('#re-plot'), {
  xLabel: 'Mass ratio m₀ / m_f', yLabel: 'Δv (km/s)', yMin: 0,
  series: [], hLines: [{ y: 9.4, label: 'LEO incl. losses ≈ 9.4 km/s' }],
});
function updateRocket() {
  const isp = +reIsp.value, mr = +reMr.value;
  const dv = deltaV(isp, mr, 1);
  $('#re-dv').textContent = fmt(dv, 4);
  $('#re-pf').textContent = (100 * (1 - 1 / mr)).toFixed(1) + ' %';
  rePlot.update({
    series: [
      ...ISP_REF.map(([name, i]) => ({ name, x: mrs, y: mrs.map(m => deltaV(i, m, 1) / 1000) })),
      { name: `Your engine (${isp} s)`, x: mrs, y: mrs.map(m => deltaV(isp, m, 1) / 1000), dash: [5, 4], color: cssVar('--fg-muted') },
      { name: '', x: [mr], y: [dv / 1000], points: true, radius: 6, color: cssVar('--accent') },
    ],
  });
}
bindRange('re-isp', updateRocket, v => v + ' s');
bindRange('re-mr', updateRocket, v => v.toFixed(1));
updateRocket();
onSettings(updateRocket);

// ---------- nozzle lab ----------
const engSel = $('#nz-engine');
engSel.innerHTML = Object.entries(ENGINES).map(([k, e]) => `<option value="${k}">${e.name} (${PROPELLANTS[e.prop].name})</option>`).join('');
const pcIn = $('#nz-pc'), epsIn = $('#nz-eps'), altIn = $('#nz-alt');
const nzPlot = linePlot($('#nz-plot'), { xLabel: 'Altitude (km)', yLabel: 'Isp (s)', series: [] });
const alts = Array.from({ length: 81 }, (_, i) => i);
const nozzleCanvas = $('#nozzle-canvas');

function currentEngine() {
  const base = ENGINES[engSel.value];
  return { ...base, pc: +pcIn.value * 1e6, eps: +epsIn.value, thrustVac: base.thrustVac ?? base.thrustSL * 1.07 };
}
function updateNozzle() {
  const e = currentEngine();
  const f = enginePerformance(e);
  const pa = atmosphere(+altIn.value * 1000).p;
  const p = f(pa);
  $('#nz-isp').textContent = fmt(p.isp, 4);
  $('#nz-thrust').textContent = fmt(p.thrust / 1000, 4);
  $('#nz-me').textContent = fmt(p.Me, 3);
  $('#nz-pe').textContent = fmt(p.pe / 1000, 3);
  const ratio = p.pe / Math.max(pa, 1e-9);
  let status;
  if (p.separated) status = `<span class="badge bad">Flow separation</span> <span class="small">p<sub>e</sub> = ${fmt(p.pe / 1000)} kPa is below 0.4 × ambient (${fmt(pa / 1000)} kPa). The jet peels off the wall and side-loads the nozzle. Shrink ε or raise p<sub>c</sub>.</span>`;
  else if (pa < 1) status = `<span class="badge good">Vacuum</span> <span class="small">No ambient pressure: bigger ε always helps (until the nozzle gets too heavy).</span>`;
  else if (ratio < 0.9) status = `<span class="badge warn">Over-expanded</span> <span class="small">p<sub>e</sub> &lt; p<sub>a</sub>: losing some pressure thrust, but attached.</span>`;
  else if (ratio > 1.1) status = `<span class="badge warn">Under-expanded</span> <span class="small">p<sub>e</sub> &gt; p<sub>a</sub>: a longer nozzle would extract more.</span>`;
  else status = `<span class="badge good">Optimally expanded</span> <span class="small">p<sub>e</sub> ≈ p<sub>a</sub>: maximum thrust at this altitude.</span>`;
  $('#nz-status').innerHTML = status;

  const isps = alts.map(a => f(atmosphere(a * 1000).p).isp);
  const sepAlt = alts.find(a => !f(atmosphere(a * 1000).p).separated);
  const series = [{ name: `${e.name}, ε = ${e.eps}`, x: alts, y: isps.map((v, i) => (alts[i] < (sepAlt ?? 0) ? NaN : v)) }];
  if (sepAlt > 0) series.push({ name: 'separated (unusable)', x: alts.filter(a => a <= sepAlt), y: isps.filter((_, i) => alts[i] <= sepAlt), dash: [3, 3], color: cssVar('--bad') });
  const rep = [];
  if (e.ispSL && Math.abs(+pcIn.value * 1e6 - ENGINES[engSel.value].pc) < 1 && +epsIn.value === ENGINES[engSel.value].eps) {
    rep.push({ name: 'Published Isp (sea level / vacuum)', x: [0, 80], y: [e.ispSL, e.ispVac], points: true, radius: 5, color: cssVar('--accent') });
  } else if (e.ispVac && Math.abs(+pcIn.value * 1e6 - ENGINES[engSel.value].pc) < 1 && +epsIn.value === ENGINES[engSel.value].eps) {
    rep.push({ name: 'Published vacuum Isp', x: [80], y: [e.ispVac], points: true, radius: 5, color: cssVar('--accent') });
  }
  nzPlot.update({ series: [...series, ...rep], vLines: [{ x: +altIn.value, label: 'you are here' }] });
  drawNozzle(e.eps, p.Me, PROPELLANTS[e.prop].gamma);
}

// Nozzle contour (conical-ish bell) coloured by local Mach number from the area–Mach relation.
function drawNozzle(eps, Me, g) {
  const c = nozzleCanvas, ctx = c.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = c.clientWidth, h = c.clientHeight;
  c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const cy = h / 2;
  const rt = Math.min(18, h / (2 * Math.sqrt(eps) + 2) * 1.6);
  const re = rt * Math.sqrt(eps);
  const scale = Math.min(1, (h / 2 - 10) / re);
  const Rt = rt * scale, Re = re * scale, Rc = Rt * 1.8;
  const x0 = 20, xThroat = x0 + 70, xExit = Math.min(w - 20, xThroat + Math.max(80, (Re - Rt) * 2.2));
  const radius = x => {
    if (x < x0 + 40) return Rc;
    if (x < xThroat) { const s = (x - x0 - 40) / (xThroat - x0 - 40); return Rc - (Rc - Rt) * (0.5 - 0.5 * Math.cos(Math.PI * s)); }
    const s = (x - xThroat) / (xExit - xThroat);
    return Rt + (Re - Rt) * Math.sin(s * Math.PI / 2) ** 0.8; // bell-like: steep start, flattening exit
  };
  for (let x = x0; x <= xExit; x += 2) {
    const rr = radius(x);
    let M;
    if (x < xThroat) M = machFromAreaRatio((rr / Rt) ** 2, g, false); else M = machFromAreaRatio((rr / Rt) ** 2, g, true);
    const hue = 30 + Math.min(1, M / Math.max(Me, 1)) * 210;
    ctx.fillStyle = `oklch(0.68 0.16 ${hue})`;
    ctx.fillRect(x, cy - rr, 2.5, 2 * rr);
  }
  ctx.strokeStyle = cssVar('--fg'); ctx.lineWidth = 2;
  for (const sgn of [-1, 1]) { ctx.beginPath(); for (let x = x0; x <= xExit; x += 2) { const y = cy + sgn * radius(x); x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); }
  ctx.fillStyle = cssVar('--fg-muted'); ctx.font = '11px ui-sans-serif, sans-serif'; ctx.textAlign = 'center';
  ctx.textAlign = 'left'; ctx.fillText('chamber (M ≈ 0)', x0, Math.max(12, cy - Rc - 8)); ctx.textAlign = 'center';
  ctx.fillText('throat, M = 1', xThroat, Math.min(h - 4, cy + Rc + 14));
  ctx.textAlign = 'right'; ctx.fillText(`exit, M = ${Me.toFixed(2)}`, xExit, 12);
}

engSel.addEventListener('change', () => {
  const e = ENGINES[engSel.value];
  pcIn.value = e.pc / 1e6; epsIn.value = e.eps;
  pcIn.dispatchEvent(new Event('input')); epsIn.dispatchEvent(new Event('input'));
});
bindRange('nz-pc', updateNozzle, v => v + ' MPa');
bindRange('nz-eps', updateNozzle, v => v.toFixed(0));
bindRange('nz-alt', updateNozzle, v => v + ' km');
updateNozzle();
new ResizeObserver(() => updateNozzle()).observe(nozzleCanvas);
onSettings(updateNozzle);

// ---------- turbopump power balance ----------
function updateCycle() {
  const mdot = +$('#cy-mdot').value, pc = +$('#cy-pc').value * 1e5, eta = +$('#cy-eta').value;
  const p = PROPELLANTS[$('#cy-prop').value];
  const dp = 1.5 * pc;
  const mOx = mdot * p.of / (1 + p.of), mF = mdot / (1 + p.of);
  const pOx = mOx * dp / (p.densityOx * eta), pF = mF * dp / (p.densityFuel * eta);
  const total = pOx + pF;
  // gas-generator turbine: Δh = cp·T_in·(1 − PR^−(γ−1)/γ)·η_t with cp≈2500 J/kgK, T_in≈1000 K, PR≈20, γ≈1.2, η_t≈0.7
  const dh = 2500 * 1000 * (1 - 20 ** (-0.2 / 1.2)) * 0.7;
  const ggFrac = total / dh / mdot;
  $('#cy-pox').textContent = fmt(pOx / 1e6, 3);
  $('#cy-pf').textContent = fmt(pF / 1e6, 3);
  $('#cy-ptot').textContent = fmt(total / 1e6, 3);
  $('#cy-gg').textContent = (100 * ggFrac).toFixed(1) + ' %';
  $('#cy-note').textContent = `${fmt(total / 1e6, 3)} MW ≈ ${fmt(total / 1e6 / 0.0007457 / 1000, 3)} thousand horsepower. In a gas-generator cycle ~${(100 * ggFrac).toFixed(1)} % of the propellant would be burned just to drive the pumps and thrown away at low velocity. ${ggFrac > 0.06 ? 'That’s why high-pressure engines must be staged-combustion.' : ''}`;
}
bindRange('cy-mdot', updateCycle, v => v + ' kg/s');
bindRange('cy-pc', updateCycle, v => v + ' bar');
bindRange('cy-eta', updateCycle, v => (v * 100).toFixed(0) + ' %');
$('#cy-prop').addEventListener('change', updateCycle);
updateCycle();

// ---------- exercises & sources ----------
renderExercises($('#exercise-list'), exercises);
$('#source-list').innerHTML = ['sutton', 'f9', 'wikiMerlin', 'wikiRaptor', 'starship']
  .map(k => `<li><a href="${SOURCES[k].url}" target="_blank" rel="noopener">${SOURCES[k].title}</a></li>`).join('');
