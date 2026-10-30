// Constructs: the dwarves' golems (docs/WORLD.md «Асимметрия народов», дварфы). No magic moves them: a golem is a
// machine of metal plates on a frame, wound and fed with coals by the smiths of a golem forge (data/townBuildings.js
// golemforge) — the forge-masters know how its springs and bellows are set. It is made of the best metal the realm works
// (data/townBuildings.js GOLEMS.tiers): the better the metal, the harder it is and the more it can take.
// Tag «Механизм» (data/tags.js mechanism):
//   no needs and no morale — it does not run nor give up (mind 'mindless': no fear, no cunning)
//   immune — poison, bleeding, stunning, fear (agents/combat.js, agents/body.js)
//   no healing — neither a healer, nor a potion, nor its own body mends it: it is mended only at a forge (agents/golem.js
//   GOLEM_REPAIR: the colony's forge, the caravan in a town with a forge)
// Where it comes: the realm's armies (atlas/golems.js: its men in the might), a dwarven band (data/raids.js dwarves), the
// colony's golem forge (agents/golem.js) and a caravan that bought one in a dwarven town with a golem forge (data/transport.js)
// The numbers (hp, armour as `resist`, speed, the blow): data/balance/creatures.js, a row each.
import {bodyFor} from './balance/creatures.js';

export const GOLEM_METALS = ['bronze', 'iron', 'steel', 'mithril'];
// the species of a golem of a metal
export const golemOf = metal => `${metal}golem`;
export const isGolem = sp => !!sp?.mechanism;

const LOOK = {bronze: '#b8823e', iron: '#7c8288', steel: '#aab4bc', mithril: '#cfe3ee'};
const WORDS = {
  bronze: ['бронзовый голем', 'бронзового голема', 'бронзовые големы', 'бронза'],
  iron: ['железный голем', 'железного голема', 'железные големы', 'железо'],
  steel: ['стальной голем', 'стального голема', 'стальные големы', 'сталь'],
  mithril: ['мифриловый голем', 'мифрилового голема', 'мифриловые големы', 'мифрил'],
};
// a broken golem is scrap of its metal (the mithril one: the plates go back to the ore's price)
const SCRAP = {bronze: {bronze: 3}, iron: {iron: 3}, steel: {steel: 3}, mithril: {mithrilOre: 2}};

export const CONSTRUCTS = GOLEM_METALS.map(m => bodyFor({
  id: golemOf(m), kind: 'construct', mechanism: true, metal: m, mind: 'mindless', label: WORDS[m][0], labelAcc: WORDS[m][1], plural: WORDS[m][2],
  needs: [], heatHarm: 400, fearHeat: 900, big: true,
  look: {shape: 'golem', size: 1.0, color: LOOK[m]},
  yields: SCRAP[m],
  killMessage: name => `Голем раздавил: <b>${name}</b>.`,
}));

// A golem on its side's guard (agents/behaviours/golem.js): it sees a foe this far (`sight`) and answers one that falls on
// its own this far (`help`); back at its post when further than `off`; the weights of its two wishes
export const GOLEM_GUARD = {sight: 12, help: 8, off: 1.5, want: {fight: 3, post: 1}};
// mended only at a forge (agents/golem.js): within `reach` cells of one of `at` (data/buildings.js), `rate` × full health a
// tick; the caravan's golems — a share `day` of full health a day in a town with a forge or by the camp's own forge
export const GOLEM_REPAIR = {at: ['forge', 'magmaforge', 'golemforge'], reach: 4, rate: 0.0006, day: 0.25};
// The golem forge of a dwarven colony (data/buildings.js golemforge, settlement/golems.js): at the start of each season it
// makes one golem, of the best metal in the stock (`metals` in order, best first: `cost` of it), while there are fewer
// golems than 1 + one per `per` of the colony's people
export const GOLEM_LOCAL = {metals: ['steel', 'iron', 'bronze'], cost: 10, coal: 5, per: 6};
