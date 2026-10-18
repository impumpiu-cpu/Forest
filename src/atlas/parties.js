// Parties: the forces that walk the world map as things (data/parties.js). A raid out of a lair, a
// brood on its way to found a lair, an army of a realm at war, a dragon on the wing — one object
// with one code for moving, one for drawing, and a behaviour by kind (BEHAVIOURS below): what it
// does when it arrives, what it does each day while it stays, where it goes afterwards.
//
// The season is the world's tick; a party moves day by day inside it (stepParties runs SEASON_DAYS
// days). It walks the cheapest way (atlas/roads.js findPath and moveCost: roads are faster, mountains
// and swamps slow) or flies straight. The screen slides it from where it stood at the last tick
// (px, py) to where it stands now.
//
// a.parties = [{id, kind, x, y, px, py, i, goal, path, k, state, days, stay, home, speed, might, men,
//               people, owner (lair id or realm id), target (town id), label, color}]
import {PARTIES} from '../data/parties.js';
import {SEASON_DAYS} from '../data/atlas.js';
import {findPath, moveCost} from './roads.js';
import {scaleOf} from './tectonics.js';

export const BEHAVIOURS = {};   // kind → {arrive(a, p, rnd, say), stay(a, p, rnd, say), home(a, p, rnd, say)}; filled by the systems that own the kinds

const scratchOf = a => (a.roadScratch ||= {g: new Float64Array(a.n).fill(Infinity), came: new Int32Array(a.n), touched: []});

// a party sets out from a cell towards a goal cell; null when there is no way
export function sendParty(a, kind, from, goal, props) {
  const p = {id: (a.hist.nextParty = (a.hist.nextParty || 0) + 1), kind, i: from, x: from % a.w + 0.5, y: ((from / a.w) | 0) + 0.5, home: from,
    state: 'go', days: 0, stay: 0, speed: 'foot', people: null, might: 0, men: 0, label: '', color: [220, 220, 220], ...props};
  p.px = p.x; p.py = p.y;
  if (!aim(a, p, goal)) return null;
  (a.parties ||= []).push(p);
  (a.hist.parties ||= {sent: 0, arrived: 0, lost: 0}).sent++;
  return p;
}

// point the party at a goal: a path on foot, a straight line on the wing
function aim(a, p, goal) {
  p.goal = goal; p.k = 0; p.days = 0;
  if (p.speed === 'flight') { p.path = [goal]; return true; }
  const path = findPath(a, p.i, goal, p.people, scratchOf(a));
  if (!path) return false;
  path.reverse();   // findPath gives the way from the goal back; the party walks it forwards
  p.path = path.slice(1);
  return true;
}

const cellSpeed = (a, p, i) => {
  const base = PARTIES.speed[p.speed] * scaleOf(a);
  if (p.speed === 'flight') return base;
  const c = moveCost(a, i, p.people);
  return c === Infinity ? 0 : base / Math.max(0.3, c);
};

// one day of walking; true when the goal is reached
function walk(a, p) {
  let budget = 1;
  while (budget > 0 && p.k < p.path.length) {
    const next = p.path[p.k], nx = next % a.w + 0.5, ny = ((next / a.w) | 0) + 0.5;
    const d = Math.hypot(nx - p.x, ny - p.y), v = cellSpeed(a, p, next);
    if (v <= 0) return false;
    const can = v * budget;
    if (can >= d) { p.x = nx; p.y = ny; p.i = next; p.k++; budget -= d / v; }
    else { p.x += (nx - p.x) / d * can; p.y += (ny - p.y) / d * can; budget = 0; }
  }
  if (p.k >= p.path.length) { p.i = p.goal; return true; }
  return false;
}

export const partyGone = (a, p) => { p.state = 'gone'; };
// the party turns home; it disbands where it stands if it cannot find the way
export function goHome(a, p) {
  p.state = 'home';
  if (!aim(a, p, p.home)) p.state = 'gone';
}

// a season of all parties: SEASON_DAYS days each; the lines go to `say`
export function stepParties(a, rnd, say) {
  if (!a.parties || !a.parties.length) return;
  for (const p of a.parties) { p.px = p.x; p.py = p.y; }
  for (let day = 0; day < SEASON_DAYS; day++) {
    for (const p of a.parties) {
      if (p.state === 'gone') continue;
      const B = BEHAVIOURS[p.kind];
      if (p.state === 'go' || p.state === 'home') {
        p.days++;
        const there = walk(a, p);
        const tally = a.hist.parties ||= {sent: 0, arrived: 0, lost: 0};
        if (there) {
          if (p.state === 'home') { B.home?.(a, p, rnd, say); p.state = 'gone'; }
          else { tally.arrived++; B.arrive(a, p, rnd, say); }
        } else if (p.days > PARTIES.giveUp) {
          if (p.state === 'home') p.state = 'gone'; else { tally.lost++; B.lost?.(a, p, rnd, say); goHome(a, p); }
        }
      } else if (p.state === 'stay') { p.stay++; B.stay?.(a, p, rnd, say); }
    }
  }
  a.parties = a.parties.filter(p => p.state !== 'gone');
}

// the party nearest a cell within a cell's reach, for the readout
export function partyAt(a, i) {
  if (!a.parties) return null;
  const x = i % a.w + 0.5, y = ((i / a.w) | 0) + 0.5;
  let best = null, bd = 1.2;
  for (const p of a.parties) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
  return best;
}
