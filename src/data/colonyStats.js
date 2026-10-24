// The settlement's vital signs (docs/SETTLEMENT.md), as the food, water, beds, defence and happiness of a Fallout
// settlement: each a number worked out from the colony as it is now (settlement/stats.js) against its norm. They
// change nothing by themselves — the systems that read them are named in `reads`; the card shows them, and `low`
// says what a shortfall leads to.
//   food    — days of food in the stores (data/colony.js PLAN.ration a colonist a day); the council plans by it
//   beds    — sleeping places a colonist (data/mods.js add.beds): a sleeper in a bed rests faster
//   warmth  — warm places a colonist (add.bedWarmth): in a cold night a warm bed keeps the warmth up
//   defence — the colony's strength (КС of the fighters) over the next raid's (settlement/threat.js)
//   mood    — the mean mood (−1 … +1): a long low mood drives people away
//   room    — colonists over the places the camp holds (8 + add.popCap): past 1 newcomers do not stay
import {Registry} from '../core/registry.js';

export const SETTLEMENT_STATS = new Registry('settlementStat');
SETTLEMENT_STATS.registerAll([
  {id: 'food', label: 'еда, дней', norm: 6, above: true, reads: 'план дня (settlement/plan.js), совет', low: 'идут на охоту и сбор, а не на стройку; голод'},
  {id: 'beds', label: 'кровати на жителя', norm: 1, above: true, reads: 'сон (agents/tasks.js)', low: 'спят на земле: отдыхают медленнее'},
  {id: 'warmth', label: 'тёплые места на жителя', norm: 1, above: true, reads: 'тепло во сне (agents/tasks.js)', low: 'зимой мёрзнут во сне'},
  {id: 'defence', label: 'сила против набега', norm: 1.15, above: true, reads: 'бой; перевес 15% решает (README, КС)', low: 'следующий набег может взять верх'},
  {id: 'mood', label: 'настроение', norm: 0, above: true, reads: 'уход, ссоры (settlement/life.js, migration.js)', low: 'люди уходят'},
  {id: 'room', label: 'занято мест', norm: 1, above: false, reads: 'приход новых (settlement/migration.js)', low: 'новые не остаются'},
]);
