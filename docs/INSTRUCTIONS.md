# Moonshot: Setup, Run and Use

## Requirements

- Any modern browser (Chrome, Safari, Firefox, Edge) with WebGL for the 3D pages.
- To serve locally: Python 3 (for `http.server`) or any static file server.
- To run the tests: Node.js 20 or newer (no `npm install` needed; there are no dependencies).
- Internet access at runtime for the CDN libraries (KaTeX, Three.js) and the heading font.

## Run it

ES modules don't load from `file://`, so serve the folder:

```bash
python3 -m http.server 47321 --bind 127.0.0.1
```

Then open <http://127.0.0.1:47321/>. Any free port works; 47321 is just the default used by the scripts.

## Test it

```bash
npm test
```

This runs every unit test and every model-vs-published validation check in Node (the same checks the Validation page shows).

Smoke-test a page in headless Chrome (prints console errors and saves a screenshot):

```bash
scripts/check-page.sh propulsion.html /tmp/propulsion.png 1400,1000
```

For pages with continuous 3D animation, add a real-time limit:

```bash
REALTIME=8000 scripts/check-page.sh moon.html /tmp/moon.png
```

## Use it

| Page | What to do there |
|---|---|
| **Home** | Overview, live headline numbers, system map. “Send me to the Moon” jumps to the mission. |
| **3D Vehicles** | Rotate/zoom the rockets (drag, scroll or pinch). Switch vehicle, cut away the tanks, explode the stages, click parts for details. |
| **Propulsion** | Rocket-equation explorer, nozzle lab (chamber pressure, area ratio, altitude → Isp, thrust, separation warning), turbopump power balance. |
| **Flight Physics** | Ascent simulator (vehicle, payload, pitch kick, max-Q limit, landing reserve) with loss breakdown and a max-payload search; staging explorer; Hohmann calculator. |
| **Hardware** | Material strength vs temperature, tank-sizing lab across materials, re-entry heating lab. |
| **Software & AI** | Kalman-filter demo, booster-landing simulator (crash it by lighting late), Monte Carlo landings, reliability and redundancy demos. |
| **Starlink** | 3D constellation with your location, coverage maths, phased-array beam steering, link budget, latency vs fibre. |
| **Cost** | Falcon 9 and Starship cost models with sliders, reuse curve, learning curve. |
| **Moon** | Press **Launch me** to fly the full mission: launch, refilling, TLI, coast, lunar orbit, landing. Adjust tanker size and boil-off, scrub the timeline, switch camera. |
| **Exercises** | Every problem in one place. Filter by topic tag or difficulty; progress is saved in your browser. |
| **Validation** | Every model compared with its published figure, with error, tolerance, source and assumptions. |

### Settings (⌘, on Mac, Ctrl+, elsewhere, or the gear button)

- **Appearance:** System, Light or Dark.
- **Motion:** reduce motion to stop idle 3D spin and auto-playing animation.
- **3D quality:** Low/Medium/High render resolution.
- **Default simulation speed:** the starting time warp for the Moon and landing sims.
- **Exam mode:** hides “Show solution” on exercises.
- **Exercise progress:** reset.

### Feedback

The small **Feedback** tab on the right edge opens a note form. Notes are stored in your browser; use **Copy all** or **Download** to pass them on.

## Deploy (when wanted)

The site is static. Any static host works (for example GitHub Pages serving the repository root). No build step is needed.
