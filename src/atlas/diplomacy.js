// How the realms of the world map get on (data/diplomacy.js, atlas/realms.js): attitudes that move
// with shared land, trade, raids and wars; trade routes; folk of one people settling in the other's
// towns; wars with battles between their nearest towns, burnt towns left as ruins and battlefields
// left as barrows; orc raids; peace when the war has worn both out. Two realms of one race deal with
// each other like any two, starting from their race's memory of itself (data/relations.js).
//
// a.rel = {'rA:rB': {att, war: {since, battles, razed} | null, wars, routes, met}};  a.ruins = [{...}]
// a.f.barrows — 0 … 1, the old graves of battles (the «barrows» biome share of a cell, atlas/biomes.js)
import {DIPLOMACY} from '../data/diplomacy.js';
import {ROT} from '../data/lairs.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {ROADS} from '../data/roads.js';
import {RELATIONS} from '../data/relations.js';
import {SPECIES} from '../data/species.js';
import {scaleOf} from './tectonics.js';
import {townFx, might, raidShare, townLabel} from './towns.js';
import {realmOf, realmPeople, realmLabel, realmLabelGen} from './realms.js';

const D = DIPLOMACY;

// a people's old feeling for another (data/relations.js), −3 … +3; a race remembers itself too
export function feeling(p, q) {
  const a = SPECIES.get(WORLD_PEOPLES.get(p).race).rel, b = SPECIES.get(WORLD_PEOPLES.get(q).race).rel;
  return RELATIONS[a]?.[b] ?? 0;
}
// what two realms start from: the worse of their races' memories of each other
export const memory = (a, p, q) => { const P = realmPeople(a, p), Q = realmPeople(a, q); return Math.min(feeling(P, Q), feeling(Q, P)); };

const key = (p, q) => (p < q ? `${p}:${q}` : `${q}:${p}`);
const cap1 = s => s[0].toUpperCase() + s.slice(1);
const label = id => WORLD_PEOPLES.get(id).label;

// p and q are realm ids throughout
export const relation = (a, p, q) => a.rel?.[key(p, q)] || null;
// the attitude between two realms: their record, or the old memory of their races before they meet
export const attitude = (a, p, q) => (p === q ? 5 : relation(a, p, q)?.att ?? memory(a, p, q));
export const atWar = (a, p, q) => p !== q && !!relation(a, p, q)?.war;
export function stateOf(a, p, q) {
  if (atWar(a, p, q)) return 'war';
  const v = attitude(a, p, q);
  return D.states.find(s => v >= s.from).id;
}
export const stateLabel = id => (id === 'war' ? 'война' : D.states.find(s => s.id === id).label);
// whether their towns trade and share roads
export const trades = (a, p, q) => p === q || (!atWar(a, p, q) && attitude(a, p, q) >= -1);

export function meet(a, p, q, year) {
  a.rel ||= {};
  const k = key(p, q);
  if (!a.rel[k]) a.rel[k] = {att: memory(a, p, q), war: null, wars: 0, routes: 0, met: year};
  return a.rel[k];
}
// the worst standing between the realms of two races (for the races' fields pushing each other)
export function raceState(a, P, Q) {
  let worst = null;
  for (const r of a.realms || []) if (r.people === P) for (const o of a.realms) if (o.people === Q && r.id !== o.id) {
    const st = stateOf(a, r.id, o.id), rank = D.states.findIndex(x => x.id === st) + (st === 'war' ? 10 : 0);
    if (worst == null || rank > worst[1]) worst = [st, rank];
  }
  if (worst) return worst[0];
  const v = Math.min(feeling(P, Q), feeling(Q, P));
  return D.states.find(s => v >= s.from).id;
}

// burn a town: it is gone, a ruin stays where it stood
function raze(a, t, by, how) {
  t.alive = false; t.died = a.hist.year;
  barrows(a, t.i, Math.max(2, Math.round(2 * scaleOf(a))), ROT.ruinGraves);   // the dead of a burnt town
  a.ruins ||= [];
  a.ruins.push({i: t.i, x: t.x, y: t.y, name: t.name, people: t.people, realm: t.realm, by, year: a.hist.year, how});
}

// old graves around a battlefield: `v` at the middle, fading out to `r` cells. A raid on a town
// leaves a few (ROT.raidGraves); the rot of the dead grows from them (atlas/lairs.js)
export function barrows(a, i, r, v = 0.5) {
  const f = a.f, x0 = i % a.w, y0 = (i / a.w) | 0;
  f.barrows ||= new Float32Array(a.n);
  for (let y = Math.max(0, y0 - r); y <= Math.min(a.h - 1, y0 + r); y++) for (let x = Math.max(0, x0 - r); x <= Math.min(a.w - 1, x0 + r); x++) {
    const j = y * a.w + x, d = Math.hypot(x - x0, y - y0);
    if (!f.ocean[j] && d <= r) f.barrows[j] = Math.min(1, f.barrows[j] + v * (1 - d / (r + 1)));
  }
}
export const raidGraves = (a, t) => barrows(a, t.i, Math.max(1, Math.round(scaleOf(a))), ROT.raidGraves);

// where the battle was fought: a few cells out of the beaten town towards the winner, on land — the
// towns may be far apart, with sea between them, and the graves lie under the town's walls
function battlefield(a, lose, win) {
  const k = scaleOf(a), dx = win.x - lose.x, dy = win.y - lose.y, d = Math.hypot(dx, dy) || 1, far = Math.min(d / 2, 3 * k);
  let best = lose.i;
  for (let s = 1; s <= far; s++) {
    const x = Math.round(lose.x + dx / d * s), y = Math.round(lose.y + dy / d * s);
    if (x < 0 || y < 0 || x >= a.w || y >= a.h || a.f.ocean[y * a.w + x]) break;
    best = y * a.w + x;
  }
  return best;
}

const fight = (t, rnd) => might(t, townFx(t)) * (0.6 + 0.8 * rnd());

// a year of the peoples' dealings; `overlap(p, q)` is the share of their land they share
export function stepDiplomacy(a, rnd, say, overlap) {
  const k = scaleOf(a), H = a.hist, towns = a.towns.filter(t => t.alive);
  // the nearest towns of two peoples, and how far apart they are
  const nearest = (p, q) => {
    let best = null, bd = Infinity;
    for (const t of towns) if (t.realm === p && t.alive) for (const o of towns) if (o.realm === q && o.alive) {
      const d = Math.hypot(t.x - o.x, t.y - o.y); if (d < bd) { bd = d; best = [t, o]; }
    }
    return [best, bd];
  };
  for (const [kk, r] of Object.entries(a.rel || {})) {
    const [p, q] = kk.split(':'), P = realmPeople(a, p), Q = realmPeople(a, q), kin = P === Q;
    const old = memory(a, p, q);
    // trade routes: road-joined towns of the two near each other
    let routes = 0;
    if (trades(a, p, q)) {
      for (const t of towns) if (t.realm === p) for (const o of towns) if (o.realm === q && Math.hypot(t.x - o.x, t.y - o.y) <= ROADS.reach * k &&
        a.f.road[t.i] >= ROADS.levels[0].wear && a.f.road[o.i] >= ROADS.levels[0].wear) {
        routes++;
        // folk of each settle in the other's town (of another race; kin need no settling)
        if (!kin) for (const [x, y] of [[t, o.people], [o, t.people]]) {
          x.folk ||= {};
          const was = x.folk[y] || 0;
          x.folk[y] = Math.min(D.mingleMax, was + D.mingle);
          if (was < 0.1 && x.folk[y] >= 0.1 && x.tier >= 1) say(`В ${townLabel(x, 3)} ${x.name} осели ${label(y)}: каждый десятый там теперь из них.`);
        }
      }
      if (routes && !r.routes) say(`Между землями ${realmLabelGen(a, p)} и ${realmLabelGen(a, q)} пошли первые караваны.`);
      r.routes = routes;
    }
    // shared land sours two races; two realms of one race share their own land freely
    const sh = kin ? 0 : overlap(P, Q), [pair, gap] = nearest(p, q), border = sh > 0 || gap <= D.front * k;
    r.att += D.drift * Math.sign(old - r.att) * Math.min(1, Math.abs(old - r.att)) - D.pressure * sh + (r.att < old + D.tradeCeil ? Math.min(D.tradeMax, D.trade * routes) : 0);
    if (r.war) {
      r.att += D.weariness;
      const years = H.year - r.war.since;
      // the front: the nearest pair of towns of the two fight it out
      const best = gap <= D.front * k ? pair : null;
      if (best) {
        const [t, o] = best, ft = fight(t, rnd), fo = fight(o, rnd), [win, lose] = ft >= fo ? [t, o] : [o, t];
        const loss = (D.battleLoss[0] + (D.battleLoss[1] - D.battleLoss[0]) * rnd()) * raidShare(townFx(lose));
        lose.pop *= 1 - loss; win.pop *= 1 - loss * 0.4; r.war.battles++;
        barrows(a, battlefield(a, lose, win), D.barrows * Math.max(1, Math.round(k)));
        if (lose.pop < D.raze && lose.tier <= 1) {
          raze(a, lose, win.realm, 'war'); r.war.razed++;
          say(`${cap1(realmLabel(a, win.realm))} из ${townLabel(win, 2)} ${win.name} взяли и сожгли ${townLabel(lose, 1)} ${lose.name}: осталось пепелище.`);
        } else say(`Битва под ${townLabel(lose, 4)} ${lose.name}: ${realmLabel(a, win.realm)} одолели ${realmLabelGen(a, lose.realm)}, поле усеяно курганами.`);
      }
      if (r.att >= D.peaceAt || years >= D.longest) {
        say(`${cap1(realmLabel(a, p))} и ${realmLabel(a, q)} заключили мир после ${years} ${years % 10 === 1 && years % 100 !== 11 ? 'года' : 'лет'} войны.`);
        r.war = null; r.att = D.afterPeace;
      }
    } else if (r.att <= D.warAt && border) {
      r.war = {since: H.year, battles: 0, razed: 0}; r.wars++;
      say(`${cap1(realmLabel(a, p))} и ${realmLabel(a, q)} не поделили ${kin ? 'власть' : 'земли'}: началась война.`);
    }
    r.att = Math.max(-5, Math.min(5, r.att));
  }
  // orcs raid the nearest town of a people they do not like, a few raids a year
  const raids = {};
  for (const t of towns) {
    if (!D.raiders.includes(t.people) || !t.alive || rnd() > D.raidChance || (raids[t.people] || 0) >= D.raidsPerYear) continue;
    if (!townFx(t).defence) continue;   // only a camp with warriors goes raiding
    let target = null, bd = D.raidReach * k;
    for (const o of towns) if (o.alive && o.realm !== t.realm && relation(a, t.realm, o.realm) && attitude(a, t.realm, o.realm) < 0) {
      const d = Math.hypot(t.x - o.x, t.y - o.y); if (d < bd) { bd = d; target = o; }
    }
    if (!target) continue;
    const r = meet(a, t.realm, target.realm, H.year);
    r.att = Math.max(-5, r.att - D.raid); raids[t.people] = (raids[t.people] || 0) + 1;
    if (fight(t, rnd) > fight(target, rnd)) {
      const loss = D.raidLoss * raidShare(townFx(target));
      target.pop *= 1 - loss; t.pop += target.pop * loss * 0.3; raidGraves(a, target);
      say(`${cap1(realmLabel(a, t.realm))} из ${townLabel(t, 2)} ${t.name} разграбили ${townLabel(target, 1)} ${target.name}.`);
    } else {
      t.pop *= 0.9;
      say(`${cap1(realmLabel(a, target.realm))} отбили набег ${realmLabelGen(a, t.realm)} на ${townLabel(target, 1)} ${target.name}.`);
    }
  }
}

export const ruinAt = (a, i) => (a.ruins || []).find(r => Math.abs(r.x - i % a.w) <= 1 && Math.abs(r.y - ((i / a.w) | 0)) <= 1) || null;
