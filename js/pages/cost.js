// Cost page: history chart, Falcon 9 and Starship cost models, reuse curve, learning curve.
import { renderExercises, bindRange, fmt, onSettings, $ } from '../common.js';
import { linePlot } from '../plot.js';
import { falcon9Cost, starshipCost, F9_COST, STARSHIP_COST, propellantCost, learningCurveUnit, learningCurveAverage, HISTORICAL_PER_KG } from '../physics/cost.js';
import { VEHICLES } from '../data/vehicles.js';
import exercises from '../data/exercises/cost.js';

const money = v => v >= 1e6 ? '$' + fmt(v / 1e6, 3) + ' M' : '$' + fmt(v / 1e3, 3) + 'k';

// Cost categories share the green Economics family; hardware lines lean yellow-green, operations teal-green.
const PART_COLOR = [
  'oklch(0.55 0.13 128)', 'oklch(0.68 0.13 118)', 'oklch(0.48 0.09 150)', 'oklch(0.60 0.15 140)',
  'oklch(0.75 0.12 135)', 'oklch(0.42 0.08 165)', 'oklch(0.62 0.10 160)',
];
function renderBar(barEl, legendEl, { parts, total }) {
  const entries = Object.entries(parts).filter(([, v]) => v > 0);
  barEl.innerHTML = entries.map(([k, v], i) => `<div style="width:${(100 * v / total).toFixed(2)}%;background:${PART_COLOR[i % PART_COLOR.length]}" title="${k}: ${money(v)}">${v / total > 0.12 ? k.split(' (')[0] : ''}</div>`).join('');
  legendEl.innerHTML = entries.map(([k, v], i) => `<span><span class="legend-swatch" style="background:${PART_COLOR[i % PART_COLOR.length]}"></span>${k}: <strong>${money(v)}</strong> (${(100 * v / total).toFixed(0)} %)</span>`).join('');
}

// ---------- history ----------
const histPlot = linePlot($('#hist-plot'), {
  xLabel: 'First flight year', yLabel: '$/kg to LEO (FY2018, log scale)', yLog: true, yMin: 500, yMax: 100000, xMin: 1975, xMax: 2030,
  series: HISTORICAL_PER_KG.map(h => ({ name: `${h.name}: $${fmt(h.perKg, 3)}/kg`, x: [h.year], y: [h.perKg], points: true, radius: 7 })),
  xFormat: v => String(Math.round(v)),
});

// ---------- Falcon 9 ----------
const F9_INPUTS = { 'c-n': ['reuses', 1], 'c-b': ['boosterBuild', 1e6], 'c-s2': ['upperStage', 1e6], 'c-rf': ['boosterRefurb', 1e6], 'c-fu': ['fairingUses', 1], 'c-ops': ['launchOps', 1e6] };
function f9Inputs() {
  const c = { ...F9_COST };
  for (const [id, [key, scale]] of Object.entries(F9_INPUTS)) c[key] = +$('#' + id).value * scale;
  return c;
}
function updateF9() {
  const c = f9Inputs();
  const res = falcon9Cost(c);
  const payload = c.reuses > 1 ? VEHICLES.falcon9.payloadLEOReusable : VEHICLES.falcon9.payloadLEO;
  $('#c-total').textContent = money(res.total);
  $('#c-perkg').textContent = '$' + fmt(res.total / payload, 3);
  renderBar($('#c-bar'), $('#c-legend'), res);
  const top = Object.entries(res.parts).sort((a, b) => b[1] - a[1])[0];
  $('#c-note').innerHTML = `Biggest line item: <strong>${top[0]}</strong> (${(100 * top[1] / res.total).toFixed(0)} %). ${c.reuses === 1 ? 'Expendable: the booster dominates.' : 'With the booster reused, what you throw away (second stage) and what you do (operations) now dominate.'}`;
  updateReuse();
}
for (const [id, [, scale]] of Object.entries(F9_INPUTS)) bindRange(id, updateF9, v => (scale === 1 ? v : '$' + v + ' M'));
$('#c-reset').addEventListener('click', () => {
  for (const [id, [key, scale]] of Object.entries(F9_INPUTS)) { $('#' + id).value = F9_COST[key] / scale; $('#' + id).dispatchEvent(new Event('input')); }
});

// ---------- propellant cards ----------
{
  const f9 = propellantCost(VEHICLES.falcon9.stages.reduce((a, s) => a + s.prop, 0), 'kerolox');
  const ss = propellantCost(VEHICLES.starship.stages.reduce((a, s) => a + s.prop, 0), 'methalox');
  const card = (name, p, payload) => `<div class="card"><h3>${name}</h3><div class="stats">
    <div class="stat"><span class="v">${money(p.total)}</span><span class="k">propellant per launch</span></div>
    <div class="stat"><span class="v">$${fmt(p.total / payload, 2)}</span><span class="k">per kg of payload</span></div></div>
    <p class="small muted">${fmt(p.oxMass / 1000, 3)} t LOX + ${fmt(p.fuelMass / 1000, 3)} t fuel, at est. bulk prices.</p></div>`;
  $('#prop-cards').innerHTML = card('Falcon 9 (RP-1/LOX)', f9, VEHICLES.falcon9.payloadLEOReusable) + card('Starship (CH₄/LOX)', ss, VEHICLES.starship.payloadLEO);
}

// ---------- reuse curve ----------
const reusePlot = linePlot($('#reuse-plot'), { xLabel: 'Flights per booster', yLabel: 'Cost per flight ($M)', yMin: 0, series: [] });
function updateReuse() {
  const c = f9Inputs();
  const N = Array.from({ length: 40 }, (_, i) => i + 1);
  const totals = N.map(n => falcon9Cost({ ...c, reuses: n }).total / 1e6);
  const boosterShare = N.map(n => (c.boosterBuild / n) / 1e6);
  reusePlot.update({
    series: [{ name: 'Total cost per flight', x: N, y: totals }, { name: 'Booster share', x: N, y: boosterShare, dash: [5, 4] },
      { name: 'You', x: [c.reuses], y: [falcon9Cost(c).total / 1e6], points: true, radius: 6 }],
    hLines: [{ y: 74, label: 'List price ~$74 M' }, { y: 28, label: 'Reported ~$28 M (reused)' }],
  });
}

// ---------- Starship ----------
const SS_INPUTS = { 's-bb': ['boosterBuild', 1e6], 's-sb': ['shipBuild', 1e6], 's-bn': ['boosterReuses', 1], 's-sn': ['shipReuses', 1], 's-ops': ['launchOps', 1e6] };
const ssPlot = linePlot($('#ss-plot'), { xLabel: 'Ship flights (booster flights fixed)', yLabel: '$/kg to LEO (log)', yLog: true, yMin: 5, yMax: 20000, series: [] });
function updateSS() {
  const c = { ...STARSHIP_COST };
  for (const [id, [key, scale]] of Object.entries(SS_INPUTS)) c[key] = +$('#' + id).value * scale;
  const payload = +$('#s-pay').value * 1000;
  const res = starshipCost(c);
  $('#s-total').textContent = money(res.total);
  $('#s-perkg').textContent = '$' + fmt(res.total / payload, 3);
  renderBar($('#s-bar'), $('#s-legend'), res);
  const N = Array.from({ length: 100 }, (_, i) => i + 1);
  ssPlot.update({
    series: [{ name: 'Starship (your inputs)', x: N, y: N.map(n => starshipCost({ ...c, shipReuses: n }).total / payload) },
      { name: 'Falcon 9 reused (default model)', x: N, y: N.map(() => falcon9Cost().total / VEHICLES.falcon9.payloadLEOReusable), dash: [5, 4] }],
    hLines: [{ y: 2720, label: 'Falcon 9, Jones 2018' }, { y: propellantCost(4.9e6, 'methalox').total / payload, label: 'propellant floor' }],
  });
}
for (const [id, [, scale]] of Object.entries(SS_INPUTS)) bindRange(id, updateSS, v => (scale === 1 ? v : '$' + v + ' M'));
bindRange('s-pay', updateSS, v => v + ' t');

// ---------- learning curve ----------
const lcPlot = linePlot($('#lc-plot'), { xLabel: 'Cumulative units built (log)', yLabel: 'Cost relative to first unit', xLog: true, yMin: 0, yMax: 1.05, series: [] });
function updateLC() {
  const n = Array.from({ length: 60 }, (_, i) => Math.round(10 ** (i / 59 * 3)));
  lcPlot.update({ series: [0.95, 0.9, 0.85, 0.8].map(b => ({ name: `${b * 100} % curve`, x: n, y: n.map(k => learningCurveUnit(1, k, b)) })) });
  void learningCurveAverage;
}

updateF9(); updateSS(); updateLC();
onSettings(() => { updateF9(); updateSS(); updateLC(); histPlot.draw(); });

renderExercises($('#exercise-list'), exercises);
$('#source-list').innerHTML = [
  { title: 'Jones, H. W. “The Recent Large Reduction in Space Launch Cost”, 48th ICES (2018), NASA NTRS 20200001093', url: 'https://ntrs.nasa.gov/api/citations/20200001093/downloads/20200001093.pdf' },
  { title: 'Inverse: SpaceX on the economics of reusable rockets ($28 M reused-launch cost, C. Couluris)', url: 'https://inverse.com/innovation/spacex-elon-musk-falcon-9-economics' },
  { title: 'Design World: Musk on Falcon 9 propellant cost (~$200k)', url: 'https://www.designworldonline.com/elon-musk-says-falcon-9-rocket-ready-to-relaunch/' },
  { title: 'Space.com: SpaceX’s reusable Falcon 9, real cost savings', url: 'https://www.space.com/32688-spacex-reusable-rockets-real-cost-savings.html' },
  { title: 'SpaceX: Falcon 9 vehicle page (payload capability)', url: 'https://www.spacex.com/vehicles/falcon-9/' },
  { title: 'SpaceX Rideshare program', url: 'https://rideshare.spacex.com/' },
  { title: 'Wright, T. P. “Factors Affecting the Cost of Airplanes”, J. Aeronautical Sciences 3(4), 1936', url: 'https://doi.org/10.2514/8.155' },
].map(s => `<li><a href="${s.url}" target="_blank" rel="noopener">${s.title}</a></li>`).join('');
