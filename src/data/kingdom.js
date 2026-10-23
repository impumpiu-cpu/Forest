// The realm as a kingdom (docs/NRI.md, этап 7), after Kingmaker in Pathfinder 2: four attributes — culture, economy,
// loyalty, stability — and four kinds of ruin — corruption, crime, decay, strife; buildings that cost upkeep, edicts,
// the court's offices with named holders, and the events of a year. atlas/kingdom.js runs it once a year, in spring,
// on a random stream of its own, so the rest of the history draws as before.
//
// How an attribute is made (REALM_STATS): the realm's towns' effects (data/townBuildings.js fx: lore, faith, prestige,
// prod, trade, food, defence, health), the average over its towns, each × `from[key]`; plus `compass` × the realm's
// world view (data/values.js, ±5); plus what its edicts, offices and the year's events add; minus `ruin` × each point
// of the ruin that eats it. What an attribute does back to the world is FEEDBACK — 0 for now: the kingdom is counted,
// told and shown, and changes the history only when a number there is set.
import {Registry} from '../core/registry.js';

export const REALM_STATS = new Registry('realmStat');
REALM_STATS.registerAll([
  {id: 'culture', label: 'культура', from: {lore: 1, faith: 0.5, prestige: 1}, compass: {}, note: 'знание, вера, слава: чем держава гордится'},
  {id: 'economy', label: 'экономика', from: {prod: 1, trade: 1, food: 0.5}, compass: {}, note: 'ремесло, торговля, хлеб'},
  {id: 'loyalty', label: 'лояльность', from: {faith: 1, prestige: 0.5}, compass: {mercy: 0.05}, note: 'вера и слава; добрая держава милее подданным'},
  {id: 'stability', label: 'стабильность', from: {defence: 1, health: 0.5}, compass: {order: 0.05}, note: 'оборона и здоровье; закон держит порядок'},
]);

// Ruin grows by its sources every year and falls by the attribute that holds it back (× `fall`); never below 0.
//   towns — per town of the realm;  pop — per 1000 people;  upkeep — per point of upkeep over the economy;
//   wars — per war the realm is in;  raided — per town of it raided this year
// `eats` — the attribute each point of this ruin takes off (× `penalty`)
export const RUINS = new Registry('ruin');
RUINS.registerAll([
  {id: 'corruption', label: 'коррупция', grows: {towns: 0.03}, fall: 'culture', eats: 'economy', note: 'чем больше держава, тем больше рук, что берут'},
  {id: 'crime', label: 'преступность', grows: {pop: 0.02}, fall: 'stability', eats: 'loyalty', note: 'людные города, слабая стража'},
  {id: 'decay', label: 'упадок', grows: {upkeep: 0.5}, fall: 'economy', eats: 'stability', note: 'содержание построек сверх того, что даёт экономика'},
  {id: 'strife', label: 'раздоры', grows: {wars: 0.3, raided: 0.15}, fall: 'loyalty', eats: 'culture', note: 'войны и набеги ссорят знать'},
]);
export const RUIN_RULES = {fall: 0.1, penalty: 0.05, max: 20};

// Upkeep (consumption): what a building of each category costs the realm a year, in points of economy (the average
// over the realm's towns, as the attributes)
export const UPKEEP = {housing: 0.01, food: 0, raw: 0.01, craft: 0.02, trade: 0.02, defence: 0.04, faith: 0.02, lore: 0.03, power: 0.05, life: 0.02};

// Edicts: what a realm decrees this year. Each has levels; a realm takes the first level whose `when` holds (or the
// last). `adds` — to the attributes; `ruin` — to the ruin a year.
//   when: {war: true} — at war;  {below: {stat: v}} — an attribute under v;  {above: {stat: v}} — over v
export const EDICTS = new Registry('edict');
EDICTS.registerAll([
  {id: 'taxes', label: 'подати', levels: [
    {id: 'high', label: 'тяжёлые', when: {war: true}, adds: {economy: 0.15, loyalty: -0.1}},
    {id: 'light', label: 'лёгкие', when: {below: {loyalty: 0.2}}, adds: {economy: -0.1, loyalty: 0.1}},
    {id: 'usual', label: 'обычные', adds: {}},
  ]},
  {id: 'feasts', label: 'праздники', levels: [
    {id: 'many', label: 'щедрые', when: {above: {economy: 0.8}}, adds: {culture: 0.1, loyalty: 0.05, economy: -0.05}},
    {id: 'few', label: 'скромные', adds: {}},
  ]},
  {id: 'levy', label: 'набор войска', levels: [
    {id: 'full', label: 'поголовный', when: {war: true}, adds: {stability: -0.05}, ruin: {strife: 0.1}},
    {id: 'none', label: 'обычный', adds: {}},
  ]},
]);

// The court: offices a realm fills with named holders (names: data/names.js, of the realm's race). A filled office
// adds to its attribute; an empty one takes off `vacant`. A holder serves `years` (from–to), then the office is filled
// again the next spring.
export const OFFICES = new Registry('office');
OFFICES.registerAll([
  {id: 'ruler', label: 'правитель', adds: {stability: 0.1, loyalty: 0.05}, vacant: {stability: -0.2}, years: [15, 40]},
  {id: 'general', label: 'полководец', adds: {stability: 0.05}, vacant: {stability: -0.05}, years: [8, 25]},
  {id: 'treasurer', label: 'казначей', adds: {economy: 0.1}, vacant: {economy: -0.1}, years: [8, 25]},
  {id: 'priest', label: 'первосвященник', adds: {culture: 0.05, loyalty: 0.05}, vacant: {loyalty: -0.05}, years: [10, 30]},
]);
export const COURT = {fill: 0.7};   // the chance a spring fills an empty office

// The events of a realm's year: a random table (data/chance.js format, mode `one` by weight) drawn with `chance` a year.
// `when` — as for edicts; `adds` — to the attributes for that year; `ruin` — to the ruin; `text` — the chronicle line
// ({realm} — the realm's name).
export const REALM_EVENTS = new Registry('realmEvent');
REALM_EVENTS.registerAll([
  {id: 'harvest', weight: 3, adds: {economy: 0.1, loyalty: 0.05}, text: 'У {realm} обильный урожай: амбары полны.'},
  {id: 'feast', weight: 2, when: {above: {culture: 0.3}}, adds: {culture: 0.1}, text: '{realm} справили великий праздник.'},
  {id: 'scandal', weight: 2, when: {above: {corruption: 1}}, ruin: {corruption: 0.5}, adds: {loyalty: -0.05}, text: 'При дворе {realm} раскрылось казнокрадство.'},
  {id: 'bandits', weight: 2, when: {below: {stability: 0.3}}, ruin: {crime: 0.5}, text: 'На дорогах {realm} развелись разбойники.'},
  {id: 'unrest', weight: 1, when: {below: {loyalty: 0.1}}, ruin: {strife: 0.5}, adds: {stability: -0.1}, text: 'В городах {realm} неспокойно: подданные ропщут.'},
  {id: 'flood', weight: 1, ruin: {decay: 0.5}, text: 'Половодье разорило земли {realm}.'},
  {id: 'boom', weight: 1, when: {above: {economy: 0.6}}, adds: {economy: 0.1}, text: 'Торговля {realm} цветёт: купцы богатеют.'},
]);
export const EVENTS_RULE = {chance: 0.35};

// What the kingdom does back to the world (0 — nothing yet). schismByStrife: a contender's chance to break away
// × (1 + value × strife); schismByLoyalty: × (1 + value × (1 − loyalty)) while loyalty is under 1
export const FEEDBACK = {schismByStrife: 0, schismByLoyalty: 0};

// The market of a town by its step (campaign/town.js), as the base value and purchase limit of a Pathfinder settlement:
// `maxPrice` — the dearest thing it sells, `purse` — the gold it pays for the caravan's goods in one visit. Empty — no
// limit (as before).
export const MARKET_TIERS = new Registry('marketTier');
MARKET_TIERS.registerAll([
  {id: 'tier0', tier: 0, label: 'хутор', maxPrice: null, purse: null},
  {id: 'tier1', tier: 1, label: 'село', maxPrice: null, purse: null},
  {id: 'tier2', tier: 2, label: 'город', maxPrice: null, purse: null},
  {id: 'capital', tier: 3, label: 'столица', maxPrice: null, purse: null},
]);
export const marketTierOf = t => MARKET_TIERS.get(t.capital ? 'capital' : `tier${Math.min(2, t.tier ?? 0)}`);

// What is wrong with a condition ({war}, {below: {k: v}}, {above: {k: v}}) → [error]; k — an attribute or a ruin
export function whenErrors(when) {
  if (when == null) return [];
  if (typeof when !== 'object' || Array.isArray(when)) return ['условие — не набор'];
  const errs = [];
  for (const [k, v] of Object.entries(when)) {
    if (k === 'war') { if (typeof v !== 'boolean') errs.push('war — да или нет'); continue; }
    if (k !== 'below' && k !== 'above') { errs.push(`в условии нет «${k}» (war, below, above)`); continue; }
    for (const [s, x] of Object.entries(v || {})) {
      if (!REALM_STATS.has(s) && !RUINS.has(s)) errs.push(`${k}.${s}: нет такого показателя или разрухи`);
      if (typeof x !== 'number' || !Number.isFinite(x)) errs.push(`${k}.${s}: не число`);
    }
  }
  return errs;
}
// the levels of an edict: [{id, label, when?, adds?, ruin?}], the last without a condition
export function levelsErrors(levels) {
  if (!Array.isArray(levels) || !levels.length) return ['уровни — непустой список'];
  const errs = [];
  for (const L of levels) {
    if (!L || typeof L.id !== 'string' || typeof L.label !== 'string') { errs.push('у уровня нужны id и label'); continue; }
    errs.push(...whenErrors(L.when).map(e => `${L.id}: ${e}`));
    for (const k of Object.keys(L.adds || {})) if (!REALM_STATS.has(k)) errs.push(`${L.id}: adds.${k} — нет такого показателя`);
    for (const k of Object.keys(L.ruin || {})) if (!RUINS.has(k)) errs.push(`${L.id}: ruin.${k} — нет такой разрухи`);
  }
  if (levels[levels.length - 1].when) errs.push('у последнего уровня не должно быть условия: он — по умолчанию');
  return errs;
}
