// How the peoples see each other: the memory of old wars and old friendships, −3 … +3.
// The table is not symmetric: an elf tolerates a human (0), a dwarf likes one (+1).
// Rows and columns are race lines (`rel` in data/races.js): the greenskins — orcs, goblins, ogres,
// trolls — share one line. Undead and other monsters are not here: nobody makes peace with them.
//
// One creature's opinion of another (opinion() below) has two parts. The starting attitude, which does
// not change: the old memory of the peoples, shared values (+), clashing values (−), a gulf in mercy or
// order (−), the other's charisma. And the personal history, which does: what has happened between the
// two of them (agent.grudge[id], ± grudgeCap) — quarrels (settlement/relations.js), and escorts, a
// wound dressed, work and fights shared (settlement/together.js).
import {Registry} from '../core/registry.js';
import {VALUES} from './values.js';
import {SPECIES} from './species.js';
import {EFFECTS} from './special.js';

export const KINS = new Registry('kin');
KINS.registerAll([
  {id: 'human', label: 'люди'}, {id: 'halfling', label: 'полурослики'}, {id: 'giant', label: 'великаны'},
  {id: 'elf', label: 'лесные эльфы'}, {id: 'darkelf', label: 'тёмные эльфы'}, {id: 'dwarf', label: 'гномы'},
  {id: 'greenskin', label: 'зеленокожие'}, {id: 'gnoll', label: 'гноллы'},
]);

// from (row) → to (column)
const COLS = ['human', 'halfling', 'giant', 'elf', 'darkelf', 'dwarf', 'greenskin', 'gnoll'];
const ROWS = {
  human:     [+1, +1,  0,  0, -2, +1, -1, -3],
  halfling:  [+1, +2,  0, +1, -2,  0, -2, -3],
  giant:     [ 0, +1, +2,  0, -1, -1,  0, -2],
  elf:       [ 0, +1,  0, +2, -3, -2, -2, -3],
  darkelf:   [-1, -2, -1, -3, +1, -1,  0, -1],
  dwarf:     [+1,  0, -1, -2, -2, +2, -3, -2],
  greenskin: [-1, -1, +1, -2,  0, -3, +1,  0],
  gnoll:     [-2, -2, -1, -2,  0, -2, +1,  0],
};

export const RELATIONS = Object.fromEntries(Object.entries(ROWS).map(([r, row]) => [r, Object.fromEntries(COLS.map((c, k) => [c, row[k]]))]));

// the old memory between two races (0 when one of them has no line in the table)
export const kinship = (fromSpecies, toSpecies) => {
  const a = SPECIES.get(fromSpecies).rel, b = SPECIES.get(toSpecies).rel;
  return a && b ? RELATIONS[a][b] : 0;
};

export const OPINION = {
  shared: 0.5,       // per value both hold dear
  clash: 0.75,       // per pair of values that clash
  mercyGap: 3,       // this far apart on mercy → −1
  orderGap: 4,       // this far apart on order → −0.5
  grudgeCap: 4,      // personal history (good or bad) counts at most this much either way
};

// what `a` thinks of `b`, about −6 … +6; ≤ −2 is dislike, ≤ −3.5 hatred, ≥ 2 friendship
export function opinion(a, b) {
  let v = kinship(a.species, b.species);
  const va = a.values || [], vb = b.values || [];
  for (const x of va) {
    if (vb.includes(x)) v += OPINION.shared;
    for (const y of vb) if (VALUES.get(x).clash.includes(y)) v -= OPINION.clash;
  }
  if (a.align && b.align) {
    if (Math.abs(a.align.mercy - b.align.mercy) >= OPINION.mercyGap) v -= 1;
    if (Math.abs(a.align.order - b.align.order) >= OPINION.orderGap) v -= 0.5;
  }
  if (b.special) v += EFFECTS.charm(b.special);
  const g = a.grudge?.[b.id] || 0;
  return v + Math.max(-OPINION.grudgeCap, Math.min(OPINION.grudgeCap, g));
}

export function opinionWord(v) {
  if (v >= 3) return 'дружит';
  if (v >= 1.5) return 'ладит';
  if (v > -1.5) return 'терпит';
  if (v > -3.5) return 'недолюбливает';
  return 'ненавидит';
}
