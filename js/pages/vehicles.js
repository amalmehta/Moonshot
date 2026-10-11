// vehicles.html: 3D viewer wiring, specs tables, tank calculator, exercises.
// The 3D part is loaded with a dynamic import so the tables and exercises still work if
// WebGL or the CDN is unavailable.
import { $, $$, fmt, renderExercises, tagChip, bindRange, typeset } from '../common.js';
import exercises from '../data/exercises/vehicles.js';
import { VEHICLES, ENGINES, SOURCES } from '../data/vehicles.js';
import { stageTanks, LAYOUT, propellantFraction, finenessRatio } from '../physics/tanks.js';
import { engineDims, bellProfile, lengthBudget } from '../three/geometry-math.js';

renderExercises(document.getElementById('exercise-list'), exercises);

// ---------------------------------------------------------------------------
// Sources
const usedSources = ['f9', 'f9guide', 'wikiF9', 'wikiMerlin', 'starship', 'wikiStarship', 'wikiRaptor', 'faaPEA', 'sutton'];
$('#source-list').innerHTML = usedSources.map(k => `<li><a href="${SOURCES[k].url}" rel="noopener">${SOURCES[k].title}</a></li>`).join('') +
  '<li>Statue of Liberty height (ground to torch, 93 m): <a href="https://www.nps.gov/stli/learn/historyculture/statue-statistics.htm" rel="noopener">US National Park Service — Statue Statistics</a></li>' +
  '<li>Ellipsoidal-head membrane stresses: any pressure-vessel text, e.g. Timoshenko &amp; Woinowsky-Krieger, <em>Theory of Plates and Shells</em>, ch. 14</li>';

// ---------------------------------------------------------------------------
// Specs tables (from VEHICLES / ENGINES; "est." per the data file's est lists)
const srcLinks = keys => keys.map(k => `<a href="${SOURCES[k].url}" rel="noopener" title="${SOURCES[k].title}">[${k}]</a>`).join(' ');
function stageTable() {
  const head = `<thead><tr><th>Stage</th><th>Engines</th><th class="num">Thrust</th><th class="num">Isp (s)</th><th class="num">Dry (t)</th><th class="num">Propellant (t)</th><th class="num">Prop. fraction</th><th class="num">Length × ⌀ (m)</th><th class="num">Fineness</th><th>Sources</th></tr></thead>`;
  const rows = [];
  for (const v of Object.values(VEHICLES)) {
    const est = f => v.est.includes('stages.' + f) ? ' est' : '';
    rows.push(`<tr><th colspan="10" style="text-transform:none;font-size:.95em;color:var(--fg)">${v.name} · ${v.height} m × ${v.diameter} m · liftoff <span${v.est.includes('liftoffMass') ? ' class="est"' : ''}>${fmt(v.liftoffMass / 1000, 4)} t</span></th></tr>`);
    for (const s of v.stages) {
      const thrust = s.thrustSL ? `${fmt(s.thrustSL / 1e6, 3)} MN SL` : `${fmt(s.thrustVac / 1e6, 3)} MN vac`;
      rows.push(`<tr><td>${s.name}</td><td>${s.count} × ${ENGINES[s.engines].name}${s.engines === 'raptorVac' ? ' / Raptor 2 (3 + 3)' : ''}</td>
        <td class="num">${thrust}</td><td class="num${est('isp')}">${s.isp}</td><td class="num${est('dry')}">${fmt(s.dry / 1000, 3)}</td>
        <td class="num${est('prop')}">${fmt(s.prop / 1000, 4)}</td><td class="num">${(propellantFraction(s) * 100).toFixed(1)} %</td>
        <td class="num">${s.length} × ${s.diameter}</td><td class="num">${finenessRatio(s.length, s.diameter).toFixed(1)}</td><td class="small">${srcLinks(v.src)}</td></tr>`);
    }
    if (v.fairing) rows.push(`<tr><td>Payload fairing</td><td>—</td><td></td><td></td><td class="num est">${fmt(v.fairing.mass / 1000, 2)}</td><td></td><td></td><td class="num">${v.fairing.length} × ${v.fairing.diameter}</td><td></td><td class="small">${srcLinks(['f9'])}</td></tr>`);
  }
  $('#stage-table').innerHTML = head + `<tbody>${rows.join('')}</tbody>`;
}
function engineTable() {
  const head = `<thead><tr><th>Engine</th><th>Cycle</th><th class="num">Chamber p (MPa)</th><th class="num">Area ratio ε</th><th class="num">Thrust SL / vac (kN)</th><th class="num">Isp SL / vac (s)</th><th class="num">Mass (kg)</th><th class="num">Model throat / exit ⌀ (m)</th><th>Sources</th></tr></thead>`;
  const rows = ['merlin1d', 'mvac', 'raptor2', 'raptorVac'].map(k => {
    const e = ENGINES[k], d = engineDims(k);
    const est = f => e.est.includes(f) ? ' est' : '';
    const pair = (a, b, fa, fb) => `<span class="${est(fa).trim()}">${a ?? '—'}</span> / <span class="${est(fb).trim()}">${b ?? '—'}</span>`;
    return `<tr><td>${e.name}<div class="small muted">${e.vehicle}</div></td><td>${e.cycle}</td><td class="num${est('pc')}">${e.pc / 1e6}</td><td class="num${est('eps')}">${e.eps}</td>
      <td class="num">${pair(e.thrustSL ? Math.round(e.thrustSL / 1e3) : null, e.thrustVac ? Math.round(e.thrustVac / 1e3) : null, 'thrustSL', 'thrustVac')}</td>
      <td class="num">${pair(e.ispSL, e.ispVac, 'ispSL', 'ispVac')}</td><td class="num${est('mass')}">${e.mass ?? '—'}</td>
      <td class="num">${(2 * d.rt).toFixed(3)} / ${(2 * d.re).toFixed(2)}</td><td class="small">${srcLinks(e.src)}</td></tr>`;
  });
  $('#engine-table').innerHTML = head + `<tbody>${rows.join('')}</tbody>`;
}
stageTable(); engineTable();
{
  const m = engineDims('merlin1d'), r = engineDims('raptor2');
  const pm = bellProfile(m.rt, m.eps), pr = bellProfile(r.rt, r.eps);
  $('#engine-dims').innerHTML = `Model result: Merlin 1D throat ⌀ ${(2 * m.rt * 100).toFixed(1)} cm, exit ⌀ ${(2 * m.re).toFixed(2)} m, chamber-to-exit length ${pm.length.toFixed(2)} m; ` +
    `Raptor 2 throat ⌀ ${(2 * r.rt * 100).toFixed(1)} cm, exit ⌀ ${(2 * r.re).toFixed(2)} m, length ${pr.length.toFixed(2)} m. ` +
    `Real bells are somewhat smaller (Raptor 2’s exit is usually quoted at about 1.3 m, est.): one efficiency factor for everything slightly oversizes the throat, and real nozzles are not ideal.`;
}

// ---------------------------------------------------------------------------
// Tank calculator
let tankOpts = { ullage: 0.03, k: Math.SQRT1_2, densified: true };
let viewer = null;
function tankRows() {
  const f9 = VEHICLES.falcon9, ss = VEHICLES.starship;
  const t = {
    f9s1: stageTanks(f9.stages[0], 'kerolox', { ...tankOpts, loxOnTop: true }),
    f9s2: stageTanks(f9.stages[1], 'kerolox', { ...tankOpts, loxOnTop: true }),
    sh: stageTanks(ss.stages[0], 'methalox', { ...tankOpts, loxOnTop: true }),
    ss: stageTanks(ss.stages[1], 'methalox', { ...tankOpts, loxOnTop: false }),
  };
  return { t, budget: lengthBudget(t, LAYOUT, VEHICLES) };
}
const COLORS = { tanks: 'oklch(0.66 0.12 236)', engine: 'oklch(0.68 0.13 18)', structure: 'oklch(0.70 0.12 86)' };
function renderTanks() {
  const { t, budget } = tankRows();
  const rows = budget.map(b => {
    const tk = t[b.id];
    const err = (b.total - b.published) / b.published;
    const bar = ['engine', 'structure', 'tanks'].map(p => `<span style="width:${(b.parts[p] / Math.max(b.total, b.published) * 100).toFixed(1)}%;background:${COLORS[p]}" title="${p} ${b.parts[p].toFixed(1)} m"></span>`).join('');
    const verdict = b.partial
      ? `<span class="badge good">leaves ${(b.published - b.total).toFixed(1)} m for the nose</span>`
      : `<span class="badge ${Math.abs(err) < 0.06 ? 'good' : Math.abs(err) < 0.12 ? 'warn' : 'bad'}">${err >= 0 ? '+' : '−'}${Math.abs(err * 100).toFixed(1)} %</span>`;
    return `<tr><td>${b.stage}</td><td class="num">${tk.ox.tankVolume.toFixed(0)} / ${tk.fuel.tankVolume.toFixed(0)}</td>
      <td class="num">${tk.length.toFixed(1)}</td><td class="num">${b.total.toFixed(1)}</td><td class="num">${b.published}</td><td>${verdict}</td></tr>
      <tr><td colspan="6" style="border-bottom-width:2px"><div class="budget-bar" aria-hidden="true">${bar}</div></td></tr>`;
  });
  $('#tank-table').innerHTML = `<thead><tr><th>Stage</th><th class="num">LOX / fuel tank (m³)</th><th class="num">Tank stack (m)</th><th class="num">+ engine + structure (m)</th><th class="num">Published (m)</th><th>Model vs published</th></tr></thead><tbody>${rows.join('')}</tbody>`;
  $('#tank-note').innerHTML = `<span class="legend-swatch" style="background:${COLORS.engine}"></span>engine (nozzle model) <span class="legend-swatch" style="background:${COLORS.structure};margin-left:10px"></span>engine bay / interstage (est.) <span class="legend-swatch" style="background:${COLORS.tanks};margin-left:10px"></span>tank stack. ` +
    `Bulk density: kerolox ${t.f9s1.bulkDensity.toFixed(0)} kg/m³, methalox ${t.sh.bulkDensity.toFixed(0)} kg/m³.`;
  viewer?.setTanks(tankOpts);
}
bindRange('tk-ullage', v => { tankOpts.ullage = v / 100; renderTanks(); }, v => `${v} %`);
bindRange('tk-k', v => { tankOpts.k = v; renderTanks(); }, v => v.toFixed(2));
$('#tk-dense').addEventListener('change', e => { tankOpts.densified = e.target.checked; renderTanks(); });
renderTanks();

// ---------------------------------------------------------------------------
// Legend
const LEGEND = [
  ['Engines & propulsion', 'oklch(0.70 0.13 18)'], ['Structures', 'oklch(0.70 0.13 86)'],
  ['Thermal protection', 'oklch(0.70 0.12 100)'], ['Avionics & control', 'oklch(0.70 0.13 300)'],
  ['LOX (cutaway)', '#3b82f6'], ['Fuel: RP-1 / CH₄', '#f97316'],
];
$('#legend').innerHTML = LEGEND.map(([n, c]) => `<span><span class="legend-swatch" style="background:${c}"></span>${n}</span>`).join('');

// ---------------------------------------------------------------------------
// Info card
const CAT_TAG = { propulsion: 'engines', structures: 'structures', thermal: 'thermal', control: 'gnc' };
function showPart(key, info) {
  if (!info) return;
  const card = $('#part-card');
  card.innerHTML = `<h4>${info.name}</h4>
    <div class="row" style="gap:6px;margin-bottom:4px">${CAT_TAG[info.cat] ? tagChip(CAT_TAG[info.cat]) : ''}</div>
    <p style="margin:4px 0">${info.what}</p>
    ${info.material ? `<p class="small muted" style="margin:4px 0"><strong>Material:</strong> ${info.material}</p>` : ''}
    ${info.facts?.length ? `<ul class="small">${info.facts.map(f => `<li>${f}</li>`).join('')}</ul>` : ''}`;
  typeset(card);
}

// ---------------------------------------------------------------------------
// 3D viewer
const vp = $('#viewport');
const ui = { mode: 'falcon9' };
function syncDisabled() {
  const m = ui.mode;
  $('#opt-legs').disabled = !(m === 'falcon9' || m === 'both');
  $('#opt-cut').disabled = m === 'engines';
  $('#opt-explode').disabled = m === 'engines';
}
$$('#pick button').forEach(b => b.addEventListener('click', () => {
  $$('#pick button').forEach(x => x.setAttribute('aria-pressed', x === b));
  ui.mode = b.dataset.mode; syncDisabled();
  viewer?.setMode(ui.mode);
}));
$$('#paint button').forEach(b => b.addEventListener('click', () => {
  $$('#paint button').forEach(x => x.setAttribute('aria-pressed', x === b));
  viewer?.setPaint(b.dataset.paint);
}));
$('#opt-cut').addEventListener('change', e => viewer?.setCutaway(e.target.checked));
$('#opt-explode').addEventListener('change', e => viewer?.setExplode(e.target.checked));
$('#opt-legs').addEventListener('change', e => viewer?.setLegs(e.target.checked));
$('#reset-view').addEventListener('click', () => viewer?.resetView());
syncDisabled();

function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
if (!hasWebGL()) {
  $('#loading').textContent = 'This browser can’t run WebGL, so the 3D viewer is unavailable. The tables and calculator below still work.';
} else {
  import('../three/viewer.js').then(({ createViewer }) => {
    viewer = createViewer(vp, { onPick: showPart, tankOpts });
    $('#loading').remove();
    // apply any options the reader set before the viewer loaded
    viewer.setMode(ui.mode);
    if ($('#opt-cut').checked) viewer.setCutaway(true);
    if ($('#opt-explode').checked) viewer.setExplode(true);
    if ($('#opt-legs').checked) viewer.setLegs(true);
    const paint = $('#paint button[aria-pressed="true"]').dataset.paint;
    viewer.setPaint(paint);
    // deep links: vehicles.html#viewer?mode=starship&cut=1 is overkill; support ?mode=… only
    const q = new URLSearchParams(location.search);
    const m = q.get('mode');
    if (m && $(`#pick button[data-mode="${m}"]`)) $(`#pick button[data-mode="${m}"]`).click();
    if (q.get('cut') === '1') { $('#opt-cut').checked = true; viewer.setCutaway(true); }
    if (q.get('explode') === '1') { $('#opt-explode').checked = true; viewer.setExplode(true); }
    if (q.get('legs') === '1') { $('#opt-legs').checked = true; viewer.setLegs(true); }
    if (q.get('paint') === 'real') $('#paint button[data-paint="real"]').click();
  }).catch(err => {
    console.error(err);
    $('#loading').textContent = 'The 3D viewer failed to load (offline?). The tables and calculator below still work.';
  });
}
