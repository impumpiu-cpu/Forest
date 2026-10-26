// Leaders of the old lairs (data/lairs.js LEADER; docs/WORLD.md «Главари логов»). A lair is a field of strength that
// feeds, breeds and raids by chance (atlas/lairs.js); an ancient one may raise a leader, and then it thinks. The leader
// is a named creature of its kind grown past its kind's limits (as a calamity's boss, less so: agents/special.js
// bossSpecial). Each spring it may set out on a plan, at the head of a party that walks the world map as an army does
// (atlas/parties.js, kind 'leader'). The plans are the deeds of its species' row (`deeds.lair`, data/deeds.js; the code
// in atlas/deeds/: raid, expand, subdue, rival), chosen by the actor's brain (atlas/actor.js) — the leader is the first
// role of that brain, as the grazer was of the creature's.
// It leads until age takes it (a new one may rise the next years), its lair dies, it falls in a beaten raid or fight,
// or a caravan kills it (campaign/march.js). A calamity rising may take one of the living leaders as its boss
// (atlas/calamity.js). While a lair has a leader it sends no raids or broods by chance.
// The leaders draw from their own stream (seed:atlas:leaders), kept by its position in a.leadRnd.
//
// lair.leader = {name, title, species, g, special, add, born, dies, deeds}; lair.lord — the id of the lair it pays tribute to
import {mulberry, seedNumber} from '../core/rng.js';
import {LAIRS, LEADER} from '../data/lairs.js';
import {necroLabel} from './necro.js';
import {TITLE, makeName} from '../data/names.js';
import {SPECIES} from '../data/species.js';
import {bossSpecial} from '../agents/special.js';
import {BEHAVIOURS, sendParty, goHome} from './parties.js';
import {wherePhrase, power} from './lairs.js';
import {actorStep} from './actor.js';
import {DOES} from './deeds/index.js';

const between = (r, [lo, hi]) => lo + r() * (hi - lo);
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
export function raise(a, l, r) {
  const L = LAIRS.get(l.kind), sp = SPECIES.get(L.species), mind = sp.kind === 'undead' ? 'undead' : sp.kind === 'fiend' ? 'fiend' : sp.mind || 'beast';
  // the name from data/names.js: a thinking one — a name of its race and a nickname («Хракк Тихий»), the rest — a nickname
  const title = TITLE[mind] || TITLE.beast;
  // a necromancer was one of the living about (atlas/necro.js): his name is of his race
  const name = makeName(mind === 'sentient' ? (l.race && SPECIES.has(l.race) ? l.race : L.species) : null, r, {nick: 'always'});
  const add = Object.fromEntries(LEADER.stats.map(id => [id, Math.round(between(r, LEADER.add))]));
  const roll = sp.special ? bossSpecial(sp, r, {stats: [], add: [0, 0], cap: LEADER.cap}) : {special: null};
  if (roll.special) for (const id of LEADER.stats) roll.special[id] = Math.min(LEADER.cap, roll.special[id] + add[id]);
  const y = a.hist.year;
  l.leader = {name, title, species: L.species, ...(l.race ? {race: l.race} : {}), g: 'm', special: roll.special, add, born: y, dies: y + Math.round(between(r, LEADER.life)), deeds: 0};
  l.heirAt = null;
  return `${cap1(L.label)} «${l.name}» ${wherePhrase(a, l.i)}: поднялся ${title[0].toLowerCase()} — ${name}, ${l.race ? necroLabel(l.race) : sp.label} сильнее всех своих. Теперь ${sp.plural} оттуда не бродят, а ходят за ним.`;
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

// the leader's role for the actor's brain (atlas/actor.js): the deeds of its species' lairs, the party it has out, and how
// it sets out — one party at a time, its might the lair's strength × its kind's power × LEADER.might, with luck
const mightOf = (l, L, r) => l.strength * power(L.species) * (L.might || 1) * LEADER.might * (LEADER.luck[0] + LEADER.luck[1] * r());
export const partyOf = (a, l) => (a.parties || []).find(p => p.kind === 'leader' && p.owner === l.id && p.state !== 'gone') || null;
const leaderRole = {
  list: [],   // set per leader: its species' deeds.lair
  party: partyOf,
  setOut(a, l, [plan, , , d], {L, r, say}) {
    const p = sendParty(a, 'leader', l.i, plan.goal, {owner: l.id, plan: d.id, target: plan.target ?? null, might: mightOf(l, L, r),
      speed: L.flies ? 'flight' : L.riders ? 'rider' : 'foot', label: `${leaderName(l)} (${SPECIES.get(L.species).plural})`, color: L.color, leader: true});
    if (!p) return;
    // only a raid is told as it sets out (the towns see it coming); the rest — when it is done
    const line = DOES[d.id].told?.(a, l, plan);
    if (line) say(line);
  },
};

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
    if (!lord?.alive || (!lord.leader && !LAIRS.get(lord.kind).domain)) { v.lord = null; continue; }   // (a necromancer's tower is a seat with a leader or without)
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
  // the plans: a leader with a party out waits for it; the rest think with LEADER.think, by the deeds of their species
  for (const l of livingLeaders(a)) {
    if (partyOf(a, l) || r() >= LEADER.think) continue;
    const L = LAIRS.get(l.kind), sp = SPECIES.get(L.species);
    actorStep(a, l, {...leaderRole, list: sp.deeds?.lair || []}, {L, sp, role: 'leader', season: 'spring', r, say});
  }
  done();
}

// the leader's party arrives: the deed it came for does its work (atlas/deeds/), and the party goes home
BEHAVIOURS.leader = {
  arrive(a, p, rnd, say) {
    const l = a.lairs.find(x => x.id === p.owner), L = l && LAIRS.get(l.kind);
    if (l?.alive && l.leader) DOES[p.plan]?.arrive?.(a, p, l, L, rnd, say);
    goHome(a, p);
  },
  home(a, p) {
    const l = a.lairs.find(x => x.id === p.owner);
    if (l?.alive) DOES[p.plan]?.home?.(a, p, l);
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

