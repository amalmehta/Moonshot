// Validation checks for the Moon Mission section: the integrated mission model vs Apollo figures.
// Pure (no DOM). planTLI() runs ~100–200 trajectory integrations, so this takes ~0.5–1 s.
import { planTLI, poweredDescent, soiRadius } from '../physics/moon.js';

const FT = 0.3048;
const AFJ_TLI = 'https://www.nasa.gov/history/afj/ap11fj/02earth-orbit-tli.html';
const AFJ_LOI1 = 'https://www.nasa.gov/history/afj/ap11fj/12day4-loi1.html';
const AFJ_LOI2 = 'https://www.nasa.gov/history/afj/ap11fj/14day4-loi2.html';
const AFJ_16PDI = 'https://www.nasa.gov/history/afj/ap16fj/16_Day5_Pt4.html';
const WIKI_SOI = 'https://en.wikipedia.org/wiki/Sphere_of_influence_(astrodynamics)';

let cache;
export function apolloLikePlan() {
  // Apollo 11's parking orbit was ~103 nmi (190 km); free return with a ~110 km pericynthion.
  if (!cache) cache = planTLI({ parkingAlt: 190e3, periseleneAlt: 110e3, mode: 'freeReturn', returnPerigeeAlt: 60e3 });
  return cache;
}

export default function checks() {
  const tli = apolloLikePlan();
  const desc = poweredDescent({ h: 15e3, lloAlt: 110e3, isp: 311 });
  return [
    {
      id: 'moon-tli-dv', quantity: 'Trans-lunar injection Δv (free return, 190 km parking orbit)',
      computed: tli.dv, reported: 10435.6 * FT, unit: 'm/s', tolerance: 0.03,
      source: AFJ_TLI,
      note: 'Apollo 11 planned TLI Δv 10,435.6 ft/s (S-IVB, 5 min 47 s burn). The model burn is impulsive, so it has no gravity loss from a finite burn (Apollo\'s cost tens of m/s), and the Moon is on a circular orbit at its mean distance with no Sun; Apollo also had to fit the Moon\'s real distance and a 30°-plus orbit inclination.',
    },
    {
      id: 'moon-coast-time', quantity: 'Coast time, TLI to lunar orbit insertion',
      computed: tli.tof / 3600, reported: (75 + 49 / 60 + 50 / 3600) - (2 + 44 / 60 + 16 / 3600), unit: 'h', tolerance: 0.10,
      source: AFJ_LOI1,
      note: 'Apollo 11: TLI ignition 002:44:16 GET, LOI-1 ignition 075:49:50 GET (73.1 h). Model: impulsive TLI to perilune on a planar free return. The real time depends on the Moon\'s distance that day and the chosen return conditions (Apollo 8 took ~66 h), so ±10 %.',
    },
    {
      id: 'moon-loi-dv', quantity: 'Lunar orbit insertion Δv (total, into ~110 km orbit)',
      computed: tli.loiDv, reported: (2917 + 159.2) * FT, unit: 'm/s', tolerance: 0.06,
      source: AFJ_LOI1 + ' ; ' + AFJ_LOI2,
      note: 'Apollo 11 entered orbit in two burns: LOI-1 2,917 ft/s into 61 × 169 nmi, then LOI-2 159.2 ft/s to ~54 × 66 nmi. The model makes one impulsive burn to a circular orbit at perilune, which is slightly cheaper than two burns to a slightly elliptical orbit.',
    },
    {
      id: 'moon-descent-dv', quantity: 'Powered descent Δv, 15 km perilune to touchdown',
      computed: desc.dv, reported: 6698 * FT, unit: 'm/s', tolerance: 0.15,
      source: AFJ_16PDI,
      note: 'Apollo 16 PDI-to-touchdown budget 6,698 ft/s. The model is an ideal constant-thrust gravity turn with the thrust level solved to stop exactly at the surface (lunar T/W ≈ 2.9), so it has the minimum gravity loss (~70 m/s). The LM flew at lower T/W (~1.8 lunar g at PDI), held altitude while braking, pitched up for the crew to see the site and kept a hover reserve, which together cost ~250–300 m/s more.',
    },
    {
      id: 'moon-soi', quantity: 'Moon sphere of influence radius',
      computed: soiRadius() / 1e3, reported: 66100, unit: 'km', tolerance: 0.01,
      source: WIKI_SOI,
      note: 'Laplace r = a(m/M)^(2/5) with a = 384,400 km and μ☾/μ⊕ = 0.0123. The SOI is a modelling boundary, not a physical surface.',
    },
  ];
}
