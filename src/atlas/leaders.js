// Leaders of the old lairs (data/lairs.js LEADER; docs/WORLD.md «Главари логов»). A lair is a field of strength that
// feeds, breeds and raids by chance (atlas/lairs.js); an ancient one may raise a leader, and then it thinks. The leader
// is a named creature of its kind grown past its kind's limits (as a calamity's boss, less so: agents/special.js
// bossSpecial). Each spring it may set out on a plan, at the head of a party that walks the world map as an army does
// (atlas/parties.js, kind 'leader'):
//   raid    — on a town in its reach that it can hope to beat; the loot feeds its lair, a beating may kill it
//   expand  — leads a brood out to found a daughter lair, which holds to it as a vassal
//   subdue  — goes to a weaker lair near it and brings it under its hand: a vassal pays tribute every year
//   rival   — goes to war on a rival lair: the loser is thinned or wiped out
// It leads until age takes it (a new one may rise the next years), its lair dies, it falls in a beaten raid or fight,
// or a caravan kills it (campaign/march.js). A calamity rising may take one of the living leaders as its boss
// (atlas/calamity.js). While a lair has a leader it sends no raids or broods by chance.
// The leaders draw from their own stream (seed:atlas:leaders), kept by its position in a.leadRnd.
//
// lair.leader = {name, title, species, g, special, add, born, dies, deeds}; lair.lord — the id of the lair it pays tribute to
import {mulberry, seedNumber} from '../core/rng.js';
import {LAIRS, LEADER, TRIBE_RAID} from '../data/lairs.js';
import {TITLE, makeName} from '../data/names.js';
import {SPECIES} from '../data/species.js';
import {RELATIONS} from '../data/relations.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {bossSpecial} from '../agents/special.js';
import {BEHAVIOURS, sendParty, goHome} from './parties.js';
import {newLair, findSpot, wherePhrase, strikeTown, power, R, groundFits} from './lairs.js';
import {townLabel} from './towns.js';
import {scaleOf} from './tectonics.js';

const between = (r, [lo, hi]) => lo + r() * (hi - lo);
const pick = (r, list) => list[(r() * list.length) | 0];
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const cap1 = s => s[0].toUpperCase() + s.slice(1);

function draw(a) {
  const r = mulberry(a.leadRnd ?? seedNumber(`${a.cfg.seed}:atlas:leaders`));
  return {r, done: () => { a.leadRnd = r.state; }};
}

// the lairs that may raise a leader: ancient, not a dragon's (it is one beast), not a vampire's manor, not a boss's
export const canLead = (l, L = LAIRS.get(l.kind)) => l.alive && l.ancient && l.boss == null && !L.dragon && L.at !== 'town';
export const leaderName = l => `${l.leader.title[0]} ${l.leader.name}`;
export const livingLeaders = a => (a.lairs || []).filter(l => l.alive && l.leader);

// a new leader for a lair
function raise(a, l, r) {
  const L = LAIRS.get(l.kind), sp = SPECIES.get(L.species), mind = sp.kind === 'undead' ? 'undead' : sp.kind === 'fiend' ? 'fiend' : sp.mind || 'beast';
  // the name from data/names.js: a thinking one — a name of its race and a nickname («Хракк Тихий»), the rest — a nickname
  const title = TITLE[mind] || TITLE.beast;
  const name = makeName(mind === 'sentient' ? L.species : null, r, {nick: 'always'});
  const add = Object.fromEntries(LEADER.stats.map(id => [id, Math.round(between(r, LEADER.add))]));
  const roll = sp.special ? bossSpecial(sp, r, {stats: [], add: [0, 0], cap: LEADER.cap}) : {special: null};
  if (roll.special) for (const id of LEADER.stats) roll.special[id] = Math.min(LEADER.cap, roll.special[id] + add[id]);
  const y = a.hist.year;
  l.leader = {name, title, species: L.species, g: 'm', special: roll.special, add, born: y, dies: y + Math.round(between(r, LEADER.life)), deeds: 0};
  l.heirAt = null;
  return `${cap1(L.label)} «${l.name}» ${wherePhrase(a, l.i)}: поднялся ${title[0].toLowerCase()} — ${name}, ${sp.label} сильнее всех своих. Теперь ${sp.plural} оттуда не бродят, а ходят за ним.`;
}

// the leader is gone: its lair is a field again; the vassals go free when their lord's lair has no leader
export function leaderFalls(a, l, how, say) {
  if (!l?.leader) return;
  const who = leaderName(l), L = LAIRS.get(l.kind);
  (a.fallenLeaders ||= []).push({lair: l.id, name: who, species: l.leader.species, year: a.hist.year, how, deeds: l.leader.deeds});
  l.leader = null;
  if (how === 'age') l.heirAt = a.hist.year + 1;
  say?.({age: `Умер своей смертью ${who}, хозяин «${l.name}» (${L.label}): логово ждёт нового.`,
    beaten: `${who} пал в бою, и «${l.name}» осталось без главаря.`,
    lair: `${who} сгинул вместе с «${l.name}».`,
    caravan: `${who} из «${l.name}» убит караваном.`,
    boss: null}[how] || `${who} из «${l.name}» пропал.`);
}

// where it can go: its reach on the world map (× the tribes' raid reach)
const reachOf = a => TRIBE_RAID.reach * LEADER.reach * scaleOf(a);
const mightOf = (l, L, r) => l.strength * power(L.species) * (L.might || 1) * LEADER.might * (0.6 + 0.8 * r());
const raider = (L, t) => {
  const race = SPECIES.get(L.species);
  if (L.undead || L.fiend || !race.rel) return true;   // the dead, the demons and the beasts go for anyone
  return (RELATIONS[race.rel]?.[SPECIES.get(WORLD_PEOPLES.get(t.people).race).rel] ?? 0) < 0;
};

// the plans it could follow now, with their weights → [{plan, goal, target?, weight}]
function plansOf(a, l, L, r) {
  const out = [], reach = reachOf(a), W = LEADER.plans;
  // a raid: the nearest town in reach it may hope to beat
  let town = null, td = reach;
  for (const t of a.towns || []) if (t.alive && raider(L, t)) { const d = dist(l, t); if (d < td) { td = d; town = t; } }
  // a beast's leader goes for a town less often than a thinking one: it is the herds and the woods it hunts (beastRaid)
  const beast = (SPECIES.get(L.species).mind || 'beast') === 'beast';
  if (town) out.push({plan: 'raid', goal: town.i, target: town.id, weight: W.raid * (beast ? LEADER.beastRaid : 1)});
  // a brood led out: when the lair is strong and its kind not too many
  if (l.strength > 0.6 && a.lairs.filter(o => o.alive && o.kind === L.id).length < L.max * 1.5) {
    const i = findSpot(a, L, r, l, 60);
    if (i >= 0) out.push({plan: 'expand', goal: i, weight: W.expand});
  }
  // a weaker lair near: of any kind but a boss's, a dragon's or one that already has a leader or a lord
  const sub = (a.lairs || []).filter(o => o.alive && o !== l && o.boss == null && !o.leader && o.lord == null && !LAIRS.get(o.kind).dragon && LAIRS.get(o.kind).at !== 'town'
    && dist(o, l) <= LEADER.subdue.reach * (R(a, L) + R(a, LAIRS.get(o.kind))));
  const rivals = sub.filter(o => L.rivals.includes(o.kind)), meek = sub.filter(o => !L.rivals.includes(o.kind));
  if (meek.length) { const o = meek.sort((p, q) => dist(p, l) - dist(q, l))[0]; out.push({plan: 'subdue', goal: o.i, target: o.id, weight: W.subdue}); }
  if (rivals.length) { const o = rivals.sort((p, q) => dist(p, l) - dist(q, l))[0]; out.push({plan: 'rival', goal: o.i, target: o.id, weight: W.rival}); }
  return out;
}

const WHAT = {raid: 'выступил в набег', expand: 'вышел с выводком искать новое логово', subdue: 'выступил подчинять соседей', rival: 'выступил войной на соперников'};

// ── a year of the leaders (spring): age, new leaders, tribute, plans
export function stepLeaders(a, say) {
  if (!a.lairs || a.hist.season !== 0) return;
  const {r, done} = draw(a), y = a.hist.year;
  for (const l of a.lairs) {
    if (!l.leader) continue;
    if (!l.alive) { leaderFalls(a, l, 'lair', say); continue; }
    if (y >= l.leader.dies) leaderFalls(a, l, 'age', say);
  }
  // vassals pay their lords; a lord's lair gone or without a leader frees them
  for (const v of a.lairs) {
    if (!v.alive || v.lord == null) continue;
    const lord = a.lairs.find(o => o.id === v.lord);
    if (!lord?.alive || !lord.leader) { v.lord = null; continue; }
    const t = LEADER.tribute * v.strength;
    lord.strength = Math.min(1, lord.strength + t); v.strength = Math.max(0, v.strength - t / 2);
  }
  // new leaders in the old lairs, up to the world's limit
  let n = livingLeaders(a).length;
  for (const l of a.lairs) {
    if (n >= LEADER.max) break;
    if (l.leader || !canLead(l)) continue;
    const chance = l.heirAt != null && y >= l.heirAt ? LEADER.heir : LEADER.chance;
    if (r() >= chance) continue;
    say(raise(a, l, r)); n++;
  }
  // the plans: at most one party a leader at a time
  for (const l of livingLeaders(a)) {
    if ((a.parties || []).some(p => p.kind === 'leader' && p.owner === l.id && p.state !== 'gone') || r() >= LEADER.think) continue;
    const L = LAIRS.get(l.kind), options = plansOf(a, l, L, r);
    if (!options.length) continue;
    let u = r() * options.reduce((s, o) => s + o.weight, 0), o = options[0];
    for (const x of options) { u -= x.weight; if (u <= 0) { o = x; break; } }
    const p = sendParty(a, 'leader', l.i, o.goal, {owner: l.id, plan: o.plan, target: o.target ?? null, might: mightOf(l, L, r),
      speed: L.flies ? 'flight' : L.riders ? 'rider' : 'foot', label: `${leaderName(l)} (${SPECIES.get(L.species).plural})`, color: L.color, leader: true});
    if (!p) continue;
    // only a raid is told as it sets out (the towns see it coming); the rest — when it is done
    const goal = o.plan === 'raid' ? a.towns.find(t => t.id === o.target) : null;
    if (goal) say(`${leaderName(l)} из «${l.name}» ${WHAT.raid}: на ${townLabel(goal, 1)} ${goal.name}.`);
  }
  done();
}

// the leader's party arrives: it does what it came for and goes home
BEHAVIOURS.leader = {
  arrive(a, p, rnd, say) {
    const l = a.lairs.find(x => x.id === p.owner), L = l && LAIRS.get(l.kind);
    if (!l?.alive || !l.leader) { goHome(a, p); return; }
    const who = leaderName(l);
    if (p.plan === 'raid') {
      const t = a.towns.find(x => x.id === p.target);
      if (t?.alive) {
        const line = strikeTown(a, l, L, t, p.might, rnd, false);
        p.loot = /погибло/.test(line) ? TRIBE_RAID.loot : 0;
        say(`${line} Вёл их ${who}.`);
        if (p.loot) l.leader.deeds++;
        else if (rnd() < LEADER.fall) leaderFalls(a, l, 'beaten', say);
      }
    } else if (p.plan === 'expand') {
      if (groundFits(a, L, p.goal) && !a.lairs.some(o => o.alive && o.kind === L.id && dist(o, {x: p.goal % a.w, y: (p.goal / a.w) | 0}) < 2 * R(a, L))) {
        const young = newLair(a, L, p.goal, rnd, LEADER.young);
        young.lord = l.id; l.strength *= 0.8; l.leader.deeds++;
        say(`${who} увёл молодых из «${l.name}» и основал «${young.name}» ${wherePhrase(a, p.goal)}: новое логово под его рукой.`);
      }
    } else {
      const o = a.lairs.find(x => x.id === p.target), Lo = o && LAIRS.get(o.kind);
      if (o?.alive && !o.leader && o.boss == null) {
        const theirs = o.strength * power(Lo.species) * (Lo.might || 1) * (0.6 + 0.8 * rnd());
        if (p.plan === 'subdue' && p.might >= theirs * LEADER.subdue.ratio) {
          o.lord = l.id; l.leader.deeds++;
          say(`${who} из «${l.name}» подчинил «${o.name}»: ${SPECIES.get(Lo.species).plural} оттуда платят ему данью.`);
        } else if (p.might >= theirs) {
          o.strength *= LEADER.beat; l.leader.deeds++;
          if (o.strength < 0.12) { o.alive = false; o.died = a.hist.year; say(`${who} из «${l.name}» разорил «${o.name}» ${wherePhrase(a, o.i)}.`); }
          else say(`${who} из «${l.name}» разбил ${SPECIES.get(Lo.species).plural} «${o.name}» и отогнал их.`);
        } else {
          l.strength *= 0.75;
          say(`${SPECIES.get(Lo.species).plural.replace(/^./, c => c.toUpperCase())} «${o.name}» отбились от ${l.leader.title[1].toLowerCase()} ${l.leader.name}.`);
          if (rnd() < LEADER.fall) leaderFalls(a, l, 'beaten', say);
        }
      }
    }
    goHome(a, p);
  },
  home(a, p) {
    const l = a.lairs.find(x => x.id === p.owner);
    if (l?.alive && p.loot) l.strength = Math.min(1, l.strength + p.loot);
  },
};

// what a calamity takes when it rises on a living leader (atlas/calamity.js): the strongest of those whose lair is of
// one of the kinds it may rise in → the lair, or null
// `fits(lair)` — where the calamity may rise (after the wild era: within a raid's reach of the peoples' towns)
export function leaderForCalamity(a, kinds, fits = () => true) {
  const list = livingLeaders(a).filter(l => kinds.includes(l.kind) && fits(l));
  if (!list.length) return null;
  return list.sort((p, q) => q.strength * power(LAIRS.get(q.kind).species) - p.strength * power(LAIRS.get(p.kind).species))[0];
}

// the leader of the lair whose party a caravan beat (campaign/march.js): it is dead
export function leaderSlain(a, lairId, say) {
  const l = (a.lairs || []).find(x => x.id === lairId);
  if (l?.leader) leaderFalls(a, l, 'caravan', say);
}

