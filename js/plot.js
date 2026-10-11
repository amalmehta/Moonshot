// Tiny dependency-free canvas plotter: line/scatter series, nice ticks, legend,
// hover readout, theme-aware, HiDPI. Usage:
//   const p = linePlot(canvas, { xLabel, yLabel, series:[{name, x:[], y:[], color?, dash?}], ... });
//   p.update(newOpts)
import { cssVar, onSettings, fmt } from './common.js';

export const SERIES_COLORS = ['#3b82f6', '#f97316', '#14b8a6', '#d946ef', '#84cc16', '#eab308', '#ef4444', '#8b5cf6'];

function niceStep(range, target = 6) {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}
function ticks(min, max, target) {
  if (!(max > min)) return [min];
  const s = niceStep(max - min, target);
  const out = [];
  for (let v = Math.ceil(min / s) * s; v <= max + s * 1e-9; v += s) out.push(Math.abs(v) < s * 1e-9 ? 0 : v);
  return out;
}
function logTicks(min, max) {
  const out = [];
  if (!(min > 0) || !(max > min)) return out;
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) out.push(10 ** e);
  return out.filter(v => v >= min * 0.999 && v <= max * 1.001);
}

export function linePlot(canvas, opts) {
  let o = opts;
  let hoverX = null;
  const ctx = canvas.getContext('2d');

  function extent(key, log) {
    let lo = Infinity, hi = -Infinity;
    for (const s of o.series) for (const v of s[key]) if (Number.isFinite(v) && (!log || v > 0)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (o[key + 'Min'] !== undefined) lo = o[key + 'Min'];
    if (o[key + 'Max'] !== undefined) hi = o[key + 'Max'];
    if (lo === hi) { lo -= 1; hi += 1; }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = log ? 1 : 0; hi = log ? 10 : 1; }
    if (log && lo <= 0) { lo = hi > 0 ? hi / 1000 : 1; if (hi <= lo) hi = lo * 10; }
    if (!log && o[key + 'Min'] === undefined && o[key + 'Max'] === undefined) { const pad = (hi - lo) * 0.05; if (key === 'y') { lo -= lo === 0 ? 0 : pad; hi += pad; } }
    return [lo, hi];
  }

  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const fg = cssVar('--fg'), muted = cssVar('--fg-muted'), grid = cssVar('--plot-grid'), axis = cssVar('--plot-axis');
    const font = '11px ui-sans-serif, -apple-system, sans-serif';
    ctx.font = font;
    const [x0, x1] = extent('x', o.xLog);
    const [y0, y1] = extent('y', o.yLog);
    const L = 58, R = 14, T = o.title ? 26 : 12, B = 40;
    const pw = w - L - R, ph = h - T - B;
    const sx = v => L + (o.xLog ? (Math.log10(v) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0)) : (v - x0) / (x1 - x0)) * pw;
    const sy = v => T + ph - (o.yLog ? (Math.log10(v) - Math.log10(y0)) / (Math.log10(y1) - Math.log10(y0)) : (v - y0) / (y1 - y0)) * ph;

    if (o.title) { ctx.fillStyle = fg; ctx.font = '600 12px ui-sans-serif, sans-serif'; ctx.fillText(o.title, L, 15); ctx.font = font; }
    // grid + tick labels
    ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.fillStyle = muted;
    const xt = o.xLog ? logTicks(x0, x1) : ticks(x0, x1, Math.max(3, Math.floor(pw / 80)));
    const yt = o.yLog ? logTicks(y0, y1) : ticks(y0, y1, Math.max(3, Math.floor(ph / 45)));
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const v of xt) { const X = sx(v); ctx.beginPath(); ctx.moveTo(X, T); ctx.lineTo(X, T + ph); ctx.stroke(); ctx.fillText((o.xFormat || fmt)(v), X, T + ph + 5); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of yt) { const Y = sy(v); ctx.beginPath(); ctx.moveTo(L, Y); ctx.lineTo(L + pw, Y); ctx.stroke(); ctx.fillText((o.yFormat || fmt)(v), L - 6, Y); }
    ctx.strokeStyle = axis; ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, T + ph); ctx.lineTo(L + pw, T + ph); ctx.stroke();
    // axis labels
    ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    if (o.xLabel) ctx.fillText(o.xLabel, L + pw / 2, h - 3);
    if (o.yLabel) { ctx.save(); ctx.translate(12, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText(o.yLabel, 0, 0); ctx.restore(); }
    // reference lines
    for (const r of o.hLines || []) {
      ctx.strokeStyle = r.color || axis; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(L, sy(r.y)); ctx.lineTo(L + pw, sy(r.y)); ctx.stroke(); ctx.setLineDash([]);
      if (r.label) { ctx.fillStyle = r.color || muted; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(r.label, L + pw - 4, sy(r.y) - 2); }
    }
    for (const r of o.vLines || []) {
      ctx.strokeStyle = r.color || axis; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(sx(r.x), T); ctx.lineTo(sx(r.x), T + ph); ctx.stroke(); ctx.setLineDash([]);
      if (r.label) { ctx.save(); ctx.fillStyle = r.color || muted; ctx.translate(sx(r.x) - 3, T + ph - 4); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(r.label, 0, 0); ctx.restore(); }
    }
    // series
    ctx.save(); ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();
    o.series.forEach((s, i) => {
      const c = s.color || SERIES_COLORS[i % SERIES_COLORS.length];
      ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = s.width || 2;
      ctx.setLineDash(s.dash || []);
      if (s.points) {
        for (let k = 0; k < s.x.length; k++) { ctx.beginPath(); ctx.arc(sx(s.x[k]), sy(s.y[k]), s.radius || 3.5, 0, 7); ctx.fill(); }
      } else {
        ctx.beginPath(); let pen = false;
        for (let k = 0; k < s.x.length; k++) {
          const X = s.x[k], Y = s.y[k];
          if (!Number.isFinite(X) || !Number.isFinite(Y) || (o.yLog && Y <= 0)) { pen = false; continue; }
          pen ? ctx.lineTo(sx(X), sy(Y)) : ctx.moveTo(sx(X), sy(Y)); pen = true;
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    });
    ctx.restore();
    // legend
    const named = o.series.filter(s => s.name);
    if (named.length > 1 || o.legend) {
      let lx = L + 8, ly = T + 8;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      named.forEach(s => {
        const c = s.color || SERIES_COLORS[o.series.indexOf(s) % SERIES_COLORS.length];
        const tw = ctx.measureText(s.name).width;
        if (lx + tw + 24 > L + pw) { lx = L + 8; ly += 16; }
        ctx.fillStyle = c; ctx.fillRect(lx, ly - 4, 12, 8);
        ctx.fillStyle = fg; ctx.fillText(s.name, lx + 16, ly);
        lx += tw + 30;
      });
    }
    // hover readout
    if (hoverX !== null && hoverX >= L && hoverX <= L + pw) {
      const xv = o.xLog ? 10 ** (Math.log10(x0) + (hoverX - L) / pw * (Math.log10(x1) - Math.log10(x0))) : x0 + (hoverX - L) / pw * (x1 - x0);
      ctx.strokeStyle = axis; ctx.beginPath(); ctx.moveTo(hoverX, T); ctx.lineTo(hoverX, T + ph); ctx.stroke();
      const lines = [`${o.xLabel || 'x'}: ${fmt(xv)}`];
      o.series.forEach((s, i) => {
        if (s.points || !s.x.length) return;
        let k = 0; let best = Infinity;
        for (let j = 0; j < s.x.length; j++) { const d = Math.abs(s.x[j] - xv); if (d < best) { best = d; k = j; } }
        const c = s.color || SERIES_COLORS[i % SERIES_COLORS.length];
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx(s.x[k]), sy(s.y[k]), 3.5, 0, 7); ctx.fill();
        lines.push(`${s.name || 'y'}: ${fmt(s.y[k])}`);
      });
      ctx.font = font; const bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + 14, bh = lines.length * 15 + 8;
      const bx = hoverX + bw + 12 > L + pw ? hoverX - bw - 8 : hoverX + 8;
      ctx.fillStyle = cssVar('--bg-elev'); ctx.strokeStyle = cssVar('--border');
      ctx.fillRect(bx, T + 4, bw, bh); ctx.strokeRect(bx, T + 4, bw, bh);
      ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      lines.forEach((l, i) => ctx.fillText(l, bx + 7, T + 9 + i * 15));
    }
  }

  canvas.addEventListener('pointermove', e => { const r = canvas.getBoundingClientRect(); hoverX = e.clientX - r.left; draw(); });
  canvas.addEventListener('pointerleave', () => { hoverX = null; draw(); });
  new ResizeObserver(draw).observe(canvas);
  onSettings(() => requestAnimationFrame(draw));
  draw();
  return { update(next) { o = { ...o, ...next }; draw(); }, draw };
}
