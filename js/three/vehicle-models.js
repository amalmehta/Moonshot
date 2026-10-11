// Procedural Three.js models of Falcon 9, Starship + Super Heavy, two engine close-ups and two
// scale references. Everything is in metres, y up, engine exits at y = 0. Proportions come from
// VEHICLES / ENGINES (js/data/vehicles.js), nozzle sizes from the ideal-nozzle model and tank
// lengths from js/physics/tanks.js. Every mesh carries userData.part (a key into PARTS).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VEHICLES, ENGINES } from '../data/vehicles.js';
import { stageTanks, LAYOUT } from '../physics/tanks.js';
import { engineDims, bellProfile, octawebLayout, superHeavyLayout, shipLayout, oklchToSrgb } from './geometry-math.js';

// ---------------------------------------------------------------------------
// Categories → TAGS hue families (engines 18, structures 86, thermal 100, gnc 300)
export const CATEGORIES = {
  propulsion: { tag: 'engines', label: 'Engines & propulsion', h: 18 },
  structures: { tag: 'structures', label: 'Structures', h: 86 },
  thermal: { tag: 'thermal', label: 'Thermal protection', h: 100 },
  control: { tag: 'gnc', label: 'Avionics & control surfaces', h: 300 },
  scale: { tag: null, label: 'Scale reference', h: 250 },
};
export const PROPELLANT_COLORS = { ox: '#3b82f6', fuel: '#f97316' };

export function oklchColor(L, C, h) {
  const [r, g, b] = oklchToSrgb(L, C, h);
  return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
}
/** Category colour; `shade` nudges lightness / hue within the family so sub-parts stay distinct. */
export function categoryColor(cat, shade = 0) {
  const c = CATEGORIES[cat];
  if (cat === 'scale') return oklchColor(0.72, 0.02, c.h);
  // structures are the bulk of the surface, so they get a paler, less saturated shade of their hue
  if (cat === 'structures') return oklchColor(0.80 + shade * 0.05, 0.07, c.h + shade * 8);
  return oklchColor(0.70 + shade * 0.06, cat === 'thermal' ? 0.12 : 0.14, c.h + shade * 10);
}

// ---------------------------------------------------------------------------
// Derived dimensions (shared by the builders, the info cards and the specs table)
const F9 = VEHICLES.falcon9, SS = VEHICLES.starship;
export const DIMS = {
  merlin: engineDims('merlin1d'), mvac: engineDims('mvac'),
  raptor: engineDims('raptor2'), rvac: engineDims('raptorVac'),
};
for (const d of Object.values(DIMS)) d.profile = bellProfile(d.rt, d.eps);

export function computeTanks(opts = {}) {
  return {
    f9s1: stageTanks(F9.stages[0], 'kerolox', { ...opts, loxOnTop: true }),
    f9s2: stageTanks(F9.stages[1], 'kerolox', { ...opts, loxOnTop: true }),
    sh: stageTanks(SS.stages[0], 'methalox', { ...opts, loxOnTop: true }),
    ss: stageTanks(SS.stages[1], 'methalox', { ...opts, loxOnTop: false }),
  };
}

// ---------------------------------------------------------------------------
// Part information for the click-to-inspect card.
const kN = x => `${Math.round(x / 1e3).toLocaleString('en-US')} kN`;
const t = x => `${(x / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} t`;
const m = (x, d = 2) => `${x.toFixed(d)} m`;
const EST = '<span class="badge warn">est.</span>';

export function partsInfo(tanks) {
  const e = ENGINES;
  const tankFacts = (tk, which, prop) => [
    `${which === 'ox' ? 'Liquid oxygen' : prop} mass: ${t(tk[which].mass)} (from stage propellant ${EST} and mixture ratio)`,
    `Liquid volume: ${tk[which].volume.toFixed(0)} m³ at ${tk.densities[which]} kg/m³ ${EST}`,
    `Tank volume incl. ${Math.round(tk.ullage * 100)} % ullage: ${tk[which].tankVolume.toFixed(0)} m³`,
    `Whole tank stack (both tanks, common bulkhead): ${m(tk.length, 1)} long`,
  ];
  return {
    'f9-merlin': { name: 'Merlin 1D engines (×9)', cat: 'propulsion', material: 'Regeneratively cooled copper-alloy chamber, Inconel jacket; kerosene–LOX gas-generator cycle',
      what: 'Nine sea-level engines in the octaweb: 8 in a ring around a centre engine. The centre engine (and two outer ones) relight for boostback, entry and landing burns; the centre engine alone throttles to ~40 % for the hover-less landing.',
      facts: [`Sea-level thrust ${kN(e.merlin1d.thrustSL)} each, ${kN(F9.stages[0].thrustSL)} total`, `Isp ${e.merlin1d.ispSL} s sea level / ${e.merlin1d.ispVac} s vacuum ${EST}`,
        `Area ratio ε = ${e.merlin1d.eps} ${EST}; chamber ≈ ${e.merlin1d.pc / 1e6} MPa ${EST}`, `Model exit diameter ${m(2 * DIMS.merlin.re)} (drawn slightly smaller where the ring forces it)`, `Mass ≈ ${e.merlin1d.mass} kg ${EST}`] },
    'f9-octaweb': { name: 'Octaweb thrust structure', cat: 'structures', material: 'Aluminium thrust structure with a heat shield across the engine bay',
      what: 'Carries nine engines’ thrust into the tank walls and shields the engine bay from the exhaust plume during the re-entry and landing burns.',
      facts: ['The octagonal layout lets one engine-out be tolerated during ascent', 'Single bolted structure; replaced the 3×3 grid of earlier versions'] },
    'f9-s1': { name: 'First-stage tank walls', cat: 'structures', material: 'Aluminium–lithium alloy, friction-stir welded',
      what: 'The tank walls are the stage’s body: there is no separate outer skin. Pressurised propellant tanks carry the flight loads (a stiffened, partly pressure-stabilised shell).',
      facts: [`Length ${F9.stages[0].length} m, diameter ${F9.stages[0].diameter} m (road-transport limit)`, `Dry mass ≈ ${t(F9.stages[0].dry)} ${EST}`, `Propellant ≈ ${t(F9.stages[0].prop)} ${EST}`, `Fineness ratio ≈ ${(F9.stages[0].length / F9.stages[0].diameter).toFixed(1)}`] },
    'f9-legs': { name: 'Landing legs (×4)', cat: 'structures', material: 'Carbon fibre with aluminium honeycomb; helium-pneumatic deployment',
      what: 'Stowed flat against the stage during ascent; deploy just before touchdown and are pushed out by a telescoping pusher.',
      facts: ['Span when deployed ≈ 18 m ' + EST, 'Mass of the set ≈ 2 t ' + EST, 'Toggle “Landing configuration” to deploy'] },
    'f9-gridfins': { name: 'Grid fins (×4)', cat: 'control', material: 'Cast and machined titanium (uncoated, reusable)',
      what: 'Lattice control surfaces at the top of the interstage. They fold flat for ascent and open for re-entry, steering the booster to the landing site through the hypersonic and transonic regime.',
      facts: ['≈ 1.2 × 1.5 m each ' + EST, 'Aluminium fins of early Block 3/4 charred; titanium needs no ablative coating', 'Hydraulic actuators on an open-loop hydraulic system'] },
    'f9-interstage': { name: 'Interstage', cat: 'structures', material: 'Carbon-fibre / aluminium-honeycomb composite (the black band)',
      what: 'Connects the stages and hides the Merlin Vacuum nozzle. Pneumatic pushers separate the stages; the grid fins and cold-gas thruster pods sit on it.',
      facts: [`Length ≈ ${LAYOUT.falcon9.interstage} m ${EST}`, 'Stays with the first stage and is recovered with it'] },
    'f9-coldgas': { name: 'Cold-gas thrusters', cat: 'control', material: 'Nitrogen thrusters in pods',
      what: 'Flip the booster for the boostback burn and hold attitude above the atmosphere where grid fins do nothing.', facts: ['Gaseous nitrogen, ~70 s-class Isp ' + EST] },
    'f9-mvac': { name: 'Merlin Vacuum', cat: 'propulsion', material: 'Regeneratively cooled chamber; radiatively cooled niobium-alloy nozzle extension (glows orange in flight)',
      what: 'The second stage’s single engine. A long, wide nozzle expands the exhaust further, so Isp rises from 311 s to about 348 s in vacuum.',
      facts: [`Vacuum thrust ${kN(e.mvac.thrustVac)}`, `Isp ${e.mvac.ispVac} s`, `Area ratio ε = ${e.mvac.eps} ${EST}`, `Model exit diameter ${m(2 * DIMS.mvac.re)}, engine length ${m(DIMS.mvac.profile.length)}`, `Minimum throttle ≈ ${Math.round(e.mvac.throttleMin * 100)} % ${EST}`] },
    'f9-s2': { name: 'Second stage', cat: 'structures', material: 'Aluminium–lithium tanks; avionics and nitrogen thrusters at the forward end',
      what: 'A shorter version of the first-stage tank on the same tooling. Expended on every flight, which is what the reusable-booster economics leave on the table.',
      facts: [`Length ${F9.stages[1].length} m incl. MVac`, `Dry ≈ ${t(F9.stages[1].dry)} ${EST}, propellant ≈ ${t(F9.stages[1].prop)} ${EST}`, `Burn ≈ ${F9.stages[1].burn} s`] },
    'f9-fairing': { name: 'Payload fairing (two halves)', cat: 'structures', material: 'Carbon-fibre skins over aluminium honeycomb',
      what: 'Protects the payload through the dense atmosphere, then splits along its length (pneumatic pushers) a few minutes after liftoff. The halves parasail back and are reused.',
      facts: [`${F9.fairing.diameter} m wide × ${F9.fairing.length} m tall`, `Mass ≈ ${t(F9.fairing.mass)} ${EST}`, 'Press “Exploded view” to separate it'] },
    'f9s1-ox': { name: 'First-stage LOX tank', cat: 'propulsion', material: 'Aluminium–lithium; sub-cooled LOX', what: 'Upper tank. LOX reaches the engines through a transfer tube running down through the RP-1 tank.', facts: tankFacts(tanks.f9s1, 'ox') },
    'f9s1-fuel': { name: 'First-stage RP-1 tank', cat: 'propulsion', material: 'Aluminium–lithium; chilled RP-1 kerosene', what: 'Lower tank of the first stage.', facts: tankFacts(tanks.f9s1, 'fuel', 'RP-1') },
    'f9s2-ox': { name: 'Second-stage LOX tank', cat: 'propulsion', material: 'Aluminium–lithium', what: 'Upper tank of the second stage.', facts: tankFacts(tanks.f9s2, 'ox') },
    'f9s2-fuel': { name: 'Second-stage RP-1 tank', cat: 'propulsion', material: 'Aluminium–lithium', what: 'Lower tank of the second stage.', facts: tankFacts(tanks.f9s2, 'fuel', 'RP-1') },

    'sh-raptor-inner': { name: 'Raptor 2, inner ring (×3, gimbaling)', cat: 'propulsion', material: 'Full-flow staged-combustion methalox engine; copper-alloy chamber, steel/Inconel structure',
      what: 'The 3 centre engines gimbal for steering and are the ones relit for the boostback and catch burns.',
      facts: [`Sea-level thrust ≈ ${kN(e.raptor2.thrustSL)} each ${EST}`, `Chamber ≈ ${e.raptor2.pc / 1e6} MPa ${EST}`, `ε ≈ ${e.raptor2.eps} ${EST}`, `Model exit diameter ${m(2 * DIMS.raptor.re)}`] },
    'sh-raptor-middle': { name: 'Raptor 2, middle ring (×10, gimbaling)', cat: 'propulsion', material: 'Full-flow staged-combustion methalox engine',
      what: 'Ten more gimbaling engines; they also take part in the boostback burn.', facts: [`Total sea-level thrust of all 33 ≈ ${(SS.stages[0].thrustSL / 1e6).toFixed(1)} MN ${EST}`, 'Both preburners (ox-rich and fuel-rich) send all the propellant through turbines: “full flow”'] },
    'sh-raptor-outer': { name: 'Raptor 2, outer ring (×20, fixed)', cat: 'propulsion', material: 'Fixed-mount “Raptor Boost” variant (no gimbal, no relight hardware) ' + EST,
      what: 'Twenty fixed engines run only during ascent; dropping gimbals and restart hardware saves mass on the ring that adds the most thrust.',
      facts: ['Ring drawn at the largest bell that fits 20 around a 9 m skirt', `Model bell at this ring is drawn ${m(2 * superHeavyLayout(SS.diameter / 2, DIMS.raptor.re).drawBellR)} wide vs ${m(2 * DIMS.raptor.re)} computed`] },
    'sh-shell': { name: 'Super Heavy booster', cat: 'structures', material: 'Stainless steel (300-series), ~4 mm rings welded into a stack ' + EST,
      what: 'Steel was chosen over carbon fibre: cheap, easy to weld, stronger at cryogenic temperatures and keeps strength far hotter than aluminium, so the booster needs no heat shield on its body.',
      facts: [`Length ${SS.stages[0].length} m, diameter ${SS.stages[0].diameter} m`, `Dry ≈ ${t(SS.stages[0].dry)} ${EST}, propellant ≈ ${t(SS.stages[0].prop)} ${EST}`, `Fineness ratio ≈ ${(SS.stages[0].length / SS.stages[0].diameter).toFixed(1)}`] },
    'sh-hsr': { name: 'Hot-staging ring (vented interstage)', cat: 'structures', material: 'Steel ring with vent slots and a shielded booster dome',
      what: 'The ship lights its engines while still attached; the exhaust escapes through the vents. Staging with the ship’s engines already running avoids a coast and gains payload.',
      facts: [`Length ≈ ${LAYOUT.starship.hotStage} m ${EST}`, 'Jettisoned on the boostback in some flights to save landing mass'] },
    'sh-gridfins': { name: 'Grid fins (×4)', cat: 'control', material: 'Steel; electrically actuated ' + EST,
      what: 'Four large fixed-position (non-folding) grid fins steer the booster on its way back; they are also lift points the tower’s chopsticks can catch under.',
      facts: ['V2 moved from 4 to 3 larger grid fins on later boosters; the V2 stack shown here uses 4 ' + EST] },
    'sh-pins': { name: 'Catch-pin hardpoints', cat: 'structures', material: 'Steel hardpoints',
      what: 'Load points that rest on the launch-tower “chopsticks” when the returning booster is caught instead of landing on legs.', facts: ['No landing legs: the tower is the landing gear'] },
    'sh-ox': { name: 'Super Heavy LOX tank', cat: 'propulsion', material: 'Stainless steel; sub-cooled LOX', what: 'Upper booster tank.', facts: tankFacts(tanks.sh, 'ox') },
    'sh-fuel': { name: 'Super Heavy methane tank', cat: 'propulsion', material: 'Stainless steel; sub-cooled liquid methane', what: 'Lower booster tank.', facts: tankFacts(tanks.sh, 'fuel', 'Methane') },

    'ss-raptor': { name: 'Raptor 2 sea-level engines (×3)', cat: 'propulsion', material: 'Full-flow staged-combustion methalox',
      what: 'Gimbaling sea-level engines used for control and for the landing flip burn, where a vacuum bell would separate.', facts: [`ε ≈ ${e.raptor2.eps} ${EST}`, `Thrust ≈ ${kN(e.raptor2.thrustSL)} each (sea level) ${EST}`] },
    'ss-rvac': { name: 'Raptor Vacuum engines (×3)', cat: 'propulsion', material: 'Same powerhead, large regeneratively cooled nozzle extension; fixed mount',
      what: 'The larger bells give much higher vacuum Isp (~380 s est.) but would separate at sea level, so they are only fired in space.', facts: [`ε ≈ ${e.raptorVac.eps} ${EST}`, `Vacuum thrust ≈ ${kN(e.raptorVac.thrustVac)} ${EST}`, `Model exit diameter ${m(2 * DIMS.rvac.re)}`] },
    'ss-shell': { name: 'Starship (ship)', cat: 'structures', material: 'Stainless steel tanks and nose; payload bay in the nose',
      what: 'Upper stage and spacecraft in one: it reaches orbit, re-enters belly-first under its heat shield, then flips to vertical and lands on its engines.',
      facts: [`Length ${SS.stages[1].length} m`, `Dry ≈ ${t(SS.stages[1].dry)} ${EST}, propellant ≈ ${t(SS.stages[1].prop)}`, `Payload to LEO ${t(SS.payloadLEO)} reusable (target)`] },
    'ss-tiles': { name: 'Hexagonal heat-shield tiles', cat: 'thermal', material: 'Silica-based ceramic tiles, pin-mounted to the steel, ≈ 18 000 of them ' + EST,
      what: 'Only the windward side (the belly during re-entry) is tiled; the leeward steel stays cool enough bare. Hexagons have no long straight gaps for hot plasma to run along and are all the same shape, so they can be mass-produced.',
      facts: ['Re-entry from orbit puts ~1 400 °C on the windward face ' + EST, 'Tile edge ≈ 0.3 m; drawn as a repeating hex texture'] },
    'ss-fwdflaps': { name: 'Forward flaps (×2)', cat: 'control', material: 'Steel, tiled on the windward face; electric actuators',
      what: 'With the aft flaps, they steer the belly-flop descent like a skydiver’s arms and legs: four flaps control pitch, roll and yaw.', facts: ['Moved to the leeward side and shrunk on later ships to keep them out of the hottest flow ' + EST] },
    'ss-aftflaps': { name: 'Aft flaps (×2)', cat: 'control', material: 'Steel, tiled on the windward face; electric actuators', what: 'Larger flaps at the base set the pitch trim of the belly-first descent.', facts: ['Flaps (not grid fins) because the ship descends broadside, not tail-first'] },
    'ss-nose': { name: 'Nose and payload bay', cat: 'structures', material: 'Stainless steel; header tanks inside for the landing burn', what: 'Payload bay (Starlink “pez dispenser” door on current flights) and the nose cone with a small header tank.', facts: ['Header tanks hold landing propellant so it doesn’t slosh in the near-empty main tanks'] },
    'ss-ox': { name: 'Ship LOX tank', cat: 'propulsion', material: 'Stainless steel', what: 'Lower main tank of the ship.', facts: tankFacts(tanks.ss, 'ox') },
    'ss-fuel': { name: 'Ship methane tank', cat: 'propulsion', material: 'Stainless steel', what: 'Upper main tank of the ship.', facts: tankFacts(tanks.ss, 'fuel', 'Methane') },

    'eng-bell': { name: 'Nozzle bell (divergent section)', cat: 'propulsion', material: 'Regeneratively cooled tube or channel wall',
      what: 'Supersonic expansion: the area grows by ε from throat to exit, turning chamber pressure into exhaust velocity. Shape here: Rao 80 % bell (quadratic approximation).', facts: [`Merlin 1D: ε = ${e.merlin1d.eps} ${EST}, exit ⌀ ${m(2 * DIMS.merlin.re)} (model)`, `Raptor 2: ε = ${e.raptor2.eps} ${EST}, exit ⌀ ${m(2 * DIMS.raptor.re)} (model)`] },
    'eng-chamber': { name: 'Combustion chamber and throat', cat: 'propulsion', material: 'Copper alloy liner with milled cooling channels, steel/Inconel jacket',
      what: 'Propellants burn at high pressure; the converging section accelerates the gas to Mach 1 exactly at the throat (the narrowest point), which sets the mass flow.', facts: [`Merlin throat ⌀ ${m(2 * DIMS.merlin.rt, 3)}, Raptor throat ⌀ ${m(2 * DIMS.raptor.rt, 3)} (model)`, `Chamber pressure: Merlin ≈ ${e.merlin1d.pc / 1e6} MPa, Raptor ≈ ${e.raptor2.pc / 1e6} MPa ${EST}`, 'Contraction ratio 3 and L* = 1 m assumed'] },
    'eng-pump': { name: 'Turbopumps and preburners', cat: 'propulsion', material: 'Nickel superalloys; oxygen-rich side needs special oxidation-resistant alloys',
      what: 'Merlin: one turbopump driven by a gas generator whose exhaust is dumped overboard (the side pipe). Raptor: two turbopumps, one driven by an oxygen-rich and one by a fuel-rich preburner; all the gas then goes into the chamber.', facts: ['Gas-generator dump costs a few % of Isp', 'Full-flow lets both turbines run cooler at higher pressure'] },
    'eng-manifold': { name: 'Injector and manifold', cat: 'propulsion', material: 'Machined / 3-D printed alloys', what: 'Distributes propellant (Raptor: hot gas) across the injector face.', facts: ['Drawn schematically'] },

    human: { name: 'Person, 1.8 m', cat: 'scale', material: '', what: 'For scale.', facts: [] },
    liberty: { name: 'Statue of Liberty, 93 m', cat: 'scale', material: 'Copper skin on an iron frame; granite pedestal', what: 'Ground to torch tip, including pedestal and foundation (≈ 46 m statue on ≈ 47 m base).', facts: ['Starship + Super Heavy is about 1.3 Statues of Liberty'] },
  };
}

// ---------------------------------------------------------------------------
// Builder context: one material per (vehicle, part) so hover can highlight a part by key.
const REAL = {
  'f9-merlin': ['#2e3036', 0.6, 0.45], 'f9-octaweb': ['#4a4d55', 0.4, 0.6], 'f9-s1': ['#eef0f3', 0.05, 0.55], 'f9-legs': ['#222429', 0.2, 0.6],
  'f9-gridfins': ['#8e8a84', 0.85, 0.4], 'f9-interstage': ['#1b1c20', 0.1, 0.7], 'f9-coldgas': ['#d9dade', 0.1, 0.6], 'f9-mvac': ['#5b4a3c', 0.7, 0.4],
  'f9-s2': ['#eef0f3', 0.05, 0.55], 'f9-fairing': ['#f4f5f7', 0.05, 0.5],
  'sh-raptor-inner': ['#a4a8ad', 0.8, 0.35], 'sh-raptor-middle': ['#a4a8ad', 0.8, 0.35], 'sh-raptor-outer': ['#a4a8ad', 0.8, 0.35],
  'sh-shell': ['#c3c7cc', 0.85, 0.32], 'sh-hsr': ['#9da1a7', 0.85, 0.4], 'sh-gridfins': ['#8d9198', 0.85, 0.4], 'sh-pins': ['#6c7077', 0.8, 0.4],
  'ss-raptor': ['#a4a8ad', 0.8, 0.35], 'ss-rvac': ['#9fa3a8', 0.8, 0.35], 'ss-shell': ['#c3c7cc', 0.85, 0.32], 'ss-tiles': ['#ffffff', 0.0, 0.85],
  'ss-fwdflaps': ['#b9bdc2', 0.85, 0.35], 'ss-aftflaps': ['#b9bdc2', 0.85, 0.35], 'ss-nose': ['#c3c7cc', 0.85, 0.32],
  'eng-bell': ['#5c4f45', 0.75, 0.4], 'eng-chamber': ['#b07a4f', 0.85, 0.35], 'eng-pump': ['#9aa0a7', 0.8, 0.35], 'eng-manifold': ['#8a8f96', 0.8, 0.35],
  human: ['#e0b48c', 0, 0.8], liberty: ['#6fa595', 0.3, 0.6],
};
const SHADE = { 'f9-octaweb': -1, 'f9-legs': -1, 'f9-interstage': -2, 'f9-fairing': 1, 'f9-coldgas': 1, 'sh-hsr': -1, 'sh-pins': -2, 'ss-nose': 1,
  'f9-mvac': -1, 'sh-raptor-middle': -1, 'sh-raptor-outer': -2, 'ss-rvac': -1, 'ss-aftflaps': -1, 'eng-chamber': 1, 'eng-pump': -1, 'eng-manifold': -2, 'eng-bell': 0 };

export class PartRegistry {
  constructor(info) { this.info = info; this.mats = new Map(); this.colorMode = 'category'; }
  /** Material for a part key; tank keys get the propellant colours. */
  material(key, extra = {}) {
    const tank = key.endsWith('-ox') || key.endsWith('-fuel');
    const cat = this.info[key]?.cat ?? 'structures';
    let real, cat3;
    if (tank) {
      real = cat3 = new THREE.Color(PROPELLANT_COLORS[key.endsWith('-ox') ? 'ox' : 'fuel']);
    } else {
      const r = REAL[key] ?? ['#cccccc', 0.3, 0.5];
      real = new THREE.Color(r[0]);
      cat3 = categoryColor(cat, SHADE[key] ?? 0);
    }
    const r = REAL[key] ?? ['#ccc', 0.2, 0.55];
    const mat = new THREE.MeshStandardMaterial({ color: this.colorMode === 'real' ? real : cat3, metalness: tank ? 0.1 : r[1], roughness: tank ? 0.45 : r[2], ...extra });
    mat.userData = { key, real, cat: cat3, tank };
    if (!this.mats.has(key)) this.mats.set(key, []);
    this.mats.get(key).push(mat);
    return mat;
  }
  setColorMode(mode) {
    this.colorMode = mode;
    for (const list of this.mats.values()) for (const mt of list) if (!mt.userData.tank) mt.color.copy(mode === 'real' ? mt.userData.real : mt.userData.cat);
  }
  highlight(key, on) {
    for (const mt of this.mats.get(key) ?? []) mt.emissive.setHex(on ? 0x553311 : 0x000000);
  }
}

function mesh(geo, mat, key) {
  const o = new THREE.Mesh(geo, mat);
  o.userData.part = key;
  return o;
}
/** Profile [[r, y], …] → LatheGeometry. */
const lathe = (pts, seg = 48, phiStart = 0, phiLen = Math.PI * 2) =>
  new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), seg, phiStart, phiLen);
const tube = (r, y0, y1, seg = 48, open = true) => {
  const g = new THREE.CylinderGeometry(r, r, y1 - y0, seg, 1, open);
  g.translate(0, (y0 + y1) / 2, 0);
  return g;
};

/** Engine geometry from the nozzle profile (exit at y = 0, injector on top). */
export function engineGeometry(dims, { drawExitR = dims.re, seg = 24, phiStart = 0, phiLen = Math.PI * 2 } = {}) {
  const p = dims.profile;
  const s = drawExitR / dims.re; // uniform scale if the cluster forces a smaller bell
  // injector face (closed at the axis) → chamber → throat → open exit at y = 0
  const prof = [[0, (p.bellLength - p.chamberStart) * s], ...p.points.map(q => [q.r * s, (p.bellLength - q.z) * s])];
  return { geo: lathe(prof, seg, phiStart, phiLen), length: (p.bellLength - p.chamberStart) * s, scale: s };
}

/** Tank stack (two lathe solids) from a stageTanks() result, bottom apex at y0. */
export function tankMeshes(tk, y0, reg, prefix, seg = 40) {
  const { R, h, split, length } = tk;
  const ell = (yc, up, n = 10) => Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI / 2; // 0 at apex → π/2 at rim
    return [R * Math.sin(a), yc + (up ? 1 : -1) * h * Math.cos(a)];
  });
  // lower tank: bottom dome (apex → rim), barrel, then the common dome back down to its apex
  const lowerPts = [...ell(y0 + h, false), ...ell(y0 + split, false).reverse()];
  // upper tank: common dome (apex → rim), barrel, top dome (rim → apex)
  const upperPts = [...ell(y0 + split, false), [R, y0 + length - h], ...ell(y0 + length - h, true).reverse()];
  const lower = mesh(lathe(dedupe(lowerPts), seg), reg.material(`${prefix}-${tk.lower}`, { side: THREE.DoubleSide }), `${prefix}-${tk.lower}`);
  const upper = mesh(lathe(dedupe(upperPts), seg), reg.material(`${prefix}-${tk.upper}`, { side: THREE.DoubleSide }), `${prefix}-${tk.upper}`);
  const g = new THREE.Group(); g.add(lower, upper);
  g.scale.set(0.96, 1, 0.96); // a hair inside the shell so the cut edge stays visible
  return g;
}
function dedupe(pts) {
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-6);
}

/** Lattice grid-fin geometry, w × hgt, root at origin, extending +y, in the x–y plane. */
function gridFinGeometry(w, hgt, depth, bars = 7) {
  const gs = [];
  const bar = (len, thick) => new THREE.BoxGeometry(thick, len, depth);
  const frame = 0.08 * Math.max(w, hgt) / 1.5;
  for (const x of [-w / 2, w / 2]) { const b = bar(hgt, frame); b.translate(x, hgt / 2, 0); gs.push(b); }
  for (const y of [0, hgt]) { const b = new THREE.BoxGeometry(w + frame, frame, depth); b.translate(0, y, 0); gs.push(b); }
  const diag = Math.hypot(w, hgt) * 1.1;
  for (const sgn of [1, -1]) for (let i = 0; i < bars; i++) {
    const off = (i - (bars - 1) / 2) * (w + hgt) / bars / 1.4;
    const b = bar(diag, frame * 0.35);
    b.rotateZ(sgn * Math.PI / 4); b.translate(off, hgt / 2, 0);
    gs.push(b);
  }
  // clip lattice to the frame by scaling bars is overkill; bars poking slightly past the frame read fine at this size
  return mergeGeometries(gs.map(g => g.toNonIndexed()));
}

/** Hexagonal tile texture (pointy-top tiling, one period = √3·s × 3·s). */
function hexTexture() {
  const W = 128, H = 222, s = W / Math.sqrt(3);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#5b5e63'; g.fillRect(0, 0, W, H); // grout / gaps
  const hex = (cx, cy, shade) => {
    g.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(cx + (s - 3) * Math.cos(a), cy + (s - 3) * Math.sin(a)); }
    g.closePath(); g.fillStyle = shade; g.fill();
  };
  const centres = [[0, 0], [W, 0], [W / 2, 1.5 * s], [0, 3 * s], [W, 3 * s], [-W / 2, 1.5 * s], [1.5 * W, 1.5 * s]];
  centres.forEach(([x, y], i) => hex(x, y, ['#141518', '#191a1e', '#121316'][i % 3]));
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------------------
// Falcon 9
export function buildFalcon9(reg, tanks, seg = 48) {
  const root = new THREE.Group(); root.name = 'falcon9';
  const shells = [];   // meshes cut by the cutaway plane
  const R = F9.diameter / 2, L = LAYOUT.falcon9;
  const s1Top = F9.stages[0].length, isTop = s1Top + L.interstage;
  const fairBase = F9.height - F9.fairing.length, s2Top = fairBase;

  // --- first stage
  const s1 = new THREE.Group(); s1.name = 'stage1'; root.add(s1);
  const oct = octawebLayout(R, DIMS.merlin.re);
  const merlin = engineGeometry(DIMS.merlin, { drawExitR: oct.drawBellR, seg: 20 });
  const merlinMat = reg.material('f9-merlin');
  for (const p of oct.engines) { const e = mesh(merlin.geo, merlinMat, 'f9-merlin'); e.position.set(p.x, 0, p.y); s1.add(e); }
  const gimbal = merlin.length;
  const bayTop = gimbal + L.engineBay;
  const octMat = reg.material('f9-octaweb', { side: THREE.DoubleSide });
  const octShield = mesh(new THREE.CircleGeometry(R * 0.995, seg).rotateX(Math.PI / 2).translate(0, gimbal, 0), octMat, 'f9-octaweb');
  const bay = mesh(tube(R, gimbal, bayTop, seg), octMat, 'f9-octaweb');
  s1.add(octShield, bay); shells.push(bay);
  const s1Mat = reg.material('f9-s1', { side: THREE.DoubleSide });
  const s1Body = mesh(tube(R, bayTop, s1Top, seg), s1Mat, 'f9-s1');
  s1.add(s1Body); shells.push(s1Body);
  const s1Tanks = tankMeshes(tanks.f9s1, bayTop, reg, 'f9s1'); s1Tanks.name = 'tanks'; s1.add(s1Tanks);
  // interstage + grid fins + cold gas pods
  const isMat = reg.material('f9-interstage', { side: THREE.DoubleSide });
  const inter = mesh(tube(R, s1Top, isTop, seg), isMat, 'f9-interstage');
  s1.add(inter); shells.push(inter);
  const legs = [], fins = [];
  const legMat = reg.material('f9-legs'), finMat = reg.material('f9-gridfins'), cgMat = reg.material('f9-coldgas');
  const legLen = 8.5;
  const legGeo = new THREE.BoxGeometry(0.55, legLen, 0.35); legGeo.translate(0, legLen / 2, 0);
  const footGeo = new THREE.CylinderGeometry(0.45, 0.5, 0.15, 16); footGeo.translate(0, legLen, 0);
  const finGeo = gridFinGeometry(1.2, 1.5, 0.12);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    // leg: hinge near the base, stowed along the body (pointing up), deploys outward and down
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * (R + 0.2), bayTop + 0.3, Math.sin(a) * (R + 0.2));
    pivot.rotation.y = -a;
    const swing = new THREE.Group(); pivot.add(swing);
    swing.add(mesh(legGeo, legMat, 'f9-legs'), mesh(footGeo, legMat, 'f9-legs'));
    s1.add(pivot); legs.push({ obj: swing, stowed: 0, deployed: -1.9 }); // ≈ 109° from vertical
    // grid fin: hinge at the top of the interstage, folds up flat for ascent, sticks out for re-entry
    const fp = new THREE.Group();
    fp.position.set(Math.cos(a) * (R + 0.08), isTop - 2.0, Math.sin(a) * (R + 0.08));
    fp.rotation.y = -a;
    const fs = new THREE.Group(); fp.add(fs);
    const fin = mesh(finGeo, finMat, 'f9-gridfins'); fin.rotation.y = Math.PI / 2; fs.add(fin);
    s1.add(fp); fins.push({ obj: fs, stowed: 0, deployed: -Math.PI / 2 });
    // cold-gas pod between fins
    const ca = a + Math.PI / 4;
    const pod = mesh(new THREE.BoxGeometry(0.35, 0.6, 0.5), cgMat, 'f9-coldgas');
    pod.position.set(Math.cos(ca) * (R + 0.1), isTop - 0.8, Math.sin(ca) * (R + 0.1)); pod.rotation.y = -ca;
    s1.add(pod);
  }

  // --- second stage (anchored to the fairing base; MVac hangs into the interstage)
  const s2 = new THREE.Group(); s2.name = 'stage2'; root.add(s2);
  const tk2 = tanks.f9s2;
  const s2TankBottom = s2Top - 0.1 - tk2.length;
  const mvac = engineGeometry(DIMS.mvac, { seg: 32 });
  const mv = mesh(mvac.geo, reg.material('f9-mvac', { side: THREE.DoubleSide }), 'f9-mvac');
  mv.position.y = s2TankBottom + tk2.h * 0.6 - mvac.length; s2.add(mv);
  const s2Mat = reg.material('f9-s2', { side: THREE.DoubleSide });
  const s2Body = mesh(tube(R, Math.min(isTop, s2TankBottom + tk2.h), s2Top, seg), s2Mat, 'f9-s2');
  s2.add(s2Body); shells.push(s2Body);
  const s2Tanks = tankMeshes(tk2, s2TankBottom, reg, 'f9s2'); s2Tanks.name = 'tanks'; s2.add(s2Tanks);

  // --- fairing: two halves split along x
  const fr = F9.fairing.diameter / 2, fl = F9.fairing.length;
  const prof = [[R * 0.98, 0], [fr, 1.0], [fr, 6.6]];
  const ogL = fl - 6.6;
  for (let i = 1; i <= 16; i++) { const t = i / 16; prof.push([fr * Math.cos(t * Math.PI / 2) ** 0.8, 6.6 + ogL * Math.sin(t * Math.PI / 2)]); }
  prof[prof.length - 1] = [0.0, fl];
  const fairMat = reg.material('f9-fairing', { side: THREE.DoubleSide });
  const halves = [];
  for (const side of [0, 1]) {
    const hgeo = lathe(prof, seg / 2, side * Math.PI, Math.PI);
    const hm = mesh(hgeo, fairMat, 'f9-fairing');
    const holder = new THREE.Group(); holder.position.y = fairBase; holder.add(hm);
    root.add(holder); shells.push(hm);
    halves.push({ obj: holder, sign: side === 0 ? 1 : -1 });
  }

  return {
    root, shells, legs, fins, height: F9.height, radius: Math.max(fr, R),
    tankGroups: [s1Tanks, s2Tanks],
    tankSlots: [
      { key: 'f9s1', prefix: 'f9s1', parent: s1, y0: () => bayTop },
      { key: 'f9s2', prefix: 'f9s2', parent: s2, y0: tk => s2Top - 0.1 - tk.length },
    ],
    explode: [
      { obj: s2, to: new THREE.Vector3(0, 7, 0) },
      ...halves.map(hv => ({ obj: hv.obj, base: hv.obj.position.clone(), to: new THREE.Vector3(hv.sign * 4.5, 13, 0), rotZ: -hv.sign * 0.3 })),
    ],
  };
}

// ---------------------------------------------------------------------------
// Starship + Super Heavy
export function buildStarship(reg, tanks, seg = 64) {
  const root = new THREE.Group(); root.name = 'starship';
  const shells = [];
  const R = SS.diameter / 2, L = LAYOUT.starship;
  const shTop = SS.stages[0].length, hsrBase = shTop - L.hotStage;

  // --- booster
  const sh = new THREE.Group(); sh.name = 'booster'; root.add(sh);
  const lay = superHeavyLayout(R, DIMS.raptor.re);
  const rap = engineGeometry(DIMS.raptor, { drawExitR: lay.drawBellR, seg: 16 });
  const mats = { inner: reg.material('sh-raptor-inner'), middle: reg.material('sh-raptor-middle'), outer: reg.material('sh-raptor-outer') };
  for (const p of lay.engines) {
    const e = mesh(rap.geo, mats[p.ring], `sh-raptor-${p.ring}`);
    e.position.set(p.x, 0, p.y); sh.add(e);
  }
  const gimbal = rap.length, bayTop = gimbal + L.engineBay;
  const shMat = reg.material('sh-shell', { side: THREE.DoubleSide });
  const skirt = mesh(tube(R, gimbal * 0.35, hsrBase, seg), shMat, 'sh-shell');
  const shield = mesh(new THREE.CircleGeometry(R * 0.99, seg).rotateX(Math.PI / 2).translate(0, gimbal + 0.05, 0), reg.material('sh-shell', { side: THREE.DoubleSide }), 'sh-shell');
  sh.add(skirt, shield); shells.push(skirt);
  const shTanks = tankMeshes(tanks.sh, bayTop, reg, 'sh'); shTanks.name = 'tanks'; sh.add(shTanks);
  // hot-staging ring: two thin rings joined by posts, vents between
  const hsrMat = reg.material('sh-hsr', { side: THREE.DoubleSide });
  const hsrParts = [tube(R, hsrBase, hsrBase + 0.35, seg), tube(R, shTop - 0.3, shTop, seg)];
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    const post = new THREE.BoxGeometry(0.45, L.hotStage - 0.6, 0.25);
    post.rotateY(-a); post.translate(Math.cos(a) * (R - 0.12), hsrBase + L.hotStage / 2, Math.sin(a) * (R - 0.12));
    hsrParts.push(post.toNonIndexed());
  }
  const hsr = mesh(mergeGeometries(hsrParts.map(g => g.index ? g.toNonIndexed() : g)), hsrMat, 'sh-hsr');
  const hsrDome = mesh(new THREE.CircleGeometry(R - 0.3, seg).rotateX(-Math.PI / 2).translate(0, hsrBase + 0.4, 0), hsrMat, 'sh-hsr');
  sh.add(hsr, hsrDome); shells.push(hsr);
  // grid fins (4) and catch pins
  const finGeo = gridFinGeometry(2.4, 3.2, 0.35, 9);
  const finMat = reg.material('sh-gridfins'), pinMat = reg.material('sh-pins');
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const fp = new THREE.Group();
    fp.position.set(Math.cos(a) * (R + 0.1), hsrBase - 2.2, Math.sin(a) * (R + 0.1));
    fp.rotation.y = -a;
    const fin = mesh(finGeo, finMat, 'sh-gridfins'); fin.rotation.set(0, Math.PI / 2, -Math.PI / 2); fp.add(fin);
    sh.add(fp);
  }
  for (const a of [0, Math.PI]) {
    const pin = mesh(new THREE.BoxGeometry(1.2, 0.8, 1.0), pinMat, 'sh-pins');
    pin.position.set(Math.cos(a) * (R + 0.5), hsrBase - 4.6, Math.sin(a) * (R + 0.5)); pin.rotation.y = -a;
    sh.add(pin);
  }

  // --- ship (windward side = +z)
  const ship = new THREE.Group(); ship.name = 'ship'; root.add(ship);
  const base = shTop;
  const vacG = engineGeometry(DIMS.rvac, { seg: 24 });
  const slG = engineGeometry(DIMS.raptor, { seg: 20 });
  const sGimbal = base + 0.3 + vacG.length;
  const shipL = shipLayout(R, DIMS.raptor.re, DIMS.rvac.re);
  const slMat = reg.material('ss-raptor'), vacMat = reg.material('ss-rvac');
  for (const p of shipL) {
    const vac = p.ring === 'vacuum';
    const e = mesh(vac ? vacG.geo : slG.geo, vac ? vacMat : slMat, vac ? 'ss-rvac' : 'ss-raptor');
    e.position.set(p.x, sGimbal - (vac ? vacG.length : slG.length), p.y); ship.add(e);
  }
  const tankBase = sGimbal + L.shipAft;
  const ssTanks = tankMeshes(tanks.ss, tankBase, reg, 'ss'); ssTanks.name = 'tanks'; ship.add(ssTanks);
  const top = SS.height, noseLen = 13.0, barrelTop = top - noseLen;
  const shipMat = reg.material('ss-shell', { side: THREE.DoubleSide });
  const shipBody = mesh(tube(R, base, barrelTop, seg), shipMat, 'ss-shell');
  ship.add(shipBody); shells.push(shipBody);
  const noseProf = [];
  for (let i = 0; i <= 20; i++) { const t = i / 20; noseProf.push([R * Math.cos(t * Math.PI / 2) ** 0.75, barrelTop + noseLen * Math.sin(t * Math.PI / 2) ** 1.15]); }
  noseProf[noseProf.length - 1][0] = 0;
  const noseMat = reg.material('ss-nose', { side: THREE.DoubleSide });
  const nose = mesh(lathe(noseProf, seg), noseMat, 'ss-nose');
  ship.add(nose); shells.push(nose);
  // windward heat-shield tiles: a half-shell + half-nose with a hex texture
  const tex = hexTexture();
  const tileMat = reg.material('ss-tiles', { side: THREE.DoubleSide });
  const tileS = 0.3; // hex "radius" s in metres → texture period √3 s × 3 s
  const barrelArc = Math.PI * (R + 0.02), barrelH = barrelTop - base;
  const t1 = tex.clone(); t1.needsUpdate = true; t1.repeat.set(barrelArc / (Math.sqrt(3) * tileS), barrelH / (3 * tileS));
  tileMat.map = t1;
  const tiles = mesh(new THREE.CylinderGeometry(R + 0.02, R + 0.02, barrelH, seg, 1, true, -Math.PI / 2, Math.PI).translate(0, (base + barrelTop) / 2, 0), tileMat, 'ss-tiles');
  const tileMat2 = reg.material('ss-tiles', { side: THREE.DoubleSide });
  const t2 = tex.clone(); t2.needsUpdate = true; t2.repeat.set(barrelArc / (Math.sqrt(3) * tileS), noseLen / (3 * tileS)); tileMat2.map = t2;
  const noseTiles = mesh(lathe(noseProf.map(([r, y]) => [r + 0.02, y]), seg / 2, -Math.PI / 2, Math.PI), tileMat2, 'ss-tiles');
  ship.add(tiles, noseTiles); shells.push(tiles, noseTiles);
  // flaps on the ±x sides, slightly leeward (−z)
  const flap = (hgt, rootW, tipW, thick) => {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.lineTo(rootW, 0.4); s.lineTo(tipW, hgt - 0.4); s.lineTo(0, hgt); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
    g.translate(0, 0, -thick / 2);
    return g; // x outward, y up
  };
  const aft = flap(10.5, 4.2, 3.2, 0.35), fwd = flap(6.5, 2.6, 1.6, 0.3);
  const aftMat = reg.material('ss-aftflaps'), fwdMat = reg.material('ss-fwdflaps');
  const flaps = [];
  for (const sgn of [1, -1]) {
    const leeward = -0.8; // m toward −z
    const af = mesh(aft, aftMat, 'ss-aftflaps');
    af.position.set(sgn * (R - 0.1), base + 1.0, leeward); af.scale.x = sgn;
    const ff = mesh(fwd, fwdMat, 'ss-fwdflaps');
    ff.position.set(sgn * (R * 0.72), barrelTop + 1.0, leeward - 0.4); ff.scale.x = sgn;
    ship.add(af, ff); flaps.push(af, ff);
  }

  return {
    root, shells, legs: [], fins: [], height: SS.height, radius: R + 4.2,
    tankGroups: [shTanks, ssTanks],
    tankSlots: [
      { key: 'sh', prefix: 'sh', parent: sh, y0: () => bayTop },
      { key: 'ss', prefix: 'ss', parent: ship, y0: () => tankBase },
    ],
    explode: [{ obj: ship, to: new THREE.Vector3(0, 14, 0) }],
  };
}

// ---------------------------------------------------------------------------
// Engine close-ups: Merlin 1D and Raptor 2, true relative size, with a 90° section cut.
export function buildEngines(reg) {
  const root = new THREE.Group(); root.name = 'engines';
  const labels = [];
  const cut = { phiStart: Math.PI / 4, phiLen: Math.PI * 1.5 }; // the missing wedge faces +z (the camera)
  const make = (dims, key, x, kind) => {
    const g = new THREE.Group(); g.position.x = x; root.add(g);
    const p = dims.profile;
    const total = p.bellLength - p.chamberStart;
    // split the profile at the throat: chamber+throat (z ≤ 0) and bell (z ≥ 0)
    const toY = q => [q.r, p.bellLength - q.z];
    const ch = p.points.filter(q => q.z <= 0).map(toY);
    const bl = p.points.filter(q => q.z >= 0).map(toY);
    const chamber = mesh(lathe([[0.0001, total], ...ch], 48, cut.phiStart, cut.phiLen), reg.material('eng-chamber', { side: THREE.DoubleSide }), 'eng-chamber');
    const bell = mesh(lathe(bl, 48, cut.phiStart, cut.phiLen), reg.material('eng-bell', { side: THREE.DoubleSide }), 'eng-bell');
    g.add(chamber, bell);
    // cut-edge outline (both faces of the wedge)
    const outlineMat = new THREE.LineBasicMaterial({ color: 0xffd08a });
    for (const phi of [cut.phiStart, cut.phiStart + cut.phiLen]) {
      const pts = p.points.map(q => new THREE.Vector3(Math.sin(phi) * q.r, p.bellLength - q.z, Math.cos(phi) * q.r));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), outlineMat);
      g.add(line);
    }
    // injector dome + manifold + turbopumps
    const rc = p.Rc, yTop = total;
    const pumpMat = reg.material('eng-pump'), manMat = reg.material('eng-manifold');
    const dome = mesh(new THREE.SphereGeometry(rc, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1).translate(0, yTop, 0), manMat, 'eng-manifold');
    const torus = mesh(new THREE.TorusGeometry(rc * 1.05, rc * 0.14, 10, 32).rotateX(Math.PI / 2).translate(0, yTop - p.Lc * 0.3, 0), manMat, 'eng-manifold');
    g.add(dome, torus);
    const pump = (px, len, r) => {
      const c = mesh(new THREE.CylinderGeometry(r, r * 0.9, len, 20).translate(px, yTop + 0.05, -0.05), pumpMat, 'eng-pump');
      g.add(c); return c;
    };
    if (kind === 'merlin') {
      pump(-rc * 1.9, rc * 1.8, rc * 0.55);
      // gas-generator exhaust duct running down beside the bell
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-rc * 1.9, yTop - rc * 0.8, -0.05), new THREE.Vector3(-rc * 2.0, yTop - p.Lc - 0.3, -0.05),
        new THREE.Vector3(-p.re * 0.85, p.bellLength * 0.25, -0.1), new THREE.Vector3(-p.re * 0.95, -0.05, -0.1)]);
      g.add(mesh(new THREE.TubeGeometry(curve, 30, 0.045, 8), pumpMat, 'eng-pump'));
    } else {
      pump(-rc * 1.9, rc * 2.2, rc * 0.6); // oxygen-rich preburner + LOX turbopump
      pump(rc * 1.9, rc * 2.2, rc * 0.6);  // fuel-rich preburner + CH₄ turbopump
      const hot = new THREE.CatmullRomCurve3([new THREE.Vector3(-rc * 1.9, yTop + rc, -0.05), new THREE.Vector3(0, yTop + rc * 1.6, 0), new THREE.Vector3(rc * 1.9, yTop + rc, -0.05)]);
      g.add(mesh(new THREE.TubeGeometry(hot, 24, rc * 0.18, 8), manMat, 'eng-manifold'));
    }
    const e = ENGINES[key];
    labels.push(
      { parent: g, pos: new THREE.Vector3(0, total + rc * 2.6, 0), html: `<b>${e.name}</b>`, cls: 'title' },
      { parent: g, pos: new THREE.Vector3(Math.sin(cut.phiStart) * rc, p.bellLength - p.chamberStart - p.Lc / 2, Math.cos(cut.phiStart) * rc), html: 'Chamber' },
      { parent: g, pos: new THREE.Vector3(Math.sin(cut.phiStart) * dims.rt, p.bellLength, Math.cos(cut.phiStart) * dims.rt), html: `Throat ⌀ ${(2 * dims.rt * 100).toFixed(0)} cm` },
      { parent: g, pos: new THREE.Vector3(0, -0.12, p.re), html: `Exit ⌀ ${(2 * p.re).toFixed(2)} m · ε = ${e.eps} (est.)` },
    );
    return { group: g, height: total };
  };
  const mer = make(DIMS.merlin, 'merlin1d', -1.25, 'merlin');
  const rap = make(DIMS.raptor, 'raptor2', 1.35, 'raptor');
  return { root, labels, shells: [], legs: [], fins: [], explode: [], tankGroups: [], height: Math.max(mer.height, rap.height) + 0.6, radius: 2.6 };
}

// ---------------------------------------------------------------------------
// Scale references
export function buildHuman(reg) {
  const g = new THREE.Group();
  const mat = reg.material('human');
  const body = mesh(new THREE.CapsuleGeometry(0.17, 1.0, 4, 10).translate(0, 0.87, 0), mat, 'human');
  const head = mesh(new THREE.SphereGeometry(0.12, 12, 8).translate(0, 1.68, 0), mat, 'human');
  g.add(body, head);
  return g;
}
export function buildLiberty(reg) {
  const g = new THREE.Group();
  const stone = reg.material('liberty');
  // ≈ 47 m of foundation + pedestal, ≈ 46 m statue to the torch tip (total 93 m)
  const parts = [
    new THREE.BoxGeometry(28, 6, 28).translate(0, 3, 0),          // star-fort foundation (simplified)
    new THREE.CylinderGeometry(9, 12, 21, 4).rotateY(Math.PI / 4).translate(0, 16.5, 0), // foundation
    new THREE.BoxGeometry(14, 20, 14).translate(0, 37, 0),         // pedestal → 47 m
    new THREE.CylinderGeometry(3.2, 5.6, 26, 16).translate(0, 60, 0),     // robe
    new THREE.CylinderGeometry(2.2, 3.2, 6, 14).translate(0, 76, 0),      // shoulders
    new THREE.SphereGeometry(2.0, 14, 10).translate(0, 80.5, 0),          // head
    new THREE.ConeGeometry(2.6, 2.2, 7).translate(0, 82.6, 0),            // crown
    new THREE.CylinderGeometry(0.7, 0.8, 12, 8).translate(0, 6, 0).rotateZ(-0.18).translate(3.2, 76.5, 0), // raised arm
    new THREE.CylinderGeometry(1.3, 0.6, 2.2, 10).translate(5.4, 89.6, 0),  // torch
    new THREE.ConeGeometry(0.9, 2.2, 10).translate(5.4, 91.8, 0),           // flame (top ≈ 93 m)
  ];
  g.add(mesh(mergeGeometries(parts.map(p => p.toNonIndexed())), stone, 'liberty'));
  return g;
}
