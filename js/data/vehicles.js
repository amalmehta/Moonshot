// Public vehicle and engine figures used as model inputs AND as the "reported results" the
// models are checked against. `est: true` marks community/press estimates rather than figures
// SpaceX has published. Every entry cites where it came from (see SOURCES).

export const SOURCES = {
  f9: { title: 'SpaceX — Falcon 9 vehicle page (specs)', url: 'https://www.spacex.com/vehicles/falcon-9/' },
  f9guide: { title: 'SpaceX — Falcon User’s Guide (2021)', url: 'https://www.spacex.com/media/falcon-users-guide-2021-09.pdf' },
  starship: { title: 'SpaceX — Starship vehicle page (specs)', url: 'https://www.spacex.com/vehicles/starship/' },
  capabilities: { title: 'SpaceX — Capabilities & Services (list prices)', url: 'https://www.spacex.com/media/Capabilities&Services.pdf' },
  wikiF9: { title: 'Wikipedia — Falcon 9 Full Thrust (stage masses, est.)', url: 'https://en.wikipedia.org/wiki/Falcon_9_Full_Thrust' },
  wikiMerlin: { title: 'Wikipedia — SpaceX Merlin (chamber pressure, area ratio)', url: 'https://en.wikipedia.org/wiki/SpaceX_Merlin' },
  wikiRaptor: { title: 'Wikipedia — SpaceX Raptor', url: 'https://en.wikipedia.org/wiki/SpaceX_Raptor' },
  wikiStarship: { title: 'Wikipedia — SpaceX Starship', url: 'https://en.wikipedia.org/wiki/SpaceX_Starship' },
  faaPEA: { title: 'FAA — Final Programmatic Environmental Assessment, Starship/Super Heavy at Boca Chica (2022)', url: 'https://www.faa.gov/space/stakeholder_engagement/spacex_starship' },
  fcc: { title: 'FCC — SpaceX Gen1/Gen2 NGSO authorizations (orbital shells)', url: 'https://www.fcc.gov/' },
  nasaHLS: { title: 'NASA — Artemis Human Landing System', url: 'https://www.nasa.gov/reference/human-landing-system/' },
  sutton: { title: 'Sutton & Biblarz, Rocket Propulsion Elements, 9th ed. (2017)', url: 'https://www.wiley.com/en-us/Rocket+Propulsion+Elements%2C+9th+Edition-p-9781118753910' },
  blackmore: { title: 'Blackmore, “Autonomous Precision Landing of Space Rockets”, NAE The Bridge (2016)', url: 'https://www.nae.edu/162039/Autonomous-Precision-Landing-of-Space-Rockets' },
  ussa: { title: 'U.S. Standard Atmosphere, 1976 (NOAA/NASA/USAF)', url: 'https://ntrs.nasa.gov/citations/19770009539' },
};

export const ENGINES = {
  merlin1d: {
    name: 'Merlin 1D', vehicle: 'Falcon 9 first stage (×9)', cycle: 'Gas generator', prop: 'kerolox',
    pc: 9.7e6, eps: 16, thrustSL: 845e3, thrustVac: 914e3, ispSL: 282, ispVac: 311, throttleMin: 0.40, mass: 470,
    src: ['f9', 'wikiMerlin'], est: ['pc', 'eps', 'ispSL', 'ispVac', 'throttleMin', 'mass'],
  },
  mvac: {
    name: 'Merlin Vacuum', vehicle: 'Falcon 9 second stage (×1)', cycle: 'Gas generator', prop: 'kerolox',
    pc: 9.7e6, eps: 165, thrustVac: 981e3, ispVac: 348, throttleMin: 0.39,
    src: ['f9', 'wikiMerlin'], est: ['pc', 'eps', 'throttleMin'],
  },
  raptor2: {
    name: 'Raptor 2', vehicle: 'Super Heavy (×33) / Starship (×3)', cycle: 'Full-flow staged combustion', prop: 'methalox',
    pc: 30e6, eps: 34, thrustSL: 2256e3, ispSL: 327, ispVac: 347, throttleMin: 0.40, mass: 1630,
    src: ['wikiRaptor'], est: ['pc', 'eps', 'ispSL', 'ispVac', 'throttleMin', 'mass'],
  },
  raptorVac: {
    name: 'Raptor Vacuum', vehicle: 'Starship upper stage (×3)', cycle: 'Full-flow staged combustion', prop: 'methalox',
    pc: 30e6, eps: 90, thrustVac: 2530e3, ispVac: 380,
    src: ['wikiRaptor'], est: ['pc', 'eps', 'thrustVac', 'ispVac'],
  },
  raptor3: {
    name: 'Raptor 3', vehicle: 'Starship V3 (in development)', cycle: 'Full-flow staged combustion', prop: 'methalox',
    pc: 35e6, eps: 34, thrustSL: 2746e3, ispSL: 330, ispVac: 350, mass: 1525,
    src: ['wikiRaptor'], est: ['pc', 'eps', 'ispSL', 'ispVac', 'mass'],
  },
};

// Stages bottom-first. Masses in kg. Isp used in Δv budgets is a burn-averaged value for stage 1.
export const VEHICLES = {
  falcon9: {
    name: 'Falcon 9 Block 5',
    height: 70, diameter: 3.7, liftoffMass: 549054,
    payloadLEO: 22800, payloadLEOReusable: 17400, payloadGTO: 8300, payloadGTOReusable: 5500,
    listPrice: 69.85e6,
    stages: [
      { name: 'First stage', engines: 'merlin1d', count: 9, dry: 25600, prop: 395700, isp: 297, ispSL: 282, ispVac: 311, thrustSL: 7607e3, thrustVac: 8227e3, burn: 162, length: 41.2, diameter: 3.7 },
      { name: 'Second stage', engines: 'mvac', count: 1, dry: 3900, prop: 92670, isp: 348, thrustVac: 981e3, burn: 397, length: 13.8, diameter: 3.7, jettison: 1900 /* fairing */ },
    ],
    fairing: { mass: 1900, length: 13.1, diameter: 5.2 },
    src: ['f9', 'f9guide', 'wikiF9', 'capabilities'],
    est: ['stages.dry', 'stages.prop', 'stages.isp', 'payloadLEOReusable', 'payloadGTOReusable'],
  },
  starship: {
    name: 'Starship + Super Heavy (V2)',
    height: 123.1, diameter: 9, liftoffMass: 5000000,
    payloadLEO: 100000, payloadLEOExpendable: 150000,
    stages: [
      { name: 'Super Heavy booster', engines: 'raptor2', count: 33, dry: 275000, prop: 3400000, isp: 338, ispSL: 327, ispVac: 347, thrustSL: 74.4e6, burn: 160, length: 71, diameter: 9 },
      { name: 'Starship', engines: 'raptorVac', count: 6, dry: 130000, prop: 1500000, isp: 370, thrustVac: 3 * 2530e3 + 3 * 2400e3, burn: 380, length: 52.1, diameter: 9 },
    ],
    src: ['starship', 'wikiStarship', 'faaPEA'],
    est: ['stages.dry', 'stages.isp', 'payloadLEOExpendable', 'liftoffMass'],
  },
};

/** Δv to low Earth orbit including typical gravity, drag and steering losses (rule-of-thumb band). */
export const DV_TO_LEO = { low: 9300, typical: 9400, high: 9700 };
