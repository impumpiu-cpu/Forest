// The realm as a kingdom (docs/WORLD.md; the numbers: data/kingdom.js). Once a year, at its end (winter: so the
// year's raids are all counted), on a random
// stream of its own (a.kingdomRnd), every living realm takes stock: its four attributes from its towns and world
// view, its offices filled or emptied, its edicts, the year's event, its upkeep and its four kinds of ruin.
//
// realm.kingdom = {stats: {culture, economy, loyalty, stability}, ruin: {corruption, crime, decay, strife}, upkeep,
//                  edicts: {taxes: level, …}, court: {ruler: {person, since, until} | null, …}, event: id | null}
// A holder of an office is a person of the world (atlas/persons.js): it lives at the seat, ages and dies by its own
// event; its term running out (`until`) only sends it off the office. The throne after a ruler's death goes by the realm's
// profile (data/polities.js, atlas/succession.js): a kingdom's court mourns `mourn` years and fills it again; a horde fights
// What it does back to the world: data/kingdom.js FEEDBACK — schismFactor (atlas/realms.js), t.realmFx (growth, might).
import {REALM_STATS, RUINS, RUIN_RULES, UPKEEP, EDICTS, OFFICES, COURT, REALM_EVENTS, EVENTS_RULE, FEEDBACK} from '../data/kingdom.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {makeName} from '../data/names.js';
import {mulberry, seedNumber} from '../core/rng.js';
import {pickOne} from '../data/chance.js';
import {townFx, roughShare, might} from './towns.js';
import {taxYear, realmSpend, realmDuties, realmKeep, payTribute, reserveOf, fiscOf} from './treasury.js';
import {attitude} from './diplomacy.js';
import {TOWN_BUILDINGS, TOWN_MONEY} from '../data/townBuildings.js';
import {realmTowns, realmLabelGen, realmLabel} from './realms.js';
import {SEASONS_PER_YEAR} from '../data/atlas.js';
import {newPerson, personOf, moveTo} from './persons.js';
import {rulerTitle} from './polities.js';

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
  // money: how well its towns' treasuries hold (their gold against the keep of their people, at most 1) — data/kingdom.js `from.money`
  fx.needs = towns.reduce((s, t) => s + (t.needs?.basic ?? 1), 0) / towns.length;   // how well its people live (atlas/treasury.js)
  fx.money = towns.reduce((s, t) => s + Math.min(1, Math.max(0, t.gold || 0) / Math.max(1, TOWN_MONEY.tax.keep * t.pop)), 0) / towns.length;
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
// (by kind, as the effects: twelve fields are one farmland to keep — atlas/towns.js townFx)
export const upkeepOf = towns => towns.reduce((s, t) => s + [...new Set(t.built)].reduce((u, id) => u + (UPKEEP[TOWN_BUILDINGS.has(id) ? TOWN_BUILDINGS.get(id).cat : ''] || 0), 0), 0) / Math.max(1, towns.length);

// a realm's might: the might of its towns (atlas/towns.js might) — for tribute
const mightOfRealm = a => { const m = new Map(); for (const t of a.towns || []) if (t.alive && t.realm != null) m.set(t.realm, (m.get(t.realm) || 0) + might(t, townFx(t))); return id => m.get(id) || 0; };

const atWarAny = (a, realm) => Object.entries(a.rel || {}).some(([k, x]) => x.war && k.split(':').includes(String(realm.id)));

// each season: every living realm keeps its war host out of its treasury — garrisons, its armies' pay, food and kit
// (atlas/treasury.js realmKeep)
export function stepRealmKeep(a) {
  for (const realm of a.realms || []) {
    if (realm.fallen != null) continue;
    const towns = realmTowns(a, realm.id);
    if (towns.length) realmKeep(a, realm, towns, atWarAny(a, realm));
  }
}

export function stepKingdom(a, say) {
  let mightOf = null;
  if (!a.realms?.length || a.hist.season !== SEASONS_PER_YEAR - 1) return;
  const r = mulberry(a.kingdomRnd ?? seedNumber(`${a.cfg.seed}:atlas:kingdom`)), year = a.hist.year;
  const tell = text => say({text, topic: 'kingdom'});
  for (const realm of a.realms) {
    if (realm.fallen != null) continue;
    const towns = realmTowns(a, realm.id);
    if (!towns.length) continue;
    const K = realm.kingdom ||= {ruin: zero(RUINS), court: Object.fromEntries(OFFICES.all().map(o => [o.id, null])), edicts: {}, stats: zero(REALM_STATS)};
    const name = realmLabelGen(a, realm.id), Name = cap1(realmLabel(a, realm.id)), war = atWarAny(a, realm);
    const stats = baseStats(a, realm, towns);
    // the court: a holder's years run out (it lives on), an empty office is filled with a person of the realm's race at
    // its seat — the throne not while the realm mourns or the horde fights over it (atlas/succession.js)
    const race = WORLD_PEOPLES.get(realm.people).race, seat = towns.find(t => t.id === realm.capital) || towns[0];
    for (const O of OFFICES.all()) {
      const h = K.court[O.id], hp = h ? personOf(a, h.person) : null;
      if (h && (!hp || !hp.alive)) K.court[O.id] = null;   // (its holder is dead: the office was freed by its death — atlas/succession.js; an old save's holder of no person is let go)
      else if (h && year >= h.until) { K.court[O.id] = null; tell(`${cap1(O.id === 'ruler' ? rulerTitle(realm, hp) : hp.g === 'f' ? O.labelF : O.label)} ${name} ${hp.name} оставил${hp.g === 'f' ? 'а' : ''} свой пост.`); }
      const held = O.id === 'ruler' && ((realm.mourn ?? -1) > year || realm.contest != null);
      if (!K.court[O.id] && !held && r() < COURT.fill) {
        // a name nobody at this court has yet; a people without names leaves the office empty
        const used = new Set(Object.values(K.court).filter(Boolean).map(x => personOf(a, x.person)?.name).filter(Boolean));
        const f = r() < COURT.female, nm = makeName(race, r, {gender: f ? 'f' : 'm', used}), years = Math.round(O.years[0] + r() * (O.years[1] - O.years[0]));
        if (nm) {
          const p = newPerson(a, {name: nm, g: f ? 'f' : 'm', species: race, r});
          if (seat) moveTo(p, 'town', seat.id);
          K.court[O.id] = {person: p.id, since: year, until: year + years};
          tell(`${f ? 'Новая' : 'Новый'} ${O.id === 'ruler' ? rulerTitle(realm, p) : f ? O.labelF : O.label} ${name} — ${nm}.`);
        }
      }
      addTo(stats, K.court[O.id] ? O.adds : O.vacant);
    }
    // the edicts: the first level whose condition holds (the treasury's council reads `reserve`: years of its spending held)
    const ctx = {stats: {...stats, reserve: reserveOf(realm)}, ruin: K.ruin, war};
    for (const E of EDICTS.all()) {
      const L = E.levels.find(l => holds(l.when, ctx)) || E.levels[E.levels.length - 1];
      if (K.edicts[E.id] !== L.id && K.edicts[E.id] != null) tell(`${cap1(E.label)} ${name} — ${L.label}.`);
      K.edicts[E.id] = L.id;
      addTo(stats, L.adds); addTo(K.ruin, L.ruin); addTo(ctx.stats, L.adds);
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
    // the tax of the year, by last year's edict (atlas/treasury.js): the realm's treasury
    taxYear(realm, towns, K.edicts.taxes || 'usual');   // (corruption takes its share on the way)
    mightOf ||= mightOfRealm(a);
    const courtUnpaid = realmDuties(a, realm, towns);   // its court is paid first (atlas/treasury.js; its armies — each season, stepRealmKeep)
    { const tr = payTribute(a, realm, towns, mightOf, attitude); if (tr && tr[1] >= 1) tell(`${Name} платят дань «${realmLabel(a, tr[0].id)}»: ${Math.round(tr[1])} золотых.`); }
    realmSpend(realm, towns, war, a);   // grants to build, by the council's wind (atlas/treasury.js, atlas/mind.js)
    // ruin grows by its sources and falls by the attribute that holds it back
    const upkeep = upkeepOf(towns), pop = towns.reduce((s, t) => s + t.pop, 0) / 1000;
    const wars = Object.entries(a.rel || {}).filter(([k, x]) => x.war && k.split(':').includes(String(realm.id))).length, raided = towns.filter(t => t.raided === year).length;
    const src = {unpaid: towns.reduce((s, t) => s + (t.unpaid || 0), 0), broke: (realm.gold || 0) < TOWN_MONEY.dust ? 1 : 0, towns: towns.length, rough: towns.reduce((s, t) => s + roughShare(t), 0), folk: towns.reduce((s, t) => s + Object.values(t.folk || {}).reduce((x, v) => x + v, 0), 0), pop, upkeep: Math.max(0, upkeep - stats.economy), wars, raided};
    src.court = courtUnpaid;   // the court unpaid: decay
    const RP = WORLD_PEOPLES.get(realm.people), bureau = RP?.bureau ?? 1;   // (corruption × the people's bureaucracy; any ruin × its `ruinGrow`)
    for (const R of RUINS.all()) {
      let v = K.ruin[R.id] || 0;
      for (const [k, w] of Object.entries(R.grows)) v += (src[k] || 0) * w * (R.id === 'corruption' ? bureau : 1) * (RP?.ruinGrow?.[R.id] ?? 1);
      v -= Math.max(0, stats[R.fall]) * RUIN_RULES.fall;
      K.ruin[R.id] = r3(Math.min(RUIN_RULES.max, Math.max(0, v)));
    }
    K.upkeep = r3(upkeep);
    K.stats = Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, r3(v)]));
    fiscOf(realm); realm.fisc.last = realm.fisc.year; realm.fisc.year = null;   // the year's ledger closed (atlas/treasury.js)
    // back to the world for a year: its towns' growth by the economy, their might by the stability (saved on each town)
    const [lo, hi] = FEEDBACK.range, k = v => r3(Math.max(lo, Math.min(hi, v)));
    for (const t of towns) t.realmFx = {grow: k(1 + FEEDBACK.growthByEconomy * K.stats.economy), might: k(1 + FEEDBACK.mightByStability * K.stats.stability)};
  }
  a.kingdomRnd = r.state;
}

// × a contender's chance to break away from this realm (atlas/realms.js): by its strife and loyalty (FEEDBACK)
export function schismFactor(realm) {
  const K = realm?.kingdom;
  if (!K) return 1;
  return (1 + FEEDBACK.schismByStrife * (K.ruin.strife || 0)) * (1 + FEEDBACK.schismByLoyalty * Math.max(0, 1 - (K.stats.loyalty || 0)));
}
