// Captives (docs/CAPTIVES.md): what binds them, how they are taken, what a captive may and may not do.
//
// Bonds. A captive is bound with the best bonds in the stock: shackles of iron, of bronze, else rope.
//   resource — what is taken from the stock; n — how many units bind one captive
//   hold     — × the chance to escape (stage 2): the better the bonds, the lower
//   back     — the bonds come back to the stock when the captive is freed or dies (shackles yes, rope no)
//   slow     — × the pace of a captive running away in them (stage 2); a tool kept for the night cuts them: no slow
// Bonds have no quality steps (+1…+3): they hold by their material alone.
// A new kind of bonds is one row here and a resource (data/resources.js) with a price (data/balance/prices.js).
import {Registry} from '../core/registry.js';

export const BONDS = new Registry('bonds');

BONDS.registerAll([
  {id: 'mithril', label: 'мифриловые кандалы', short: 'мифр. кандалы', resource: 'shacklesMithril', n: 1, hold: 0.15, back: true, slow: 0.6},
  {id: 'steel',  label: 'стальные кандалы', short: 'стал. кандалы', resource: 'shacklesSteel', n: 1, hold: 0.3, back: true, slow: 0.6},
  {id: 'iron',   label: 'железные кандалы', short: 'жел. кандалы', resource: 'shacklesIron', n: 1, hold: 0.4, back: true, slow: 0.65},
  {id: 'bronze', label: 'бронзовые кандалы', short: 'бронз. кандалы', resource: 'shacklesBronze', n: 1, hold: 0.55, back: true, slow: 0.7},
  {id: 'rope',   label: 'верёвка', short: 'верёвка', resource: 'rope', n: 2, hold: 1, back: false, slow: 0.85},
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

// Stage 2 (docs/CAPTIVES.md): the will to run, the council's evening rolls, the plot and the informer, the
// night escape, the red alarm, the tool handed in for the night, the ration.
//   will — 0…1 on every captive (a.captive.will / m.captive.will); it starts at `start` and moves at dawn by `day`:
//     cut ration, hunger, wounds, kin seen in a raid push it up; the days in captivity, a full belly and health
//     bring it down. A recaptured runaway, the betrayed instigator — up by `caught`, `betrayed`.
//   escape — at the evening council (after it, in the campaign's evening): base × will × the bonds' hold ×
//     `watched` when the night watch is posted. Whoever wants it starts a plot: that night at `hour` every
//     captive not resigned runs.
//   resign — at the same council, base × (1 − will) × days/(days + `settle`): the resigned never run again.
//   inform — a plot made, each resigned captive: base + `opinion` × its liking of the free (−2…+4, clamped
//     at 0): told, the plot is off — the instigator's will up, the informer earns `service`.
//   red — during a red alarm, once a captive per alarm: base × will × hold, × `kin` if the raiders are its own
//     kind, × `tool` while it holds a tool: it runs at once.
//   catch — a runaway caught by a colonist close enough to grab it (`reach`); in the campaign: a night roll.
//   ration — the council cuts the captives' ration when food is short: less than `cutDays` days of food a head;
//     then they eat `eat` of their need (hunger slower), work `work` as fast, and the will grows by `day.cut`.
//   tools — from the council till dawn a captive in the camp hands its tool in to the store; outfit gives it back
//     after `dawn`. One still holding a tool runs unslowed by its bonds.
export const ESCAPE = {
  will: {start: 0.6,
    day: {cut: 0.06, hungry: 0.05, hurt: 0.03, kin: 0.12, time: -0.03, content: -0.02},
    caught: 0.15, betrayed: 0.2},
  escape: {base: 0.15, watched: 0.7},
  resign: {base: 0.08, settle: 6},
  inform: {base: 0.25, opinion: 0.1, service: 1},
  red: {base: 0.12, kin: 2.5, tool: 1.3},
  hour: 1,              // the plotters run at this hour of the night
  catch: {reach: 1.3, campaign: 0.45, guide: 0.1},
  ration: {cutDays: 3, eat: 0.65, work: 0.85},
  tools: {dawn: 6},
  lost: 1200,           // a runaway that has not reached the edge in this many ticks (a day) is lost in the wilds: gone
  runPace: 1.15,        // runs for the edge at this pace (× the bonds' `slow`)
};

// Stage 4 (docs/CAPTIVES.md): from captive to former slave to member.
//   free    — a resigned captive with at least this much service (a day as a master's learner ≈ 1.5, at the next
//             bench under its eye half that, a told plot 1) is
//             freed by the council, when the master who taught it last vouches: its liking of the captive at
//             least `vouch` (−2…+4). In the campaign: any master of the caravan vouches.
//   bond    — a former slave's tie to the colony (0…1), from `start`; at dawn: `day` more, `hungry` less when its
//             belly is empty, `hurt` less when badly wounded, `content` more when fed and healthy. At the council,
//             below `stay` it may leave: `leave` × (1 − bond)² (as a companion does in the campaign).
//   member  — a former slave who fought for the colony (answered a blow in a red alarm, or stood in a fight the
//             caravan won) is made a full member at the next council.
export const FREEDOM = {
  free: 2, vouch: 0,
  bond: {start: 0.6, day: 0.01, hungry: -0.04, hurt: -0.02, content: 0.005, stay: 0.5, leave: 0.25},
};
