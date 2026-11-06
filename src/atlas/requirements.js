// The facts of a town for the requirements (data/requirements.js, core/requirements.js): what the world can tell about a
// town when a building, a recipe or a deed asks — read from the town and its realm at the moment of the check, never
// kept in a table. One source serves the council that chooses what to build (atlas/towns.js chooseBuilding), the check
// that it may (canBuild), the works that run their recipes (atlas/economy.js) and the cards that explain (ui/inspect.js).
//   townFacts(a, t, {inRealm, lit, stock}) → {get(fact, arg, scope)}; `inRealm` — what stands in the realm's towns (realmBuilt),
//   `lit` — the town's lit indicators (atlas/economy.js townLights), `stock` — the store to read (the economy: the season's
//   supply, imports too); all worked out once by a caller asking many times
import {personOf} from './persons.js';
import {WORLD_PEOPLES, placeNeed} from '../data/peoples.js';
import {POLITIES} from '../data/polities.js';
import {lineHas, TOWN_GOODS} from '../data/townBuildings.js';
import {FACTS} from '../data/requirements.js';
import {explain, reqText} from '../core/requirements.js';
import {realmBuilt, placeHas} from './towns.js';
import {headsOf} from './population.js';
import {SPECIES} from '../data/species.js';

// how much of a good's wanted store the realm still lacks (data/townBuildings.js TOWN_GOODS `stock` a head; after Widelands'
// target quantity): 1 − (what its towns' stores and its treasury hold) / (stock × its people), 0 … 1; a good with no target — 1.
// Once a realm, good and step (a scratch, not saved: read from the stores, so a world loaded goes on as it would have)
export function realmWant(a, t, g) {
  const k = TOWN_GOODS.has(g) ? TOWN_GOODS.get(g).stock : null;
  if (!(k > 0)) return 1;
  const key = `${a?.hist?.step ?? -1}:${t.realm ?? 't' + t.id}:${g}`, W = a ? (a.realmWant ||= new Map()) : new Map();
  if (W.has(key)) return W.get(key);
  if (W.size > 512) W.clear();
  const towns = t.realm == null || !a?.towns ? [t] : a.towns.filter(x => x.alive && x.realm === t.realm);
  const R = t.realm == null ? null : (a?.realms || []).find(r => r.id === t.realm);
  const has = towns.reduce((s, x) => s + (x.stock?.[g] || 0), 0) + (R?.stock?.[g] || 0), want = k * towns.reduce((s, x) => s + (x.pop || 0), 0);
  const v = want > 0 ? Math.max(0, 1 - has / want) : 0;
  W.set(key, v);
  return v;
}
export function townFacts(a, t, {inRealm = null} = {}) {
  let realmSet = inRealm;
  const realm = () => realmSet || (realmSet = realmBuilt(a, t));
  const pk = t.place ||= {};
  const has = need0 => { const need = placeNeed(t.people, need0); return need === 'road' || need === 'graves' ? placeHas(a, t.i, need) : (pk[need] ??= placeHas(a, t.i, need)); };   // the land does not change; roads and graves do
  return {
    get(fact, arg, scope) {
      switch (fact) {
        case 'people': return t.people;
        case 'polity': { const r = (a?.realms || []).find(x => x.id === t.realm); const P = WORLD_PEOPLES.get(r?.people || t.people); return POLITIES.has(P.polity || P.id) ? P.polity || P.id : undefined; }
        case 'kinShare': { if (!(t.pop > 0)) return undefined; const b = headsOf(a, t)[arg]; return b ? (b[0] + b[1] + b[2]) / t.pop : 0; }   // (the exact share: t.kin is rounded for the cards)
        case 'kinCount': { const b = headsOf(a, t)[arg]; return b ? b[0] + b[1] + b[2] : 0; }
        case 'kinHands': { const b = headsOf(a, t)[arg]; return (b ? b[1] : 0) * (WORLD_PEOPLES.get(t.people)?.hands ?? 0); }
        case 'built': return scope === 'realm' ? lineHas(realm(), arg) : scope == null || scope === 'town' ? lineHas(t.built, arg) : undefined;
        case 'exact': return t.built.includes(arg);
        case 'place': return a?.f ? has(arg) : true;
        case 'pop': return t.pop;
        case 'tier': return t.tier || 0;
        case 'capital': return !!t.capital;
        case 'ruler': { const r = (a?.realms || []).find(x => x.id === t.realm); const h = r?.kingdom?.court?.ruler; return !!h && !!personOf(a, h.person)?.alive; }
        case 'want': return realmWant(a, t, arg);
      }
      if (!FACTS.has(fact)) throw new Error(`requirements: unknown fact «${fact}»`);
      return undefined;
    },
  };
}
// the words for the cards: a race by its plural, a building by its name
import {TOWN_BUILDINGS, PLACE_NEEDS, PEOPLE_WORDS} from '../data/townBuildings.js';
export const WORDS = {
  arg: (fact, arg) => (fact === 'want' ? (TOWN_GOODS.has(arg) ? TOWN_GOODS.get(arg).label : arg) : fact === 'kinShare' || fact === 'kinCount' || fact === 'kinHands' ? (SPECIES.has(arg) ? SPECIES.get(arg).plural : arg) + (fact === 'kinCount' ? ' (число)' : fact === 'kinHands' ? ' (руки)' : '')
    : fact === 'built' || fact === 'exact' ? (TOWN_BUILDINGS.has(arg) ? TOWN_BUILDINGS.get(arg).name : arg)
    : fact === 'place' ? (PLACE_NEEDS[arg] || arg) : null),
  value: (fact, v) => (fact === 'people' ? PEOPLE_WORDS[v] || v : fact === 'polity' ? (POLITIES.has(v) ? POLITIES.get(v).label : v) : v),
};
export const townExplain = (a, t, req, opts) => explain(req, townFacts(a, t, opts), WORDS);
// the words of what a building asks (its row's short fields and its `need`), for the tables and the cards
import {needsOf, tierNeed} from '../data/requirements.js';
export const buildingNeedText = (b, people = null) => reqText([tierNeed(b, people), needsOf(b)].filter(Boolean), WORDS) || '—';
// why a town may or may not build this now: [{text, ok}] (the limits of count, slot, line and site are not asked here)
export const whyBuild = (a, t, b, opts) => townExplain(a, t, [tierNeed(b, t.people), needsOf(b)].filter(Boolean), opts).flatMap(x => (x.all ? x.items : [x]));   // (the building's own «all» opened into its lines)
