# Moonshot: What’s Where

```
SpaceX/
├── index.html            Home: hero, live headline numbers, system map, section cards
├── vehicles.html         3D Vehicles: Falcon 9 / Starship / engines, cutaway, exploded view, specs, tank geometry
├── propulsion.html       Propulsion: thrust, rocket equation, propellants, nozzle theory + labs, engine cycles
├── flight.html           Flight Physics: atmosphere, ascent simulator, losses, staging, Hohmann calculator
├── structures.html       Hardware & Materials: pressure vessels, buckling, materials vs temperature, re-entry heating
├── software.html         Flight Software & AI: architecture, Kalman, TVC, guidance, landing sim, reliability, autonomy
├── starlink.html         Starlink: 3D constellation, coverage, phased arrays, link budget, laser latency, bus
├── cost.html             Cost: $/kg history, Falcon 9 & Starship cost models, reuse and learning curves
├── moon.html             Moon Mission: “Launch me” 3D mission player, planner, Δv map, patched conics, Apollo comparison
├── exercises.html        Every exercise, filterable by topic/difficulty, with progress
├── validation.html       Every model vs published figure, live
├── favicon.svg
├── package.json          `npm test` and `npm run serve` (no dependencies)
├── SpaceX.md             The project brief (with open questions/assumptions and changelog)
│
├── css/style.css         Design tokens (light/dark), layout, components, tag colours
│
├── js/
│   ├── common.js         Shell for every page: nav, footer, Settings (⌘,), Feedback tab, KaTeX, TAGS colours, exercise widget
│   ├── plot.js           Canvas line/scatter plotter
│   ├── pages/            One script per page (DOM glue: sliders → models → plots)
│   │   ├── home.js  vehicles.js  propulsion.js  flight.js  structures.js  software.js
│   │   ├── starlink.js  cost.js  moon.js  exercises.js  validation.js
│   │   ├── moon-worker.js           Web Worker: TLI targeting, descent/ascent, Apollo comparison
│   │   └── software-mc-worker.js    Web Worker: Monte Carlo landings
│   ├── physics/          Pure models (no DOM; imported by pages, exercises, validation and tests)
│   │   ├── constants.js  rocket.js  engine.js  atmosphere.js  orbit.js  ascent.js
│   │   ├── structures.js  cost.js  tanks.js
│   │   ├── moon.js       Earth–Moon RK45 integrator, TLI/LOI/descent/ascent, mission budget
│   │   ├── starlink.js   Walker shells, J2, visibility, coverage, phased array, link budget, latency, orbit raising, decay
│   │   ├── gnc.js        Kalman filters, TVC sim, ZEM/ZEV guidance, landing sim + Monte Carlo
│   │   └── reliability.js k-of-n, TMR, voting, engine-out
│   ├── three/            Three.js scene code for the 3D Vehicles page
│   │   ├── viewer.js           renderer, controls, cutaway, exploded view, picking
│   │   ├── vehicle-models.js   procedural Falcon 9 / Starship / engine models + part info
│   │   └── geometry-math.js    pure geometry: nozzle contours, engine cluster layouts, OKLCH→sRGB
│   ├── data/
│   │   ├── vehicles.js   Vehicle & engine specs with citations (SOURCES) and “est.” markers
│   │   └── exercises/    One file per section + index.js (answers computed from the physics code)
│   └── validation/       One file per section + index.js (runAll); used by validation.html and tests
│
├── tests/                node --test suites
│   ├── core.test.mjs  vehicles.test.mjs  software.test.mjs  starlink.test.mjs  moon.test.mjs
│   └── validation.test.mjs   every published-figure check must be within tolerance
│
├── scripts/check-page.sh Headless-Chrome smoke test (console errors + screenshot)
│
└── docs/
    ├── INSTRUCTIONS.md   Setup, run, test, use
    ├── SYSTEM-DESIGN.md  Architecture, components, flows, decisions, testing, limits
    ├── FILE-STRUCTURE.md This file
    └── images/           Screenshots used by the README
```

## Where to change things

| To change… | Edit |
|---|---|
| A vehicle or engine number | `js/data/vehicles.js` (models, pages and validation all read it) |
| A physics model | `js/physics/<model>.js`, then run `npm test` |
| An exercise | `js/data/exercises/<section>.js` |
| A published-figure check | `js/validation/<section>.js` |
| Nav, settings, feedback, tag colours | `js/common.js` |
| Colours, spacing, dark mode | `css/style.css` (tokens at the top) |
