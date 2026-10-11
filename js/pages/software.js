// Flight Software & AI page: Kalman lab, TVC lab, landing simulator + Monte Carlo,
// reliability calculator and the TMR fault-injection demo.
import { renderExercises, bindRange, fmt, cssVar, onSettings, reducedMotion, getSettings, $, $$ } from '../common.js';
import { linePlot, SERIES_COLORS } from '../plot.js';
import exercises from '../data/exercises/software.js';
import {
  simulateAltimeterFusion, simulateTVC, simulateLanding, monteCarloLandings, BOOSTER, LANDING_CRITERIA, engineAt,
} from '../physics/gnc.js';
import { G0 } from '../physics/constants.js';
import { kOfN, anyFailure, tmr, redundantVote, flipBit } from '../physics/reliability.js';

renderExercises(document.getElementById('exercise-list'), exercises);

const stat = (v, k) => `<div class="stat"><span class="v">${v}</span><span class="k">${k}</span></div>`;
const C = SERIES_COLORS;

// ===========================================================================
// Kalman filter lab
{
  let seed = 1;
  const kfPlot = linePlot($('#kf-plot'), { xLabel: 'time (s)', yLabel: 'altitude (m)', series: [] });
  const errPlot = linePlot($('#kf-err'), { xLabel: 'time (s)', yLabel: 'estimate − truth (m)', series: [] });
  const run = () => {
    const r = simulateAltimeterFusion({
      seed, duration: 40, sigmaAlt: +$('#kf-alt').value, altRate: +$('#kf-rate').value,
      sigmaAcc: +$('#kf-acc').value, accBias: +$('#kf-bias').value, estimateBias: $('#kf-estbias').checked,
    });
    const lo = Math.min(...r.truth) - 25, hi = Math.max(...r.truth) + 25;
    kfPlot.update({
      yMin: lo, yMax: hi,
      series: [
        { name: 'Altimeter fixes', x: r.tm, y: r.meas, points: true, radius: 2, color: C[7] + '99' },
        { name: 'IMU only (dead reckoning)', x: r.t, y: r.dead, color: C[1], dash: [5, 4] },
        { name: 'Truth', x: r.t, y: r.truth, color: cssVar('--fg-muted'), width: 3 },
        { name: 'Kalman estimate', x: r.t, y: r.est, color: C[2] },
      ],
    });
    const err = r.est.map((e, i) => e - r.truth[i]);
    const m = Math.max(4, ...r.sigma.slice(20).map(s => 2.5 * s), ...err.slice(20).map(Math.abs));
    errPlot.update({
      yMin: -m, yMax: m,
      series: [
        { name: '+2σ (filter belief)', x: r.t, y: r.sigma.map(s => 2 * s), color: C[3], dash: [4, 4] },
        { name: '', x: r.t, y: r.sigma.map(s => -2 * s), color: C[3], dash: [4, 4] },
        { name: 'Error', x: r.t, y: err, color: C[2] },
      ],
    });
    const inside = err.filter((e, i) => Math.abs(e) <= 2 * r.sigma[i]).length / err.length;
    $('#kf-stats').innerHTML = stat(fmt(r.rmsMeas, 2) + ' m', 'altimeter RMS error') + stat(fmt(r.rmsEst, 2) + ' m', 'filter RMS error') +
      stat(fmt(Math.abs(r.finalDeadErr), 2) + ' m', 'IMU-only drift at 40 s') + stat((inside * 100).toFixed(0) + '%', 'inside ±2σ') +
      ($('#kf-estbias').checked ? stat(fmt(r.bias.at(-1), 2) + ' m/s²', 'estimated bias') : '');
  };
  bindRange('kf-alt', run, v => v + ' m');
  bindRange('kf-rate', run, v => v + ' Hz');
  bindRange('kf-acc', run, v => v.toFixed(2) + ' m/s²');
  bindRange('kf-bias', run, v => v.toFixed(3) + ' m/s²');
  $('#kf-estbias').addEventListener('change', run);
  $('#kf-reseed').addEventListener('click', () => { seed++; run(); });
  run();
}

// ===========================================================================
// TVC lab
{
  const plot = linePlot($('#tvc-plot'), { xLabel: 'time (s)', yLabel: 'angle (deg)', series: [] });
  const run = () => {
    const lim = +$('#tvc-lim').value;
    const r = simulateTVC({
      Kp: +$('#tvc-kp').value, Kd: +$('#tvc-kd').value, Ki: +$('#tvc-ki').value, gimbalLimitDeg: lim,
      theta0Deg: +$('#tvc-th0').value, gustTorque: +$('#tvc-gust').value * 1e3,
    });
    const span = Math.max(lim * 1.3, 6, ...r.theta.map(Math.abs).filter(v => v < 60));
    plot.update({
      yMin: -Math.min(span, 60), yMax: Math.min(span, 60), xMin: 0, xMax: 12,
      hLines: [{ y: lim, label: 'gimbal limit' }, { y: -lim }],
      vLines: +$('#tvc-gust').value > 0 ? [{ x: 6, label: 'gust' }] : [],
      series: [{ name: 'Tilt θ', x: r.t, y: r.theta, color: C[0] }, { name: 'Gimbal δ', x: r.t, y: r.delta, color: C[1] }],
    });
    const kpMin = 0.6 / r.b;
    $('#tvc-result').innerHTML = r.diverged
      ? `<span class="badge bad">Tipped over</span> <span class="small muted">at t = ${fmt(r.t.at(-1), 2)} s. Needs Kp &gt; a/b = ${kpMin.toFixed(2)} for a restoring force, damping, and enough gimbal authority.</span>`
      : `<span class="badge good">Stable</span> <span class="small muted">final tilt ${fmt(r.finalTheta, 2)}°; gimbal saturated for ${fmt(r.saturatedTime, 2)} s. Stability needs Kp &gt; ${kpMin.toFixed(2)}.</span>`;
  };
  for (const [id, f] of [['tvc-kp', v => v.toFixed(2)], ['tvc-kd', v => v.toFixed(2)], ['tvc-ki', v => v.toFixed(2)],
    ['tvc-lim', v => v + '°'], ['tvc-th0', v => v + '°'], ['tvc-gust', v => v + ' kN·m']]) bindRange(id, run, f);
  run();
}

// ===========================================================================
// Landing simulator
const land = (() => {
  const canvas = $('#land-canvas');
  const ctx = canvas.getContext('2d');
  const hud = $('#land-hud');
  let guided = true;
  let result = null, frame = 0, playing = false, raf = 0, t0 = 0, viewH = null;
  let colors = {};
  const readColors = () => {
    colors = { fg: cssVar('--fg'), muted: cssVar('--fg-muted'), border: cssVar('--border'), accent: cssVar('--accent'), link: cssVar('--link'),
      good: cssVar('--good'), bad: cssVar('--bad'), warn: cssVar('--warn'), bg: cssVar('--bg-sunk'), elev: cssVar('--bg-elev') };
  };
  readColors();
  const phasePlot = linePlot($('#ld-phase'), { title: 'Speed vs altitude', xLabel: 'altitude (m)', yLabel: 'descent speed (m/s)', series: [] });
  const thrPlot = linePlot($('#ld-thr'), { title: 'Throttle', xLabel: 'time (s)', yLabel: 'throttle (%)', series: [] });

  const opts = () => ({
    seed: Math.max(1, Math.round(+$('#ld-seed').value || 1)), wind: +$('#ld-wind').value, gust: +$('#ld-gust').value,
    noise: +$('#ld-noise').value, x0: +$('#ld-x0').value, guidance: guided,
    ignitionAlt: $('#ld-ovr').checked ? +$('#ld-ign').value : null, record: true,
  });

  function draw(i) {
    const tr = result.trace;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const x = tr.x[i], z = Math.max(0, tr.z[i]);
    // camera: keep deck and booster in view; zoom smoothly as the booster descends
    const wantH = Math.max(140, z * 1.25 + 60);
    viewH = viewH == null || !playing ? wantH : viewH + (wantH - viewH) * 0.08;
    const seaY = h - 34;
    const s = Math.min((seaY - 20) / viewH, (w * 0.8) / (Math.abs(x) + 140));
    const cx = x * 0.5;
    const X = wx => w / 2 + (wx - cx) * s, Y = wz => seaY - (wz + 3) * s;
    // sea
    ctx.fillStyle = colors.link + '33';
    ctx.fillRect(0, Y(-3), w, h - Y(-3));
    ctx.strokeStyle = colors.link + '88'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, Y(-3)); ctx.lineTo(w, Y(-3)); ctx.stroke();
    // altitude ticks
    ctx.fillStyle = colors.muted; ctx.font = '11px ui-sans-serif, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const step = [10, 20, 50, 100, 200, 500, 1000, 2000][[10, 20, 50, 100, 200, 500, 1000, 2000].findIndex(v => v * s * 5 > seaY - 20)] || 2000;
    ctx.strokeStyle = colors.border;
    for (let a = step; Y(a) > 10; a += step) { ctx.beginPath(); ctx.moveTo(w - 8, Y(a)); ctx.lineTo(w, Y(a)); ctx.stroke(); ctx.fillText(a >= 1000 ? a / 1000 + ' km' : a + ' m', w - 11, Y(a)); }
    // ship (≈ 91 m deck, side view)
    const deckL = Math.max(91 * s, 46), hullD = Math.max(9 * s, 7);
    ctx.fillStyle = colors.muted;
    ctx.beginPath(); ctx.moveTo(X(0) - deckL / 2, Y(0)); ctx.lineTo(X(0) + deckL / 2, Y(0)); ctx.lineTo(X(0) + deckL / 2 - hullD * 0.6, Y(0) + hullD); ctx.lineTo(X(0) - deckL / 2 + hullD * 0.6, Y(0) + hullD); ctx.closePath(); ctx.fill();
    // target zone (±10 m)
    ctx.fillStyle = colors.good; ctx.globalAlpha = 0.55;
    ctx.fillRect(X(-LANDING_CRITERIA.miss), Y(0) - 3, Math.max(2 * LANDING_CRITERIA.miss * s, 6), 3); ctx.globalAlpha = 1;
    // trajectory trace
    ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.5; ctx.setLineDash([]);
    ctx.beginPath();
    for (let k = 0; k <= i; k += 2) { const px = X(tr.x[k]), pz = Y(Math.max(0, tr.z[k])); k ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); }
    ctx.stroke();
    if (result.ignitionTime != null) {
      const k = tr.lit.indexOf(true);
      if (k >= 0 && k <= i) { ctx.fillStyle = colors.warn; ctx.beginPath(); ctx.arc(X(tr.x[k]), Y(tr.z[k]), 4, 0, 7); ctx.fill(); }
    }
    // booster (drawn at least 40 px tall so it stays visible from altitude)
    const L = Math.max(41.2 * s, 40), D = Math.max(3.7 * s, L * 0.11);
    const tilt = tr.tilt[i] * Math.PI / 180;
    ctx.save();
    ctx.translate(X(x), Y(z));
    ctx.rotate(tilt);
    // plume
    if (tr.lit[i] && tr.thr[i] > 0) {
      const flick = reducedMotion() ? 1 : 0.85 + 0.3 * Math.random();
      const pl = (12 + 40 * tr.thr[i]) * flick * Math.min(1.6, L / 40);
      const g = ctx.createLinearGradient(0, 0, 0, pl);
      g.addColorStop(0, '#fff6d0'); g.addColorStop(0.35, '#ffb347'); g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-D * 0.35, 0); ctx.quadraticCurveTo(-D * 0.7, pl * 0.5, 0, pl); ctx.quadraticCurveTo(D * 0.7, pl * 0.5, D * 0.35, 0); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = colors.fg;
    ctx.fillRect(-D / 2, -L, D, L);
    ctx.fillStyle = colors.elev; ctx.fillRect(-D / 2 + 1, -L * 0.62, D - 2, L * 0.04); // interstage band
    // grid fins
    ctx.fillStyle = colors.fg;
    ctx.fillRect(-D / 2 - D * 0.45, -L * 0.95, D * 0.45, D * 0.35); ctx.fillRect(D / 2, -L * 0.95, D * 0.45, D * 0.35);
    // legs deploy below 400 m
    if (z < 400) {
      const legOpen = Math.min(1, (400 - z) / 150);
      ctx.strokeStyle = colors.fg; ctx.lineWidth = Math.max(1.5, D * 0.18);
      for (const sgn of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(sgn * D / 2, -L * 0.18);
        ctx.lineTo(sgn * (D / 2 + legOpen * L * 0.22), -L * 0.18 + L * 0.18 * (0.2 + 0.8 * legOpen) + 1); ctx.stroke();
      }
    }
    ctx.restore();
    // wind arrow
    const wv = tr.wind[i];
    ctx.save(); ctx.translate(16, h - 14); ctx.strokeStyle = colors.muted; ctx.fillStyle = colors.muted; ctx.lineWidth = 2;
    const al = Math.max(-40, Math.min(40, wv * 3));
    ctx.beginPath(); ctx.moveTo(40, 0); ctx.lineTo(40 + al, 0); ctx.stroke();
    if (Math.abs(al) > 3) { ctx.beginPath(); ctx.moveTo(40 + al, 0); ctx.lineTo(40 + al - Math.sign(al) * 6, -4); ctx.lineTo(40 + al - Math.sign(al) * 6, 4); ctx.fill(); }
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = '11px ui-sans-serif, sans-serif';
    ctx.fillText(`wind ${wv.toFixed(1)} m/s`, 88, 0);
    ctx.restore();
    // HUD
    const done = i >= tr.t.length - 1;
    const phase = done ? (result.success ? 'Touchdown' : 'Failed') : tr.lit[i] ? 'Landing burn' : (result.cutoffReason && i > 0 && tr.thr[i] === 0 && tr.lit.slice(0, i).some(Boolean) ? 'Engine off' : 'Falling (grid fins)');
    const prop = tr.m[i] - BOOSTER.dry;
    hud.innerHTML = `t ${tr.t[i].toFixed(1)} s · ${phase}<br>alt ${fmt(z, 3)} m · ↓ ${fmt(-tr.vz[i], 3)} m/s<br>→ ${fmt(tr.vx[i], 2)} m/s · x ${fmt(tr.x[i], 3)} m<br>throttle ${(tr.thr[i] * 100).toFixed(0)}% · prop ${fmt(prop / 1000, 3)} t`;
  }

  function showResult() {
    const r = result, c = LANDING_CRITERIA;
    const good = (v, lim) => v <= lim ? '' : ' style="color:var(--bad)"';
    $('#ld-stats').innerHTML =
      `<div class="stat"><span class="v"${good(r.vz, c.vz)}>${fmt(r.vz, 2)} m/s</span><span class="k">touchdown vertical</span></div>` +
      `<div class="stat"><span class="v"${good(r.vx, c.vx)}>${fmt(r.vx, 2)} m/s</span><span class="k">touchdown horizontal</span></div>` +
      `<div class="stat"><span class="v"${good(r.miss, c.miss)}>${fmt(r.miss, 2)} m</span><span class="k">miss distance</span></div>` +
      stat(`${fmt(r.propLeft / 1000, 2)} t`, `propellant left (${(100 * r.propLeft / BOOSTER.propAtStart).toFixed(0)}% of start)`) +
      stat(`${fmt(r.burnTime, 3)} s`, 'landing-burn time') +
      stat(r.ignitionAlt != null ? `${fmt(r.ignitionAlt / 1000, 2)} km` : '—', `ignition altitude${r.ignitionSpeed ? ' at ' + fmt(r.ignitionSpeed, 3) + ' m/s' : ''}`);
    $('#ld-verdict').innerHTML = r.success
      ? `<span class="badge good">Landed</span> <span class="small muted">seed ${opts().seed}</span>`
      : `<span class="badge bad">Lost the booster</span><ul>${r.fails.map(f => `<li>${f}</li>`).join('')}</ul>`;
    // plots
    const tr = r.trace;
    const m0 = r.startMass;
    const hs = Array.from({ length: 61 }, (_, k) => k * 100);
    const curve = frac => hs.map(hh => { const a = frac * engineAt(1, hh).thrust / m0 - G0; return a > 0 ? Math.sqrt(2 * a * hh) : NaN; });
    phasePlot.update({
      xMin: 0, xMax: 6000, yMin: 0, yMax: 340,
      series: [
        { name: 'Flown', x: tr.z.map(v => Math.max(0, v)), y: tr.vz.map(v => -v), color: C[2] },
        { name: 'Stop at full thrust', x: hs, y: curve(1), color: C[6], dash: [5, 4] },
        { name: 'Stop at 62% (plan)', x: hs, y: curve(0.62), color: C[0], dash: [2, 3] },
      ],
    });
    thrPlot.update({
      yMin: 0, yMax: 105, xMin: 0, xMax: tr.t.at(-1),
      hLines: [{ y: 100 * BOOSTER.minThrottle, label: 'minimum throttle (est.)' }],
      series: [{ name: 'Throttle', x: tr.t, y: tr.thr.map(v => v * 100), color: C[1] }],
    });
  }

  function animate(now) {
    const speed = getSettings().simSpeed || 1;
    const tSim = (now - t0) / 1000 * speed;
    const tr = result.trace;
    while (frame < tr.t.length - 1 && tr.t[frame] < tSim) frame++;
    draw(frame);
    if (frame < tr.t.length - 1) raf = requestAnimationFrame(animate);
    else { playing = false; showResult(); }
  }

  function fly(play) {
    cancelAnimationFrame(raf);
    result = simulateLanding(opts());
    viewH = null;
    if (play && !reducedMotion()) {
      playing = true; frame = 0; t0 = performance.now();
      $('#ld-verdict').innerHTML = '<span class="badge warn">Flying…</span>';
      raf = requestAnimationFrame(animate);
    } else { playing = false; frame = result.trace.t.length - 1; draw(frame); showResult(); }
  }

  $$('#lab-land [data-gm]').forEach(b => b.addEventListener('click', () => {
    guided = b.dataset.gm === 'on';
    $$('#lab-land [data-gm]').forEach(x => x.setAttribute('aria-pressed', x === b));
    fly(false);
  }));
  bindRange('ld-wind', null, v => `${v > 0 ? '+' : ''}${v} m/s`);
  bindRange('ld-gust', null, v => v + ' m/s');
  bindRange('ld-noise', null, v => v.toFixed(1) + '×');
  bindRange('ld-x0', null, v => v + ' m');
  bindRange('ld-ign', null, v => fmt(v, 4) + ' m');
  for (const id of ['ld-wind', 'ld-gust', 'ld-noise', 'ld-x0', 'ld-ign']) $('#' + id).addEventListener('change', () => fly(false));
  $('#ld-seed').addEventListener('change', () => fly(false));
  $('#ld-ovr').addEventListener('change', e => { $('#ld-ign').disabled = !e.target.checked; fly(false); });
  $('#ld-fly').addEventListener('click', () => fly(true));
  $('#ld-random').addEventListener('click', () => { $('#ld-seed').value = 1 + Math.floor(Math.random() * 99999); fly(true); });
  new ResizeObserver(() => { if (result && !playing) draw(frame); }).observe(canvas);
  onSettings(() => { readColors(); if (result && !playing) draw(frame); });
  fly(false);
})();

// ===========================================================================
// Monte Carlo
{
  const plot = linePlot($('#mc-plot'), { xLabel: 'touchdown position from target (m)', yLabel: 'vertical touchdown speed (m/s)', series: [], xMin: -30, xMax: 30, yMin: 0, yMax: 8 });
  bindRange('mc-wind', null, v => '±' + v + ' m/s');
  bindRange('mc-noise', null, v => v.toFixed(1) + '×');
  bindRange('mc-off', null, v => '±' + v + ' m');
  let worker = null;
  const show = res => {
    const ok = res.filter(r => r.success), bad = res.filter(r => !r.success);
    const c = LANDING_CRITERIA;
    const xm = Math.min(80, Math.max(20, ...res.map(r => Math.abs(r.x)).filter(v => v < 80)) * 1.15);
    const ym = Math.min(30, Math.max(c.vz * 1.6, ...res.map(r => r.vz).filter(v => v < 30)) * 1.1);
    plot.update({
      xMin: -xm, xMax: xm, yMin: 0, yMax: ym,
      vLines: [{ x: -c.miss, label: '−10 m', color: cssVar('--good') }, { x: c.miss, label: '+10 m', color: cssVar('--good') }],
      hLines: [{ y: c.vz, label: `${c.vz} m/s limit`, color: cssVar('--good') }],
      series: [
        { name: `Landed (${ok.length})`, x: ok.map(r => r.x), y: ok.map(r => r.vz), points: true, radius: 3, color: cssVar('--good') },
        { name: `Failed (${bad.length})`, x: bad.map(r => r.x), y: bad.map(r => r.vz), points: true, radius: 3.5, color: cssVar('--bad') },
      ],
      legend: true,
    });
    const off = res.filter(r => Math.abs(r.x) > xm || r.vz > ym).length;
    const miss = res.map(r => r.miss).sort((a, b) => a - b);
    const props = res.filter(r => r.success).map(r => r.propLeft);
    $('#mc-stats').innerHTML = stat(`${(100 * ok.length / res.length).toFixed(1)}%`, 'success rate') +
      stat(`${fmt(miss[Math.floor(0.5 * miss.length)], 2)} m`, 'median miss') +
      stat(`${fmt(miss[Math.floor(0.95 * miss.length)], 2)} m`, '95th-percentile miss') +
      stat(props.length ? `${fmt(Math.min(...props) / 1000, 2)} t` : '—', 'least propellant left');
    const reasons = {};
    for (const r of bad) for (const f of r.fails) { const k = f.replace(/[\d.]+ m(\/s)?/g, '…').replace(/\s+>.*$/, ''); reasons[k] = (reasons[k] || 0) + 1; }
    $('#mc-fails').innerHTML = (bad.length ? 'Failure causes: ' + Object.entries(reasons).map(([k, n]) => `${k} (${n})`).join('; ') + '. ' : '') +
      (off ? `${off} touchdown${off > 1 ? 's' : ''} off the plotted scale.` : '');
  };
  const run = () => {
    const o = { n: 200, seed: 1 + Math.floor(Math.random() * 1e6), windMax: +$('#mc-wind').value, gust: 3, noise: +$('#mc-noise').value,
      offsetMax: +$('#mc-off').value, guidance: !$('#mc-open').checked };
    const btn = $('#mc-run'); btn.disabled = true;
    const bar = $('#mc-bar');
    const finish = res => { btn.disabled = false; bar.style.width = '100%'; show(res); };
    try {
      worker?.terminate();
      worker = new Worker(new URL('./software-mc-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = e => { if (e.data.progress != null) bar.style.width = (e.data.progress * 100).toFixed(0) + '%'; if (e.data.done) finish(e.data.done); };
      worker.onerror = () => { worker = null; fallback(); };
      worker.postMessage(o);
    } catch { fallback(); }
    // main-thread fallback, 2 landings per frame
    function fallback() {
      const res = [];
      const step = () => {
        res.push(...monteCarloLandings({ ...o, start: res.length, count: 2 }));
        bar.style.width = (100 * res.length / o.n).toFixed(0) + '%';
        if (res.length < o.n) requestAnimationFrame(step); else finish(res);
      };
      requestAnimationFrame(step);
    }
  };
  $('#mc-run').addEventListener('click', run);
  $('#mc-stats').innerHTML = '<p class="small muted">Press the button to run.</p>';
}

// ===========================================================================
// Reliability: engine-out calculator
{
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const pow10 = v => '10' + String(Math.round(Math.log10(v))).split('').map(c => SUP[c]).join('');
  const plot = linePlot($('#rel-plot'), { xLabel: 'per-engine failure probability', yLabel: 'P(lose the mission)', xLog: true, yLog: true, series: [], yMin: 1e-12, yMax: 1,
    yFormat: v => v === 1 ? '1' : pow10(v), xFormat: v => v >= 0.01 ? String(v) : pow10(v) });
  const nIn = $('#rel-n'), kIn = $('#rel-k'), rIn = $('#rel-r');
  const run = () => {
    const n = +nIn.value;
    kIn.max = n; if (+kIn.value > n) kIn.value = n;
    $('output[for="rel-k"]').textContent = `${kIn.value} (tolerates ${n - kIn.value} out)`;
    const k = +kIn.value, R = +rIn.value, p = 1 - R;
    const ps = Array.from({ length: 80 }, (_, i) => 10 ** (-4 + 3 * i / 79));
    const series = [0, 1, 2, 3].filter(e => n - e >= 1).map((e, i) => ({
      name: e === 0 ? `all ${n} needed` : `${e} engine-out`, x: ps, y: ps.map(q => Math.max(1e-16, 1 - kOfN(n - e, n, 1 - q))), color: C[i],
      dash: n - e === k ? [] : [5, 4], width: n - e === k ? 3 : 1.5,
    }));
    plot.update({ series, vLines: [{ x: p, label: `p = ${fmt(p, 2)}` }] });
    const ps1 = kOfN(k, n, R);
    $('#rel-stats').innerHTML = stat(ps1 > 0.999999 ? (1 - ps1).toExponential(2) : fmt(1 - ps1, 3), 'P(lose the mission)') +
      stat((100 * anyFailure(n, p)).toFixed(2) + '%', 'P(≥ 1 engine fails)') + stat(fmt(n * p, 3), 'expected failures');
  };
  bindRange('rel-n', run, v => v);
  kIn.addEventListener('input', run);
  bindRange('rel-r', run, v => v.toFixed(4));
  $$('#lab-rel [data-pre]').forEach(b => b.addEventListener('click', () => {
    $$('#lab-rel [data-pre]').forEach(x => x.setAttribute('aria-pressed', x === b));
    if (b.dataset.pre === 'f9') { nIn.value = 9; kIn.value = 8; } else { nIn.value = 33; kIn.value = 31; }
    $('output[for="rel-n"]').textContent = nIn.value; run();
  }));
  run();
}

// ===========================================================================
// TMR fault injection
{
  const TRUE = 0x5a3c; // the correct 16-bit throttle command
  const BITS = 16;
  let strings;
  const reset = () => { strings = ['A', 'B', 'C'].map(name => ({ name, core1: TRUE, core2: TRUE, alive: true })); render(); };
  const bitHtml = (v, si, core) => {
    let s = '';
    for (let b = BITS - 1; b >= 0; b--) {
      const bit = (v >> b) & 1, wrong = ((v ^ TRUE) >> b) & 1;
      s += `<button class="bitbtn${wrong ? ' flip' : ''}" data-s="${si}" data-c="${core}" data-b="${b}" title="Flip bit ${b}" aria-label="String ${'ABC'[si]} core ${core} bit ${b} is ${bit}; flip it">${bit}</button>`;
      if (b % 4 === 0 && b) s += '<span class="gap"></span>';
    }
    return s;
  };
  function render() {
    const vote = redundantVote(strings);
    $('#tmr-strings').innerHTML = strings.map((s, i) => {
      const out = vote.outputs[i];
      const status = !s.alive ? '<span class="badge warn">powered off</span>' : out === null ? '<span class="badge bad">cores disagree → silent</span>' : out === TRUE ? '<span class="badge good">output OK</span>' : '<span class="badge bad">output WRONG (cores agree)</span>';
      return `<div class="string-card${out === null ? ' silent' : ''}"><h4>String ${s.name} ${status}</h4>
        <div class="small muted">core 1 = ${s.core1}</div><div class="bits">${bitHtml(s.core1, i, 1)}</div>
        <div class="small muted" style="margin-top:4px">core 2 = ${s.core2}</div><div class="bits">${bitHtml(s.core2, i, 2)}</div>
        <div class="chk"><button class="btn" data-pwr="${i}">${s.alive ? 'Power off' : 'Power on'}</button><button class="btn" data-fix="${i}">Repair</button></div></div>`;
    }).join('');
    const ok = vote.command === TRUE;
    $('#tmr-voter').innerHTML = `<strong>Actuator vote:</strong> ${vote.status}. Command sent: <code>${vote.command === null ? 'none (hold last safe command)' : vote.command}</code> ` +
      (vote.command === null ? '<span class="badge warn">no command</span>' : ok ? '<span class="badge good">correct</span>' : '<span class="badge bad">WRONG command reaches the engine</span>') +
      `<div class="small muted" style="margin-top:4px">Correct value: ${TRUE}. One bad core is caught by its twin; a whole bad string is out-voted by the other two. Getting a wrong command through takes two strings with identical errors in both cores, or a single remaining string that is wrong.</div>`;
  }
  $('#tmr-strings').addEventListener('click', e => {
    const b = e.target.closest('.bitbtn');
    if (b) { const s = strings[+b.dataset.s]; const key = 'core' + b.dataset.c; s[key] = flipBit(s[key], +b.dataset.b) & 0xffff; render(); return; }
    const p = e.target.closest('[data-pwr]'); if (p) { const s = strings[+p.dataset.pwr]; s.alive = !s.alive; render(); return; }
    const f = e.target.closest('[data-fix]'); if (f) { const s = strings[+f.dataset.fix]; s.core1 = s.core2 = TRUE; s.alive = true; render(); }
  });
  $('#tmr-reset').addEventListener('click', reset);
  $('#tmr-random').addEventListener('click', () => {
    const s = strings[Math.floor(Math.random() * 3)]; const key = Math.random() < 0.5 ? 'core1' : 'core2';
    s[key] = flipBit(s[key], Math.floor(Math.random() * BITS)) & 0xffff; render();
  });
  const style = document.createElement('style');
  style.textContent = `.bitbtn{font:inherit;font-family:var(--mono);font-size:.8rem;background:var(--bg-elev);color:var(--fg);border:1px solid var(--border);border-radius:4px;width:1.35em;padding:1px 0;margin:1px;cursor:pointer}
    .bitbtn.flip{color:var(--bad);border-color:var(--bad);font-weight:700}.bits .gap{display:inline-block;width:4px}`;
  document.head.appendChild(style);
  reset();
  // reliability curves
  const Rs = Array.from({ length: 101 }, (_, i) => i / 100);
  linePlot($('#tmr-plot'), {
    xLabel: 'single-unit reliability R', yLabel: 'system reliability', xMin: 0, xMax: 1, yMin: 0, yMax: 1,
    vLines: [{ x: 0.5, label: 'crossover R = ½' }],
    series: [
      { name: 'Single unit', x: Rs, y: Rs, color: C[0] },
      { name: 'TMR 3R² − 2R³', x: Rs, y: Rs.map(tmr), color: C[3] },
      { name: '2-of-3 dual-core strings (each R²)', x: Rs, y: Rs.map(r => tmr(r * r)), color: C[2], dash: [5, 4] },
    ],
  });
}
