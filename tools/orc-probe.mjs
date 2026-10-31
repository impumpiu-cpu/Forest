// Probe of the greenskins under the microscope (and the other peoples beside them): a world's history run season by season,
// a yearly count by people, and at the end of history every town — what holds it back (room or food), what its buildings make
// and lack, what its people could not buy, its kinds, its store; the realms' treasuries and stores; the battles of the armies.
// `node tools/orc-probe.mjs <seed> [size]` → JSON on stdout
import {newAtlas, runNextStage} from '../src/atlas/generate.js';
import {BEHAVIOURS} from '../src/atlas/parties.js';
import {townFx, room, townKin} from '../src/atlas/towns.js';
import {TOWN_BUILDINGS} from '../src/data/townBuildings.js';

const seed = process.argv[2] || 'macro0', size = process.argv[3] || 'small';
const a = newAtlas({seed, size, land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
const realmPeople = id => a.realms?.find(r => r.id === id)?.people;
// the battles: who stormed whom and how it went
const battles = [];
let armyStay = null;
const hook = () => {
  if (armyStay || !BEHAVIOURS.army) return;
  armyStay = BEHAVIOURS.army.stay;
  BEHAVIOURS.army.stay = (a2, p, rnd, say) => {
    const n0 = a2.chronicle.length, t = a2.towns.find(x => x.id === p.target), men0 = p.men;
    armyStay(a2, p, rnd, say);
    for (const c of a2.chronicle.slice(n0)) {
      const tx = c.text || '';
      if (p.lair == null && t && /штурм/.test(tx)) battles.push({year: a2.hist.year, att: realmPeople(p.owner), def: t.people, won: /взяло штурмом/.test(tx), razed: /сожгло/.test(tx), men: Math.round(men0), lost: Math.round(men0 - p.men)});
    }
  };
};
const years = [];
let lastYear = 0;
while (true) {
  const st = runNextStage(a);
  if (!st) break;
  hook();
  if (a.hist && a.towns && a.hist.season === 0 && a.hist.year !== lastYear) {
    lastYear = a.hist.year;
    const by = {};
    for (const t of a.towns) if (t.alive) {
      const P = by[t.people] ||= {pop: 0, towns: 0, t1: 0, t2: 0, army: 0};
      P.pop += t.pop; P.towns++; if (t.tier >= 1) P.t1++; if (t.tier >= 2) P.t2++;
    }
    for (const p of a.parties || []) if (p.kind === 'army') { const pp = realmPeople(p.owner); if (pp && by[pp]) by[pp].army += p.men || 0; }
    years.push({y: a.hist.year, era: a.hist.era, by: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, {pop: Math.round(v.pop), towns: v.towns, t1: v.t1, t2: v.t2, army: Math.round(v.army)}]))});
  }
}
const r1 = x => Math.round(x * 10) / 10, r3 = x => Math.round(x * 1000) / 1000;
const towns = a.towns.filter(t => t.alive).map(t => {
  const fx = townFx(t), rm = room(fx), E = t.econ || {};
  const kin = t.people === 'orcs' ? townKin(a, t) : null;
  return {id: t.id, people: t.people, realm: t.realm, pop: Math.round(t.pop), tier: t.tier, capital: !!t.capital, room: Math.round(rm), feeds: Math.round(t.wants?.feeds ?? 0), target: t.target,
    econFeeds: Math.round(E.feeds || 0), ateStores: t.ateStores || 0, built: t.built, project: t.project?.b?.id || t.project?.id || null,
    work: t.work, hands: Math.round(E.hands || 0), free: Math.round(E.freeHands || 0), jobs: Math.round(E.jobs || 0),
    short: Object.fromEntries(Object.entries(E.short || {}).map(([g, v]) => [g, r3(v)])), spare: Object.fromEntries(Object.entries(E.spare || {}).map(([g, v]) => [g, r3(v)])),
    made: Object.fromEntries(Object.entries(E.made || {}).map(([g, v]) => [g, r1(v)])), used: Object.fromEntries(Object.entries(E.used || {}).map(([g, v]) => [g, r1(v)])),
    pools: E.pools, recipes: (E.recipes || []).map(x => ({id: x.id, on: x.on, eff: r3(x.eff)})),
    needs: t.needs, stock: t.stock, gold: r1(t.gold || 0), peopleGold: r1(t.peopleGold || 0), makersGold: r1(t.makersGold || 0),
    kin, warBeasts: t.warBeasts?.men || 0, garrison: t.garrison || 0, raided: t.raided || 0, slaves: t.slaves || 0, born: t.from != null, fx: Object.fromEntries(Object.entries(fx).map(([k, v]) => [k, r3(v)]))};
});
const realms = (a.realms || []).filter(r => a.towns.some(t => t.alive && t.realm === r.id)).map(r => ({id: r.id, people: r.people, gold: r1(r.gold || 0), stock: r.stock || {}, fisc: r.fisc || null, towns: a.towns.filter(t => t.alive && t.realm === r.id).length, mind: r.mind ? {course: r.mind.course} : null}));
const rels = Object.entries(a.rel || {}).map(([k, v]) => { const [p, q] = k.split(':').map(Number); return {p: realmPeople(p), q: realmPeople(q), wars: v.wars || 0, war: !!v.war, att: v.att}; });
const ruins = (a.ruins || []).map(r => ({people: r.people, how: r.how, by: r.by != null ? realmPeople(r.by) : null, year: r.year}));
console.log(JSON.stringify({seed, years, towns, realms, rels, ruins, battles, hist: {moved: a.hist.moved || 0, abroad: a.hist.movedAbroad || 0, lost: a.hist.lost || null}}));
