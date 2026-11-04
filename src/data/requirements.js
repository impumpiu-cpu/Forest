// Requirements (docs/WORLD.md «Требования построек и рецептов»): one way to say what a building, a recipe or a deed asks of
// the place it is in — and one checker for the council that chooses, the builders that build, the works that run and the
// cards that explain (core/requirements.js). A FACT is something the world can tell about a town: its people, the uklad of
// its realm, the share of a race among its people, a building that stands, the land it stands on. A
// CONDITION compares a fact with a value: {fact, arg?, op, value, scope?}. A requirement is a condition or a group of them:
// {all: [...]} — every one, {any: [...]} — any one. The facts are not kept in a table: they are read from the town when the
// check is made (atlas/requirements.js townFacts). Thresholds live in the requirement, never in the fact: there is one share
// of gnolls, and «gnolls ≤ 5 %» is a condition of whoever asks.
//
//   FACTS: id, label, type (bool · num · enum), arg (what the fact is about: a race, a building, a place need), scope — where
//          it is read: 'town' (the town itself), 'realm' (any town of the realm), or either
//   OPS:   = · != · > · >= · < · <= · in (the value a list) · not-in
//
// The old fields of the buildings' rows (data/townBuildings.js `peoples`, `requires`, `requiresAny`, `here`, `tier`,
// `pop`, `capital`, `needs`, `needsAny`, a recipe's `req`) are read as requirements by needsOf (below): the rows keep their
// short form, the checker sees one shape. A row may also carry `need` — a requirement written out for its building — and
// `workNeed` — for its running; a recipe's `need` is for its running.
import {Registry} from '../core/registry.js';

export const FACTS = new Registry('fact');
FACTS.registerAll([
  {id: 'people', label: 'народ', type: 'enum', note: 'народ города (data/peoples.js)'},
  {id: 'polity', label: 'уклад', type: 'enum', note: 'уклад державы города (data/polities.js); город без державы — уклад его народа'},
  {id: 'kinShare', label: 'доля расы', type: 'num', arg: 'race', note: 'доля расы среди жителей города, 0…1 (atlas/population.js); в пустом городе доли нет — сравнение не выполняется'},
  {id: 'kinCount', label: 'число расы', type: 'num', arg: 'race', note: 'сколько жителей этой расы в городе'},
  {id: 'kinHands', label: 'руки расы', type: 'num', arg: 'race', note: 'взрослые этой расы в городе × hands народа'},
  {id: 'built', label: 'постройка', type: 'bool', arg: 'building', scope: 'either', note: 'стоит ли постройка (или тир её линии): в городе (scope town) или в любом городе державы (realm)'},
  {id: 'exact', label: 'постройка (именно эта)', type: 'bool', arg: 'building', note: 'стоит ли именно эта запись, не тир её линии — ярус пристани просит свою пристань'},
  {id: 'place', label: 'место', type: 'bool', arg: 'need', note: 'стоит ли город на таком месте (data/townBuildings.js PLACE_NEEDS); народ читает место по-своему (data/peoples.js places)'},
  {id: 'pop', label: 'жителей', type: 'num'},
  {id: 'tier', label: 'ступень', type: 'num', note: 'ступень города: 0, 1, 2 (data/peoples.js TIERS)'},
  {id: 'capital', label: 'столица', type: 'bool'},
  {id: 'ruler', label: 'правитель жив', type: 'bool', note: 'есть ли у державы города живой правитель (atlas/persons.js)'},
]);

// what an `arg` of a fact must be — a known id of its kind — and what an enum fact's value may be (core/requirements.js reqErrors):
// a race of the species, a building of the catalogue, a place need; a people, an uklad. A typo is an error of data, never a
// share of zero
import {SPECIES} from './species.js';
import {TOWN_BUILDINGS, PLACE_NEEDS} from './townBuildings.js';
import {WORLD_PEOPLES} from './peoples.js';
import {POLITIES} from './polities.js';
export const ARG_KNOWN = {
  race: id => SPECIES.has(id), building: id => TOWN_BUILDINGS.has(id), need: id => id in PLACE_NEEDS,
};
export const VALUE_KNOWN = {people: v => WORLD_PEOPLES.has(v), polity: v => POLITIES.has(v)};

export const OPS = {'=': 'равно', '!=': 'не', '>': 'больше', '>=': 'не меньше', '<': 'меньше', '<=': 'не больше', in: 'одно из', 'not-in': 'ни одно из'};

// a condition in short: C('kinShare', 'gnoll', '<=', 0.05), C('polity', '=', 'humans')
export const C = (fact, ...rest) => { const F = FACTS.get(fact); const [arg, op, value, scope] = F.arg ? rest : [null, ...rest]; return {fact, ...(arg != null ? {arg} : {}), op, value, ...(scope ? {scope} : {})}; };
export const ALL = (...list) => ({all: list.flat()});
export const ANY = (...list) => ({any: list.flat()});

// ── the old short fields of a building's row as a requirement (data/townBuildings.js): what canBuild always asked
import {KIN} from './peoples.js';
import {onEdit} from './schema/layer.js';
// The council asks every building of the catalogue for every town each season (atlas/towns.js chooseBuilding): the trees are
// made once per row and kept while the fields they are made of stay the same objects. A table edit clears them all
// (data/schema/layer.js onEdit); a check that writes a field by hand gives the row a new value, and the kept tree is not
// the row's any more — it is made again (`of`: what the tree was made of, compared by identity; KIN.least with them).
let kept = new WeakMap();
onEdit(() => { kept = new WeakMap(); });
const keptOf = (x, slot, of, make) => {
  let e = kept.get(x); if (!e) kept.set(x, e = {});
  const k = e[slot];
  of.push(KIN.least);
  if (k && k.of.length === of.length && of.every((v, i) => k.of[i] === v)) return k.v;
  const v = make(x); e[slot] = {v, of};
  return v;
};
export const needsOf = b => keptOf(b, 'needs', [b.peoples, b.requires, b.requiresAny, b.here, b.capital, b.pop, b.needs, b.needsAny, b.need, b.id], makeNeeds);
function makeNeeds(b) {
  const out = [];
  if (b.peoples) out.push(C('people', 'in', b.peoples));
  if (b.requires) out.push(...b.requires.map(id => C('built', id, '=', true, 'realm')));
  if (b.requiresAny) out.push(ANY(b.requiresAny.map(id => C('built', id, '=', true, 'realm'))));
  // in the town itself: a harbour — its own pier; an annex — its host; a tier — what it is built in place of, or a unit of itself
  if (b.here) out.push(ANY(b.here.map(id => (id === b.id ? C('exact', id, '=', true) : C('built', id, '=', true, 'town')))));
  if (b.capital) out.push(C('capital', '=', true));
  if (b.pop) out.push(C('pop', '>=', b.pop));
  if (b.needs) out.push(...b.needs.map(n => C('place', n, '=', true)));
  if (b.needsAny) out.push(ANY(b.needsAny.map(n => C('place', n, '=', true))));
  if (b.need) out.push(b.need);
  return out.length ? ALL(out) : null;
}
// the step a building asks for, by the town's people (`tierBy`: a step of its own for a people — the dwarves' stone walls)
export const tierNeed = (b, people) => { const v = b.tierBy?.[people] ?? b.tier ?? 0; return TIER_NEED[v] || C('tier', '>=', v); };
const TIER_NEED = [0, 1, 2].map(v => Object.freeze({fact: 'tier', op: '>=', value: v}));   // (the three steps: one condition each, shared)
// the lights of a town as a source of facts (atlas/economy.js townLights: `people:x`, `kin:x`): for a check with nothing but
// the lights at hand
export const litFacts = lit => ({get(fact, arg) {
  if (fact === 'kinShare') return lit.has(`kin:${arg}`) ? KIN.least : 0;
  if (fact === 'people') { for (const x of lit) if (x.startsWith('people:')) return x.slice(7); return undefined; }
  return undefined;
}});
// the stages are apart (docs/WORLD.md «Требования»): what a building asks to be BUILT is `need` (with its short fields, needsOf);
// what it asks to WORK is `req` and `workNeed` — a threshold of the building's rise is never copied into its running. A recipe
// only runs: its `req` and its `need` are its work
export const workNeeds = (x, recipe = false) => keptOf(x, recipe ? 'work1' : 'work0', [x.req, recipe ? x.need : x.workNeed], y => { const r = reqNeeds(y.req), w = recipe ? y.need : y.workNeed; return w ? ALL([r, w].filter(Boolean)) : r; });
// a recipe's `req` as a requirement: 'kin:x' — the race's share, 'people:x' — the people; 'a|b' — either
export const reqNeeds = req => (req?.length ? keptOf(req, 'req', [...req], makeReq) : null);
function makeReq(req) {
  const one = x => {
    const [k, v] = x.split(':');
    if (k === 'kin') return C('kinShare', v, '>=', KIN.least);
    if (k === 'people') return C('people', '=', v);
    throw new Error(`требование рецепта «${x}»: только people:<народ> или kin:<раса>`);
  };
  return ALL(req.map(r => { const alts = r.split('|'); return alts.length > 1 ? ANY(alts.map(one)) : one(r); }));
}
