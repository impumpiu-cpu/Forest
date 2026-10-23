// Luck in a fight, and what a deadly wound leaves behind.
//
// Critical blows. Every blow or shot that lands (not dodged, not blocked) gets one check against the
// attacker's Luck: the curve 'crit' (data/curves.js, table «Кривые»). A critical blow does `mul`
// times the damage; it never turns a miss into a hit and does not go through armour. L 5 → 8%, L 10 → 11%.
//
// The deadly wound. When a blow (cause 'ран') would kill a creature that can be saved (CAN_FALL), there
// is one check against its Luck, once for this wound and never again until it is over:
//   survive: the curve 'survive' — L 1 → 9%, 5 → 20%, 10 → 27%.
//            Failed — death. A blow far past what the body holds (more than `overkill` × full health
//            below zero) gives no check at all: luck saves from «almost», not from a dragon's jaws.
//   down:    survived — the creature lies senseless (agent.downed) and bleeds; it lives for
//            the curve 'bleed' (hours by E) unless someone dresses the wound (settlement/together.js
//            aid). Foes leave the fallen alone; nothing that hits it again is luck's business: it dies.
//   clean:   at the same moment a second check decides what the wound leaves: the curve 'clean'. Passed — a grave wound that heals in `grave.days` days. Failed — on top of it an
//            incurable trauma (a limp, a maimed hand, …) that stays for life. Both work through the body's
//            sources (agents/special.js refreshBody), so they show in every number the game reads.
// Only wounds from blows are luck's to save: venom, hunger, cold and fire kill as before.
import {Registry} from '../core/registry.js';
import {HOUR, DAY} from '../core/time.js';
import {curve} from './curves.js';

export const CRIT = {mul: 1.5};

export const DEATHBLOW = {
  overkill: 1,              // more than full health below zero: no check
  hpLeft: 0.02,             // the fallen keep this share of health while they bleed
  stableHp: 0.2,            // a dressed wound leaves at least this share of health
  causes: ['ран'],          // which deaths luck may turn aside
};

// who may fall instead of dying: a thinking creature of the colony, or a thinking raider — one that may be
// bound and taken after the fight (settlement/captives.js). Beasts die as before; the undead and things
// without a body to bleed never fall
export const CAN_FALL = (sp, a) => !!sp.sentient && !sp.undead && (a.faction === 'colony' || a.faction === 'raiders');

// a chance on Luck by one of the luck curves: 'crit', 'survive', 'clean' (data/curves.js)
export const luckChance = (id, L) => curve(id, L);

// Wounds kept on agent.wounds as [{id, until?}]: `until` (a tick) for one that heals, none for a trauma.
//   mods: multipliers for agent.mods (adds for aim, dodge, bravery, as everywhere); hp: × full health
//   trauma: true — incurable, drawn when the second luck check fails (weight: how often)
export const WOUNDS = new Registry('wound');

WOUNDS.registerAll([
  {id: 'grave', label: 'тяжёлая рана', note: 'заживает', days: 4, mods: {speed: 0.85, work: 0.75}},
  {id: 'limp', label: 'хромота', note: 'на всю жизнь', trauma: true, weight: 3, mods: {speed: 0.85}},
  {id: 'maimedHand', label: 'покалеченная рука', note: 'на всю жизнь', trauma: true, weight: 3, mods: {work: 0.85, str: 0.85, fin: 0.85}},
  {id: 'chest', label: 'пробитая грудь', note: 'на всю жизнь', trauma: true, weight: 2, hp: 0.85, mods: {cold: 1.15}},
  {id: 'eye', label: 'выбитый глаз', note: 'на всю жизнь', trauma: true, weight: 2, mods: {sight: 0.8, aim: -0.08}},
  {id: 'dread', label: 'страх смерти', note: 'на всю жизнь', trauma: true, weight: 2, mods: {bravery: -0.3}},
]);

export const GRAVE_TICKS = id => WOUNDS.get(id).days * DAY;
export const bleedTicks = E => Math.round(curve('bleed', E) * HOUR);
