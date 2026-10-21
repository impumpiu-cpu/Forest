// Captives (docs/CAPTIVES.md): what binds them, how they are taken, what a captive may and may not do.
//
// Bonds. A captive is bound with the best bonds in the stock: shackles of iron, of bronze, else rope.
//   resource — what is taken from the stock; n — how many units bind one captive
//   hold     — × the chance to escape (stage 2): the better the bonds, the lower
//   back     — the bonds come back to the stock when the captive is freed or dies (shackles yes, rope no)
// A new kind of bonds is one row here and a resource (data/resources.js) with a price (data/balance/prices.js).
import {Registry} from '../core/registry.js';

export const BONDS = new Registry('bonds');

BONDS.registerAll([
  {id: 'iron',   label: 'железные кандалы', short: 'жел. кандалы', resource: 'shacklesIron', n: 1, hold: 0.4, back: true},
  {id: 'bronze', label: 'бронзовые кандалы', short: 'бронз. кандалы', resource: 'shacklesBronze', n: 1, hold: 0.55, back: true},
  {id: 'rope',   label: 'верёвка', short: 'верёвка', resource: 'rope', n: 2, hold: 1, back: false},
]);

// the best bonds the stock holds enough of for one more captive, or null
export const bestBonds = stock => BONDS.all().find(b => (stock[b.resource] || 0) >= b.n) || null;

export const CAPTIVE = {
  // who can be taken: a thinking creature that bleeds (not the undead, not a beast) — data/wounds.js CAN_FALL
  max: 4,                 // captives the colony (or the caravan) keeps at once
  bindTicks: 40,          // dressing the wound and tying the knots, on the spot
  bindWeight: 1.15,       // the pull of binding a fallen foe: above any work (≤ 1), below an alarm and the council
  bindFar: 30,            // how far a colonist goes to bind one
  calm: 8,                // no foe on its feet this close to the fallen: it is safe to bind
  bindHp: 0.5,            // too badly hurt to bind anyone
  // the captive's lot: work only inside the settlement zone; these runners stay inside it
  camp: ['craft', 'build', 'farm'],
  // what a captive may hold: a tool (an axe, a pick, a hammer) — no shield, no bow, no blade that is only a blade;
  // on the body: clothes, not armour (armour above this)
  armour: 0.12,
  // the campaign (campaign/captives.js): the caravan sets out with `startRope` of rope in the baggage. A fight
  // in the quick mode, won against those who fall and can be bound, takes one captive with `auto[kind]` (two with
  // `two`), of the races `races[kind]`; on the local map the caravan binds them itself
  campaign: {
    startRope: 8,
    auto: {bandits: 0.35, army: 0.3, tribe: 0.3, lair: 0.15},
    two: 0.3,
    races: {bandits: ['human'], army: ['human', 'orc', 'dwarf', 'elf'], tribe: ['goblin', 'gnoll', 'orc'], lair: ['goblin', 'ogre', 'troll']},
    gear: {hand: [], body: 'clothes'},
    // a town buys bonds while the caravan has fewer than `keep` captives' worth, and gold to spare
    keep: 3,
  },
};
