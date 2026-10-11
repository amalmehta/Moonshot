// Home page: starfield, live headline numbers, system map, section cards.
import { tagChips, fmt, reducedMotion, onSettings, isDark, $ } from '../common.js';
import { circularVelocity, hohmann } from '../physics/orbit.js';
import { R_EARTH, MOON_SMA } from '../physics/constants.js';
import { enginePerformance } from '../physics/engine.js';
import { ENGINES } from '../data/vehicles.js';
import { falcon9Cost } from '../physics/cost.js';
import { SECTIONS as EX } from '../data/exercises/index.js';

// ---------- headline numbers (computed live by the site's own models) ----------
const mvac = enginePerformance({ ...ENGINES.mvac })(0).isp;
const tli = hohmann(R_EARTH + 200e3, MOON_SMA).dv1;
const nums = [
  [fmt(circularVelocity(R_EARTH + 200e3) / 1000, 3) + ' km/s', 'sideways speed to stay in orbit'],
  [fmt(mvac, 3) + ' s', `predicted MVac Isp (published ${ENGINES.mvac.ispVac} s)`],
  ['$' + fmt(falcon9Cost().total / 1e6, 3) + ' M', 'model cost of a reused Falcon 9 flight'],
  [fmt(tli / 1000, 3) + ' km/s', 'burn from LEO toward the Moon'],
  [String(EX.reduce((a, s) => a + s.list.length, 0)), 'exercises with worked solutions'],
];
$('#num-strip').innerHTML = nums.map(([v, k]) => `<div class="card stat"><span class="v">${v}</span><span class="k">${k}</span></div>`).join('');

// ---------- sections ----------
const CARDS = [
  { href: 'vehicles.html', icon: '🛰️', title: '3D Vehicles', text: 'Falcon 9 and Starship/Super Heavy, modelled to scale. Cut away the tanks, explode the stages, click any part.', tags: ['structures', 'engines'] },
  { href: 'propulsion.html', icon: '🔥', title: 'Propulsion', text: 'Thrust, specific impulse, the rocket equation, nozzle flow, and the Merlin vs Raptor engine cycles.', tags: ['propulsion', 'nozzles', 'combustion'] },
  { href: 'flight.html', icon: '📈', title: 'Flight Physics', text: 'Atmosphere, gravity turns, max-Q, staging and orbits, with a working ascent simulator.', tags: ['atmosphere', 'orbits'] },
  { href: 'structures.html', icon: '🔩', title: 'Hardware & Materials', text: 'Pressure vessels, buckling, why stainless steel, and how heat shields survive re-entry.', tags: ['materials', 'structures', 'thermal'] },
  { href: 'software.html', icon: '🧠', title: 'Flight Software & AI', text: 'Redundant flight computers, Kalman filters, landing guidance, and a booster-landing simulator you can crash.', tags: ['software', 'gnc', 'ai', 'reliability'] },
  { href: 'starlink.html', icon: '🌐', title: 'Starlink', text: 'Thousands of satellites in 3D, Walker constellations, phased-array beams, link budgets and laser latency.', tags: ['starlink', 'rf'] },
  { href: 'cost.html', icon: '💸', title: 'Cost', text: 'What a launch really costs, why reuse works, why propellant is nearly free, and Starship’s $/kg.', tags: ['cost', 'reuse'] },
  { href: 'moon.html', icon: '🌕', title: 'Moon Mission', text: 'Launch, refill in orbit, burn for the Moon and land, integrated in the real Earth–Moon gravity field.', tags: ['moon', 'mission', 'orbits'] },
  { href: 'exercises.html', icon: '✏️', title: 'Exercises', text: 'Every practice problem in one place, filterable by topic, with hints and worked solutions.', tags: [] },
];
$('#section-cards').innerHTML = CARDS.map(c => `<a class="card link-card" href="${c.href}"><div class="card-icon" aria-hidden="true">${c.icon}</div><h3>${c.title}</h3><p>${c.text}</p>${tagChips(c.tags)}</a>`).join('');

// ---------- system map (boxes coloured by their tag family hue) ----------
const NODES = [
  { id: 'prop', x: 30, y: 40, title: 'Propulsion', sub: 'Isp, thrust', h: 30, href: 'propulsion.html' },
  { id: 'struct', x: 30, y: 230, title: 'Hardware', sub: 'mass fraction', h: 86, href: 'structures.html' },
  { id: 'veh', x: 250, y: 135, title: '3D Vehicles', sub: 'stages, tanks', h: 86, href: 'vehicles.html' },
  { id: 'flight', x: 470, y: 40, title: 'Flight Physics', sub: 'Δv, losses, orbit', h: 236, href: 'flight.html' },
  { id: 'sw', x: 470, y: 230, title: 'Software & AI', sub: 'GNC, landing', h: 300, href: 'software.html' },
  { id: 'cost', x: 690, y: 230, title: 'Cost', sub: 'reuse → $/kg', h: 132, href: 'cost.html' },
  { id: 'moon', x: 690, y: 40, title: 'Moon Mission', sub: 'TLI, refill, land', h: 264, href: 'moon.html' },
  { id: 'starlink', x: 690, y: 135, title: 'Starlink', sub: 'fills the rockets', h: 190, href: 'starlink.html' },
];
const EDGES = [['prop', 'veh'], ['struct', 'veh'], ['veh', 'flight'], ['veh', 'sw'], ['flight', 'moon'], ['sw', 'cost'], ['flight', 'starlink'], ['starlink', 'cost'], ['sw', 'flight']];
const W = 230, H = 64;
function drawMap() {
  const dark = isDark();
  const N = Object.fromEntries(NODES.map(n => [n.id, n]));
  const edges = EDGES.map(([a, b]) => {
    const A = N[a], B = N[b];
    const ax = A.x + W / 2 - 25, ay = A.y + H / 2, bx = B.x + W / 2 - 25, by = B.y + H / 2;
    // connect box edges
    const sx = ax + Math.sign(bx - ax) * (W / 2 - 25) * (Math.abs(bx - ax) > 10 ? 1 : 0);
    const sy = ay + (Math.abs(bx - ax) > 10 ? 0 : Math.sign(by - ay) * H / 2);
    const ex = bx - Math.sign(bx - ax) * (W / 2 - 25) * (Math.abs(bx - ax) > 10 ? 1 : 0);
    const ey = by - (Math.abs(bx - ax) > 10 ? 0 : Math.sign(by - ay) * H / 2);
    const mx = (sx + ex) / 2;
    return `<path class="edge" d="M${sx},${sy} C${mx},${sy} ${mx},${ey} ${ex},${ey}"/>`;
  }).join('');
  const nodes = NODES.map(n => `<a href="${n.href}"><rect x="${n.x}" y="${n.y}" width="${W - 50}" height="${H}" rx="10"
      fill="oklch(${dark ? 0.27 : 0.95} ${dark ? 0.05 : 0.04} ${n.h})" stroke="oklch(${dark ? 0.7 : 0.6} 0.13 ${n.h})" stroke-width="1.5"/>
      <text x="${n.x + 14}" y="${n.y + 27}">${n.title}</text><text class="sub" x="${n.x + 14}" y="${n.y + 46}">${n.sub}</text></a>`).join('');
  $('#map-nodes').innerHTML = edges + nodes;
}
drawMap();
onSettings(drawMap);

// ---------- starfield (gentle drift; static when motion is reduced) ----------
const canvas = $('#stars');
const ctx = canvas.getContext('2d');
let stars = [];
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const n = Math.round(canvas.clientWidth * canvas.clientHeight / 2600);
  stars = Array.from({ length: n }, () => ({ x: Math.random() * canvas.clientWidth, y: Math.random() * canvas.clientHeight, r: Math.random() * 1.3 + 0.2, v: Math.random() * 0.15 + 0.02, a: Math.random() * 0.7 + 0.3 }));
}
function frame() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = isDark() ? '#fff' : '#3a4256';
  for (const s of stars) {
    ctx.globalAlpha = s.a * (isDark() ? 1 : 0.5);
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
    if (!reducedMotion()) { s.x -= s.v; if (s.x < -2) s.x = w + 2; }
  }
  ctx.globalAlpha = 1;
  if (!reducedMotion() && visible) requestAnimationFrame(frame);
}
let visible = true;
new IntersectionObserver(([e]) => { const was = visible; visible = e.isIntersecting; if (visible && !was) requestAnimationFrame(frame); }).observe(canvas);
new ResizeObserver(() => { resize(); requestAnimationFrame(frame); }).observe(canvas);
onSettings(() => requestAnimationFrame(frame));
