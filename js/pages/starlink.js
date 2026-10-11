// Starlink page: shell table, live 3D constellation globe, coverage calculator + numerical
// visibility plot, phased-array demo, link budget, laser-route latency and the bus/decay lab.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { renderExercises, bindRange, fmt, $, $$, onSettings, reducedMotion, pixelRatioCap, cssVar, typeset } from '../common.js';
import { linePlot, SERIES_COLORS } from '../plot.js';
import exercises from '../data/exercises/starlink.js';
import { R_EARTH, DEG, C_LIGHT, OMEGA_EARTH, DAY, MU_EARTH as MU } from '../physics/constants.js';
import * as S from '../physics/starlink.js';

renderExercises(document.getElementById('exercise-list'), exercises);

// ---------------------------------------------------------------------------
// Colours: shells use the Starlink tag hue family (oklch), converted to sRGB for WebGL.
function oklchToSrgb(L, C, h) {
  const a = C * Math.cos(h * DEG), b = C * Math.sin(h * DEG);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
  return lin.map(x => { x = Math.min(1, Math.max(0, x)); return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055; });
}
const SHELL_CHROMA = 0.13;
const shellCss = s => `oklch(${s.l} ${SHELL_CHROMA} ${s.h})`;

// ---------------------------------------------------------------------------
// 1. Shell table
{
  const rows = [...S.SHELLS_GEN1, ...S.SHELLS_GEN2].map(s => {
    const a = R_EARTH + s.alt, T = S.orbitalPeriod(a) / 60;
    const drift = S.radPerSecToDegPerDay(S.nodalPrecession(a, s.inc * DEG));
    return `<tr><td><span class="legend-swatch" style="background:${shellCss(s)};border-radius:50%"></span>${s.gen === 2 ? 'Gen2' : 'Gen1'} ${s.family}</td>
      <td class="num">${s.alt / 1e3} km</td><td class="num">${s.inc}°</td><td class="num">${s.planes} × ${s.perPlane}</td>
      <td class="num">${S.shellCount(s).toLocaleString('en-US')}</td><td class="num">${S.walkerNotation(s)}</td>
      <td class="num">${T.toFixed(2)} min</td><td class="num">${drift > 0 ? '+' : '−'}${Math.abs(drift).toFixed(3)}°/day</td></tr>`;
  });
  rows.push(`<tr><td><strong>Gen1 total</strong></td><td></td><td></td><td></td><td class="num"><strong>${S.totalSatellites(S.SHELLS_GEN1).toLocaleString('en-US')}</strong></td><td colspan="3" class="small muted">FCC 21-48</td></tr>`);
  $('#shell-table tbody').innerHTML = rows.join('');
}

// ---------------------------------------------------------------------------
// 2. Globe
const CITY_NAMES = Object.fromEntries($$('#city option').map(o => [o.value, o.textContent]));
const globe = (() => {
  const view = $('#globe-view');
  const hud = $('#hud'), hudTime = $('#hud-time');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, pixelRatioCap()));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  view.prepend(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '3D globe with Starlink satellites');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  camera.position.set(2.2, 2.4, 3.6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.minDistance = 1.4; controls.maxDistance = 9; controls.enablePan = false;

  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(5, 2, 3); scene.add(sun);

  // Earth-fixed frame: physics ECEF (x→lon 0, z→north) maps to three (x, z, −y), y up.
  const earthFrame = new THREE.Group(); scene.add(earthFrame);
  const earthMat = new THREE.MeshPhongMaterial({ color: 0x1d3f6e, shininess: 8 });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), earthMat);
  earthFrame.add(earth);
  new THREE.TextureLoader().load('https://cdn.jsdelivr.net/gh/mrdoob/three.js@r169/examples/textures/planets/earth_atmos_2048.jpg', tex => {
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    earthMat.map = tex; earthMat.color.set(0xffffff); earthMat.needsUpdate = true; dirty = true;
  }, undefined, () => { /* offline: keep the plain ocean colour + graticule */ });
  // graticule every 30°
  {
    const pts = [];
    const p = (la, lo) => { const u = S.groundUnit(la, lo); return new THREE.Vector3(u[0] * 1.001, u[2] * 1.001, -u[1] * 1.001); };
    for (let la = -60; la <= 60; la += 30) for (let lo = 0; lo < 360; lo += 3) pts.push(p(la, lo), p(la, lo + 3));
    for (let lo = 0; lo < 360; lo += 30) for (let la = -90; la < 90; la += 3) pts.push(p(la, lo), p(la + 3, lo));
    earthFrame.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x9fb4d8, transparent: true, opacity: 0.18 })));
  }

  // Satellites: one Points object, positions/colours/sizes rewritten each frame.
  const MAXN = S.totalSatellites(S.SHELLS_GEN1) + S.totalSatellites(S.SHELLS_GEN2);
  const posAttr = new THREE.BufferAttribute(new Float32Array(3 * MAXN), 3).setUsage(THREE.DynamicDrawUsage);
  const colAttr = new THREE.BufferAttribute(new Float32Array(3 * MAXN), 3).setUsage(THREE.DynamicDrawUsage);
  const sizeAttr = new THREE.BufferAttribute(new Float32Array(MAXN), 1).setUsage(THREE.DynamicDrawUsage);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', posAttr); geo.setAttribute('color', colAttr); geo.setAttribute('size', sizeAttr);
  const satMat = new THREE.ShaderMaterial({
    uniforms: { pr: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute float size; attribute vec3 color; varying vec3 vColor; uniform float pr;
      void main() { vColor = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * pr; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vColor;
      void main() { vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; gl_FragColor = vec4(vColor, smoothstep(0.5, 0.3, r)); }`,
    transparent: true, depthWrite: false,
  });
  const points = new THREE.Points(geo, satMat);
  points.frustumCulled = false;
  earthFrame.add(points);

  // user marker + serving link + laser route
  const userMarker = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff7a2f }));
  earthFrame.add(userMarker);
  const linkGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const link = new THREE.Line(linkGeo, new THREE.LineBasicMaterial({ color: 0xffb36b }));
  link.frustumCulled = false; earthFrame.add(link);
  const routeGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 200), 3));
  const route = new THREE.Line(routeGeo, new THREE.LineBasicMaterial({ color: 0xff4fd8 }));
  route.frustumCulled = false; route.visible = false; earthFrame.add(route);

  // state
  let con, ecef, N = 0, baseColors;
  let t = 0, warp = 60, dirty = true, visibleOnScreen = true;
  let user = { lat: 47.6062, lon: -122.3321, name: 'Seattle' };
  let elevMin = 25 * DEG;
  const highlight = oklchToSrgb(0.97, 0.06, 95);
  const serving = [1, 0.48, 0.18];

  function setShells(gen2) {
    const shells = gen2 ? [...S.SHELLS_GEN1, ...S.SHELLS_GEN2] : S.SHELLS_GEN1;
    con = S.buildConstellation(shells);
    N = con.N; ecef = new Float64Array(3 * N);
    baseColors = new Float32Array(3 * N);
    const pal = shells.map(s => oklchToSrgb(s.l, SHELL_CHROMA, s.h));
    for (let n = 0; n < N; n++) baseColors.set(pal[con.shell[n]], 3 * n);
    geo.setDrawRange(0, N);
    $('#shell-legend').innerHTML = shells.map(s => `<span><span class="sw" style="background:${shellCss(s)}"></span>${s.name}: ${S.shellCount(s).toLocaleString('en-US')}</span>`).join('')
      + `<span><span class="sw" style="background:oklch(0.97 0.06 95)"></span>in view of the user</span>`;
    route.visible = false; $('#route-out').textContent = '';
    dirty = true;
  }

  const toThree = (x, y, z, out, k) => { out[k] = x; out[k + 1] = z; out[k + 2] = -y; };

  function placeUser() {
    const u = S.groundUnit(user.lat, user.lon);
    userMarker.position.set(u[0], u[2], -u[1]);
    dirty = true;
  }

  function update() {
    S.positionsAt(con, t, ecef);
    const P = posAttr.array, Cc = colAttr.array, Z = sizeAttr.array;
    const inv = 1 / R_EARTH;
    for (let n = 0; n < N; n++) {
      const k = 3 * n;
      toThree(ecef[k] * inv, ecef[k + 1] * inv, ecef[k + 2] * inv, P, k);
      Cc[k] = baseColors[k]; Cc[k + 1] = baseColors[k + 1]; Cc[k + 2] = baseColors[k + 2];
      Z[n] = 2.4;
    }
    const gu = S.groundUnit(user.lat, user.lon), g = gu.map(v => v * R_EARTH);
    const vis = S.visibleFrom(ecef, N, g, elevMin);
    for (const v of vis) { Cc.set(highlight, 3 * v.n); Z[v.n] = 4.2; }
    const LP = linkGeo.attributes.position.array;
    if (vis.length) {
      const s = vis[0];
      Cc.set(serving, 3 * s.n); Z[s.n] = 6.5;
      toThree(gu[0], gu[1], gu[2], LP, 0);
      LP[3] = P[3 * s.n]; LP[4] = P[3 * s.n + 1]; LP[5] = P[3 * s.n + 2];
      link.visible = true; linkGeo.attributes.position.needsUpdate = true;
    } else link.visible = false;
    posAttr.needsUpdate = colAttr.needsUpdate = sizeAttr.needsUpdate = true;
    earthFrame.rotation.y = (OMEGA_EARTH * t) % (2 * Math.PI); // Earth turns; orbits stay inertial
    // readouts
    const r = vis.length ? vis[0].range : NaN;
    const ow = r / C_LIGHT * 1e3;
    $('#st-vis').textContent = vis.length;
    $('#st-range').textContent = vis.length ? `${fmt(r / 1e3, 4)} km` : 'none';
    $('#st-lat').textContent = vis.length ? `${ow.toFixed(2)} ms` : '–';
    $('#st-rtt').textContent = vis.length ? `${(4 * ow).toFixed(1)} ms` : '–';
    hud.innerHTML = `${user.name} · ${user.lat.toFixed(1)}°, ${user.lon.toFixed(1)}°<br>${vis.length} satellites above ${Math.round(elevMin / DEG)}°` +
      (vis.length ? `<br>serving: ${fmt(r / 1e3, 4)} km, elev ${(vis[0].elev / DEG).toFixed(0)}°, ${ow.toFixed(2)} ms` : '<br>no satellite in view');
    const hh = t / 3600;
    hudTime.textContent = `t = ${Math.floor(hh)} h ${String(Math.floor((t % 3600) / 60)).padStart(2, '0')} min · ${warp ? warp + '×' : 'paused'}`;
  }

  function resize() {
    const w = view.clientWidth, h = view.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    dirty = true;
  }
  new ResizeObserver(resize).observe(view);
  new IntersectionObserver(([e]) => { visibleOnScreen = e.isIntersecting; if (visibleOnScreen) dirty = true; }).observe(view);
  controls.addEventListener('change', () => { dirty = true; });

  // click / tap to move the user (ignore drags)
  let down = null;
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(earth)[0];
    if (!hit) return;
    const p = earthFrame.worldToLocal(hit.point.clone()).normalize();
    // three (x, y, z) = ecef (x, z, −y)
    user = { lat: Math.asin(p.y) / DEG, lon: Math.atan2(-p.z, p.x) / DEG, name: 'Clicked point' };
    $('#city').value = 'custom';
    placeUser();
  });

  let last = performance.now();
  function frame(now) {
    // the first rAF timestamp can precede the performance.now() taken at setup: never step backwards
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
    if (visibleOnScreen) {
      if (warp) { t += dt * warp; dirty = true; }
      if (controls.update()) dirty = true;
      if (dirty) { update(); renderer.render(scene, camera); dirty = false; }
    }
    requestAnimationFrame(frame);
  }

  onSettings(() => { renderer.setPixelRatio(Math.min(devicePixelRatio, pixelRatioCap())); satMat.uniforms.pr.value = renderer.getPixelRatio(); resize(); });

  setShells(false); placeUser(); resize();
  requestAnimationFrame(frame);

  return {
    setShells, placeUser,
    setUser(u) { user = u; placeUser(); },
    setElev(e) { elevMin = e * DEG; dirty = true; },
    setWarp(w) { warp = w; dirty = true; },
    get t() { return t; },
    get con() { return con; },
    showRoute(r) {
      const A = routeGeo.attributes.position.array;
      const pts = [r.gA, ...r.path.map(n => [r.pos[3 * n], r.pos[3 * n + 1], r.pos[3 * n + 2]]), r.gB];
      pts.forEach((p, i) => toThree(p[0] / R_EARTH, p[1] / R_EARTH, p[2] / R_EARTH, A, 3 * i));
      routeGeo.setDrawRange(0, pts.length);
      routeGeo.attributes.position.needsUpdate = true;
      route.visible = true; dirty = true;
    },
    hideRoute() { route.visible = false; dirty = true; },
  };
})();

// globe controls
const warpButtons = $$('#warp button');
function setWarp(w) {
  warpButtons.forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.w === w)));
  globe.setWarp(w);
  if (w) globe.hideRoute();
}
warpButtons.forEach(b => b.addEventListener('click', () => setWarp(+b.dataset.w)));
setWarp(reducedMotion() ? 0 : 60);
$('#gen2').addEventListener('change', e => globe.setShells(e.target.checked));
$('#city').addEventListener('change', e => {
  if (e.target.value === 'custom') return;
  const [lat, lon] = e.target.value.split(',').map(Number);
  globe.setUser({ lat, lon, name: CITY_NAMES[e.target.value] });
});
bindRange('elev', v => globe.setElev(v), v => `${v}°`);

const LONDON = { lat: 51.5074, lon: -0.1278 }, NYC = { lat: 40.7128, lon: -74.006 };
const LN_DIST = S.centralAngle(LONDON.lat, LONDON.lon, NYC.lat, NYC.lon) * R_EARTH;
$('#route-btn').addEventListener('click', () => {
  // the route uses the 550 km / 53° shell, which is shell 0 in both layouts
  const r = S.laserRoute(globe.con, 0, globe.t, LONDON, NYC, 25);
  setWarp(0);
  if (!r) { $('#route-out').textContent = 'No route at this instant (one end has no 550 km satellite in view). Advance time and try again.'; return; }
  globe.showRoute(r);
  $('#route-out').innerHTML = `<strong>London → New York, snapshot:</strong> ${r.hops + 1} satellites, ${r.hops} laser hops, ${fmt(r.length / 1e3, 4)} km, <strong>${(r.latency * 1e3).toFixed(2)} ms</strong> one way (straight fibre: ${(S.fiberLatency(LN_DIST) * 1e3).toFixed(1)} ms). Time is paused; press a warp button to resume.`;
});

// ---------------------------------------------------------------------------
// 3. Coverage calculator + visible-vs-latitude plot
{
  const out = $('#cv-out');
  const upd = () => {
    const h = +$('#cv-h').value * 1e3, e = +$('#cv-e').value * DEG;
    const fp = S.footprint(h, e), d = S.slantRange(h, e);
    out.innerHTML = `
      <tr><td>Central angle \\(\\lambda\\)</td><td>${(fp.lambda / DEG).toFixed(2)}°</td></tr>
      <tr><td>Footprint radius</td><td>${fmt(fp.radius / 1e3, 4)} km</td></tr>
      <tr><td>Footprint area</td><td>${fmt(fp.area / 1e6 / 1e6, 3)} M km²</td></tr>
      <tr><td>Fraction of Earth</td><td>${(fp.fraction * 100).toFixed(3)}%</td></tr>
      <tr><td>Max slant range</td><td>${fmt(d / 1e3, 4)} km</td></tr>
      <tr><td>Edge one-way delay</td><td>${(d / C_LIGHT * 1e3).toFixed(2)} ms</td></tr>
      <tr><td>Period</td><td>${(S.orbitalPeriod(R_EARTH + h) / 60).toFixed(1)} min</td></tr>
      <tr><td>Honeycomb lower bound \\(N_{\\min}\\)</td><td>${S.satellitesForCoverage(h, e).toLocaleString('en-US')}</td></tr>`;
    typeset(out);
  };
  bindRange('cv-h', upd, v => `${v} km`);
  bindRange('cv-e', upd, v => `${v}°`);
  upd();

  const lats = []; for (let l = -90; l <= 90; l += 2) lats.push(l);
  const series = [
    { name: 'Gen1 mean', x: lats, y: lats.map(() => NaN), color: shellCss(S.SHELLS_GEN1[0]) },
    { name: 'Gen1 worst case', x: lats, y: lats.map(() => NaN), color: shellCss(S.SHELLS_GEN1[1]), dash: [5, 4] },
    { name: 'Gen1 + Gen2 mean', x: lats, y: lats.map(() => NaN), color: SERIES_COLORS[1] },
  ];
  const plot = linePlot($('#vis-plot'), { title: 'Satellites above 25° elevation vs latitude', xLabel: 'Latitude (°)', yLabel: 'Satellites in view', xMin: -90, xMax: 90, yMin: 0, series });
  let started = false;
  const start = () => {
    if (started) return; started = true;
    const samp1 = S.visibilitySampler(S.buildConstellation(S.SHELLS_GEN1));
    let samp2 = null;
    let i = 0, phase = 0;
    const step = () => {
      const t0 = performance.now();
      while (performance.now() - t0 < 12 && phase < 2) {
        if (phase === 0) { const r = samp1(lats[i]); series[0].y[i] = r.mean; series[1].y[i] = r.min; }
        else { const r = samp2(lats[i]); series[2].y[i] = r.mean; }
        if (++i >= lats.length) { i = 0; phase++; if (phase === 1) { plot.update({ series }); setTimeout(() => { samp2 = S.visibilitySampler(S.buildConstellation([...S.SHELLS_GEN1, ...S.SHELLS_GEN2])); requestAnimationFrame(step); }, 30); return; } }
      }
      plot.update({ series });
      if (phase < 2) setTimeout(step, 0);
      else {
        const eq = series[0].y[45], at50 = Math.max(series[0].y[70], series[0].y[71]), pole = series[0].y[90];
        $('#vis-note').textContent = `Gen1 (4,408): about ${eq.toFixed(0)} in view at the equator, ${at50.toFixed(0)} near 50–52°, ${pole.toFixed(0)} at the poles. Adding the Gen2 low-inclination shells mostly helps below 53°. Computed from ${lats.length} latitudes × 16 longitudes × 6 instants.`;
      }
    };
    setTimeout(step, 0);
  };
  new IntersectionObserver(([e]) => { if (e.isIntersecting) start(); }, { rootMargin: '400px' }).observe($('#vis-plot'));
}

// ---------------------------------------------------------------------------
// 4. Phased array
{
  const polar = $('#pa-polar'), linCanvas = $('#pa-linear'), out = $('#pa-out');
  let mode = 'polar';
  const angles = []; for (let a = -90; a <= 90; a += 0.25) angles.push(a);
  const toDb = v => Math.max(-40, 20 * Math.log10(Math.max(v, 1e-6)));
  const lin = linePlot(linCanvas, { xLabel: 'Angle from broadside (°)', yLabel: '|AF| (dB)', xMin: -90, xMax: 90, yMin: -40, yMax: 2, series: [{ name: 'Array factor', x: angles, y: angles.map(() => 0) }] });
  const params = () => ({ N: +$('#pa-n').value, d: +$('#pa-d').value, s: +$('#pa-s').value * DEG });

  function drawPolar() {
    const { N, d, s } = params();
    const dpr = Math.min(devicePixelRatio || 1, 2), w = polar.clientWidth, h = polar.clientHeight;
    if (!w || !h) return;
    polar.width = w * dpr; polar.height = h * dpr;
    const ctx = polar.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const R = Math.min(w / 2 - 34, h - 50), cx = w / 2, cy = h - 22;
    const grid = cssVar('--plot-grid'), axis = cssVar('--plot-axis'), fg = cssVar('--fg-muted');
    ctx.font = '11px ui-sans-serif, -apple-system, sans-serif';
    ctx.strokeStyle = grid; ctx.fillStyle = fg; ctx.lineWidth = 1;
    for (const dbr of [0, -10, -20, -30]) {
      const r = R * (1 + dbr / 40);
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI); ctx.stroke();
      ctx.textAlign = 'left'; ctx.fillText(`${dbr} dB`, cx + 3, cy - r + 11);
    }
    for (let a = -90; a <= 90; a += 30) {
      const x = Math.sin(a * DEG), y = Math.cos(a * DEG);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * x, cy - R * y); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillText(`${a}°`, cx + (R + 9) * x, cy - (R + 9) * y + (a === 0 ? -2 : 4));
    }
    ctx.strokeStyle = axis; ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
    // steering direction
    ctx.setLineDash([4, 4]); ctx.strokeStyle = cssVar('--accent');
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * Math.sin(s), cy - R * Math.cos(s)); ctx.stroke(); ctx.setLineDash([]);
    // pattern
    ctx.strokeStyle = SERIES_COLORS[0]; ctx.fillStyle = SERIES_COLORS[0] + '33'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    for (const a of angles) {
      const r = R * (1 + toDb(S.arrayFactor(N, d, s, a * DEG)) / 40);
      ctx.lineTo(cx + r * Math.sin(a * DEG), cy - r * Math.cos(a * DEG));
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // array elements along the baseline
    ctx.fillStyle = cssVar('--fg');
    const span = Math.min(R * 0.8, N * 8), step = N > 1 ? span / (N - 1) : 0;
    for (let m = 0; m < N; m++) ctx.fillRect(cx - span / 2 + m * step - 1.5, cy + 4, 3, 6);
  }

  function upd() {
    const { N, d, s } = params();
    const phase = S.steeringPhase(d, s) / DEG;
    const bw = S.beamwidth(N, d, s) / DEG;
    const gl = S.gratingLobes(d, s);
    const free = S.gratingLobeFree(d, s);
    out.innerHTML = `
      <tr><td>Phase step \\(\\beta\\)</td><td>${phase.toFixed(1)}° per element</td></tr>
      <tr><td>Half-power beamwidth</td><td>${bw < 60 ? bw.toFixed(2) + '°' : 'very wide'}</td></tr>
      <tr><td>Scan loss \\(10\\log\\cos\\theta_0\\)</td><td>${S.scanLossDb(s).toFixed(2)} dB</td></tr>
      <tr><td>Grating lobes</td><td>${gl.length ? `<span class="badge bad">at ${gl.map(g => (g / DEG).toFixed(0) + '°').join(', ')}</span>` : '<span class="badge good">none</span>'}</td></tr>
      <tr><td>Max \\(d/\\lambda\\) for this scan</td><td>${(1 / (1 + Math.abs(Math.sin(s)))).toFixed(3)}${free ? '' : ' (exceeded)'}</td></tr>`;
    typeset(out);
    if (mode === 'polar') drawPolar();
    else lin.update({ series: [{ name: 'Array factor', x: angles, y: angles.map(a => toDb(S.arrayFactor(N, d, s, a * DEG))) }], vLines: [{ x: s / DEG, label: 'θ₀' }] });
  }
  bindRange('pa-n', upd, v => v);
  bindRange('pa-d', upd, v => v.toFixed(2));
  bindRange('pa-s', upd, v => `${v}°`);
  $$('#pa-view button').forEach(b => b.addEventListener('click', () => {
    mode = b.dataset.v;
    $$('#pa-view button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    polar.parentElement.hidden = mode !== 'polar'; linCanvas.hidden = mode === 'polar';
    upd();
  }));
  new ResizeObserver(() => mode === 'polar' && drawPolar()).observe(polar);
  onSettings(() => requestAnimationFrame(() => mode === 'polar' && drawPolar()));
  upd();
}

// ---------------------------------------------------------------------------
// 5. Link budget
{
  const out = $('#lb-out'), note = $('#lb-note');
  const v = id => +$('#' + id).value;
  function upd() {
    const f = v('lb-f') * 1e9, h = v('lb-h') * 1e3, e = v('lb-e') * DEG, B = v('lb-b') * 1e6;
    const range = S.slantRange(h, e);
    const r = S.linkBudget({ f, eirpDbw: v('lb-eirp'), range, gtDbK: v('lb-gt'), bandwidth: B, lossDb: v('lb-l') });
    const pfd4k = v('lb-eirp') - S.db(4 * Math.PI * range * range) - S.db(B / 4e3);
    const pfdLimit = e >= 25 * DEG ? -140 : e >= 5 * DEG ? -150 + (e / DEG - 5) / 2 : -150;
    const okPfd = pfd4k <= pfdLimit + 1e-9;
    out.innerHTML = `
      <tr><td>Slant range</td><td>${fmt(range / 1e3, 4)} km</td></tr>
      <tr><td>Wavelength</td><td>${(C_LIGHT / f * 100).toFixed(2)} cm</td></tr>
      <tr><td>Free-space path loss</td><td>${r.fspl.toFixed(2)} dB</td></tr>
      <tr><td>\\(C/N_0\\)</td><td>${r.cn0.toFixed(1)} dB·Hz</td></tr>
      <tr><td>SNR in ${fmt(B / 1e6)} MHz</td><td>${r.snrDb.toFixed(1)} dB</td></tr>
      <tr><td>Shannon capacity</td><td><strong>${r.capacity >= 1e9 ? (r.capacity / 1e9).toFixed(2) + ' Gbit/s' : fmt(r.capacity / 1e6, 3) + ' Mbit/s'}</strong></td></tr>
      <tr><td>Spectral efficiency</td><td>${r.spectralEfficiency.toFixed(2)} bit/s/Hz</td></tr>
      <tr><td>\\(E_b/N_0\\) at capacity (Shannon limit)</td><td>${r.ebn0Db.toFixed(2)} dB</td></tr>
      <tr><td>PFD at the ground, per 4 kHz</td><td>${pfd4k.toFixed(1)} dB(W/m²) ${okPfd ? '<span class="badge good">within ITU mask</span>' : `<span class="badge warn">over ${pfdLimit.toFixed(1)} mask</span>`}</td></tr>`;
    typeset(out);
    note.textContent = `One beam to one terminal. A practical DVB-S2X-class modem gets within ~1–3 dB of Shannon, so expect roughly ${(B * Math.log2(1 + S.undb(r.snrDb - 2.5)) / 1e9).toFixed(2)} Gbit/s of real throughput in this channel, shared by every user in the beam.`;
  }
  bindRange('lb-f', upd, x => `${x.toFixed(2)} GHz`);
  bindRange('lb-h', upd, x => `${x} km`);
  bindRange('lb-e', upd, x => `${x}°`);
  bindRange('lb-eirp', upd, x => `${x.toFixed(1)} dBW`);
  bindRange('lb-gt', upd, x => `${x.toFixed(1)} dB/K`);
  bindRange('lb-b', upd, x => `${x} MHz`);
  bindRange('lb-l', upd, x => `${x.toFixed(1)} dB`);
  upd();
}

// ---------------------------------------------------------------------------
// 6. Latency: London → New York table and latency-vs-distance plot
{
  const h = 550e3, e = 25 * DEG;
  // average the routed path over a few instants (computed lazily so the first paint isn't blocked)
  const out = $('#lat-out');
  const row = (k, ms, extra = '') => `<tr><td>${k}</td><td>${ms.toFixed(1)} ms${extra}</td></tr>`;
  const base = () => [
    row('Great circle in vacuum (absolute floor)', S.vacuumLatency(LN_DIST) * 1e3),
    row('Straight fibre along the great circle (n = 1.47)', S.fiberLatency(LN_DIST) * 1e3),
    row('Space, up-over-down at 550 km', S.spaceLatencyIdeal(LN_DIST, h) * 1e3),
    row('Space, best case with 25° slant legs', S.spaceLatencyBest(LN_DIST, h, e) * 1e3),
  ].join('');
  out.innerHTML = `<tr><td>London ↔ New York great circle</td><td>${fmt(LN_DIST / 1e3, 4)} km</td></tr>` + base() + '<tr><td>Laser route (+Grid, Dijkstra)</td><td>computing…</td></tr>';
  setTimeout(() => {
    const con = S.buildConstellation([S.SHELLS_GEN1[0]]);
    const lat = [], hops = [];
    for (let k = 0; k < 6; k++) {
      const r = S.laserRoute(con, 0, k * 997, LONDON, NYC, 25);
      if (r) { lat.push(r.latency * 1e3); hops.push(r.hops); }
    }
    const mean = lat.reduce((a, b) => a + b, 0) / lat.length;
    out.innerHTML = `<tr><td>London ↔ New York great circle</td><td>${fmt(LN_DIST / 1e3, 4)} km</td></tr>` + base() +
      row('Laser route (+Grid, Dijkstra), mean of 6 instants', mean, ` <span class="muted small">(${Math.min(...lat).toFixed(1)}–${Math.max(...lat).toFixed(1)}, ${Math.min(...hops)}–${Math.max(...hops)} hops)</span>`) +
      `<tr><td>Round-trip saving vs straight fibre</td><td><strong>${(2 * (S.fiberLatency(LN_DIST) * 1e3 - mean)).toFixed(1)} ms</strong></td></tr>`;
  }, 300);

  const xs = []; for (let d = 100; d <= 18000; d += 100) xs.push(d);
  linePlot($('#lat-plot'), {
    title: 'One-way propagation delay vs ground distance', xLabel: 'Ground distance (km)', yLabel: 'One-way delay (ms)',
    xMin: 0, xMax: 18000, yMin: 0,
    series: [
      { name: 'Fibre, straight (n = 1.47)', x: xs, y: xs.map(d => S.fiberLatency(d * 1e3) * 1e3) },
      { name: 'Space, 550 km, 25° legs', x: xs, y: xs.map(d => S.spaceLatencyBest(d * 1e3, h, e) * 1e3), color: shellCss(S.SHELLS_GEN1[0]) },
      { name: 'Vacuum great circle', x: xs, y: xs.map(d => S.vacuumLatency(d * 1e3) * 1e3), dash: [5, 4], color: SERIES_COLORS[4] },
    ],
    vLines: [{ x: LN_DIST / 1e3, label: 'London–NY' }],
  });
}

// ---------------------------------------------------------------------------
// 7. Bus: orbit raising and decay
{
  const out = $('#bu-out');
  let solar = 1;
  const plot = linePlot($('#decay-plot'), { title: 'Passive decay (no thrust)', xLabel: 'Days (log scale)', yLabel: 'Altitude (km)', xLog: true, xMin: 0.1, xMax: 10, yMin: 150, series: [{ name: '', x: [1], y: [300] }] });
  const v = id => +$('#' + id).value;
  function upd() {
    const h1 = v('bu-h1') * 1e3, h2 = Math.max(v('bu-h2') * 1e3, h1), m = v('bu-m'), isp = v('bu-isp'), F = v('bu-f') / 1e3, B = v('bu-b');
    const dv = S.spiralDeltaV(h1, h2), mp = S.propellantMass(m, dv, isp), days = S.spiralTime(m, dv, F) / DAY;
    const dHigh = S.decayLifetime(h2, B, { solar }), dLow = S.decayLifetime(h1, B, { solar });
    const fmtDays = d => d > 730 ? `${(d / 365.25).toFixed(1)} years` : `${fmt(d, 3)} days`;
    out.innerHTML = `
      <tr><td>Spiral Δv</td><td>${dv.toFixed(1)} m/s</td></tr>
      <tr><td>Propellant</td><td>${mp.toFixed(2)} kg (${(mp / m * 100).toFixed(2)}%)</td></tr>
      <tr><td>Continuous-thrust time</td><td>${fmt(days, 3)} days</td></tr>
      <tr><td>Passive life at ${v('bu-h2')} km</td><td>${fmtDays(dHigh.days)}</td></tr>
      <tr><td>Passive life at ${v('bu-h1')} km</td><td>${fmtDays(dLow.days)}</td></tr>
      <tr><td>Drag at ${v('bu-h2')} km</td><td>${fmt(0.5 * S.thermosphereDensity(h2, solar) * (MU / (R_EARTH + h2)) * m / B * 1e3, 3)} mN</td></tr>`;
    const ser = (d, name, color) => ({ name, x: d.trace.map(p => Math.max(p.t, 0.01)), y: d.trace.map(p => p.h / 1e3), color });
    plot.update({ series: [ser(dHigh, `from ${v('bu-h2')} km`, shellCss(S.SHELLS_GEN1[0])), ser(dLow, `from ${v('bu-h1')} km`, SERIES_COLORS[1])], xMin: 0.1, xMax: Math.max(10, dHigh.days * 1.2) });
  }
  ['bu-h1', 'bu-h2'].forEach(id => bindRange(id, upd, x => `${x} km`));
  bindRange('bu-m', upd, x => `${x} kg`);
  bindRange('bu-isp', upd, x => `${x} s`);
  bindRange('bu-f', upd, x => `${x} mN`);
  bindRange('bu-b', upd, x => `${x} kg/m²`);
  $$('#bu-sun button').forEach(b => b.addEventListener('click', () => {
    solar = +b.dataset.s;
    $$('#bu-sun button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    upd();
  }));
  upd();
}
