// Flight physics page: atmosphere profile, ascent simulator, staging explorer, Hohmann calculator.
import { renderExercises, bindRange, fmt, cssVar, onSettings, $, $$ } from '../common.js';
import { linePlot, SERIES_COLORS } from '../plot.js';
import { atmosphere } from '../physics/atmosphere.js';
import { simulateAscent, presetFromVehicle } from '../physics/ascent.js';
import { payloadFractionIdenticalStages } from '../physics/rocket.js';
import { hohmann } from '../physics/orbit.js';
import { R_EARTH } from '../physics/constants.js';
import { VEHICLES, ENGINES, SOURCES } from '../data/vehicles.js';
import exercises from '../data/exercises/flight.js';

// ---------- atmosphere profile ----------
{
  const z = Array.from({ length: 121 }, (_, i) => i);
  const a = z.map(k => atmosphere(k * 1000));
  linePlot($('#atm-plot'), {
    xLabel: 'Altitude (km)', yLabel: 'Fraction of sea-level value (log)', yLog: true, yMin: 1e-7, yMax: 2,
    series: [
      { name: 'Pressure', x: z, y: a.map(s => s.p / 101325) },
      { name: 'Density', x: z, y: a.map(s => s.rho / 1.225) },
      { name: 'Temperature', x: z, y: a.map(s => s.T / 288.15) },
    ],
    yFormat: v => v >= 0.01 ? String(v) : v.toExponential(0),
  });
}

// ---------- ascent simulator ----------
let vehicle = 'falcon9';
const payloadIn = $('#as-payload');
const RANGES = { falcon9: { max: 40, step: 0.5, def: 15, kick: 4 }, starship: { max: 300, step: 5, def: 100, kick: 2.5 } };
const trajPlot = linePlot($('#as-traj'), { title: 'Trajectory', xLabel: 'Downrange (km)', yLabel: 'Altitude (km)', series: [] });
const speedPlot = linePlot($('#as-speed'), { title: 'Speed and altitude', xLabel: 'Time (s)', yLabel: 'km/s · 100 km', series: [] });
const qPlot = linePlot($('#as-q-plot'), { title: 'Loads', xLabel: 'Time (s)', yLabel: 'q (kPa) · accel (g×10)', series: [] });

function config(payloadKg) {
  return {
    ...presetFromVehicle(VEHICLES[vehicle], { ENGINES, boosterReserve: +$('#as-res').value / 100 }),
    payload: payloadKg ?? +payloadIn.value * 1000,
    pitchKickAngle: +$('#as-kick').value,
    qLimit: +$('#as-q').value * 1000,
    targetAlt: +$('#as-alt').value * 1000,
  };
}

function run() {
  const res = simulateAscent(config());
  const h = res.history;
  const byStage = s => h.filter(p => p.stage === s);
  const stageColors = [SERIES_COLORS[1], SERIES_COLORS[0]];
  trajPlot.update({
    series: [0, 1].map(s => ({ name: s === 0 ? 'Booster' : 'Upper stage', x: byStage(s).map(p => p.downrange / 1000), y: byStage(s).map(p => p.alt / 1000), color: stageColors[s] })),
    hLines: [{ y: +$('#as-alt').value, label: 'target orbit' }],
  });
  const t = h.map(p => p.t);
  const meco = res.events.find(e => e.name.startsWith('MECO'));
  const vlines = meco ? [{ x: meco.t, label: 'MECO' }, { x: res.maxQ.t, label: 'max-Q' }] : [{ x: res.maxQ.t, label: 'max-Q' }];
  speedPlot.update({ series: [{ name: 'Inertial speed (km/s)', x: t, y: h.map(p => p.speed / 1000) }, { name: 'Altitude (100 km)', x: t, y: h.map(p => p.alt / 1e5) }], vLines: vlines });
  qPlot.update({ series: [{ name: 'Dynamic pressure (kPa)', x: t, y: h.map(p => p.q / 1000) }, { name: 'Acceleration (g × 10)', x: t, y: h.map(p => p.accel * 10) }], vLines: vlines });

  const o = res.orbit;
  const badge = res.success ? '<span class="badge good">Orbit reached</span>' : '<span class="badge bad">Didn’t make orbit</span>';
  $('#as-result').innerHTML = `${badge}
    <div class="stats" style="margin-top:8px">
      <div class="stat"><span class="v">${fmt(res.maxQ.q / 1000, 3)}</span><span class="k">max-Q (kPa) at T+${res.maxQ.t.toFixed(0)} s</span></div>
      <div class="stat"><span class="v">${res.success ? `${fmt(o.perigeeAlt / 1000, 3)}×${fmt(o.apogeeAlt / 1000, 3)}` : fmt(Math.max(0, o.apogeeAlt) / 1000, 3)}</span><span class="k">${res.success ? 'orbit (km)' : 'apogee reached (km)'}</span></div>
    </div>
    <ol class="events">${res.events.map(e => `<li>T+${e.t.toFixed(0)} s: ${e.name}</li>`).join('')}</ol>`;

  const L = res.losses, gained = L.idealDv - L.gravity - L.drag - L.steering;
  const parts = [['Speed gained', gained, 236], ['Gravity loss', L.gravity, 30], ['Drag loss', L.drag, 86], ['Steering loss', L.steering, 300]];
  const total = parts.reduce((s, p) => s + Math.max(0, p[1]), 0);
  $('#loss-panel').innerHTML = `
    <div class="row"><strong>This flight: ${fmt(L.idealDv, 4)} m/s from the engines</strong><span class="spacer"></span><span class="muted small">+ ${fmt(res.surfaceSpeed, 3)} m/s free from Earth’s rotation</span></div>
    <div class="loss-bar">${parts.map(([n, v, hue]) => `<div style="width:${(100 * Math.max(0, v) / total).toFixed(2)}%;background:oklch(0.6 0.14 ${hue})" title="${n}: ${fmt(v, 3)} m/s">${v / total > 0.08 ? n : ''}</div>`).join('')}</div>
    <div class="row small">${parts.map(([n, v, hue]) => `<span><span class="legend-swatch" style="background:oklch(0.6 0.14 ${hue})"></span>${n}: <strong>${fmt(v, 3)}</strong> m/s</span>`).join('')}</div>`;
}

$('#as-run').addEventListener('click', run);
$('#as-max').addEventListener('click', async () => {
  const btn = $('#as-max'); btn.disabled = true; btn.textContent = 'Searching…';
  const tick = () => new Promise(r => setTimeout(r, 0));
  let lo = 0, hi = RANGES[vehicle].max * 1000 * 1.2;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (simulateAscent(config(mid)).success) lo = mid; else hi = mid;
    await tick();
  }
  payloadIn.value = Math.min(+payloadIn.max, Math.floor(lo / 1000 / RANGES[vehicle].step) * RANGES[vehicle].step);
  payloadIn.dispatchEvent(new Event('input'));
  btn.disabled = false; btn.textContent = 'Find max payload';
  run();
  $('#as-result').insertAdjacentHTML('afterbegin', `<p class="small"><strong>Max payload ≈ ${fmt(lo / 1000, 3)} t</strong> with these settings. Published: ${vehicle === 'falcon9' ? '22.8 t expendable, ~17 t with the booster recovered' : '100–150 t (V2, SpaceX stated; dry masses here are estimates)'}.</p>`);
});
$$('[data-veh]').forEach(b => b.addEventListener('click', () => {
  vehicle = b.dataset.veh;
  $$('[data-veh]').forEach(x => x.setAttribute('aria-pressed', x === b));
  const R = RANGES[vehicle];
  payloadIn.max = R.max; payloadIn.step = R.step; payloadIn.value = R.def;
  $('#as-kick').value = R.kick;
  payloadIn.dispatchEvent(new Event('input')); $('#as-kick').dispatchEvent(new Event('input'));
  run();
}));
bindRange('as-payload', null, v => fmt(v, 3) + ' t');
bindRange('as-kick', null, v => v + '°');
bindRange('as-q', null, v => v + ' kPa');
bindRange('as-res', null, v => v + ' %');
bindRange('as-alt', null, v => v + ' km');
run();

// ---------- staging explorer ----------
function updateStaging() {
  const isp = +$('#st-isp').value, eps = +$('#st-eps').value, dv = +$('#st-dv').value;
  const N = [1, 2, 3, 4, 5, 6];
  const pis = N.map(n => payloadFractionIdenticalStages(dv, isp, eps, n) * 100);
  stPlot.update({ series: [{ name: 'Payload fraction', x: N, y: pis }, { name: '', x: N, y: pis, points: true }] });
  const best = N[pis.indexOf(Math.max(...pis))];
  $('#st-note').innerHTML = pis.every(p => p === 0)
    ? 'No number of stages works: the structure is too heavy for this Isp and Δv.'
    : `Best: <strong>${best} stage${best > 1 ? 's' : ''}</strong> at ${pis[best - 1].toFixed(2)} %. Going from 1→2 stages ${pis[0] > 0 ? `multiplies payload by ${(pis[1] / pis[0]).toFixed(1)}×` : 'makes the mission possible at all'}; beyond 3, extra stages add cost and failure points for little gain.`;
}
const stPlot = linePlot($('#st-plot'), { xLabel: 'Number of stages', yLabel: 'Payload fraction (%)', yMin: 0, series: [] });
bindRange('st-isp', updateStaging, v => v + ' s');
bindRange('st-eps', updateStaging, v => v.toFixed(3));
bindRange('st-dv', updateStaging, v => fmt(v, 3) + ' m/s');
updateStaging();

// ---------- Hohmann calculator ----------
const hoCanvas = $('#hohmann-canvas');
function updateHohmann() {
  const r1 = R_EARTH + +$('#ho-r1').value * 1000, r2 = R_EARTH + +$('#ho-r2').value * 1000;
  const h = hohmann(r1, r2);
  $('#ho-dv1').textContent = fmt(h.dv1, 4);
  $('#ho-dv2').textContent = fmt(h.dv2, 4);
  $('#ho-tot').textContent = fmt(h.total, 4);
  $('#ho-tof').textContent = h.tof > 86400 ? fmt(h.tof / 86400, 3) + ' d' : fmt(h.tof / 3600, 3) + ' h';
  const c = hoCanvas, ctx = c.getContext('2d'), dpr = Math.min(devicePixelRatio || 1, 2);
  const w = c.clientWidth, H = c.clientHeight;
  c.width = w * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, H);
  if (Math.min(w, H) <= 32) return; // no room for the 16 px margins yet (hidden or background tab); the ResizeObserver redraws
  const rmax = Math.max(r1, r2);
  const s = (Math.min(w, H) / 2 - 16) / rmax;
  const a = (r1 + r2) / 2, e = Math.abs(r2 - r1) / (r1 + r2);
  const cx = w / 2 + (r2 > r1 ? (a - r1) * s : -(a - r2) * s) * 0, cy = H / 2;
  const fg = cssVar('--fg-muted');
  // Earth
  ctx.fillStyle = 'oklch(0.6 0.12 236)'; ctx.beginPath(); ctx.arc(cx, cy, Math.max(3, R_EARTH * s), 0, 7); ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = SERIES_COLORS[0]; ctx.beginPath(); ctx.arc(cx, cy, r1 * s, 0, 7); ctx.stroke();
  ctx.strokeStyle = SERIES_COLORS[2]; ctx.beginPath(); ctx.arc(cx, cy, r2 * s, 0, 7); ctx.stroke();
  // transfer half-ellipse: perigee at r1 on the +x side, apogee at r2 on the −x side (focus at Earth)
  ctx.strokeStyle = SERIES_COLORS[1]; ctx.setLineDash([6, 4]); ctx.beginPath();
  for (let k = 0; k <= 180; k++) {
    const nu = k * Math.PI / 180;
    const rr = a * (1 - e * e) / (1 + e * Math.cos(nu)) * s;
    const sign = r2 >= r1 ? 1 : -1;
    const X = cx + sign * rr * Math.cos(nu), Y = cy - rr * Math.sin(nu);
    k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
  }
  ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = cssVar('--accent');
  const p1 = r2 >= r1 ? [cx + r1 * s, cy] : [cx - r1 * s, cy], p2 = r2 >= r1 ? [cx - r2 * s, cy] : [cx + r2 * s, cy];
  for (const [X, Y] of [p1, p2]) { ctx.beginPath(); ctx.arc(X, Y, 4.5, 0, 7); ctx.fill(); }
  ctx.fillStyle = fg; ctx.font = '11px ui-sans-serif, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(`burn 1: ${fmt(h.dv1, 3)} m/s`, Math.min(p1[0] + 6, w - 110), p1[1] + 16);
  ctx.textAlign = 'left'; ctx.fillText(`burn 2: ${fmt(h.dv2, 3)} m/s`, Math.max(4, p2[0] + 6), p2[1] - 8);
}
$$('[data-preset]').forEach(b => b.addEventListener('click', () => { const el = $('#ho-r2'); el.value = b.dataset.preset; el.dispatchEvent(new Event('input')); }));
bindRange('ho-r1', updateHohmann, v => fmt(v, 4) + ' km');
bindRange('ho-r2', updateHohmann, v => fmt(v, 4) + ' km');
updateHohmann();
new ResizeObserver(updateHohmann).observe(hoCanvas);
onSettings(() => { updateHohmann(); run(); });

renderExercises($('#exercise-list'), exercises);
$('#source-list').innerHTML = ['ussa', 'sutton', 'f9', 'f9guide', 'wikiF9', 'starship']
  .map(k => `<li><a href="${SOURCES[k].url}" target="_blank" rel="noopener">${SOURCES[k].title}</a></li>`).join('');
