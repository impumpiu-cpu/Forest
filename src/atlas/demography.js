// The people of the towns (docs/WORLD.md «Демография»; each people's numbers: data/peoples.js — migrate, welcome, settlers;
// the world's: TOWN_LIFE). People are a resource, like gold or timber: they are born of the towns' people, move between
// towns, march to war, are carried off and die — nothing makes them out of nothing. Only the founding bands of a people's
// arrival (and those the hand lands) come into the world from outside it.
//
//   growth (a year, in spring, atlas/peoples.js): born of the town's people, as many as its land feeds and its houses
//     hold — a town over that shrinks the same way; no roll, no floor;
//   settlers (a year, after the growth, atlas/peoples.js sendSettlers): a full town sends `settlers.pop` of its people to
//     found a town of its realm on a free spot within its reach; they carry what it can spare of `settlers.goods`;
//   migration (each season, here): people move from the towns they like less to those they like more — fame (the town's
//     prestige) and how well their needs are met (atlas/treasury.js t.needs) draw them, free room lets them in; a town
//     over its room sends the surplus away. They move within their realm, and to a near town of a realm that trades with
//     theirs (TOWN_LIFE.abroad as dear) of their own people or of a people that welcomes them (data/peoples.js `welcome`);
//   a town left with fewer than TOWN_LIFE.abandon people is left: they go to the nearest town of their realm;
//   the captives of a lair gone go home (freeCaptives); an army whose town fell comes back to the nearest town of its realm
//   (atlas/army.js); the crowned seat draws people from its realm's towns (drawTo), it does not make them.
import {WORLD_PEOPLES, TOWN_LIFE as TL} from '../data/peoples.js';
import {SPECIES} from '../data/species.js';
import {townFx, room, townLabel, townKin} from './towns.js';
import {lifeOf, headsOf, sync, bandEdges, bandAge, pullToLand, addHeads, moveHeads, takeHeads, shareOfPeople} from './population.js';
import {razeSites} from './sites.js';
import {seatFallen} from './realms.js';
import {townGone} from './persons.js';
import {trades} from './diplomacy.js';
import {scaleOf} from './tectonics.js';
import {DIPLOMACY} from '../data/diplomacy.js';

// ── age and death (docs/WORLD.md «Демография»; each race's adult, lifeFrom, life, fertility, brawled — the races table,
// data/races.js body; data/peoples.js `brawl`, TOWN_LIFE.age). A town holds its people by race and band of age — the young,
// the grown, the old (atlas/population.js t.heads). Each year each band of each race dies by its middle age against how long
// the race lives — a long-lived race hardly dies in a history, a short-lived one turns over many times — and, in a people
// that brawls, by its brawls (the weak first); the young grow up, the grown grow old; the born are young. So the races of a
// town drift: the goblins breed and die fast, the trolls and the ogres slowly; and the land pulls them back a little
// (KIN.pull). → the year's vital signs: {born, dead, brawl, want, …the losses booked by cause during the year}
const bodyOf = id => (SPECIES.has(id) ? SPECIES.get(id).body || {} : {});
// the base of death, the children, the sick and the unlucky: high in a poor land, low where the town is healthy
const baseOf = health => { const [hi, lo] = TL.age.base; return lo + (hi - lo) * Math.exp(-Math.max(0, health) / TL.age.health); };
// the share of a race of this age that dies of age this year
export const deathRate = (L, age, health = 0) => Math.min(TL.age.most, (1 / L) * (baseOf(health) + Math.pow(age / (L / 2), TL.age.hazard)));
// the age of a founding band or of settlers of a race
export const foundAge = race => Math.round((bodyOf(race).lifeFrom ?? bodyOf(race).life ?? 54) * TL.age.found);
// the share of a town that dies in brawls this year (data/peoples.js `brawl`: the greenskins), before each race's `brawled`
export function brawlRate(a, t, fx = townFx(t)) {
  const B = WORLD_PEOPLES.get(t.people)?.brawl; if (!B) return 0;
  const crime = a?.realms?.find(r => r.id === t.realm)?.kingdom?.ruin?.crime || 0;
  return B.crime * crime + B.crowd * Math.max(0, t.pop / Math.max(1, room(fx)) - B.from);
}
// how much more a town of these races breeds than its people's own race (each race's fertility against the people's)
export function breedOf(a, t) {
  const P = WORLD_PEOPLES.get(t.people), ref = bodyOf(P?.race).fertility || 1, K = townKin(a, t);
  return Object.entries(K).reduce((s, [k, sh]) => s + sh * (bodyOf(k).fertility ?? ref) / ref, 0);
}
// a year of a town's people: `born` came of them this year (by the people's breed: the races' own fertility and grown ones
// share and scale it), `want` died of hunger and crowding (atlas/peoples.js bornOf, < 0); the bands move on
export function lifeYear(a, t, born, want = 0, fx = townFx(t)) {
  const A = TL.age, P = WORLD_PEOPLES.get(t.people), ref = bodyOf(P?.race).fertility || 1, H = headsOf(a, t), P0 = Math.max(0, t.pop);
  const health = fx.health || 0, br = brawlRate(a, t, fx);
  const V = {born: 0, came: 0, dead: 0, brawl: 0, want: 0};
  for (const [k, b] of Object.entries(H)) {
    const L = lifeOf(k, health), fight = Math.min(1, br * (bodyOf(k).brawled ?? 1)), [ad, old] = bandEdges(k);
    const n0 = b[0] + b[1] + b[2], grown = b[1];
    for (let i = 0; i < 3; i++) {
      const n = b[i]; if (!(n > 0)) continue;
      const dead = n * deathRate(L, bandAge(k, i, L), health);
      const brawl = Math.max(0, n - dead) * fight;
      const hunger = P0 > 0 ? want * n / P0 : 0;
      b[i] = Math.max(0, n - dead - brawl - hunger);
      V.dead += dead; V.brawl += brawl; V.want += Math.min(hunger, n);
    }
    // a year older: a share of the young grow up, of the grown grow old
    const up0 = b[0] / Math.max(1, ad), up1 = b[1] / Math.max(1, old - ad);
    b[0] -= up0; b[1] += up0 - up1; b[2] += up1;
    // the growth: the births — children of the grown ones of this race (none, no children), by its share and fertility against
    // the people's race — and the folk of the land that come, in the bands of TOWN_LIFE.age.arrive
    const gk = P0 > 0 ? born * (n0 / P0) * (bodyOf(k).fertility ?? ref) / ref : 0;
    const births = Math.min(gk * A.births, grown * A.perGrown * (bodyOf(k).fertility ?? ref) / ref), came = gk - births;   // (as many children as its grown ones can have)
    b[0] += births; for (let i = 0; i < 3; i++) b[i] += came * A.arrive[i];
    V.born += births; V.came += came;
  }
  sync(t);
  if (P?.kin && t.pop > 0) pullToLand(a, t);   // the land's wild tribes pull the races back a little (KIN.pull)
  t.vital = Object.fromEntries(Object.entries({...(t.book || {}), ...V}).map(([k, v]) => [k, Math.round(v * 10) / 10]));
  t.book = null;
  return t.vital;
}

// how much people like a town: its fame and how well its people live (a town not counted yet: as well as can be)
const pull = (t, fx = townFx(t)) => (1 + Math.max(0, fx.prestige)) * (t.needs?.basic ?? 1);

// whether folk of a town may move to another: the same realm; or another realm that trades with theirs, near enough,
// of their own people or of a people that welcomes them (data/peoples.js `welcome`), up to the folk the town keeps
export function mayMove(a, s, d) {
  if (s.realm === d.realm) return true;
  if (s.realm == null || d.realm == null || !trades(a, s.realm, d.realm)) return false;
  if (d.people !== s.people && (!(WORLD_PEOPLES.get(d.people).welcome || []).includes(s.people) || shareOfPeople(a, d, s.people) >= DIPLOMACY.mingleMax)) return false;
  return Math.hypot(d.x - s.x, d.y - s.y) <= TL.moveReach * WORLD_PEOPLES.get(s.people).spacing * scaleOf(a);
}

// a season of moving: people go where they like it better, as far as there is room — a town of another realm counts
// TOWN_LIFE.abroad as much (home is home); folk of another people settle as their own races among the town's (atlas/
// population.js), up to DIPLOMACY.mingleMax of it. → people moved
export function migrate(a) {
  const live = (a.towns || []).filter(t => t.alive);
  if (live.length < 2) return 0;
  const X = new Map(live.map(t => { const fx = townFx(t), rm = room(fx); return [t, {t, A: pull(t, fx), free: Math.max(0, rm - t.pop), over: Math.max(0, t.pop - rm)}]; }));   // (the town's effects once: for its room and its pull)
  let moved = 0, abroad = 0;
  for (const s of X.values()) {
    const rate = WORLD_PEOPLES.get(s.t.people).migrate || 0;
    if (!rate && !s.over) continue;
    const to = [];
    for (const d of X.values()) {
      if (d === s || d.free <= 1 || !mayMove(a, s.t, d.t)) continue;
      const A = d.A * (d.t.realm === s.t.realm ? 1 : TL.abroad);
      if (A > s.A) to.push([d, A]);
    }
    if (!to.length) continue;
    const best = Math.max(...to.map(x => x[1]));
    let go = s.over * TL.overflow + rate * s.t.pop * (1 - s.A / best);
    go = Math.min(go, Math.max(0, s.t.pop - TL.minTarget));
    if (go <= TL.moveLeast) continue;   // (fewer than this a season do not set out: TOWN_LIFE.moveLeast)
    const W = to.reduce((sum, [d, A]) => sum + A * d.free, 0);
    let left = go;
    for (const [d, A] of to) {
      const n = Math.min(d.free, go * A * d.free / W);
      if (n <= 0) continue;
      let n2 = n;
      if (d.t.people !== s.t.people) {   // newcomers of another people: their share of the town grows, up to DIPLOMACY.mingleMax
        const had = shareOfPeople(a, d.t, s.t.people) * d.t.pop;
        n2 = Math.max(0, Math.min(n, (DIPLOMACY.mingleMax * d.t.pop - had) / (1 - DIPLOMACY.mingleMax)));
      }
      if (n2 <= 0) continue;
      if (d.t.realm !== s.t.realm) abroad += n2;
      const went = moveHeads(a, s.t, d.t, n2, 'moved');   // (as they are: their races and ages go with them)
      d.free -= went; left -= went;
    }
    moved += go - left;
  }
  a.hist.moved = (a.hist.moved || 0) + moved;
  a.hist.movedAbroad = (a.hist.movedAbroad || 0) + abroad;
  return moved;
}

// the towns left with too few people: they go to the nearest town of their realm (or of their people), the town is a ruin
export function abandonEmpty(a, rnd, say) {
  for (const t of a.towns || []) {
    if (!t.alive || t.pop >= TL.abandon) continue;
    let best = null, bd = Infinity;
    for (const o of a.towns) if (o !== t && o.alive && (t.realm != null ? o.realm === t.realm : o.people === t.people)) { const d = Math.hypot(o.x - t.x, o.y - t.y); if (d < bd) { bd = d; best = o; } }
    if (best) moveHeads(a, t, best, t.pop, 'left');
    else { (a.hist.lost ||= {}).abandoned = (a.hist.lost?.abandoned || 0) + t.pop; takeHeads(a, t, t.pop, {how: 'scattered'}); }   // the last of a people: they scatter
    t.alive = false; t.died = a.hist.year;
    razeSites(a, t, a.hist.year);
    (a.ruins ||= []).push({i: t.i, x: t.x, y: t.y, name: t.name, people: t.people, realm: t.realm, by: null, year: a.hist.year, how: 'опустел'});
    say(`Последние жители покинули ${townLabel(t, 1)} ${t.name}${best ? ` и ушли в ${townLabel(best, 1)} ${best.name}` : ''}.`);
    if (t.capital) seatFallen(a, t, rnd, say);
    townGone(a, t, say);
  }
}

// the captives of a lair gone (died, cleared, beaten by a rival or a calamity — any hand) go home: each to the nearest town
// of their people; a people with no town left scatters. Each season, before the moving (atlas/history.js) → people freed
export function freeCaptives(a) {
  let freed = 0;
  for (const l of a.lairs || []) {
    if (l.alive || !l.captives) continue;
    for (const [p, n] of Object.entries(l.captives)) {
      if (!(n > 0)) continue;
      let best = null, bd = Infinity;
      for (const t of a.towns || []) if (t.alive && t.people === p) { const d = Math.hypot(t.x - l.x, t.y - l.y); if (d < bd) { bd = d; best = t; } }
      if (best) { addHeads(a, best, WORLD_PEOPLES.get(p).race, n, 1); freed += n; }   // (home as grown ones of their people's race)
    }
    l.captives = null;
  }
  return freed;
}

// people drawn to a town from the other towns of its realm (the crowned seat, campaign/ending.js): `n` of them, from each
// by its people, never below TOWN_LIFE.minTarget in a town → how many came
export function drawTo(a, t, n) {
  const from = (a.towns || []).filter(o => o.alive && o !== t && t.realm != null && o.realm === t.realm);
  const spare = o => Math.max(0, o.pop - TL.minTarget), all = from.reduce((s, o) => s + spare(o), 0);
  if (all <= 0 || n <= 0) return 0;
  const take = Math.min(n, all);
  for (const o of from) moveHeads(a, o, t, take * spare(o) / all, 'drawn');
  return take;
}
