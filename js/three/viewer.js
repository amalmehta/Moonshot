// The 3D vehicle viewer on vehicles.html: one renderer, OrbitControls, cutaway clipping,
// exploded view, deployable legs/fins, hover highlight and click-to-inspect.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { reducedMotion, pixelRatioCap, onSettings } from '../common.js';
import { PartRegistry, partsInfo, computeTanks, tankMeshes, buildFalcon9, buildStarship, buildEngines, buildHuman, buildLiberty } from './vehicle-models.js';

const MODES = {
  falcon9: { title: 'Falcon 9 Block 5 · 70 m' },
  starship: { title: 'Starship + Super Heavy (V2) · 123 m' },
  both: { title: 'Side by side: person 1.8 m · Falcon 9 70 m · Starship 123 m · Statue of Liberty 93 m' },
  engines: { title: 'Merlin 1D (left) and Raptor 2 (right), true relative size, quarter cut away' },
};

export function createViewer(container, { onPick, tankOpts = {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.localClippingEnabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const setPR = () => renderer.setPixelRatio(Math.min(devicePixelRatio || 1, pixelRatioCap()));
  setPR();
  container.prepend(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '3D model of the selected vehicle; use the controls beside it to change the view');
  renderer.domElement.setAttribute('role', 'img');

  const labelRenderer = new CSS2DRenderer();
  Object.assign(labelRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02040a);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 6000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotateSpeed = 0.6;
  controls.maxPolarAngle = Math.PI * 0.53;

  // lighting: hemisphere + sun + a faint room environment for the metals
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x30261c, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(60, 120, 90);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9db8ff, 0.6);
  rim.position.set(-80, 40, -60);
  scene.add(rim);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  pmrem.dispose();

  // starfield
  {
    const n = 2500, pos = new Float32Array(n * 3);
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = 2500;
      const s = Math.sqrt(1 - u * u);
      pos.set([r * s * Math.cos(th), Math.abs(r * u) * 0.9 + 50, r * s * Math.sin(th)], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xc8d4ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85 })));
  }
  // ground: pad + grid
  const pad = new THREE.Mesh(new THREE.CircleGeometry(60, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.95 }));
  pad.position.y = -0.02;
  const grid = new THREE.GridHelper(400, 40, 0x4b5875, 0x262d3d);
  grid.position.y = -0.01;
  scene.add(pad, grid);

  // models
  let tanks = computeTanks(tankOpts);
  const reg = new PartRegistry(partsInfo(tanks));
  const f9 = buildFalcon9(reg, tanks);
  const ss = buildStarship(reg, tanks);
  const eng = buildEngines(reg);
  const human = buildHuman(reg), liberty = buildLiberty(reg);
  const vehicles = [f9, ss];
  for (const v of [f9, ss, eng]) scene.add(v.root);
  scene.add(human, liberty);
  // tank materials are reused when the tank calculator resizes the tanks
  const tankMatCache = new Map();
  const tankMats = { material: (key, extra) => {
    if (!tankMatCache.has(key)) tankMatCache.set(key, (reg.mats.get(key) ?? [])[0] ?? reg.material(key, extra));
    return tankMatCache.get(key);
  } };
  // planes for the cutaway, one per vehicle (they pass through each vehicle's axis)
  for (const v of vehicles) v.plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);

  // labels
  const mkLabel = (html, cls = '') => {
    const d = document.createElement('div');
    d.className = 'v3-label ' + cls; d.innerHTML = html;
    return new CSS2DObject(d);
  };
  const engineLabels = eng.labels.map(l => { const o = mkLabel(l.html, l.cls || 'dim'); o.position.copy(l.pos); l.parent.add(o); return o; });
  const scaleLabels = [
    [human, 'Person 1.8 m', 2.3], [liberty, 'Statue of Liberty 93 m', 97], [f9.root, 'Falcon 9 70 m', 74], [ss.root, 'Starship 123 m', 127],
  ].map(([parent, text, y]) => { const o = mkLabel(text, 'title'); o.position.set(0, y, 0); parent.add(o); return o; });

  // state
  const state = { mode: 'falcon9', cut: false, explode: 0, explodeTarget: 0, legs: 0, legsTarget: 0, hover: null };
  let dirty = true, running = false, onScreen = true, lastInteract = performance.now();
  const IDLE_MS = 10000; // idle spin starts after 10 s without interaction (never with reduced motion)
  const touch = () => { lastInteract = performance.now(); };

  function applyLayout() {
    const m = state.mode;
    f9.root.visible = m === 'falcon9' || m === 'both';
    ss.root.visible = m === 'starship' || m === 'both';
    eng.root.visible = m === 'engines';
    human.visible = m === 'both';
    liberty.visible = m === 'both';
    f9.root.position.x = m === 'both' ? -18 : 0;
    ss.root.position.x = m === 'both' ? 6 : 0;
    human.position.set(-30, 0, 4);
    liberty.position.set(36, 0, 0);
    scaleLabels.forEach(l => (l.visible = m === 'both'));
    engineLabels.forEach(l => (l.visible = m === 'engines'));
    pad.visible = m !== 'engines';
    grid.scale.setScalar(m === 'engines' ? 0.02 : 1);
    applyCut();
    frame();
    const ov = container.querySelector('#ov-title');
    if (ov) ov.textContent = MODES[m].title;
    dirty = true;
  }

  function frame() {
    // frame both the assembled and the exploded configuration so toggling never leaves the view
    const box = new THREE.Box3();
    const vis = [f9.root, ss.root, eng.root, human, liberty].filter(o => o.visible);
    const saved = state.explode;
    for (const e of [0, 1]) { state.explode = e; applyAnimated(); vis.forEach(o => box.expandByObject(o)); }
    state.explode = saved; applyAnimated();
    if (state.mode === 'engines') box.expandByPoint(new THREE.Vector3(0, -0.3, 0));
    const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
    const fov = camera.fov * Math.PI / 180;
    const distV = (size.y / 2) / Math.tan(fov / 2);
    const distH = (Math.max(size.x, size.z) / 2) / (Math.tan(fov / 2) * camera.aspect);
    const dist = Math.max(distV, distH) * 1.12 + Math.max(size.x, size.z) / 2;
    controls.target.copy(centre);
    const dir = new THREE.Vector3(0.55, 0.18, 1).normalize();
    camera.position.copy(centre).addScaledVector(dir, dist);
    camera.near = Math.max(0.02, dist / 500); camera.far = 6000;
    camera.updateProjectionMatrix();
    controls.minDistance = state.mode === 'engines' ? 0.8 : 5;
    controls.maxDistance = dist * 3;
    controls.update();
  }

  function applyCut() {
    for (const v of vehicles) {
      for (const mesh of v.shells) mesh.material.clippingPlanes = state.cut ? [v.plane] : null;
      for (const g of v.tankGroups) g.visible = state.cut;
    }
    dirty = true;
  }
  function updatePlanes() {
    if (!state.cut) return;
    const toTarget = new THREE.Vector3().subVectors(controls.target, camera.position);
    toTarget.y = 0;
    if (toTarget.lengthSq() < 1e-6) toTarget.set(0, 0, -1);
    toTarget.normalize();
    for (const v of vehicles) {
      const axis = new THREE.Vector3(v.root.position.x, 0, v.root.position.z);
      v.plane.setFromNormalAndCoplanarPoint(toTarget, axis); // near-camera half has negative distance → clipped
    }
  }

  function applyAnimated() {
    const e = easeInOut(state.explode);
    for (const v of vehicles) for (const x of v.explode) {
      if (!x.base) x.base = x.obj.position.clone();
      x.obj.position.copy(x.base).addScaledVector(x.to, e);
      if (x.rotZ) x.obj.rotation.z = x.rotZ * e;
    }
    const d = easeInOut(state.legs);
    for (const l of f9.legs) l.obj.rotation.z = l.stowed + (l.deployed - l.stowed) * d;
    for (const f of f9.fins) f.obj.rotation.z = f.stowed + (f.deployed - f.stowed) * d;
  }
  const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

  // picking
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pointerPending = null, downAt = null;
  function pick(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const roots = [f9.root, ss.root, eng.root, human, liberty].filter(o => o.visible);
    const hits = ray.intersectObjects(roots, true);
    for (const h of hits) {
      const o = h.object;
      if (!o.userData.part || !o.visible || !isShown(o)) continue;
      const planes = o.material.clippingPlanes;
      if (planes && planes.some(p => p.distanceToPoint(h.point) < 0)) continue; // clipped away
      return o.userData.part;
    }
    return null;
  }
  const isShown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  function setHover(key) {
    if (key === state.hover) return;
    if (state.hover) reg.highlight(state.hover, false);
    state.hover = key;
    if (key) reg.highlight(key, true);
    renderer.domElement.style.cursor = key ? 'pointer' : '';
    dirty = true;
  }
  const el = renderer.domElement;
  el.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') pointerPending = [e.clientX, e.clientY]; });
  el.addEventListener('pointerleave', () => { pointerPending = null; setHover(null); });
  el.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
  el.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const key = pick(e.clientX, e.clientY);
    if (e.pointerType !== 'mouse') { setHover(key); }
    if (key) onPick?.(key, reg.info[key]);
  });
  controls.addEventListener('start', () => { touch(); controls.autoRotate = false; });
  controls.addEventListener('end', touch);
  controls.addEventListener('change', () => { dirty = true; });

  // loop
  let last = performance.now();
  function tick(now) {
    if (!onScreen || document.hidden) { running = false; return; }
    requestAnimationFrame(tick);
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
    const instant = reducedMotion();
    let animating = false;
    for (const [k, tk] of [['explode', 'explodeTarget'], ['legs', 'legsTarget']]) {
      if (state[k] !== state[tk]) {
        const step = instant ? 1 : dt / 1.6;
        state[k] = state[tk] > state[k] ? Math.min(state[tk], state[k] + step) : Math.max(state[tk], state[k] - step);
        animating = true;
      }
    }
    if (animating) { applyAnimated(); dirty = true; }
    const idle = !reducedMotion() && now - lastInteract > IDLE_MS;
    controls.autoRotate = idle && state.mode !== 'engines';
    if (controls.update()) dirty = true;
    if (controls.autoRotate) dirty = true;
    if (pointerPending) { setHover(pick(...pointerPending)); pointerPending = null; }
    if (dirty) {
      updatePlanes();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
      dirty = false;
    }
  }
  function start() { if (!running && onScreen && !document.hidden) { running = true; last = performance.now(); requestAnimationFrame(tick); } }

  const ro = new ResizeObserver(() => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    dirty = true; start();
  });
  ro.observe(container);
  new IntersectionObserver(es => { onScreen = es.some(e => e.isIntersecting); if (onScreen) { dirty = true; start(); } }).observe(container);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { dirty = true; start(); } });
  onSettings(() => { setPR(); dirty = true; start(); });

  const w0 = container.clientWidth || 800, h0 = container.clientHeight || 500;
  renderer.setSize(w0, h0, false); labelRenderer.setSize(w0, h0);
  camera.aspect = w0 / h0; camera.updateProjectionMatrix();
  reg.setColorMode('category');
  applyLayout();
  start();

  return {
    info: reg.info,
    setMode(m) { touch(); state.mode = m; applyLayout(); start(); },
    setCutaway(on) { touch(); state.cut = on; applyCut(); start(); },
    setExplode(on) { touch(); state.explodeTarget = on ? 1 : 0; start(); },
    setLegs(on) { touch(); state.legsTarget = on ? 1 : 0; start(); },
    setPaint(mode) { reg.setColorMode(mode); dirty = true; start(); },
    resetView() { touch(); frame(); dirty = true; start(); },
    /** Rebuild the tank meshes for new tank-model options (from the tank calculator). */
    setTanks(opts) {
      tanks = computeTanks(opts);
      Object.assign(reg.info, partsInfo(tanks));
      for (const v of vehicles) {
        v.tankGroups.forEach(g => { g.parent.remove(g); g.traverse(o => o.geometry?.dispose()); });
        v.tankGroups = v.tankSlots.map(slot => {
          const tk = tanks[slot.key];
          const g = tankMeshes(tk, slot.y0(tk), tankMats, slot.prefix);
          g.name = 'tanks'; slot.parent.add(g);
          return g;
        });
      }
      applyCut();
      start();
      return tanks;
    },
  };
}
