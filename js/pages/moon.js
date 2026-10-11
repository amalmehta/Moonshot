// Moon Mission page: mission planner, 3D mission player, "aim for the Moon" lab, plots, exercises.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { renderExercises, getSettings, onSettings, reducedMotion, pixelRatioCap, cssVar, $, $$, fmt, bindRange } from '../common.js';
import { linePlot, SERIES_COLORS } from '../plot.js';
import exercises from '../data/exercises/moon.js';
import { VEHICLES, DV_TO_LEO } from '../data/vehicles.js';
import { MU_EARTH, MU_MOON, R_EARTH, R_MOON, MOON_SMA, DAY } from '../physics/constants.js';
import { eccentricAnomaly } from '../physics/orbit.js';
import { moonState, MOON_N, soiRadius, planMission, propagate, parkingState, lunarRel } from '../physics/moon.js';

renderExercises(document.getElementById('exercise-list'), exercises);

const SOI = soiRadius();
const MCC_DV = 50, HOVER_DV = 100, LLO_DAYS = 0.5;
const SHIP = VEHICLES.starship.stages[1];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const km = m => fmt(m / 1e3, 4) + ' km';
const tonnes = kg => fmt(kg / 1e3, 3) + ' t';

// ---------------------------------------------------------------------------
// Worker plumbing (planning never runs on the main thread unless workers are unavailable)
let worker = null, reqId = 0;
const pending = new Map();
try {
  worker = new Worker(new URL('./moon-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => { const p = pending.get(e.data.id); if (p) { pending.delete(e.data.id); e.data.error ? p.reject(new Error(e.data.error)) : p.resolve(e.data.result); } };
  worker.onerror = () => { worker = null; for (const p of pending.values()) p.retry(); pending.clear(); };
} catch { worker = null; }

function runJob(type, params) {
  return new Promise((resolve, reject) => {
    const fallback = async () => {
      // Fallback: same code on the main thread, after the page has painted.
      await new Promise(r => setTimeout(r, 50));
      try {
        const m = await import('./moon-worker.js');
        resolve(type === 'checks' ? m.computeChecks() : m.computePlan(params));
      } catch (err) { reject(err); }
    };
    if (!worker) { fallback(); return; }
    const id = ++reqId;
    pending.set(id, { resolve, reject, retry: fallback });
    worker.postMessage({ id, type, params });
  });
}

// ---------------------------------------------------------------------------
// Inputs
const fmtFixed = (d, u) => v => `${v.toFixed(d)} ${u}`;
const get = {
  park: bindRange('p-park', () => schedulePlan(), v => `${v} km`),
  peri: bindRange('p-peri', () => schedulePlan(), v => `${v} km`),
  dry: bindRange('p-dry', () => updateMission(), v => `${v} t`),
  pay: bindRange('p-pay', () => updateMission(), v => `${v} t`),
  isp: bindRange('p-isp', () => updateMission(), v => `${v} s`),
  surf: bindRange('p-surf', () => updateMission(), fmtFixed(1, 'days')),
  tanker: bindRange('p-tanker', () => updateMission(), v => `${v} t`),
  cad: bindRange('p-cad', () => updateMission(), v => `${v} d`),
  boil: bindRange('p-boil', () => updateMission(), v => `${v.toFixed(2)} %/day`),
};
$('#p-ascent').addEventListener('change', () => { $('#p-surf').disabled = !$('#p-ascent').checked; updateMission(); });

let plan = null, mission = null, planTimer = null, planSeq = 0;
function schedulePlan() {
  clearTimeout(planTimer);
  $('#plan-status').textContent = 'Re-planning the trajectory…';
  planTimer = setTimeout(requestPlan, 350);
}
async function requestPlan() {
  const seq = ++planSeq;
  const params = { parkingAlt: get.park() * 1e3, periseleneAlt: get.peri() * 1e3, isp: 370 };
  try {
    const result = await runJob('plan', params);
    if (seq !== planSeq) return;              // a newer request superseded this one
    plan = result;
    $('#plan-status').textContent = `Trajectory solved in ${fmt(result.ms, 2)} ms (${result.tli.nProp}+ integrations, background thread).`;
    $('#tli-inline').textContent = `${fmt(plan.tli.dv, 4)} m/s`;
    updateMission();
    drawCoastPlot();
    drawDescentPlot();
    setAimToPlan();
  } catch (err) {
    if (seq === planSeq) $('#plan-status').textContent = `Planning failed: ${err.message}`;
  }
}

function missionParams() {
  return {
    dry: get.dry() * 1e3, payload: get.pay() * 1e3, isp: get.isp(), capacity: SHIP.prop,
    delivered: get.tanker() * 1e3, cadenceDays: get.cad(), boilPerDay: get.boil() / 100,
    mccDv: MCC_DV, hoverDv: HOVER_DV, lloDays: LLO_DAYS, surfaceDays: get.surf(), includeAscent: $('#p-ascent').checked,
    launchStages: VEHICLES.starship.stages, dvToLeo: DV_TO_LEO.typical, boosterReserve: 0.1,
  };
}

function updateMission() {
  if (!plan) return;
  const p = missionParams();
  mission = planMission(plan.tli, plan.desc, plan.deorb, plan.asc, p);
  renderPlanner(p);
  sim.rebuild();
}

// ---------------------------------------------------------------------------
// Planner output: stats, Δv map, budget table
function renderPlanner(p) {
  const m = mission, t = plan.tli;
  const badge = m.feasible ? '' : ' <span class="badge bad">over capacity</span>';
  $('#plan-stats').innerHTML = [
    ['TLI Δv (integrated)', `${fmt(t.dv / 1e3, 4)} km/s`],
    ['Coast to the Moon', `${fmt(t.tof / DAY, 3)} days`],
    ['Δv after LEO', `${fmt(m.dvTotal / 1e3, 3)} km/s`],
    ['Propellant needed in LEO', `${tonnes(m.propNeeded)}${badge}`],
    ['Tanker flights', Number.isFinite(m.tankers) ? `${m.tankers}` : '—'],
    ['Refilling campaign', Number.isFinite(m.campaignDays) ? `${fmt(m.campaignDays, 3)} days` : '—'],
  ].map(([k, v]) => `<div class="stat"><span class="v">${v}</span><span class="k">${k}</span></div>`).join('');

  const rows = m.legs.map(l => {
    const coast = l.dv === undefined;
    return `<tr class="${coast ? 'coast' : ''}"><td>${l.name}${coast ? ` (${fmt(l.coastDays, 2)} d)` : ''}</td>
      <td class="num">${coast ? '' : fmt(l.dv, 4)}</td><td class="num">${coast ? '' : fmt(l.prop / 1e3, 3)}</td>
      <td class="num">${l.boil ? fmt(l.boil / 1e3, 3) : ''}</td><td class="num">${fmt(l.mStart / 1e3, 4)}</td></tr>`;
  }).join('');
  const boilTotal = m.legs.reduce((a, l) => a + (l.boil || 0), 0);
  $('#budget').innerHTML = `<tr><th>Leg (after refilling)</th><th class="num">Δv m/s</th><th class="num">Propellant t</th><th class="num">Boil-off t</th><th class="num">Mass at start t</th></tr>
    ${rows}
    <tr class="total"><td>Total</td><td class="num">${fmt(m.dvTotal, 4)}</td><td class="num" colspan="2">${fmt(m.propNeeded / 1e3, 4)} (incl. ${fmt(boilTotal / 1e3, 2)} boil-off)</td><td class="num">${fmt(m.legs[0].mStart / 1e3, 4)}</td></tr>`;

  const tankLine = Number.isFinite(m.tankers)
    ? `Arriving with ${tonnes(m.residual)} (model), it needs <strong>${m.tankers} tanker flight${m.tankers === 1 ? '' : 's'}</strong> of ${p.delivered / 1e3} t, one every ${p.cadenceDays} days; ${tonnes(m.tankTimeline.at(-1))} aboard at departure after boil-off.`
    : `<span class="err">Even full tanks (${tonnes(p.capacity)}, est.) are not enough for this mass: lighten the lander or drop the ascent.</span>`;
  $('#plan-notes').innerHTML = `Launch: Super Heavy gives ${fmt(m.dvBoost / 1e3, 3)} km/s with a 10 % landing reserve (est.), the ship supplies the other
    ${fmt(m.shipNeeds / 1e3, 3)} km/s of the ~${DV_TO_LEO.typical / 1e3} km/s to orbit. ${tankLine}
    Tank capacity ${tonnes(p.capacity)} (est.); full tanks would give ${fmt(m.dvAvailableFull / 1e3, 3)} km/s.
    Mid-course corrections (${MCC_DV} m/s), the hover allowance (${HOVER_DV} m/s) and the ${LLO_DAYS}-day lunar-orbit wait are estimates;
    the rest comes from the integrations. ${p.includeAscent ? 'The payload is unloaded on the surface before ascent.' : ''}`;

  // prose numbers in "Why refill"
  const after = p.dry + (p.includeAscent ? 0 : p.payload);
  $('#dv-after-leo').textContent = `${fmt(m.dvTotal / 1e3, 3)} km/s`;
  $('#mass-ratio').textContent = `≈ ${fmt(Math.exp(m.dvTotal / (p.isp * 9.80665)), 3)}`;
  $('#end-mass').textContent = tonnes(after);
  $('#prop-need').textContent = `≈ ${tonnes(m.propNeeded)}`;
  $('#prop-resid').textContent = `≈ ${tonnes(m.residual)}`;
  drawDvMap();
}

function drawDvMap() {
  const svg = $('#dvmap'), m = mission, t = plan.tli;
  const leg = k => m.legs.find(l => l.key === k)?.dv || 0;
  const narrow = svg.clientWidth < 600;
  const nodes = [
    { name: 'Earth', sub: 'surface', h: 236 },
    { name: 'Low Earth orbit', sub: Number.isFinite(m.tankers) ? `refill: ${m.tankers} tankers` : 'refill: too much', h: 236 },
    { name: 'Lunar transfer', sub: `${fmt(t.tof / DAY, 2)}-day coast`, h: 250 },
    { name: 'Low lunar orbit', sub: `${get.peri()} km circular`, h: 264 },
    { name: 'Lunar surface', sub: 'touchdown', h: 264 },
  ];
  const edges = [
    { dv: DV_TO_LEO.typical, label: 'launch (incl. losses)' },
    { dv: leg('tli'), label: 'trans-lunar injection' },
    { dv: leg('mcc') + leg('loi'), label: `LOI ${fmt(leg('loi'), 3)} + MCC ${MCC_DV}` },
    { dv: leg('doi') + leg('pdi') + leg('hover'), label: `deorbit + descent + hover` },
  ];
  const asc = m.legs.find(l => l.key === 'ascent');
  const S = (c) => `style="fill:${c}"`;
  let out = '';
  const marker = `<defs><marker id="dv-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" style="fill:var(--fg-muted)"/></marker></defs>`;
  if (!narrow) {
    const W = 760, H = asc ? 210 : 170, x0 = 70, dx = (W - 140) / 4, y = 100;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    out += marker;
    edges.forEach((e, i) => {
      const xa = x0 + i * dx + 18, xb = x0 + (i + 1) * dx - 18;
      out += `<line x1="${xa}" y1="${y}" x2="${xb}" y2="${y}" style="stroke:var(--fg-muted);stroke-width:1.5" marker-end="url(#dv-arrow)"/>`;
      out += `<text x="${(xa + xb) / 2}" y="${y - 30}" text-anchor="middle" font-size="16" font-weight="700" ${S('var(--fg)')}>${fmt(e.dv / 1e3, 3)} km/s</text>`;
      out += `<text x="${(xa + xb) / 2}" y="${y - 13}" text-anchor="middle" font-size="11" ${S('var(--fg-muted)')}>${e.label}</text>`;
    });
    nodes.forEach((n, i) => {
      const x = x0 + i * dx;
      out += `<circle cx="${x}" cy="${y}" r="13" style="fill:oklch(0.66 0.13 ${n.h});stroke:var(--bg-elev);stroke-width:2"/>`;
      out += `<text x="${x}" y="${y + 32}" text-anchor="middle" font-size="12.5" font-weight="600" ${S('var(--fg)')}>${n.name}</text>`;
      out += `<text x="${x}" y="${y + 48}" text-anchor="middle" font-size="11" ${S('var(--fg-muted)')}>${n.sub}</text>`;
    });
    if (asc) {
      const xa = x0 + 4 * dx, xb = x0 + 3 * dx, yy = y + 64;
      out += `<path d="M${xa} ${y + 54} Q ${(xa + xb) / 2} ${yy + 40} ${xb + 6} ${y + 56}" style="fill:none;stroke:var(--fg-muted);stroke-width:1.5;stroke-dasharray:4 3" marker-end="url(#dv-arrow)"/>`;
      out += `<text x="${(xa + xb) / 2}" y="${yy + 40}" text-anchor="middle" font-size="12" ${S('var(--fg)')}><tspan font-weight="700">${fmt(asc.dv / 1e3, 3)} km/s</tspan> ascent</text>`;
    }
    out += `<text x="${W - 4}" y="16" text-anchor="end" font-size="11" ${S('var(--fg-muted)')}>after LEO: ${fmt(m.dvTotal / 1e3, 3)} km/s</text>`;
  } else {
    const W = 340, dy = 92, y0 = 24, x = 26, H = y0 + 4 * dy + (asc ? 50 : 26);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    out += marker;
    edges.forEach((e, i) => {
      const ya = y0 + i * dy + 16, yb = y0 + (i + 1) * dy - 16;
      out += `<line x1="${x}" y1="${ya}" x2="${x}" y2="${yb}" style="stroke:var(--fg-muted);stroke-width:1.5" marker-end="url(#dv-arrow)"/>`;
      out += `<text x="${x + 40}" y="${(ya + yb) / 2 + 2}" font-size="15" font-weight="700" ${S('var(--fg)')}>${fmt(e.dv / 1e3, 3)} km/s</text>`;
      out += `<text x="${x + 40}" y="${(ya + yb) / 2 + 18}" font-size="11" ${S('var(--fg-muted)')}>${e.label}</text>`;
    });
    nodes.forEach((n, i) => {
      const y = y0 + i * dy;
      out += `<circle cx="${x}" cy="${y}" r="12" style="fill:oklch(0.66 0.13 ${n.h});stroke:var(--bg-elev);stroke-width:2"/>`;
      out += `<text x="${x + 22}" y="${y + 1}" font-size="13" font-weight="600" ${S('var(--fg)')}>${n.name}</text>`;
      out += `<text x="${x + 22}" y="${y + 16}" font-size="11" ${S('var(--fg-muted)')}>${n.sub}</text>`;
    });
    if (asc) out += `<text x="${x + 22}" y="${y0 + 4 * dy + 38}" font-size="12" ${S('var(--fg)')}>↑ back to orbit: <tspan font-weight="700">${fmt(asc.dv / 1e3, 3)} km/s</tspan> ascent</text>`;
  }
  svg.innerHTML = out;
}
new ResizeObserver(() => { if (mission) drawDvMap(); }).observe($('#dvmap'));

// ---------------------------------------------------------------------------
// Plots
let coastPlot, descentPlot;
function drawCoastPlot() {
  const t = plan.tli;
  const cp = t.coastPath;
  const days = cp.t.map(x => x / DAY);
  const dE = cp.y.map(y => Math.hypot(y[0], y[1]) / 1e6);
  const dM = cp.y.map((y, i) => { const m = moonState(cp.t[i], t.lambda); return Math.hypot(y[0] - m[0], y[1] - m[1]) / 1e6; });
  const series = [{ name: 'From Earth', x: days, y: dE }, { name: 'From the Moon', x: days, y: dM }];
  if (t.freeReturn) {
    const fr = t.freeReturn.path;
    series.push({ name: 'Free return (no LOI)', x: fr.t.map(x => x / DAY), y: fr.y.map(y => Math.hypot(y[0], y[1]) / 1e6), dash: [5, 4], color: SERIES_COLORS[0] });
  }
  const opts = { xLabel: 'Days after TLI', yLabel: 'Distance (thousand km)', series, yMin: 0, xMin: 0,
    vLines: [{ x: t.tof / DAY, label: 'periselene' }], hLines: [{ y: SOI / 1e6, label: 'Moon SOI radius' }] };
  coastPlot ? coastPlot.update(opts) : (coastPlot = linePlot($('#coast-plot'), opts));
}
function drawDescentPlot() {
  const d = plan.desc;
  const opts = { xLabel: 'Distance over the ground (km)', yLabel: 'Altitude (km)',
    series: [{ name: 'Gravity-turn descent', x: d.path.downrange.map(x => x / 1e3), y: d.path.alt.map(x => x / 1e3) }], yMin: 0, xMin: 0 };
  descentPlot ? descentPlot.update(opts) : (descentPlot = linePlot($('#descent-plot'), opts));
  $('#descent-caption').textContent = `Integrated powered descent from 15 km: ${fmt(d.dv, 4)} m/s over ${fmt(d.t, 3)} s at a starting lunar thrust-to-weight of ${fmt(d.tw, 3)} (solved), gravity loss ${fmt(d.gravityLoss, 2)} m/s. Deorbit burn ${fmt(plan.deorb.dv, 3)} m/s, ascent ${fmt(plan.asc.dv, 4)} m/s.`;
}

// ---------------------------------------------------------------------------
// "Aim for the Moon" lab: one integration per change, drawn on a 2-D canvas
const aim = { canvas: $('#aim-canvas'), res: null, queued: false };
const aimDv = bindRange('aim-dv', () => queueAim(), v => `${v} m/s`);
const aimLam = bindRange('aim-lam', () => queueAim(), v => `${v.toFixed(1)}°`);
function setAimToPlan() {
  if (!plan) return;
  $('#aim-dv').value = Math.round(plan.tli.dv);
  $('#aim-lam').value = (plan.tli.lambda * 180 / Math.PI).toFixed(1);
  $$('#aim-dv, #aim-lam').forEach(el => el.dispatchEvent(new Event('input')));
}
$('#aim-planned').addEventListener('click', setAimToPlan);
function queueAim() { if (!aim.queued) { aim.queued = true; requestAnimationFrame(runAim); } }
function runAim() {
  aim.queued = false;
  const alt = (plan ? plan.tli.parkingAlt : get.park() * 1e3);
  const dv = aimDv(), lam = aimLam() * Math.PI / 180;
  const res = propagate(parkingState(alt, dv), 0, 8 * DAY, { phase0: lam, stopAt: 'perilune', after: 3 * 3600, stopOnImpact: true, rtol: 1e-9 });
  aim.res = { ...res, lam, dv };
  const el = $('#aim-result');
  const fin = res.y.at(-1), tEnd = res.t.at(-1);
  if (res.impact) el.textContent = `${res.impact.body === 'Moon' ? 'Crashes into the Moon' : 'Falls back into Earth'} after ${fmt(res.impact.t / DAY, 3)} days.`;
  else if (res.perilune) {
    const p = res.perilune, a = p.r - R_MOON;
    const dir = p.hz < 0 ? 'retrograde (far side, clockwise)' : 'prograde (counter-clockwise)';
    el.textContent = a < 0 ? `Hits the Moon after ${fmt(p.t / DAY, 3)} d.` :
      `Closest approach ${km(a)} above the Moon after ${fmt(p.t / DAY, 3)} days, ${dir}, at ${fmt(p.v, 4)} m/s. ${a < 300e3 ? '✓ Good enough for lunar orbit insertion.' : p.r < SOI ? 'Inside the sphere of influence, but too high.' : 'A miss.'}`;
  } else {
    const rel = lunarRel(tEnd, fin, lam);
    el.textContent = `No close pass within 8 days; ends ${km(rel.r)} from the Moon.`;
  }
  drawAim();
}
function drawAim() {
  const c = aim.canvas, ctx = c.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2), w = c.clientWidth, h = c.clientHeight;
  if (!w || !h) return;
  c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const scale = Math.min(w, h) / 2 / 460e6, cx = w / 2, cy = h / 2;
  const X = x => cx + x * scale, Y = y => cy - y * scale;
  const fg = cssVar('--fg'), muted = cssVar('--fg-muted'), accent = cssVar('--accent'), link = cssVar('--link');
  ctx.setLineDash([4, 5]); ctx.strokeStyle = muted; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, MOON_SMA * scale, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = link; ctx.beginPath(); ctx.arc(cx, cy, Math.max(4, R_EARTH * scale), 0, 7); ctx.fill();
  ctx.font = '12px ui-sans-serif, sans-serif'; ctx.fillStyle = muted;
  ctx.fillText('Earth', cx + 8, cy + 16);
  const r = aim.res;
  if (!r) return;
  const m0 = moonState(0, r.lam), m1 = moonState(r.t.at(-1), r.lam);
  ctx.globalAlpha = 0.35; ctx.fillStyle = muted; ctx.beginPath(); ctx.arc(X(m0[0]), Y(m0[1]), 5, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillText('Moon at TLI', X(m0[0]) + 8, Y(m0[1]) + 4);
  // SOI and Moon at the end
  ctx.strokeStyle = muted; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(X(m1[0]), Y(m1[1]), SOI * scale, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = muted; ctx.beginPath(); ctx.arc(X(m1[0]), Y(m1[1]), 6, 0, 7); ctx.fill();
  ctx.fillText('Moon (SOI dashed)', X(m1[0]) + 10, Y(m1[1]) - 8);
  ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath();
  r.y.forEach((y, i) => i ? ctx.lineTo(X(y[0]), Y(y[1])) : ctx.moveTo(X(y[0]), Y(y[1])));
  ctx.stroke();
  ctx.fillStyle = fg; ctx.beginPath(); const e = r.y.at(-1); ctx.arc(X(e[0]), Y(e[1]), 3, 0, 7); ctx.fill();
}
new ResizeObserver(drawAim).observe(aim.canvas);

// ---------------------------------------------------------------------------
// Model vs Apollo table (computed in the worker)
runJob('checks').then(({ rows, pc, deorb }) => {
  const by = id => rows.find(r => r.id === id);
  const line = (q, pcText, row, fmtv) => {
    const err = (row.computed - row.reported) / row.reported;
    const ok = Math.abs(err) <= row.tolerance;
    return `<tr><td>${q}</td><td class="num">${pcText}</td><td class="num">${fmtv(row.computed)}</td><td class="num">${fmtv(row.reported)}</td>
      <td class="num"><span class="badge ${ok ? 'good' : 'bad'}">${err >= 0 ? '+' : '−'}${Math.abs(err * 100).toFixed(1)} %</span> <span class="muted small">(±${row.tolerance * 100} %)</span></td></tr>
      <tr><td colspan="5" class="small muted" style="border-bottom-width:2px">${row.note}</td></tr>`;
  };
  const ms = v => `${fmt(v, 4)} m/s`;
  $('#compare-table').innerHTML = `<tr><th>Quantity</th><th class="num">Patched conics</th><th class="num">Integrated model</th><th class="num">Apollo</th><th class="num">Model error</th></tr>
    ${line('TLI Δv', ms(pc.tliDv) + ' (Hohmann)', by('moon-tli-dv'), ms)}
    ${line('Coast, TLI → LOI', `${fmt(pc.tof / 3600, 3)} h (Hohmann)`, by('moon-coast-time'), v => `${fmt(v, 3)} h`)}
    ${line('LOI Δv', ms(pc.loiDv), by('moon-loi-dv'), ms)}
    ${line('Powered descent Δv', `${ms(deorb.vPeri)} (speed to cancel, no losses)`, by('moon-descent-dv'), ms)}
    ${line('Moon SOI radius', '—', by('moon-soi'), v => `${fmt(v, 4)} km`)}`;
}).catch(err => { $('#compare-table').innerHTML = `<tr><td class="err">Comparison failed: ${err.message}</td></tr>`; });

// ---------------------------------------------------------------------------
// 3D mission player
const sim = (() => {
  const view = $('#moon-view');
  const U = 1e6;                                   // scene unit = 1000 km
  let renderer, scene, camera, controls, earth, moon, ship, flame, pathLine, ghostLine, launchLine, parkRing, moonRing, lunarGroup, lunarLine, lunarGhost;
  let K = 4;                                       // body exaggeration factor
  let tl = null;                                   // timeline
  let u = 0, playing = false, speed = 1, camMode = 'earth', dirty = true, visible = true, raf = 0, lastTs = 0;
  let pathTimes = [], launchTimes = [], lunarTimes = [];
  let accent = new THREE.Color(cssVar('--accent') || '#ff7a2f');

  // ---- textures (procedural, seeded so they look the same every time)
  function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function earthTexture() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 512); grd.addColorStop(0, '#1d4f8f'); grd.addColorStop(0.5, '#1f63b4'); grd.addColorStop(1, '#1d4f8f');
    g.fillStyle = grd; g.fillRect(0, 0, 1024, 512);
    const r = rng(7);
    for (let k = 0; k < 9; k++) {                  // continents: clusters of blobs
      const cx = r() * 1024, cy = 110 + r() * 300, n = 30 + r() * 50;
      for (let i = 0; i < n; i++) {
        const x = cx + (r() - 0.5) * 220, y = cy + (r() - 0.5) * 140, rad = 8 + r() * 30;
        g.fillStyle = r() < 0.75 ? `hsl(${95 + r() * 30}, 35%, ${28 + r() * 10}%)` : `hsl(35, 35%, ${40 + r() * 10}%)`;
        g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
      }
    }
    g.fillStyle = '#eef3f8'; g.fillRect(0, 0, 1024, 26); g.fillRect(0, 486, 1024, 26);
    g.globalAlpha = 0.35; g.fillStyle = '#ffffff';
    for (let i = 0; i < 260; i++) { g.beginPath(); g.ellipse(r() * 1024, r() * 512, 10 + r() * 40, 3 + r() * 8, r() * 0.6, 0, 7); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function moonTexture() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#9a9a96'; g.fillRect(0, 0, 512, 256);
    const r = rng(42);
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(70,70,72,${0.35 + r() * 0.3})`; g.beginPath(); g.ellipse(r() * 512, 60 + r() * 140, 20 + r() * 50, 12 + r() * 30, r(), 0, 7); g.fill(); }
    for (let i = 0; i < 220; i++) {
      const x = r() * 512, y = r() * 256, rad = 1 + r() ** 3 * 14;
      g.fillStyle = 'rgba(60,60,60,0.35)'; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
      g.strokeStyle = 'rgba(220,220,215,0.35)'; g.lineWidth = 1; g.beginPath(); g.arc(x - 0.5, y - 0.5, rad, 3.6, 5.6); g.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  function init() {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, pixelRatioCap()));
    view.prepend(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, 1, 0.005, 40000);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !reducedMotion();
    controls.addEventListener('change', () => { dirty = true; });
    scene.add(new THREE.AmbientLight(0xffffff, 0.22));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(1, 0.25, 0.4); scene.add(sun);
    earth = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 0.85, metalness: 0 }));
    moon = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshStandardMaterial({ map: moonTexture(), roughness: 1, metalness: 0 }));
    scene.add(earth, moon);
    // stars
    const r = rng(3), n = 1800, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const u1 = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u1 * u1); pos.set([8000 * s * Math.cos(th), 8000 * u1, 8000 * s * Math.sin(th)], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xc8d2e6, size: 1.6, sizeAttenuation: false })));
    // Moon's orbit
    const ring = []; for (let i = 0; i <= 256; i++) { const a = i / 256 * Math.PI * 2; ring.push(new THREE.Vector3(MOON_SMA / U * Math.cos(a), 0, -MOON_SMA / U * Math.sin(a))); }
    moonRing = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), new THREE.LineBasicMaterial({ color: 0x5a6680, transparent: true, opacity: 0.45 }));
    scene.add(moonRing);
    ship = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    flame = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.45, depthWrite: false }));
    scene.add(ship, flame);
    new ResizeObserver(resize).observe(view);
    new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) kick(); }).observe(view);
    resize();
    setCam('earth');
  }

  function resize() {
    const w = view.clientWidth, h = view.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    dirty = true; kick();
  }

  // ---- timeline
  function build() {
    const P = plan.tli, m = mission;
    const r0 = R_EARTH + P.parkingAlt, n0 = Math.sqrt(MU_EARTH / r0 ** 3), P0 = 2 * Math.PI / n0;
    const tof = P.tof, lam = P.lambda;
    const sense = Math.sign(P.perilune.hz) || -1;
    const rL = R_MOON + P.periseleneAlt;
    const pm = moonState(tof, lam);
    const alpha0 = Math.atan2(P.perilune.y[1] - pm[1], P.perilune.y[0] - pm[0]);
    const omegaL = sense * Math.sqrt(MU_MOON / rL ** 3);
    const tD = tof + LLO_DAYS * DAY;
    const dOrb = plan.deorb, desc = plan.desc;
    const tPDI = tD + dOrb.tof, tTD = tPDI + desc.t;
    const feasible = Number.isFinite(m.campaignDays);
    const campaign = feasible ? m.campaignDays * DAY : 0;
    const tRefEnd = -900, tRef0 = tRefEnd - campaign, tOrbit = tRef0 - 2 * P0, tL = tOrbit - 510;
    const nT = feasible ? m.tankers : 0;
    const segs = [
      { key: 'launch', label: 'Launch', t0: tL, t1: tOrbit, real: 5 },
      { key: 'orbit', label: 'Orbit', t0: tOrbit, t1: tRef0, real: 4 },
      { key: 'refill', label: 'Refilling', t0: tRef0, t1: tRefEnd, real: nT ? Math.min(14, 2 + 0.8 * nT) : 1.5 },
      { key: 'tli', label: 'TLI burn', t0: tRefEnd, t1: 1500, real: 4 },
      { key: 'coast', label: `Coast (${fmt(tof / DAY, 2)} d)`, t0: 1500, t1: tof - 4 * 3600, real: 16 },
      { key: 'loi', label: 'LOI', t0: tof - 4 * 3600, t1: tD - 600, real: 8 },
      { key: 'descent', label: 'Descent', t0: tD - 600, t1: tTD, real: 11 },
      { key: 'touchdown', label: 'Touchdown', t0: tTD, t1: tTD + 3 * 3600, real: 4 },
    ];
    let acc = 0;
    for (const s of segs) { s.u0 = acc; acc += s.real; s.u1 = acc; }
    const cp = P.coastPath;
    tl = { P, m, r0, n0, P0, tof, lam, sense, rL, alpha0, omegaL, tD, tPDI, tTD, tL, tOrbit, tRef0, tRefEnd, segs, U: acc, cp, dOrb, desc, nT, feasible,
      e: (rL - (R_MOON + 15e3)) / (rL + R_MOON + 15e3), aE: dOrb.a, nE: Math.sqrt(MU_MOON / dOrb.a ** 3) };
    tl.alphaD = alpha0 + omegaL * (tD - tof);
    const dp = desc.path;
    tl.alphaTD = tl.alphaD + sense * (Math.PI + dp.theta.at(-1));
  }

  function uToT(uu) {
    const s = tl.segs.find(s => uu <= s.u1) || tl.segs.at(-1);
    const f = s.real ? clamp((uu - s.u0) / s.real, 0, 1) : 1;
    return { t: s.t0 + f * (s.t1 - s.t0), seg: s, warp: (s.t1 - s.t0) / s.real };
  }

  function hermite(t) {
    const T = tl.cp.t, Y = tl.cp.y;
    let lo = 0, hi = T.length - 1;
    if (t >= T[hi]) return Y[hi];
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid] <= t) lo = mid; else hi = mid; }
    const h = T[hi] - T[lo], s = (t - T[lo]) / h, a = Y[lo], b = Y[hi];
    const h00 = 2 * s ** 3 - 3 * s * s + 1, h10 = s ** 3 - 2 * s * s + s, h01 = -2 * s ** 3 + 3 * s * s, h11 = s ** 3 - s * s;
    return [h00 * a[0] + h10 * h * a[2] + h01 * b[0] + h11 * h * b[2], h00 * a[1] + h10 * h * a[3] + h01 * b[1] + h11 * h * b[3]];
  }

  /** Ship position (Earth-centred, m) at mission time t (t = 0 at TLI). Also returns which body it is near. */
  function shipPos(t) {
    const L = tl;
    if (t < L.tOrbit) {                               // schematic ascent
      const f = clamp((t - L.tL) / (L.tOrbit - L.tL), 0, 1);
      // climb with zero vertical speed at both ends; downrange angle ∝ f², so horizontal speed grows to orbital speed at insertion
      const r = R_EARTH + (L.r0 - R_EARTH) * (1 - Math.cos(f * Math.PI)) / 2;
      const ang = L.n0 * L.tOrbit - (1 - f * f) * L.n0 * (L.tOrbit - L.tL) / 2;
      return [r * Math.cos(ang), r * Math.sin(ang)];
    }
    if (t <= 0) { const a = L.n0 * t; return [L.r0 * Math.cos(a), L.r0 * Math.sin(a)]; }
    if (t <= L.tof) return hermite(t);
    const m = moonState(t, L.lam);
    let r, a;
    if (t <= L.tD) { r = L.rL; a = L.alpha0 + L.omegaL * (t - L.tof); }
    else if (t <= L.tPDI) {
      const M = Math.PI + L.nE * (t - L.tD), E = eccentricAnomaly(M, L.e);
      const nu = 2 * Math.atan2(Math.sqrt(1 + L.e) * Math.sin(E / 2), Math.sqrt(1 - L.e) * Math.cos(E / 2));
      r = L.aE * (1 - L.e * Math.cos(E)); a = L.alphaD + L.sense * ((nu < 0 ? nu + 2 * Math.PI : nu) - Math.PI);
    } else if (t <= L.tTD) {
      const p = L.desc.path, k = interpIndex(p.t, t - L.tPDI);
      r = lerp(p.r, k); a = L.alphaD + L.sense * (Math.PI + lerp(p.theta, k));
    } else { r = R_MOON; a = L.alphaTD + MOON_N * (t - L.tTD); }
    return [m[0] + r * Math.cos(a), m[1] + r * Math.sin(a)];
  }
  const interpIndex = (T, t) => { let lo = 0, hi = T.length - 1; if (t >= T[hi]) return hi; if (t <= T[0]) return 0; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid] <= t) lo = mid; else hi = mid; } return lo + (t - T[lo]) / (T[hi] - T[lo]); };
  const lerp = (A, k) => { const i = Math.floor(k), f = k - i; return i >= A.length - 1 ? A.at(-1) : A[i] + f * (A[i + 1] - A[i]); };

  function dvUsed(t) {
    const L = tl, m = L.m;
    const leg = k => m.legs.find(l => l.key === k)?.dv || 0;
    let dv = 0;
    if (t >= 0) dv += leg('tli');
    if (t >= L.tof / 2) dv += leg('mcc');
    if (t >= L.tof) dv += leg('loi');
    if (t >= L.tD) dv += leg('doi');
    if (t > L.tPDI) { const p = L.desc.path; dv += lerp(p.dv, interpIndex(p.t, t - L.tPDI)); }
    if (t >= L.tTD) dv += leg('hover');
    return dv;
  }
  function burnAt(t) {
    const L = tl;
    if (t > -150 && t < 150) return 'TLI burn';
    if (Math.abs(t - L.tof) < 180) return 'LOI burn';
    if (Math.abs(t - L.tD) < 30) return 'Deorbit burn';
    if (t > L.tPDI && t < L.tTD) return 'Powered descent';
    if (t > L.tL && t < L.tOrbit) return 'Ascent to orbit';
    return '';
  }

  // ---- display mapping (exaggerated bodies push nearby points outward)
  function pushOut(x, y, cx, cy, R) {
    // Within 1.5 radii of a body everything is scaled by K about its centre (so altitudes grow with the
    // body and low orbits stay visible); beyond, the extra offset fades out over ~9 radii (monotone).
    if (K === 1) return [x, y];
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
    if (d === 0) return [x, y];
    const d1 = 1.5 * R, Lb = 9 * R;
    const f = d <= d1 ? d : d1 * Math.exp(-(d - d1) / Lb);
    const k = (d + (K - 1) * f) / d;
    return [cx + dx * k, cy + dy * k];
  }
  function disp(p, t, out = new THREE.Vector3()) {
    let [x, y] = pushOut(p[0], p[1], 0, 0, R_EARTH);
    const m = moonState(t, tl.lam);
    [x, y] = pushOut(x, y, m[0], m[1], R_MOON);
    return out.set(x / U, 0, -y / U);
  }

  function rebuildGeometry() {
    const L = tl;
    // launch arc
    launchTimes = []; const lp = [];
    for (let i = 0; i <= 50; i++) { const t = L.tL + (L.tOrbit - L.tL) * i / 50; launchTimes.push(t); lp.push(disp(shipPos(t), t)); }
    // main path: last part of the parking orbit, the integrator's own (adaptive) coast steps ×4, lunar orbit, descent
    pathTimes = [];
    for (let i = 0; i <= 30; i++) pathTimes.push(L.tRefEnd * (1 - i / 30));
    const T = L.cp.t;
    for (let i = 1; i < T.length; i++) for (let k = 1; k <= 4; k++) pathTimes.push(T[i - 1] + (T[i] - T[i - 1]) * k / 4);
    const pts = pathTimes.map(t => disp(shipPos(t), t));
    // after lunar orbit insertion the path is drawn in a Moon-centred group that moves with the Moon,
    // so the lunar orbit reads as a circle rather than a helix stretched along the Moon's motion
    lunarTimes = [L.tof];
    const nLLO = Math.ceil((L.tD - L.tof) / (2 * Math.PI / Math.abs(L.omegaL)) * 64);
    for (let i = 1; i <= nLLO; i++) lunarTimes.push(L.tof + (L.tD - L.tof) * i / nLLO);
    for (let i = 1; i <= 80; i++) lunarTimes.push(L.tD + (L.tPDI - L.tD) * i / 80);
    for (let i = 1; i <= 100; i++) lunarTimes.push(L.tPDI + (L.tTD - L.tPDI) * i / 100);
    const lpts = lunarTimes.map(t => {
      const p = shipPos(t), m = moonState(t, L.lam);
      const [x, y] = pushOut(p[0] - m[0], p[1] - m[1], 0, 0, R_MOON);
      return new THREE.Vector3(x / U, 0, -y / U);
    });
    const mk = (points, color, opacity) => new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
    for (const o of [pathLine, ghostLine, launchLine, parkRing, lunarLine, lunarGhost]) if (o) { o.parent?.remove(o); o.geometry.dispose(); o.material.dispose(); }
    pathLine = mk(pts, accent, 1);
    ghostLine = mk(pts, 0x8fa3c8, 0.22);
    launchLine = mk(lp, accent, 1);
    lunarLine = mk(lpts, accent, 1);
    lunarGhost = mk(lpts, 0x8fa3c8, 0.22);
    if (!lunarGroup) { lunarGroup = new THREE.Group(); scene.add(lunarGroup); }
    lunarGroup.add(lunarGhost, lunarLine);
    const ring = []; for (let i = 0; i <= 128; i++) { const a = i / 128 * Math.PI * 2; ring.push(disp([L.r0 * Math.cos(a), L.r0 * Math.sin(a)], 0)); }
    parkRing = mk(ring, 0x8fa3c8, 0.5);
    scene.add(ghostLine, pathLine, launchLine, parkRing);
    earth.scale.setScalar(R_EARTH / U * K);
    moon.scale.setScalar(R_MOON / U * K);
    dirty = true;
  }

  // ---- camera
  function camTarget(mode) {
    if (mode === 'moon') return moon.position.clone();
    if (mode === 'ship') return ship.position.clone();
    return new THREE.Vector3(0, 0, 0);
  }
  function setCam(mode) {
    camMode = mode;
    $$('#cam-seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.cam === mode));
    const tgt = camTarget(mode);
    let dir, dist;
    if (mode === 'earth') {
      dir = new THREE.Vector3(0.2, 0.8, 0.56).normalize();
      const vf = camera.fov * Math.PI / 360, hf = Math.atan(Math.tan(vf) * camera.aspect);
      dist = 440 / Math.tan(Math.min(vf, hf));
    } else {
      dir = camera.position.clone().sub(controls.target);
      if (dir.lengthSq() < 1e-9) dir.set(0, 1, 1);
      dir.normalize();
      if (dir.y < 0.3) { dir.y = 0.5; dir.normalize(); }
      dist = mode === 'moon' ? R_MOON / U * K * 7 : R_EARTH / U * (K === 1 ? 2.5 : 6);
    }
    controls.target.copy(tgt);
    camera.position.copy(tgt).addScaledVector(dir, dist);
    controls.update();
    dirty = true; kick();
  }
  function followCam() {
    if (camMode === 'earth') return;
    const tgt = camTarget(camMode), delta = tgt.clone().sub(controls.target);
    if (delta.lengthSq() === 0) return;
    controls.target.add(delta); camera.position.add(delta);
  }

  // ---- HUD
  const hudTL = $('#hud-tl'), hudTR = $('#hud-tr'), hudB = $('#hud-b');
  function met(t) {
    const s = Math.max(0, t - tl.tL), d = Math.floor(s / DAY), h = Math.floor(s % DAY / 3600), mi = Math.floor(s % 3600 / 60), se = Math.floor(s % 60);
    return `T+ ${d ? d + ' d ' : ''}${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(se).padStart(2, '0')}`;
  }
  function updateHud(t, seg, warp) {
    const L = tl, p = shipPos(t), h = 1;
    const p2 = shipPos(t + h), p1 = shipPos(t - h);
    const m = moonState(t, L.lam);
    const dE = Math.hypot(p[0], p[1]), dM = Math.hypot(p[0] - m[0], p[1] - m[1]);
    let vx = (p2[0] - p1[0]) / (2 * h), vy = (p2[1] - p1[1]) / (2 * h), frame = 'Earth';
    if (dM < SOI || t > L.tof) { vx -= m[2]; vy -= m[3]; frame = 'Moon'; }
    if (t >= L.tTD) { vx = 0; vy = 0; }
    const burn = burnAt(t);
    hudTL.innerHTML = `<div class="phase-name">${seg.label}</div><div>${met(t)}</div>
      <div><span class="k">time warp</span> ×${fmt(warp * speed, 3)}</div>${burn ? `<div class="burn">● ${burn}</div>` : ''}`;
    hudTR.innerHTML = `<div><span class="k">Earth</span> ${fmt(Math.max(0, Math.round((dE - R_EARTH) / 1e3)), 4)} km up</div>
      <div><span class="k">Moon</span> ${fmt(Math.max(0, Math.round((dM - R_MOON) / 1e3)), 4)} km up</div>
      <div><span class="k">speed (${frame})</span> ${fmt(Math.hypot(vx, vy), 4)} m/s</div>
      <div><span class="k">Δv used</span> ${fmt(dvUsed(t) / 1e3, 3)} / ${fmt(L.m.dvTotal / 1e3, 3)} km/s</div>`;
    let b = '';
    if (seg.key === 'refill' || seg.key === 'orbit') {
      if (!L.feasible) b = 'Too heavy: full tanks are not enough for this mission (see the planner).';
      else if (L.nT === 0) b = 'No tankers needed: the lander already has enough propellant.';
      else {
        const k = seg.key === 'orbit' ? 0 : clamp(Math.floor((t - L.tRef0) / (L.tRefEnd - L.tRef0) * L.nT) + (t >= L.tRefEnd - 1 ? 0 : 0), 0, L.nT);
        b = `Tanker ${k} of ${L.nT} docked · ${fmt(L.m.tankTimeline[k] / 1e3, 3)} t of propellant aboard`;
      }
    } else if (seg.key === 'descent' && t > L.tPDI) {
      b = `Powered descent · altitude ${fmt(Math.max(0, dM - R_MOON), 3)} m`;
    } else if (seg.key === 'touchdown') {
      b = 'Touchdown. Welcome to the Moon.';
    } else if (seg.key === 'coast' && t > L.tof - 12 * 3600) {
      b = dM < SOI ? 'Inside the Moon\'s sphere of influence' : '';
    }
    hudB.textContent = b;
    $('#scrub-out').textContent = met(t);
  }

  // ---- phase chips
  function buildChips() {
    $('#phases').innerHTML = tl.segs.map((s, i) => `<li><button data-i="${i}">${s.label}</button></li>`).join('');
  }
  $('#phases').addEventListener('click', e => {
    const b = e.target.closest('button[data-i]'); if (!b || !tl) return;
    const s = tl.segs[+b.dataset.i];
    u = s.u0 + (s.key === 'touchdown' ? 0.01 : 0.001);
    dirty = true; kick();
  });

  // ---- per-frame update
  let lastSeg = null;
  function update() {
    if (!tl) return;
    const { t, seg, warp } = uToT(u);
    const p = shipPos(t);
    disp(p, t, ship.position);
    const m = moonState(t, tl.lam);
    moon.position.set(m[0] / U, 0, -m[1] / U);
    moon.rotation.y = Math.atan2(m[1], m[0]) + Math.PI;
    // flown path
    let n = 0; { let lo = 0, hi = pathTimes.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (pathTimes[mid] <= t) lo = mid + 1; else hi = mid; } n = lo; }
    pathLine.geometry.setDrawRange(0, n);
    lunarGroup.position.copy(moon.position);
    { let lo = 0, hi = lunarTimes.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (lunarTimes[mid] <= t) lo = mid + 1; else hi = mid; } lunarLine.geometry.setDrawRange(0, lo); }
    let nl = 0; while (nl < launchTimes.length && launchTimes[nl] <= t) nl++;
    launchLine.geometry.setDrawRange(0, nl);
    parkRing.visible = t >= tl.tOrbit && t < 1500;
    followCam();
    const dist = camera.position.distanceTo(ship.position);
    ship.scale.setScalar(Math.max(1e-4, dist * 0.007));
    const burn = burnAt(t);
    flame.visible = !!burn && burn !== 'Ascent to orbit';
    flame.position.copy(ship.position); flame.scale.setScalar(dist * 0.02);
    ship.material.color.set(burn ? 0xffc27a : 0xffffff);
    updateHud(t, seg, warp);
    if (seg !== lastSeg) {
      lastSeg = seg;
      const idx = tl.segs.indexOf(seg);
      $$('#phases button').forEach((b, i) => { b.classList.toggle('done', i < idx); if (i === idx) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    }
    $('#scrub').value = Math.round(u / tl.U * 1000);
  }

  function loop(ts) {
    raf = 0;
    if (!visible) return;
    const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (playing && tl) {
      u += dt * speed;
      if (u >= tl.U) { u = tl.U; setPlaying(false); }
      dirty = true;
    }
    const moved = controls.update();
    if (dirty || moved || playing) { update(); renderer.render(scene, camera); dirty = false; }
    if (playing || moved) raf = requestAnimationFrame(loop);
    else lastTs = 0;
  }
  function kick() { if (!raf && visible && renderer) raf = requestAnimationFrame(loop); }

  function setPlaying(on) {
    playing = on;
    $('#play-btn').textContent = on ? 'Pause' : 'Play';
    if (on) { lastTs = 0; kick(); }
  }

  // ---- controls
  $('#launch-btn').addEventListener('click', () => {
    if (!tl) return;
    if (reducedMotion()) {
      // step to the start of the next phase
      const cur = uToT(u).seg, i = tl.segs.indexOf(cur);
      const next = u >= tl.U - 1e-6 ? tl.segs[0] : (u <= 0 && i === 0 ? tl.segs[1] : tl.segs[i + 1] || tl.segs[0]);
      u = next === tl.segs[0] ? 0 : next.u0 + 0.001;
      setPlaying(false); dirty = true; kick();
      $('#launch-btn').textContent = u >= tl.segs.at(-1).u0 ? 'Start over' : 'Next phase';
      return;
    }
    if (u >= tl.U - 1e-6) u = 0;
    setPlaying(true);
    $('#launch-btn').textContent = 'Launch me';
  });
  $('#play-btn').addEventListener('click', () => { if (!tl) return; if (u >= tl.U - 1e-6) u = 0; setPlaying(!playing); });
  $('#reset-btn').addEventListener('click', () => { u = 0; setPlaying(false); setCam(camMode); $('#launch-btn').textContent = 'Launch me'; dirty = true; kick(); });
  $('#scrub').addEventListener('input', e => { if (!tl) return; u = +e.target.value / 1000 * tl.U; dirty = true; kick(); });
  const SPEEDS = [0.5, 1, 2, 5, 10];
  const seg = $('#speed-seg');
  seg.innerHTML = SPEEDS.map(s => `<button data-s="${s}" aria-pressed="false">${s}×</button>`).join('');
  function setSpeed(s) {
    speed = SPEEDS.reduce((a, b) => Math.abs(b - s) < Math.abs(a - s) ? b : a, 1);
    $$('#speed-seg button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.s === speed));
    dirty = true; kick();
  }
  setSpeed(getSettings().simSpeed);
  seg.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setSpeed(+b.dataset.s); });
  $('#cam-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { update(); setCam(b.dataset.cam); } });
  $('#size-seg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !tl) return;
    K = +b.dataset.size;
    $$('#size-seg button').forEach(x => x.setAttribute('aria-pressed', x === b));
    rebuildGeometry(); update(); setCam(camMode);
  });
  onSettings(s => {
    renderer?.setPixelRatio(Math.min(devicePixelRatio, pixelRatioCap()));
    accent = new THREE.Color(cssVar('--accent') || '#ff7a2f');
    if (pathLine) { pathLine.material.color.copy(accent); launchLine.material.color.copy(accent); lunarLine.material.color.copy(accent); }
    controls.enableDamping = !reducedMotion();
    setSpeed(s.simSpeed);
    drawAim(); if (mission) drawDvMap();
    dirty = true; kick();
  });

  try { init(); } catch (err) {
    view.insertAdjacentHTML('beforeend', `<p class="overlay" style="top:40%;left:0;right:0;text-align:center">3D view unavailable (${err.message}). The planner and plots below still work.</p>`);
  }

  return {
    rebuild() {
      if (!renderer || !plan || !mission) return;
      const firstTime = !tl;
      const frac = tl ? u / tl.U : 0;
      build();
      rebuildGeometry();
      buildChips(); lastSeg = null;
      u = firstTime ? 0 : clamp(frac * tl.U, 0, tl.U);
      ['#launch-btn', '#play-btn', '#reset-btn', '#scrub'].forEach(s => { $(s).disabled = false; });
      if (firstTime) setCam('earth');
      dirty = true; kick();
    },
  };
})();

requestPlan();
