// The realm as a kingdom (docs/NRI.md, этап 7; the numbers: data/kingdom.js). Once a year, at its end (winter: so the
// year's raids are all counted), on a random
// stream of its own (a.kingdomRnd), every living realm takes stock: its four attributes from its towns and world
// view, its offices filled or emptied, its edicts, the year's event, its upkeep and its four kinds of ruin.
//
// realm.kingdom = {stats: {culture, economy, loyalty, stability}, ruin: {corruption, crime, decay, strife}, upkeep,
//                  edicts: {taxes: level, …}, court: {ruler: {name, since, until} | null, …}, event: id | null}
// What it does back to the world: data/kingdom.js FEEDBACK (0 — nothing; schismFactor for atlas/realms.js).
import {REALM_STATS, RUINS, RUIN_RULES, UPKEEP, EDICTS, OFFICES, COURT, REALM_EVENTS, EVENTS_RULE, FEEDBACK} from '../data/kingdom.js';
import {TOWN_BUILDINGS} from '../data/townBuildings.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {makeName} from '../data/names.js';
import {mulberry, seedNumber} from '../core/rng.js';
import {pickOne} from '../data/chance.js';
import {townFx} from './towns.js';
import {realmTowns, realmLabelGen, realmLabel} from './realms.js';
import {SEASONS_PER_YEAR} from '../data/atlas.js';

const cap1 = s => s[0].toUpperCase() + s.slice(1);
import {realmAlign} from './diplomacy.js';

const r3 = v => Math.round(v * 1000) / 1000;
const zero = reg => Object.fromEntries(reg.all().map(x => [x.id, 0]));

// does a condition hold for these attributes and ruin ({war}, {below: {k: v}}, {above: {k: v}})
export function holds(when, {stats, ruin, war}) {
  if (!when) return true;
  if (when.war != null && when.war !== war) return false;
  const val = k => stats[k] ?? ruin[k] ?? 0;
  for (const [k, v] of Object.entries(when.below || {})) if (!(val(k) < v)) return false;
  for (const [k, v] of Object.entries(when.above || {})) if (!(val(k) > v)) return false;
  return true;
}
const addTo = (to, adds, k = 1) => { for (const [s, v] of Object.entries(adds || {})) to[s] = (to[s] || 0) + v * k; };

// the attributes a realm's towns and world view give, before the court, the edicts and the year
export function baseStats(a, realm, towns) {
  const fx = {};
  for (const t of towns) for (const [k, v] of Object.entries(townFx(t))) fx[k] = (fx[k] || 0) + v / towns.length;
  const align = realmAlign(a, realm.id) || {};
  const out = {};
  for (const S of REALM_STATS.all()) {
    let v = 0;
    for (const [k, w] of Object.entries(S.from)) v += (fx[k] || 0) * w;
    for (const [axis, w] of Object.entries(S.compass || {})) v += (align[axis] || 0) * w;
    out[S.id] = v;
  }
  return out;
}
// the upkeep of a realm's buildings: the average over its towns
export const upkeepOf = towns => towns.reduce((s, t) => s + t.built.reduce((u, id) => u + (UPKEEP[TOWN_BUILDINGS.has(id) ? TOWN_BUILDINGS.get(id).cat : ''] || 0), 0), 0) / Math.max(1, towns.length);

export function stepKingdom(a, say) {
  if (!a.realms?.length || a.hist.season !== SEASONS_PER_YEAR - 1) return;
  const r = mulberry(a.kingdomRnd ?? seedNumber(`${a.cfg.seed}:atlas:kingdom`)), year = a.hist.year;
  const tell = text => say({text, topic: 'kingdom'});
  for (const realm of a.realms) {
    if (realm.fallen != null) continue;
    const towns = realmTowns(a, realm.id);
    if (!towns.length) continue;
    const K = realm.kingdom ||= {ruin: zero(RUINS), court: Object.fromEntries(OFFICES.all().map(o => [o.id, null])), edicts: {}, stats: zero(REALM_STATS)};
    const name = realmLabelGen(a, realm.id), Name = cap1(realmLabel(a, realm.id)), war = Object.entries(a.rel || {}).some(([k, x]) => x.war && k.split(':').includes(String(realm.id)));
    const stats = baseStats(a, realm, towns);
    // the court: a holder's years run out, an empty office is filled
    const race = WORLD_PEOPLES.get(realm.people).race;
    for (const O of OFFICES.all()) {
      const h = K.court[O.id];
      if (h && year >= h.until) { K.court[O.id] = null; tell(`${cap1(h.f ? O.labelF : O.label)} ${name} ${h.name} оставил${h.f ? 'а' : ''} свой пост.`); }
      if (!K.court[O.id] && r() < COURT.fill) {
        // a name nobody at this court has yet; a people without names leaves the office empty
        const used = new Set(Object.values(K.court).filter(Boolean).map(x => x.name));
        const f = r() < COURT.female, nm = makeName(race, r, {gender: f ? 'f' : 'm', used}), years = Math.round(O.years[0] + r() * (O.years[1] - O.years[0]));
        if (nm) {
          K.court[O.id] = {name: nm, f, since: year, until: year + years};
          tell(`${f ? 'Новая' : 'Новый'} ${f ? O.labelF : O.label} ${name} — ${nm}.`);
        }
      }
      addTo(stats, K.court[O.id] ? O.adds : O.vacant);
    }
    // the edicts: the first level whose condition holds
    const ctx = {stats, ruin: K.ruin, war};
    for (const E of EDICTS.all()) {
      const L = E.levels.find(l => holds(l.when, ctx)) || E.levels[E.levels.length - 1];
      if (K.edicts[E.id] !== L.id && K.edicts[E.id] != null) tell(`${cap1(E.label)} ${name} — ${L.label}.`);
      K.edicts[E.id] = L.id;
      addTo(stats, L.adds); addTo(K.ruin, L.ruin);
    }
    // ruin eats the attributes
    for (const R of RUINS.all()) stats[R.eats] -= (K.ruin[R.id] || 0) * RUIN_RULES.penalty;
    // the year's event
    K.event = null;
    if (r() < EVENTS_RULE.chance) {
      const can = REALM_EVENTS.filter(e => holds(e.when, ctx));
      if (can.length) {
        const E = REALM_EVENTS.get(pickOne(r, can.map(e => [e.id, e.weight])));
        addTo(stats, E.adds); addTo(K.ruin, E.ruin); K.event = E.id;
        tell(E.text.replace('{Realm}', Name).replace('{realm}', name));
      }
    }
    // ruin grows by its sources and falls by the attribute that holds it back
    const upkeep = upkeepOf(towns), pop = towns.reduce((s, t) => s + t.pop, 0) / 1000;
    const wars = Object.entries(a.rel || {}).filter(([k, x]) => x.war && k.split(':').includes(String(realm.id))).length, raided = towns.filter(t => t.raided === year).length;
    const src = {towns: towns.length, pop, upkeep: Math.max(0, upkeep - stats.economy), wars, raided};
    for (const R of RUINS.all()) {
      let v = K.ruin[R.id] || 0;
      for (const [k, w] of Object.entries(R.grows)) v += (src[k] || 0) * w;
      v -= Math.max(0, stats[R.fall]) * RUIN_RULES.fall;
      K.ruin[R.id] = r3(Math.min(RUIN_RULES.max, Math.max(0, v)));
    }
    K.upkeep = r3(upkeep);
    K.stats = Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, r3(v)]));
  }
  a.kingdomRnd = r.state;
}

// × a contender's chance to break away from this realm (atlas/realms.js): 1 while FEEDBACK is at 0
export function schismFactor(realm) {
  const K = realm?.kingdom;
  if (!K) return 1;
  return (1 + FEEDBACK.schismByStrife * (K.ruin.strife || 0)) * (1 + FEEDBACK.schismByLoyalty * Math.max(0, 1 - (K.stats.loyalty || 0)));
}
