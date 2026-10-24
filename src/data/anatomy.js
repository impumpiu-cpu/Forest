// Where a blow lands (docs/NRI.md, этап 3), as the hit locations of Fallout 2d20: every creature has a plan of its
// body, every plan its places with a weight (how often a blow lands there), × the damage there, and the traumas a
// deadly wound there may leave (data/wounds.js, `trauma: true`). Each blow or shot that lands draws its place from
// its own random stream (core/rng.js `hits`), so the place changes nothing else of the fight. The place of the last
// blow is kept on the creature (`hitAt`): when a fallen one fails the second luck check, its trauma is drawn from the
// traumas of that place. With every × at 1 a fight goes as it did before places were drawn.
//
// A species' plan: its own `plan`, else winged for those of WINGED, humanoid for the races, the undead, the spirits,
// the demons and anyone who carries gear, beast for the rest.
import {Registry} from '../core/registry.js';

export const BODY_PLANS = {humanoid: 'двуногий', beast: 'зверь', winged: 'крылатый'};
export const WINGED = ['griffin', 'wyvern', 'dragon', 'drake', 'bat'];

export const HIT_LOCATIONS = new Registry('hitLocation');

const L = (plan, id, label, weight, traumas, note) => ({id: `${plan}.${id}`, plan, label, weight, dmg: 1, traumas, note});
HIT_LOCATIONS.registerAll([
  L('humanoid', 'head', 'голова', 2, ['eye', 'dread'], 'в Fallout 2d20 — 1–2 из 20'),
  L('humanoid', 'torso', 'туловище', 6, ['chest'], '3–8'),
  L('humanoid', 'arms', 'руки', 6, ['maimedHand'], '9–14'),
  L('humanoid', 'legs', 'ноги', 6, ['limp'], '15–20'),
  L('beast', 'head', 'голова', 2, ['eye', 'dread']),
  L('beast', 'body', 'туловище', 8, ['chest']),
  L('beast', 'forelegs', 'передние лапы', 5, ['limp']),
  L('beast', 'hindlegs', 'задние лапы', 5, ['limp']),
  L('winged', 'head', 'голова', 2, ['eye', 'dread']),
  L('winged', 'body', 'туловище', 7, ['chest']),
  L('winged', 'wings', 'крылья', 6, ['limp']),
  L('winged', 'legs', 'лапы', 5, ['limp']),
]);

const HUMANOID_KINDS = new Set(['race', 'undead', 'spirit', 'fiend']);
export const planOf = sp => sp.plan ?? (WINGED.includes(sp.id) ? 'winged' : HUMANOID_KINDS.has(sp.kind) || sp.inventory ? 'humanoid' : 'beast');
export const placesOf = plan => HIT_LOCATIONS.filter(l => l.plan === plan);

// a place drawn for a blow that landed: [place, …] by weight with one number of `rnd`
// (the places of a plan kept per plan: the rows are fixed, their weights are read as they are now)
const byPlan = new Map();
const placesKept = plan => byPlan.get(plan) || (byPlan.set(plan, placesOf(plan)), byPlan.get(plan));
export function drawPlace(sp, rnd) {
  const list = placesKept(planOf(sp));
  let total = 0; for (const l of list) total += l.weight;
  let x = rnd() * total;
  for (const l of list) { x -= l.weight; if (x < 0) return l; }
  return list[list.length - 1];
}
// what an average blow does to this body (× the damage, weighted by the places): 1 while every place is at 1
export function meanPlaceDamage(sp) {
  const list = placesOf(planOf(sp)), total = list.reduce((s, l) => s + l.weight, 0);
  return list.reduce((s, l) => s + l.weight * l.dmg, 0) / total;
}
