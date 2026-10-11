// Hardware & materials page: material charts, tank sizing lab, re-entry heating lab.
import { renderExercises, bindRange, fmt, onSettings, isDark, $, $$ } from '../common.js';
import { linePlot } from '../plot.js';
import { MATERIALS, yieldAt, specificStrength, wallThickness, tankShellMass, suttonGraves, radiativeEquilibriumT } from '../physics/structures.js';
import { atmosphere } from '../physics/atmosphere.js';
import { SOURCES } from '../data/vehicles.js';
import exercises from '../data/exercises/structures.js';

// Material colours: the hardware hue family (olive/yellow), shades far enough apart to tell at a glance.
// Lightness steps are mirrored in dark mode so every shade stays visible on the background.
const SHADE_SPEC = { steel: [0.58, 0.16, 72], alli: [0.80, 0.16, 100], ti: [0.47, 0.10, 112], cfrp: [0.36, 0.05, 60] };
let SHADE = {};
function computeShades() {
  SHADE = Object.fromEntries(Object.entries(SHADE_SPEC).map(([k, [l, c, h]]) => [k, `oklch(${isDark() ? (1.2 - l).toFixed(2) : l} ${c} ${h})`]));
}
computeShades();
const COST_PER_KG = { steel: 3, alli: 35, ti: 40, cfrp: 135 }; // USD/kg, est.; steel & CFRP from Musk (Popular Mechanics, 2019)

const temps = Array.from({ length: 129 }, (_, i) => 20 + i * 10);
const matSeries = f => Object.entries(MATERIALS).map(([k, m]) => ({ name: m.short, x: temps, y: temps.map(T => f(m, T)), color: SHADE[k] }));
const vl = [{ x: 90, label: 'LOX' }, { x: 112, label: 'liquid CH₄' }, { x: 293, label: 'room' }];
const yieldPlot = linePlot($('#mat-yield'), { title: 'Yield strength', xLabel: 'Temperature (K)', yLabel: 'MPa', yMin: 0, series: matSeries(yieldAt), vLines: vl });
const specPlot = linePlot($('#mat-spec'), { title: 'Strength per kilogram', xLabel: 'Temperature (K)', yLabel: 'kN·m/kg', yMin: 0, series: matSeries(specificStrength), vLines: vl });
function renderMaterials() {
  yieldPlot.update({ series: matSeries(yieldAt) });
  specPlot.update({ series: matSeries(specificStrength) });
  $('#mat-table').innerHTML = Object.entries(MATERIALS).map(([k, m]) =>
  `<tr><td><span class="swatch-dot" style="background:${SHADE[k]}"></span>${m.short}</td><td class="num">${fmt(m.density, 4)}</td>
   <td class="num">${fmt(yieldAt(m, 90), 3)} MPa</td><td class="num">${fmt(yieldAt(m, 293), 3)} MPa</td><td class="num">${fmt(yieldAt(m, 700), 3)} MPa</td><td class="small">${m.note}</td></tr>`).join('');
}
renderMaterials();

// ---------- tank lab ----------
function updateTank() {
  const d = +$('#tk-d').value, L = +$('#tk-l').value, p = +$('#tk-p').value * 1e5, T = +$('#tk-T').value, sf = +$('#tk-sf').value;
  const rows = Object.entries(MATERIALS).map(([k, m]) => {
    const y = yieldAt(m, T) * 1e6;
    const tooHot = T > m.maxService || y < 20e6;
    const t = tooHot ? NaN : Math.max(0.0015, wallThickness(p, d / 2, y, sf, 0.75));
    const mass = tooHot ? NaN : tankShellMass(d / 2, L, t, m.density);
    return { k, m, t, mass, tooHot, cost: mass * COST_PER_KG[k] };
  });
  const ok = rows.filter(r => !r.tooHot);
  const best = ok.reduce((a, b) => (b.mass < a.mass ? b : a), ok[0]);
  $('#tk-table').innerHTML = rows.map(r => `<tr><td><span class="swatch-dot" style="background:${SHADE[r.k]}"></span>${r.m.short}</td>
    <td class="num">${r.tooHot ? '—' : fmt(r.t * 1000, 3)}</td><td class="num">${r.tooHot ? '—' : fmt(r.mass / 1000, 3)}</td>
    <td class="num">${r.tooHot ? '—' : '$' + fmt(r.cost / 1000, 3) + 'k'}</td>
    <td>${r.tooHot ? '<span class="badge bad">too hot: no strength left</span>' : r === best ? '<span class="badge good">lightest</span>' : ''}</td></tr>`).join('');
  const steel = rows.find(r => r.k === 'steel');
  $('#tk-note').innerHTML = !best ? 'Nothing survives this temperature without a heat shield.'
    : best.k === 'steel' ? 'Steel wins outright at this temperature.'
    : `${best.m.short} is lightest${steel.tooHot ? '' : ` by ${fmt((steel.mass - best.mass) / 1000, 3)} t`}, but costs ${steel.tooHot ? 'more' : fmt(best.cost / steel.cost, 2) + '× as much'} and needs insulation if the wall gets hot later in flight. Try 700 K.`;
}
bindRange('tk-d', updateTank, v => v + ' m');
bindRange('tk-l', updateTank, v => v + ' m');
bindRange('tk-p', updateTank, v => v.toFixed(1) + ' bar');
bindRange('tk-T', updateTank, v => `${v} K (${(v - 273.15).toFixed(0)} °C)`);
bindRange('tk-sf', updateTank, v => v.toFixed(2));
updateTank();

// ---------- re-entry heating lab ----------
const heatPlot = linePlot($('#ht-plot'), { xLabel: 'Speed (km/s)', yLabel: 'Equilibrium temperature (°C)', yMin: 0, series: [] });
function updateHeat() {
  const v = +$('#ht-v').value, h = +$('#ht-h').value * 1000, rn = +$('#ht-rn').value, e = +$('#ht-eps').value;
  const rho = atmosphere(h).rho;
  const q = suttonGraves(rho, v, rn);
  const T = radiativeEquilibriumT(q, e) - 273.15;
  $('#ht-q').textContent = fmt(q / 1e4, 3);
  $('#ht-T').textContent = fmt(T, 4);
  const lim = [['steel', 'bare stainless steel', 1100 - 273], ['tiles', 'silica tiles (~1,260 °C reuse limit, est.)', 1260]];
  $('#ht-verdict').innerHTML = T < lim[0][2] ? '<span class="badge good">Bare steel survives</span>'
    : T < lim[1][2] ? '<span class="badge warn">Needs ceramic tiles</span>'
    : '<span class="badge bad">Beyond reusable tiles: needs an ablator or a shallower, higher-lift entry</span>';
  const vs = Array.from({ length: 106 }, (_, i) => 1 + i * 0.1);
  heatPlot.update({
    series: [{ name: `At ${h / 1000} km, Rₙ = ${rn} m`, x: vs, y: vs.map(s => radiativeEquilibriumT(suttonGraves(rho, s * 1000, rn), e) - 273.15) },
      { name: '', x: [v / 1000], y: [T], points: true, radius: 6 }],
    hLines: [{ y: 827, label: 'steel limit ~830 °C' }, { y: 1260, label: 'tile limit ~1,260 °C' }],
  });
}
const HEAT_PRESETS = { starship: [7000, 70, 4.5, 0.85], f9: [2000, 50, 1.85, 0.8], lunar: [11000, 65, 2.5, 0.85] };
$$('[data-heat]').forEach(b => b.addEventListener('click', () => {
  const [v, h, rn, e] = HEAT_PRESETS[b.dataset.heat];
  for (const [id, val] of [['ht-v', v], ['ht-h', h], ['ht-rn', rn], ['ht-eps', e]]) { $('#' + id).value = val; $('#' + id).dispatchEvent(new Event('input')); }
}));
bindRange('ht-v', updateHeat, v => fmt(v / 1000, 3) + ' km/s');
bindRange('ht-h', updateHeat, v => v + ' km');
bindRange('ht-rn', updateHeat, v => v.toFixed(1) + ' m');
bindRange('ht-eps', updateHeat, v => v.toFixed(2));
updateHeat();
onSettings(() => { computeShades(); renderMaterials(); updateTank(); updateHeat(); });

renderExercises($('#exercise-list'), exercises);
const extra = [
  { title: 'NASA SP-8007, Buckling of Thin-Walled Circular Cylinders (1968)', url: 'https://ntrs.nasa.gov/citations/19690013955' },
  { title: 'Sutton & Graves, A General Stagnation-Point Convective-Heating Equation for Arbitrary Gas Mixtures, NASA TR R-376 (1971)', url: 'https://ntrs.nasa.gov/citations/19720003329' },
  { title: 'Allen & Eggers, A Study of the Motion and Aerodynamic Heating of Ballistic Missiles, NACA Report 1381 (1958)', url: 'https://ntrs.nasa.gov/citations/19930091020' },
  { title: 'Popular Mechanics, Elon Musk interview on Starship stainless steel (Jan 2019)', url: 'https://www.popularmechanics.com/space/rockets/a25953663/elon-musk-spacex-bfr-stainless-steel/' },
  { title: 'NASA, CRS-7 investigation summary (strut failure)', url: 'https://www.nasa.gov/news-release/nasa-independent-review-team-spacex-crs-7-accident-investigation-report-public-summary/' },
];
$('#source-list').innerHTML = [...['starship', 'wikiStarship', 'f9', 'wikiF9'].map(k => SOURCES[k]), ...extra]
  .map(s => `<li><a href="${s.url}" target="_blank" rel="noopener">${s.title}</a></li>`).join('');
