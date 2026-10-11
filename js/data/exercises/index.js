// All exercises, grouped by section (order = order on the Exercises page).
import vehicles from './vehicles.js';
import propulsion from './propulsion.js';
import flight from './flight.js';
import structures from './structures.js';
import software from './software.js';
import starlink from './starlink.js';
import cost from './cost.js';
import moon from './moon.js';

export const SECTIONS = [
  { id: 'propulsion', title: 'Propulsion', page: 'propulsion.html', list: propulsion },
  { id: 'flight', title: 'Flight Physics', page: 'flight.html', list: flight },
  { id: 'vehicles', title: '3D Vehicles', page: 'vehicles.html', list: vehicles },
  { id: 'structures', title: 'Hardware & Materials', page: 'structures.html', list: structures },
  { id: 'software', title: 'Flight Software & AI', page: 'software.html', list: software },
  { id: 'starlink', title: 'Starlink', page: 'starlink.html', list: starlink },
  { id: 'cost', title: 'Cost', page: 'cost.html', list: cost },
  { id: 'moon', title: 'Moon Mission', page: 'moon.html', list: moon },
];
