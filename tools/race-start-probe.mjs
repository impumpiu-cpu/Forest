// The peoples side by side from one start: a world's wild era runs as usual (the lairs settle), then all four peoples
// arrive at once — two founding bands each, as the elder ones do — and live to the end of history. A yearly count by
// people (people, room, feed, needs, hands, buildings by kind, store, realm: treasury, stats, ruin, course, the towns' roles,
// armies, battles), and at the end every town: what holds it back, what it lacks, and for every building of its people
// whether it could be built and, if not, what stops it; and what its council would build next.
// `node tools/race-start-probe.mjs [seed] [size]` → JSON on stdout
import {newAtlas, runNextStage} from '../src/atlas/generate.js';
import {BEHAVIOURS} from '../src/atlas/parties.js';
import {townFx, room, townKin, realmBuilt, unitsMax, lineFull, slotsUsed, slotsOf, placeHas, canBuild, chooseBuilding} from '../src/atlas/towns.js';
import {TOWN_BUILDINGS, lineHas, slotKind, goodPrice} from '../src/data/townBuildings.js';
import {WORLD_PEOPLES, KIN, placeNeed} from '../src/data/peoples.js';
import {roadAccess} from '../src/atlas/roads.js';
import {settleSpot} from '../src/atlas/peoples.js';
import {leanOf} from '../src/atlas/mind.js';
import {mulberry} from '../src/core/rng.js';

const seed = process.argv[2] || 'start' + Math.floor(Math.random() * 1e6), size = process.argv[3] || 'small';
for (const P of WORLD_PEOPLES.all()) P.era = 'elder';   // one start for all: at the end of the wild era
const a = newAtlas({seed, size, land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
const PE = WORLD_PEOPLES.all().map(P => P.id);
const realmPeople = id => a.realms?.find(r => r.id === id)?.people;
const r1 = x => Math.round(x * 10) / 10, r3 = x => Math.round(x * 1000) / 1000;
const battles = [];
let hooked = false;
const hook = () => {
  if (hooked || !BEHAVIOURS.army) return;
  hooked = true;
  const stay = BEHAVIOURS.army.stay;
  BEHAVIOURS.army.stay = (a2, p, rnd, say) => {
    const n0 = a2.chronicle.length, t = a2.towns.find(x => x.id === p.target), men0 = p.men;
    stay(a2, p, rnd, say);
    for (const c of a2.chronicle.slice(n0)) {
      const tx = c.text || '';
      if (p.lair == null && t && /штурм/.test(tx)) battles.push({year: a2.hist.year, att: realmPeople(p.owner), def: t.people, won: /взяло штурмом/.test(tx), razed: /сожгло/.test(tx), men: Math.round(men0), lost: Math.round(men0 - p.men)});
    }
  };
};
const GOODS = ['raw', 'food', 'stores', 'tools', 'arms', 'armor', 'leather', 'hide', 'cloth', 'fiber', 'ware', 'drink', 'salt', 'herbs', 'potions', 'wood', 'planks', 'stone', 'fuel', 'lux', 'beasts', 'gold'];
const CATS = ['housing', 'food', 'raw', 'craft', 'trade', 'defence', 'faith', 'lore', 'power', 'life'];
function yearRow() {
  const by = {};
  for (const p of PE) by[p] = {pop: 0, towns: 0, tiers: [0, 0, 0], room: 0, feeds: 0, target: 0, nb: 0, nc: 0, hands: 0, free: 0, jobs: 0, built: 0, cats: Object.fromEntries(CATS.map(c => [c, 0])),
    rawBy: {}, kinPop: {}, plunder: 0, worth: 0, born: 0, dead: 0, brawl: 0, want: 0, ageSum: 0, slaves: 0, warYears: 0, warKin: 0, warOther: 0, spot: 0, big: 0, idle: 0, roleOf: {agg: 0, grow: 0, econ: 0, seat: 0}, stock: {}, made: {}, used: {}, short: {}, lack: {}, army: 0, beasts: 0, ate: 0, gold: 0, slotsFull: 0, realms: 0, rgold: 0, rstock: {}, stats: {}, ruin: {}, course: {agg: 0, grow: 0, econ: 0}, wind: {agg: 0, grow: 0, econ: 0}, fisc: {}};
  for (const t of a.towns) if (t.alive) {
    const B = by[t.people], fx = townFx(t), E = t.econ || {};
    B.pop += t.pop; B.towns++; B.tiers[t.tier]++; B.room += room(fx); B.feeds += t.wants?.feeds || 0; B.target += t.target || t.pop;
    B.nb += (t.needs?.basic ?? 1) * t.pop; B.nc += (t.needs?.comfort ?? 1) * t.pop;
    B.hands += E.hands || 0; B.free += E.freeHands || 0; B.jobs += E.jobs || 0; B.built += t.built.length;
    for (const id of t.built) B.cats[TOWN_BUILDINGS.get(id).cat]++;
    if (!t.project) B.idle++;
    if (t.vital) { B.born += t.vital.born; B.dead += t.vital.dead; B.brawl += t.vital.brawl; B.want += t.vital.want; }
    B.plunder += t.plunder || 0; for (const [g, v] of Object.entries(E.made || {})) if (g !== 'gold') B.worth += v * goodPrice(g); B.worth += E.made?.gold || 0;
    B.ageSum += (t.age ?? 18) * t.pop; B.slaves += t.slaves || 0;
    for (const [k, v] of Object.entries(t.kin || {})) B.kinPop[k] = (B.kinPop[k] || 0) + v * t.pop;
    const S = WORLD_PEOPLES.get(t.people).settlers;
    if (S && t.pop >= S.from) { B.big++; if (settleSpot(a, t) >= 0) B.spot++; }
    B.roleOf[t.role || (t.capital ? 'seat' : 'econ')]++;
    for (const [g, v] of Object.entries(t.stock || {})) B.stock[g] = (B.stock[g] || 0) + v;
    for (const g of GOODS) { B.made[g] = (B.made[g] || 0) + (E.made?.[g] || 0); B.used[g] = (B.used[g] || 0) + (E.used?.[g] || 0); }
    for (const r of [...(E.rows || []), ...(E.recipes || [])]) if (r.gave?.raw > 0) { const k = r.of ? r.id : r.id; B.rawBy[k] = (B.rawBy[k] || 0) + r.gave.raw; }
    for (const g of Object.keys(E.short || {})) B.short[g] = (B.short[g] || 0) + 1;
    for (const g of Object.keys(t.needs?.lack || {})) B.lack[g] = (B.lack[g] || 0) + 1;
    B.beasts += t.warBeasts?.men || 0; B.ate += t.ateStores || 0; B.gold += (t.gold || 0) + (t.peopleGold || 0) + (t.makersGold || 0);
    if (slotsUsed(t).town >= slotsOf(t).town) B.slotsFull++;
  }
  for (const p of a.parties || []) if (p.kind === 'army') { const pp = realmPeople(p.owner); if (pp) by[pp].army += p.men || 0; }
  for (const r of a.realms || []) {
    if (!a.towns.some(t => t.alive && t.realm === r.id)) continue;
    const B = by[r.people]; B.realms++;
    { let kin = false, other = false; for (const [k, rel] of Object.entries(a.rel || {})) { if (!rel.war) continue; const [p, q] = k.split(':'); if (p !== r.id && q !== r.id) continue; const o = a.realms.find(x => x.id === (p === r.id ? q : p)); if (o?.people === r.people) kin = true; else other = true; } if (kin || other) B.warYears++; if (kin) B.warKin++; if (other) B.warOther++; } B.rgold += r.gold || 0;
    for (const [g, v] of Object.entries(r.stock || {})) B.rstock[g] = (B.rstock[g] || 0) + v;
    for (const [k, v] of Object.entries(r.kingdom?.stats || {})) B.stats[k] = (B.stats[k] || 0) + v;
    for (const [k, v] of Object.entries(r.kingdom?.ruin || {})) B.ruin[k] = (B.ruin[k] || 0) + v;
    for (const k of ['agg', 'grow', 'econ']) { B.course[k] += r.mind?.course?.[k] || 0; B.wind[k] += r.mind?.wind?.[k] || 0; }
    for (const [k, v] of Object.entries(r.fisc?.last || {})) B.fisc[k] = (B.fisc[k] || 0) + v;
  }
  const out = {};
  for (const [p, B] of Object.entries(by)) {
    const n = Math.max(1, B.realms);
    out[p] = {pop: Math.round(B.pop), towns: B.towns, tiers: B.tiers, room: Math.round(B.room), feeds: Math.round(B.feeds), target: Math.round(B.target),
      basic: r3(B.nb / Math.max(1, B.pop)), comfort: r3(B.nc / Math.max(1, B.pop)), hands: Math.round(B.hands), free: Math.round(B.free), jobs: Math.round(B.jobs), built: B.built, cats: B.cats, idle: B.idle, big: B.big, spot: B.spot, roles: B.roleOf,
      stock: Object.fromEntries(Object.entries(B.stock).map(([g, v]) => [g, Math.round(v)])), made: Object.fromEntries(Object.entries(B.made).map(([g, v]) => [g, r1(v)])), used: Object.fromEntries(Object.entries(B.used).map(([g, v]) => [g, r1(v)])),
      short: B.short, lack: B.lack, rawBy: Object.fromEntries(Object.entries(B.rawBy).map(([k, v]) => [k, Math.round(v)])), plunder: Math.round(B.plunder), worth: Math.round(B.worth), kinPop: Object.fromEntries(Object.entries(B.kinPop).map(([k, v]) => [k, Math.round(v)])), born: Math.round(B.born), dead: Math.round(B.dead), brawl: Math.round(B.brawl), want: Math.round(B.want), age: r1(B.ageSum / Math.max(1, B.pop)), slaves: Math.round(B.slaves), warYears: B.warYears, warKin: B.warKin, warOther: B.warOther, army: Math.round(B.army), beasts: Math.round(B.beasts), ate: Math.round(B.ate), gold: Math.round(B.gold), slotsFull: B.slotsFull,
      realms: B.realms, rgold: Math.round(B.rgold / n), rstock: Object.fromEntries(Object.entries(B.rstock).map(([g, v]) => [g, Math.round(v / n)])),
      stats: Object.fromEntries(Object.entries(B.stats).map(([k, v]) => [k, r3(v / n)])), ruin: Object.fromEntries(Object.entries(B.ruin).map(([k, v]) => [k, r3(v / n)])),
      course: Object.fromEntries(Object.entries(B.course).map(([k, v]) => [k, r3(v / n)])), wind: Object.fromEntries(Object.entries(B.wind).map(([k, v]) => [k, r3(v / n)])),
      fisc: Object.fromEntries(Object.entries(B.fisc).map(([k, v]) => [k, Math.round(v / n)]))};
  }
  return out;
}
// what stops a building in a town: the first check of canBuild (atlas/towns.js) that fails
function stopOf(t, b, inRealm) {
  if (b.peoples && !b.peoples.includes(t.people)) return 'народ';
  if (b.kin && !((townKin(a, t)?.[b.kin] ?? 0) >= KIN.least)) return 'вид';
  if (b.requires && !b.requires.every(id => lineHas(inRealm, id))) return 'нужна в державе: ' + b.requires.filter(id => !lineHas(inRealm, id)).map(id => TOWN_BUILDINGS.get(id).name).join(', ');
  if (b.requiresAny && !b.requiresAny.some(id => lineHas(inRealm, id))) return 'нужна в державе одна из: ' + b.requiresAny.map(id => TOWN_BUILDINGS.get(id).name).join(', ');
  if (b.here && !b.here.some(id => (id === b.id ? t.built.includes(id) : lineHas(t.built, id)))) return 'нужна в городе: ' + b.here.map(id => TOWN_BUILDINGS.get(id).name).join(' / ');
  if (b.tier > t.tier) return 'ступень ' + b.tier;
  if (b.pop && t.pop < b.pop) return 'жителей ' + b.pop;
  if (b.capital && !t.capital) return 'только столица';
  if (b.unique && a.towns.some(o => o !== t && o.alive && o.realm === t.realm && o.built.includes(b.id))) return 'одна на державу';
  if (!t.built.includes(b.id) && lineHas(t.built, b.id)) return 'есть выше';
  if (t.built.filter(id => id === b.id).length >= (b.kind === 'upgrade' ? 1 : unitsMax(t, b))) return 'есть';
  if (lineFull(t, b)) return 'предел народа';
  const sk = slotKind(b);
  if (sk && slotsUsed(t)[sk] >= slotsOf(t)[sk]) return sk === 'upgrades' ? 'нет места улучшению' : 'нет места';
  const has = n => placeHas(a, t.i, placeNeed(t.people, n));
  if (b.needs && !b.needs.every(has)) return 'место: ' + b.needs.filter(n => !has(n)).join(', ');
  if (b.needsAny && !b.needsAny.some(has)) return 'место: одно из ' + b.needsAny.join(', ');
  if (!canBuild(a, t, b, inRealm)) return b.site ? 'нет клетки рядом' : 'другое';
  return 'можно';
}
const years = [];
let last = 0;
while (true) {
  const st = runNextStage(a);
  if (!st) break;
  hook();
  if (a.hist && a.towns?.length && a.hist.season === 0 && a.hist.year !== last) { last = a.hist.year; years.push({y: a.hist.year, by: yearRow()}); }
}
const rnd = mulberry(1);
const towns = a.towns.filter(t => t.alive).map(t => {
  const fx = townFx(t), E = t.econ || {}, inRealm = realmBuilt(a, t), P = WORLD_PEOPLES.get(t.people);
  const avail = {};
  for (const b of TOWN_BUILDINGS.all()) if (!b.peoples || b.peoples.includes(t.people)) avail[b.id] = stopOf(t, b, inRealm);
  let next = null;
  if (t.wants) { const b = chooseBuilding(a, t, P, fx, {...t.wants, road: roadAccess(a, t.i), econ: t.econ, skip: new Set(), lean: leanOf(a, t)}, rnd); next = b ? b.id : null; }
  return {id: t.id, name: t.name, people: t.people, realm: t.realm, pop: Math.round(t.pop), tier: t.tier, capital: !!t.capital, role: t.role || null, room: Math.round(room(fx)), feeds: Math.round(t.wants?.feeds ?? 0), target: t.target ?? Math.round(t.pop),
    econFeeds: Math.round(E.feeds || 0), built: t.built, project: t.project || null, next, slots: slotsUsed(t), slotCap: slotsOf(t), work: t.work,
    hands: Math.round(E.hands || 0), free: Math.round(E.freeHands || 0), jobs: Math.round(E.jobs || 0), short: E.short || {}, needs: t.needs, kin: t.people === 'orcs' ? townKin(a, t) : null,
    recipes: (E.recipes || []).map(x => ({id: x.id, on: x.on, eff: r3(x.eff)})), avail, fx: Object.fromEntries(Object.entries(fx).map(([k, v]) => [k, r3(v)])), born: t.from != null, warBeasts: t.warBeasts?.list || {}, treants: t.treants || 0, wardMen: t.wardMen || 0};
});
const ruins = (a.ruins || []).map(r => ({people: r.people, how: r.how, by: r.by != null ? realmPeople(r.by) : null, year: r.year}));
const realms = (a.realms || []).filter(r => a.towns.some(t => t.alive && t.realm === r.id)).map(r => ({id: r.id, people: r.people, towns: a.towns.filter(t => t.alive && t.realm === r.id).length, gold: Math.round(r.gold || 0), stock: r.stock || {}, kingdom: r.kingdom ? {stats: r.kingdom.stats, ruin: r.kingdom.ruin, edicts: r.kingdom.edicts} : null, course: r.mind?.course, fisc: r.fisc?.last || null}));
const chron = a.chronicle.filter(c => c.year != null && /войн|штурм|раскол|столиц|дань|повернул/.test(c.text || '')).slice(-400).map(c => ({y: c.year, t: c.text}));
console.log(JSON.stringify({seed, start: years[0]?.y, years, towns, realms, ruins, battles, chron}));
