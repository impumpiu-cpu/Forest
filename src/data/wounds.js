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
import {CONDITIONS} from './conditions.js';
import {isSentient} from './species.js';

export const CRIT = {mul: 1.5};

export const DEATHBLOW = {
  overkill: 1,              // more than full health below zero: no check
  hpLeft: 0.02,             // the fallen keep this share of health while they bleed
  stableHp: 0.2,            // a dressed wound leaves at least this share of health
  causes: ['ран'],          // which deaths luck may turn aside
  // a maim instead of death (Ver_E Э4, the author's call; campaign/maims.js): a member of a caravan whose deadly wound would
  // kill it falls maimed instead — senseless but not bleeding, a dressing wakes it — `max` times; with `max` maims borne the
  // next deadly wound kills without a check. `on` — the switch (for the paired runs)
  maim: {on: true, max: 3},
};

// who may fall instead of dying: a thinking creature of the colony, or a thinking raider — one that may be
// bound and taken after the fight (settlement/captives.js). Beasts die as before; the undead and things
// without a body to bleed never fall
export const CAN_FALL = (sp, a) => isSentient(sp) && !sp.undead && (a.faction === 'colony' || a.faction === 'raiders');

// a chance on Luck by one of the luck curves: 'crit', 'survive', 'clean' (data/curves.js)
export const luckChance = (id, L) => curve(id, L);

// Wounds kept on agent.wounds as [{id, until?}]: `until` (a tick) for one that heals, none for a trauma.
//   mods: multipliers for agent.mods (adds for aim, dodge, bravery, as everywhere); hp: × full health
//   trauma: true — incurable, drawn when the second luck check fails (weight: how often)
// The rows are the wounds and traumas of data/conditions.js (the table «Состояния»), the same objects.
export const WOUNDS = new Registry('wound');
WOUNDS.registerAll(CONDITIONS.filter(c => c.kind === 'wound' || c.kind === 'trauma' || c.kind === 'maim'));
// the maim a deadly blow leaves by the trauma of its place, made worse (a fear of death has no place: the body's, by the blow)
export const MAIM_OF = {limp: 'shatteredLeg', maimedHand: 'lostArm', chest: 'crushedChest', eye: 'blindEye'};

export const GRAVE_TICKS = id => WOUNDS.get(id).days * DAY;
export const bleedTicks = E => Math.round(curve('bleed', E) * HOUR);
