// How the realms of the world map get on (data/diplomacy.js, atlas/realms.js): attitudes that move
// with shared land, trade, raids and wars; trade routes; folk of one people settling in the other's
// towns; wars with battles between their nearest towns, burnt towns left as ruins and battlefields
// left as barrows; orc raids; peace when the war has worn both out. Two realms of one race deal with
// each other like any two, starting from their race's memory of itself (data/relations.js).
//
// a.rel = {'rA:rB': {att, war: {since, battles, razed, turn, mustered} | null, wars, routes, met, border, front: [townA, townB] | null, kin}};  a.ruins = [{...}]
// a.f.barrows — 0 … 1, the old graves of battles (the «barrows» biome share of a cell, atlas/biomes.js)
import {plunder, plunderWords} from './treasury.js';
import {TOWN_MONEY, TOWN_FX} from '../data/townBuildings.js';
import {golemMen} from './golems.js';
import {DIPLOMACY} from '../data/diplomacy.js';
import {ROT} from '../data/lairs.js';
import {WORLD_PEOPLES, TIERS} from '../data/peoples.js';
import {ROADS} from '../data/roads.js';
import {RELATIONS} from '../data/relations.js';
import {SPECIES} from '../data/species.js';
import {ALIGN, ALIGN_DRIFT, shiftAlign} from '../data/values.js';
import {scaleOf} from './tectonics.js';
import {townFx, might, raidShare, townLabel} from './towns.js';
import {raidSite, razeSites} from './sites.js';
import {realmOf, realmPeople, realmLabel, realmLabelGen, seatFallen, stepRealms} from './realms.js';
import {laneBetween} from './sea.js';
import {ARMY} from '../data/parties.js';
import {SEASON_DAYS} from '../data/atlas.js';
import {allianceStay} from './alliance.js';
import {tell, fallToAlliance} from './calamity.js';
import {BEHAVIOURS, sendParty, goHome} from './parties.js';

const D = DIPLOMACY;

// a people's old feeling for another (data/relations.js), −3 … +3; a race remembers itself too
export function feeling(p, q) {
  const a = SPECIES.get(WORLD_PEOPLES.get(p).race).rel, b = SPECIES.get(WORLD_PEOPLES.get(q).race).rel;
  return RELATIONS[a]?.[b] ?? 0;
}
// a realm's point on the compass (data/values.js); a world saved before realms had one goes by its race's
export const realmAlign = (a, p) => { const r = realmOf(a, p); return r?.align || SPECIES.get(WORLD_PEOPLES.get(r.people).race).align || null; };
// how their world views bring two realms together or apart: +ALIGN.near at one point of the compass, down to
// ALIGN.far at ALIGN.span apart and beyond
export function compassFeeling(A, B) {
  if (!A || !B) return 0;
  const d = Math.hypot(A.order - B.order, A.mercy - B.mercy);
  return ALIGN.near + (ALIGN.far - ALIGN.near) * Math.min(1, d / ALIGN.span);
}
// what two realms start from and drift back to: the worse of their races' memories of each other, and how near
// their world views are (two realms of one race may be far apart: the stern and the gentle dwarves)
export const memory = (a, p, q) => {
  const P = realmPeople(a, p), Q = realmPeople(a, q);
  return Math.min(feeling(P, Q), feeling(Q, P)) + compassFeeling(realmAlign(a, p), realmAlign(a, q));
};

// once a year: the world view of each realm moves with what it lives through (data/values.js ALIGN_DRIFT) — wars
// harden it, a trading peace softens it, a long rule under one seat settles it into law (a burnt seat: atlas/realms.js),
// and it is pulled back towards the point it was founded at (`root`)
function driftRealms(a) {
  const R = ALIGN_DRIFT.realm, year = a.hist.year;
  for (const r of a.realms || []) {
    if (r.fallen != null || !r.align) continue;
    let wars = 0, routes = 0;
    for (const [kk, rel] of Object.entries(a.rel || {})) {
      const [p, q] = kk.split(':'); if (p !== r.id && q !== r.id) continue;
      if (rel.war) wars++; routes += rel.routes || 0;
    }
    const root = r.root || SPECIES.get(WORLD_PEOPLES.get(r.people).race).align;
    shiftAlign(r, 'mercy', R.back * (root.mercy - r.align.mercy) + (wars ? R.war * wars : routes ? R.peace : 0));
    shiftAlign(r, 'order', R.back * (root.order - r.align.order) + (year - (r.seatSince ?? r.founded) >= R.ruleFrom ? R.rule : 0));
  }
}

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
function raze(a, t, by, how, rnd, say) {
  t.alive = false; t.died = a.hist.year;
  razeSites(a, t, a.hist.year);   // its works burn with it
  barrows(a, t.i, Math.max(2, Math.round(2 * scaleOf(a))), ROT.ruinGraves);   // the dead of a burnt town
  a.ruins ||= [];
  a.ruins.push({i: t.i, x: t.x, y: t.y, name: t.name, people: t.people, realm: t.realm, by, year: a.hist.year, how});
  if (t.capital) seatFallen(a, t, rnd, say);
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

export const fight = (t, rnd) => might(t, townFx(t)) * (0.6 + 0.8 * rnd());

// ── armies (data/parties.js ARMY). A realm at war musters an army at its town nearest the enemy:
// a levy of the town's people with the town's arms; it marches to the enemy's town and lays siege.
// Each day of the siege the besiegers burn the town's works and eat its stock; when the town is
// starved or the siege has gone on long enough the army assaults. The foragers of a marching or
// besieging army scourge the land around it (a.f.scourge): the works there yield nothing.
const armyMight = (men, fx) => Math.sqrt(men) * (1 + 0.3 * fx.prod + 0.5 * fx.defence);
export function muster(a, t, target, war, rnd, say) {
  const A = ARMY, men = Math.round(A.levy * (WORLD_PEOPLES.get(t.people)?.levy ?? 1) * t.pop);   // a horde sends half its people (data/peoples.js levy)
  if (men < A.minMen || !target.alive) return;
  const fx = townFx(t), R = realmOf(a, t.realm);
  // the beasts of its pens and stables go too: horses for the riders, and the horde drives all its herds and war beasts ahead
  // of it to the slaughter (data/peoples.js beastLevy; each a TOWN_FX.beastMen of men)
  const beasts = Math.floor((t.stock?.beasts || 0) * (WORLD_PEOPLES.get(t.people)?.beastLevy ?? A.beasts));
  const p = sendParty(a, 'army', t.i, target.i, {owner: t.realm, from: t.id, target: target.id, war, men, men0: men, beasts, might: armyMight(men + (golemMen(t) + (t.warBeasts?.men || 0)) + beasts * TOWN_FX.beastMen, fx) * A.might,
    supplies: A.supplies, people: t.people, speed: 'foot', label: `войско ${realmLabelGen(a, t.realm)}`, color: R?.color || WORLD_PEOPLES.get(t.people).color, burnt: 0});
  if (!p) return;
  t.pop -= men; if (beasts) { t.stock.beasts -= beasts; if (t.stock.beasts <= 0) delete t.stock.beasts; }
  say(`${cap1(realmLabel(a, t.realm))} собрали в ${townLabel(t, 3)} ${t.name} войско в ${men} бойцов${beasts ? ` и погнали с ним ${beasts} зверей` : ''} и двинулись на ${townLabel(target, 1)} ${target.name}.`);
}
// the foragers: the land around the army is scourged this season
function scourge(a, p) {
  const f = a.f.scourge ||= new Float32Array(a.n), r = ARMY.scourge * scaleOf(a), x0 = p.x | 0, y0 = p.y | 0, rr = Math.ceil(r);
  for (let y = Math.max(0, y0 - rr); y <= Math.min(a.h - 1, y0 + rr); y++) for (let x = Math.max(0, x0 - rr); x <= Math.min(a.w - 1, x0 + rr); x++)
    if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) <= r) f[y * a.w + x] = 1;
}
// the war the army was sent to is over (peace made while it marched or sat under the walls): it turns home
function warOver(a, p) { return !a.rel[p.war]?.war; }
function armyDay(a, p, rnd, say) {
  if (p.ally == null && p.state !== 'home' && warOver(a, p)) {   // an alliance's army has no war to end (atlas/alliance.js)
    say(`${cap1(p.label)} ${p.state === 'stay' ? 'сняло осаду' : 'повернуло назад'}: заключён мир.`);
    goHome(a, p); return;
  }
  p.supplies--;
  if (p.supplies < 0) { p.men *= 1 - ARMY.attrition; if (p.state === 'go') goHome(a, p); }
  if (p.state === 'stay' || p.days % 3 === 0) scourge(a, p);
}
BEHAVIOURS.army = {
  day: armyDay,
  arrive(a, p, rnd, say) {
    if (p.lair != null) {   // an alliance's army at a boss's lair: it waits for the others (atlas/alliance.js)
      const l = a.lairs.find(x => x.id === p.lair);
      if (!l || !l.alive) { goHome(a, p); return; }
      p.state = 'stay'; say(`${cap1(p.label)} встало у «${l.name}»: ждёт войска союзников.`); return;
    }
    const t = a.towns.find(t => t.id === p.target);
    if (!t || !t.alive) { goHome(a, p); return; }
    p.state = 'stay'; p.siege = {stock: Math.round(ARMY.stock * SEASON_DAYS * (1 + ARMY.stockFood * townFx(t).food)), starved: 0, pop0: t.pop};
    say(`${cap1(p.label)} осадило ${townLabel(t, 1)} ${t.name}.`);
  },
  stay(a, p, rnd, say) {
    if (p.lair != null) {
      const A = (a.alliances || []).find(x => x.id === p.ally), c = A && a.calamities?.find(x => x.id === A.calamity);
      allianceStay(a, p, rnd, t => tell(a, t, c), line => c && fallToAlliance(a, c, line));
      return;
    }
    const t = a.towns.find(t => t.id === p.target), A = ARMY, S = p.siege;
    if (!t || !t.alive) { goHome(a, p); return; }
    if (rnd() < A.burn && raidSite(a, t, rnd)) { p.burnt++; p.supplies += A.forage; }   // the besiegers eat what they take
    if (S.stock > 0) S.stock--; else { const d = t.pop * A.starve; t.pop -= d; S.starved += d; }
    const fx = townFx(t), town = might(t, fx);
    const ready = p.might >= A.assaultAt * town || p.stay >= A.longest || p.supplies < 0;
    if (!ready) return;
    const r = a.rel[p.war]; if (r?.war) r.war.battles++;
    const we = p.might * (0.6 + 0.8 * rnd()), they = town * (0.6 + 0.8 * rnd());
    const hunger = S.starved > 0 ? `, в ${townLabel(t, 3)} умерло от голода ${Math.round(S.starved)}` : '', burnt = p.burnt ? `, сожжено угодий: ${p.burnt}` : '';
    barrows(a, battlefield(a, t, {x: p.x, y: p.y}), DIPLOMACY.barrows * Math.max(1, Math.round(scaleOf(a))));
    if (we > they) {
      const loss = (D.battleLoss[0] + (D.battleLoss[1] - D.battleLoss[0]) * rnd()) * raidShare(fx);
      t.pop *= 1 - loss; p.men *= 1 - A.winLoss; t.raided = a.hist.year;
      const loot = plunderWords(plunder(a.towns.find(o => o.id === p.from && o.alive), t, TOWN_MONEY.plunder.storm));   // the storm's loot goes home with the army
      if (t.pop < D.raze || t.pop < D.razeShare * TIERS[t.tier].pop || t.pop < A.broken * S.pop0) {   // beaten down, bled, or broken by the siege
        say(`${cap1(p.label)} взяло штурмом и сожгло ${townLabel(t, 1)} ${t.name}: осталось пепелище${burnt}${hunger}${loot}.`);
        raze(a, t, p.owner, 'war', rnd, say); if (r?.war) r.war.razed++;
      } else say(`${cap1(p.label)} взяло штурмом ${townLabel(t, 1)} ${t.name} и разграбило ${townLabel(t, 1)}: погибло ${Math.round(loss * 100)}% жителей${burnt}${hunger}${loot}.`);
    } else {
      p.men *= 1 - A.beatenLoss;
      say(`${cap1(WORLD_PEOPLES.get(t.people).label)} ${townLabel(t, 2)} ${t.name} отбили штурм ${p.label.replace(/^войско /, 'войска ')} и сняли осаду${burnt}${hunger}.`);
    }
    goHome(a, p);
  },
  home(a, p) {
    const t = a.towns.find(t => t.id === p.from);
    if (t && t.alive) { t.pop += Math.round(p.men); if (p.beasts && p.men0) { const back = Math.floor(p.beasts * p.men / p.men0); if (back > 0) (t.stock ||= {}).beasts = (t.stock.beasts || 0) + back; } }   // the beasts that lived come back with it
  },
  lost(a, p, rnd, say) { say(`${cap1(p.label)} не дошло до ${(() => { const t = a.towns.find(t => t.id === p.target); return t ? `${townLabel(t, 2)} ${t.name}` : 'цели'; })()} и повернуло назад.`); },
};
// the scourge of the foragers fades
export function fadeScourge(a) { if (a.f.scourge) for (let i = 0; i < a.n; i++) a.f.scourge[i] *= ARMY.scourgeFade; }

// a year of the peoples' dealings — the body of their relations: trade routes and mingling, the attitude's drift, the
// front; the deeds (war, peace, the armies, the orcs' raids) are the realms' own, atlas/deeds/. `overlap(p, q)` is the
// share of their land they share
export function stepDiplomacy(a, rnd, say, overlap) {
  driftRealms(a);
  const k = scaleOf(a), H = a.hist, towns = a.towns.filter(t => t.alive);
  // a people that will not have strangers (data/peoples.js folk.expel: the dwarves) pushes them out of its towns
  for (const t of towns) {
    const ex = WORLD_PEOPLES.get(t.people)?.folk?.expel; if (!ex || !t.folk) continue;
    for (const [y, v] of Object.entries(t.folk)) {
      const now = Math.max(0, v - ex);
      if (v >= D.folkSeen && now < D.folkSeen && t.tier >= 1) say(`Из ${townLabel(t, 2)} ${t.name} выжили чужаков: ${WORLD_PEOPLES.get(y).label} уходят.`);
      if (now > 0) t.folk[y] = now; else delete t.folk[y];
    }
  }
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
      for (const t of towns) if (t.realm === p) for (const o of towns) if (o.realm === q && ((Math.hypot(t.x - o.x, t.y - o.y) <= ROADS.reach * k &&
        a.f.road[t.i] >= ROADS.levels[0].wear && a.f.road[o.i] >= ROADS.levels[0].wear) || laneBetween(a, t, o))) {
        routes += t.built.includes('mint') || o.built.includes('mint') || t.built.includes('tradepost') || o.built.includes('tradepost') ? 2 : 1;   // coin and a trading post carry further than barter
        // folk of each settle in the other's town (of another race; kin need no settling)
        if (!kin) for (const [x, y] of [[t, o.people], [o, t.people]]) {
          x.folk ||= {};
          const was = x.folk[y] || 0, take = WORLD_PEOPLES.get(x.people)?.folk?.take ?? 1;   // (the dwarves take few, the humans many: data/peoples.js folk)
          x.folk[y] = Math.min(D.mingleMax, was + D.mingle * take);
          if (was < 0.1 && x.folk[y] >= 0.1 && x.tier >= 1) say(`В ${townLabel(x, 3)} ${x.name} осели ${label(y)}: каждый десятый там теперь из них.`);
        }
      }
      if (routes && !r.routes) say(`Между землями ${realmLabelGen(a, p)} и ${realmLabelGen(a, q)} пошли первые караваны.`);
      r.routes = routes;
    }
    // shared land sours two races; two realms of one race share their own land freely
    const sh = kin ? 0 : overlap(P, Q), [pair, gap] = nearest(p, q);
    const tw = Math.max(WORLD_PEOPLES.get(P)?.trade ?? 1, WORLD_PEOPLES.get(Q)?.trade ?? 1);   // a trading people warms faster (data/peoples.js trade: the humans)
    r.att += D.drift * Math.sign(old - r.att) * Math.min(1, Math.abs(old - r.att)) - D.pressure * sh + (r.att < old + D.tradeCeil ? Math.min(D.tradeMax * tw, D.trade * tw * routes) : 0);
    // the front, for the realms' deeds (atlas/deeds/warOn.js, march.js): whether the two border — shared land or towns
    // within the front — and the nearest pair of their towns
    r.border = sh > 0 || gap <= D.front * k; r.front = pair && gap <= D.front * k ? [pair[0].id, pair[1].id] : null; r.kin = kin;
    if (r.war) r.att += D.weariness;   // a war wears both out; who ends it, and who marches, is the realms' choice (atlas/deeds/)
    r.att = Math.max(-5, Math.min(5, r.att));
  }
  stepRealms(a, rnd, say);
}

export const ruinAt = (a, i) => (a.ruins || []).find(r => Math.abs(r.x - i % a.w) <= 1 && Math.abs(r.y - ((i / a.w) | 0)) <= 1) || null;
