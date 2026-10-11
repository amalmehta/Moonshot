// Exercises for launch economics.
import { propellantCost, learningCurveUnit, falcon9Cost, F9_COST } from '../../physics/cost.js';

const r = (x, d = 3) => Number(x.toPrecision(d)).toLocaleString('en-US');

const perKg1 = 74e6 / 22800;
const amort2 = 30e6 / 10 + 1e6 * 9 / 10;
const ss = propellantCost(4.9e6, 'methalox');
const lc5 = learningCurveUnit(1, 100, 0.85);
const expCost = falcon9Cost({ ...F9_COST, reuses: 1, fairingUses: 1 }).total;
const exp6 = expCost / 22800, reu6 = falcon9Cost().total / 17400;
const fair7 = 10 * 6e6 - (6e6 + 9 * 0.5e6);
const ride8 = 300000 / 50;

export default [
  {
    id: 'cost-1', title: 'Price per kilogram', tags: ['cost'], difficulty: 1,
    prompt: 'A dedicated Falcon 9 lists at about $74 M (2026, press reports) and can lift 22.8 t to LEO when expended. What is the price per kilogram?',
    answer: perKg1, unit: '$/kg', tolerance: 0.01,
    hints: ['Divide price by payload mass in kg.'],
    solution: `$74,000,000 / 22,800 kg ≈ <strong>$${r(perKg1)}/kg</strong>. The Space Shuttle cost ~$54,500/kg (FY2018 $), about 17× more.`,
  },
  {
    id: 'cost-2', title: 'Amortizing a booster', tags: ['reuse', 'cost'], difficulty: 1,
    prompt: 'A booster costs $30 M to build and flies 10 times. Each reflight (not the first flight) needs $1 M of refurbishment. What is the booster cost per flight, averaged over its life?',
    answer: amort2 / 1e6, unit: '$M', tolerance: 0.01,
    hints: ['Total lifetime cost = build + 9 refurbishments; divide by 10 flights.'],
    solution: `($30 M + 9 × $1 M) / 10 = <strong>$${r(amort2 / 1e6)} M</strong> per flight, down from $30 M if thrown away. Reuse turns the most expensive part into the cheapest line item, and the expendable second stage (~$10 M, est.) becomes the dominant cost.`,
  },
  {
    id: 'cost-3', title: 'Filling up a Starship', tags: ['cost', 'combustion'], difficulty: 2,
    prompt: 'A full Starship stack carries ~4,900 t of methalox at O/F = 3.6. With bulk LOX at $0.15/kg and liquefied methane at $0.30/kg, what does a fill-up cost, in $M?',
    answer: ss.total / 1e6, unit: '$M', tolerance: 0.02,
    hints: ['LOX share: 3.6/4.6 of the mass; methane: 1/4.6.'],
    solution: `LOX: ${r(ss.oxMass / 1000)} t × $0.15 = $${r(ss.ox / 1e6)} M; methane: ${r(ss.fuelMass / 1000)} t × $0.30 = $${r(ss.fuel / 1e6)} M; total ≈ <strong>$${r(ss.total / 1e6)} M</strong>. At 100 t of payload that’s under $10/kg. Propellant is never what makes rockets expensive. Throwing away hardware is.`,
  },
  {
    id: 'cost-4', title: 'The learning curve', tags: ['cost'], difficulty: 2,
    prompt: 'With an 85 % Wright learning curve (each doubling of cumulative production cuts unit cost to 85 %), what fraction of the first unit’s cost does the 100th unit cost?',
    answer: lc5, unit: '', tolerance: 0.01,
    hints: ['\\(C_n = C_1\\, n^{\\log_2 0.85}\\).'],
    solution: `\\(\\log_2 0.85 = ${r(Math.log2(0.85), 4)}\\), so \\(C_{100} = 100^{${r(Math.log2(0.85), 4)}} ≈ ${r(lc5)}\\): about ${r(lc5 * 100, 2)} % of the first. Building hundreds of Merlins (9 per booster plus one per upper stage) drives cost down the curve. Reuse cuts the <em>number</em> built, but SpaceX builds so many second stages and Starlink satellites that the factory still learns.`,
  },
  {
    id: 'cost-5', title: 'Does reuse pay if payload drops?', tags: ['reuse', 'cost'], difficulty: 3,
    prompt: `Use this site’s default cost model: an expendable Falcon 9 costs about $${r(expCost / 1e6)} M per flight for 22.8 t, a reused one about $${r(falcon9Cost().total / 1e6)} M for 17.4 t (booster recovered at sea). What is the reused cost per kg?`,
    answer: reu6, unit: '$/kg', tolerance: 0.02,
    hints: ['Divide each cost by its payload.'],
    solution: `Expendable: $${r(exp6)}/kg; reused: <strong>$${r(reu6)}/kg</strong>. Even after losing ~24 % of payload to landing propellant, reuse is ~${r(exp6 / reu6, 2)}× cheaper per kg, as long as you have enough customers (or your own Starlink satellites) to fill rockets at a high cadence.`,
  },
  {
    id: 'cost-6', title: 'Catching fairings', tags: ['reuse'], difficulty: 1,
    prompt: 'A fairing costs ~$6 M. If one set flies 10 times with $0.5 M of refurbishment per reflight, how much does SpaceX save over 10 launches compared with a new fairing every time, in $M?',
    answer: fair7 / 1e6, unit: '$M', tolerance: 0.01,
    hints: ['New every time: 10 × $6 M. Reused: one fairing + 9 refurbishments.'],
    solution: `$60 M − ($6 M + 9 × $0.5 M) = <strong>$${r(fair7 / 1e6)} M</strong>. Musk’s pitch for fairing recovery was literally “imagine $6 M falling from the sky.”`,
  },
  {
    id: 'cost-7', title: 'Rideshare pricing', tags: ['cost'], difficulty: 1,
    prompt: 'SpaceX’s rideshare program (press reports, 2026) prices a slot at about $300,000 for 50 kg. What price per kg is that?',
    answer: ride8, unit: '$/kg', tolerance: 0.01,
    hints: ['Simple division.'],
    solution: `$300,000/50 kg = <strong>$${r(ride8)}/kg</strong>, about twice the dedicated per-kg price. You pay for convenience and SpaceX’s integration work, but a small satellite can reach orbit for the price of a house.`,
  },
  {
    id: 'cost-8', title: 'Why second stages are the next frontier', tags: ['reuse', 'cost'], difficulty: 2,
    prompt: 'Explain, using this page’s cost breakdown, why making the upper stage reusable (Starship) matters more for cost than flying a Falcon 9 booster 40 times instead of 20.',
    hints: ['Compare the booster’s amortized share at 20 vs 40 flights with the second stage’s share.'],
    solution: `With 20 reuses the booster contributes $30 M/20 = $1.5 M; at 40 it’s $0.75 M, saving only $0.75 M per flight. The expendable second stage costs ~$10 M <em>every</em> flight, plus ~$8 M of launch operations. Once a booster is reused, the remaining cost is dominated by what’s thrown away and by people. Hence full reuse (ship and booster) plus fast pad turnaround, which attacks both.`,
  },
];
