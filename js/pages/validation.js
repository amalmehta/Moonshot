// Validation page: run every model-vs-published check and tabulate it.
import { fmt, $ } from '../common.js';
import { SECTIONS } from '../validation/index.js';
import { SOURCES } from '../data/vehicles.js';

const TITLES = { propulsion: 'Propulsion', flight: 'Flight Physics', vehicles: '3D Vehicles', structures: 'Hardware & Materials', software: 'Flight Software & AI', starlink: 'Starlink', cost: 'Cost', moon: 'Moon Mission' };
const PAGE = { propulsion: 'propulsion.html', flight: 'flight.html', vehicles: 'vehicles.html', structures: 'structures.html', software: 'software.html', starlink: 'starlink.html', cost: 'cost.html', moon: 'moon.html' };

function sourceLink(src) {
  if (!src) return '';
  const s = SOURCES[src];
  if (s) return `<a href="${s.url}" target="_blank" rel="noopener">${s.title.split(' — ')[0].split(',')[0]}</a>`;
  try { const u = new URL(src); return `<a href="${src}" target="_blank" rel="noopener">${u.hostname.replace('www.', '')}</a>`; } catch { return src; }
}
const val = (v, unit) => `${fmt(v, 4)} <span class="muted">${unit}</span>`;

async function run() {
  const tbody = $('#val-table tbody');
  let pass = 0, total = 0, worst = 0;
  // Run section by section, yielding between them so the page stays responsive (the ascent sim is the slow one).
  for (const [section, checks] of Object.entries(SECTIONS)) {
    await new Promise(r => setTimeout(r, 0));
    let rows;
    try { rows = checks(); } catch (e) { tbody.insertAdjacentHTML('beforeend', `<tr><td colspan="7" class="err">${TITLES[section]}: ${e.message}</td></tr>`); continue; }
    if (!rows.length) continue;
    tbody.insertAdjacentHTML('beforeend', `<tr class="section-row"><td colspan="7"><a href="${PAGE[section]}">${TITLES[section]}</a></td></tr>`);
    for (const c of rows) {
      const err = (c.computed - c.reported) / Math.abs(c.reported);
      const ok = Math.abs(err) <= c.tolerance;
      total++; if (ok) pass++; if (c.tolerance > 0) worst = Math.max(worst, Math.abs(err) / c.tolerance);
      const span = Math.max(c.tolerance * 1.6, Math.abs(err) * 1.2, 0.01);
      const pos = v => (50 + 50 * v / span).toFixed(1) + '%';
      tbody.insertAdjacentHTML('beforeend', `<tr>
        <td>${c.quantity}</td><td class="num">${val(c.computed, c.unit)}</td><td class="num">${val(c.reported, c.unit)}</td>
        <td class="num ${ok ? 'ok' : 'err'}">${err >= 0 ? '+' : '−'}${(Math.abs(err) * 100).toFixed(Math.abs(err) < 0.01 ? 2 : 1)} %</td>
        <td><div class="err-bar" title="tolerance ±${(c.tolerance * 100).toFixed(1)} %"><span class="tol" style="left:${pos(-c.tolerance)};width:${(100 * c.tolerance / span).toFixed(1)}%"></span><span class="mark" style="left:calc(${pos(err)} - 1px)"></span></div>
          <span class="badge ${ok ? 'good' : 'bad'}">${ok ? 'pass' : 'fail'}</span> <span class="small muted">±${(c.tolerance * 100).toFixed(c.tolerance < 0.01 ? 1 : 0)} %</span></td>
        <td class="small">${sourceLink(c.source)}</td><td class="note">${c.note || ''}</td></tr>`);
    }
    $('#val-summary').innerHTML = summary(pass, total, worst, false);
  }
  $('#val-summary').innerHTML = summary(pass, total, worst, true);
}
function summary(pass, total, worst, done) {
  return `<div class="stat"><span class="v ${pass === total ? 'ok' : 'err'}">${pass} / ${total}</span><span class="k">checks within tolerance${done ? '' : ' (running…)'}</span></div>
    <div class="stat"><span class="v">${Object.values(SECTIONS).length}</span><span class="k">sections</span></div>
    <div class="stat"><span class="v">${(worst * 100).toFixed(0)} %</span><span class="k">worst error as share of its tolerance</span></div>`;
}
run();
