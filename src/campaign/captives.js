// Captives in the campaign (docs/CAPTIVES.md; numbers: data/captives.js). A captive walks with the caravan as a
// member with role 'captive' and `m.captive = {since, bonds, from}`: it eats a ration and carries a load like
// anyone, but adds nothing to the caravan's might, takes no place among those who joined, never carries the
// crown, gets no weapon. The bonds come from the baggage (K.cargo): rope, bronze or iron shackles.
//   free(K), held(K)            — those who walk free, those held
//   takeAuto(a, K, d, r, say)   — after a fight won in the quick mode: one or two of the fallen bound
//   takeFromCamp(a, K, o, say)  — the captives the camp on the local map took (campaign/camp.js outcome)
//   bondsSets(K)                — how many more the baggage can bind
import {BONDS, CAPTIVE, ESCAPE, FREEDOM, bestBonds} from '../data/captives.js';
import {CAMPAIGN} from '../data/campaign.js';
import {assign} from './baggage.js';
import {SPECIES} from '../data/species.js';
import {plural} from '../core/util.js';
import {makeMember} from './start.js';

const C = CAPTIVE.campaign;
export const free = K => K.members.filter(m => m.alive && !m.captive);
export const held = K => K.members.filter(m => m.alive && m.captive);
export const bondsSets = K => BONDS.all().reduce((n, b) => n + Math.floor((K.cargo[b.resource] || 0) / b.n), 0);
export const isBonds = id => BONDS.all().some(b => b.resource === id);
const room = K => CAPTIVE.max - held(K).length;

function spend(K) {
  const B = bestBonds(K.cargo); if (!B) return null;
  K.cargo[B.resource] -= B.n;
  if (K.cargo[B.resource] <= 0) delete K.cargo[B.resource];
  return B;
}

const gen = (m, a, b) => (m.gender === 'f' ? b : a);
const who = m => `${m.name} (${SPECIES.get(m.race).label})`;
const names = list => list.join(', ');

// after a fight won in the quick mode: the fallen who can be bound — one, now and then two
export function takeAuto(a, K, d, r, say) {
  const p = C.auto[d.kind]; if (!p || r() >= p) return [];
  const n = 1 + (r() < C.two ? 1 : 0), got = [];
  const races = C.races[d.kind] || ['human'];
  for (let q = 0; q < n && room(K) > 0; q++) {
    const B = spend(K); if (!B) break;
    const race = races[(r() * races.length) | 0];
    const m = makeMember(K, r, {race, role: 'captive', gear: C.gear, captive: {since: K.day, bonds: B.id, from: d.kind, will: ESCAPE.will.start}});
    m.hp = 0.3 + r() * 0.3;   // bound where it fell: badly hurt
    K.members.push(m); got.push(m);
  }
  if (got.length) say(`Упавших врагов перевязали и связали: ${names(got.map(who))}. Пленн${got.length > 1 ? 'ые идут' : 'ый идёт'} с караваном.`, 'people', got.map(m => m.id));
  K.stats.captives = (K.stats.captives || 0) + got.length;
  return got;
}

// the captives a camp on the local map took: their bodies, names and gear as the map left them
export function takeFromCamp(a, K, o, say) {
  const got = [];
  for (const t of o.taken || []) {
    if (room(K) <= 0) break;
    const m = {id: (K.nextMember = (K.nextMember || K.members.length) + 1), name: t.name, gender: t.gender, race: t.race, people: t.people || null,
      role: 'captive', core: false, hp: t.hp, alive: true, joined: K.day, back: 1, ride: null, special: t.special, align: t.align || null, values: t.values || null,
      gear: {hand: [...(t.gear?.hand || [])], body: t.gear?.body || C.gear.body}, local: t.local || null,
      captive: {since: K.day, bonds: t.bonds, from: t.from || null, will: t.will ?? ESCAPE.will.start}};
    K.members.push(m); got.push(m);
  }
  if (got.length) say(`В плен взяли: ${names(got.map(who))}. ${got.length > 1 ? 'Идут' : gen(got[0], 'Идёт', 'Идёт')} с караваном связанн${got.length > 1 ? 'ыми' : gen(got[0], 'ым', 'ой')}.`, 'people', got.map(m => m.id));
  K.stats.captives = (K.stats.captives || 0) + got.length;
  return got;
}

// a captive's death or the end of the campaign: shackles come back to the baggage, rope does not
export function unbind(K, m) {
  const B = BONDS.has(m.captive?.bonds) ? BONDS.get(m.captive.bonds) : null;
  if (B?.back) K.cargo[B.resource] = (K.cargo[B.resource] || 0) + B.n;
}

export const captivesLine = K => { const n = held(K).length; return n ? `${n} ${plural(n, 'пленный', 'пленных', 'пленных')}` : ''; };

// ── stage 2 (docs/CAPTIVES.md; numbers: data/captives.js ESCAPE): the ration, the will, the evening rolls, the
// night escape, the red alarm of a fight. On the local map the camp plays the alarm itself (settlement/escape.js)
const holdOf = m => (BONDS.has(m.captive?.bonds) ? BONDS.get(m.captive.bonds).hold : 1);
const willOf = m => (m.captive.will ??= ESCAPE.will.start);
const clamp01 = v => Math.max(0, Math.min(1, v));
const gw = (m, a, b) => (m.gender === 'f' ? b : a);

// mouths at the meal: a captive on a cut ration eats `ration.eat` of one
export const mouths = K => free(K).length + held(K).length * (K.captiveCut ? ESCAPE.ration.eat : 1);

// one got away: gone from the caravan with its bonds
export function escaped(a, K, m, text, say) {
  m.alive = false; m.ride = null; m.left = {day: K.day, year: a.hist.year, escaped: true};
  K.stats.escaped = (K.stats.escaped || 0) + 1;
  say(text + '.', 'leave', [m.id]); assign(K);
}

// the evening (campaign/march.js people): the ration, the will, the rolls; a plot is played out the same night
export function captivesEvening(a, K, r, say) {
  const hs = held(K); if (!hs.length) { K.captiveCut = false; return; }
  const R = ESCAPE.ration, cut = K.food < mouths(K) * CAMPAIGN.ration * R.cutDays;
  // told once in a while: the ration comes and goes with every stretch of short food
  if (cut && !K.captiveCut && K.day - (K.cutTold ?? -999) > 60) { K.cutTold = K.day; say('Еды мало: пленным урезали паёк.', 'people'); }
  K.captiveCut = cut;
  const W = ESCAPE.will.day, want = [];
  for (const m of hs) {
    let d = W.time;
    if (cut) d += W.cut;
    if (K.hungry) d += W.hungry;
    if (m.hp < 0.5) d += W.hurt;
    if (!cut && !K.hungry && m.hp > 0.8) d += W.content;
    m.captive.will = clamp01(willOf(m) + d);
    if (m.captive.resigned) continue;
    if (r() < ESCAPE.escape.base * m.captive.will * holdOf(m)) { want.push(m); continue; }
    const Rs = ESCAPE.resign, days = K.day - (m.captive.since ?? K.day);
    if (r() < Rs.base * (1 - m.captive.will) * days / (days + Rs.settle)) {
      m.captive.resigned = K.day;
      say(`${m.name}, ${gw(m, 'пленный', 'пленная')} (${SPECIES.get(m.race).label}), ${gw(m, 'смирился', 'смирилась')}: бежать больше не думает.`, 'people', [m.id]);
    }
  }
  if (!want.length) return;
  const by = want[0], plotters = hs.filter(m => !m.captive.resigned);
  for (const s of hs.filter(m => m.captive.resigned)) {
    if (r() >= ESCAPE.inform.base) continue;
    by.captive.will = clamp01(willOf(by) + ESCAPE.will.betrayed);
    s.captive.service = (s.captive.service || 0) + ESCAPE.inform.service;
    K.stats.told = (K.stats.told || 0) + 1;
    say(`${s.name} ${gw(s, 'выдал', 'выдала')} сговор пленных: ${by.name} ${gw(by, 'подбивал', 'подбивала')} бежать ночью. Побега не было.`, 'people', [s.id, by.id]);
    return;
  }
  // the night: the watch may catch them
  const guide = K.members.some(m => m.alive && m.role === 'guide') ? ESCAPE.catch.guide : 0;
  if (r() < ESCAPE.catch.campaign + guide) {
    for (const m of plotters) m.captive.will = clamp01(willOf(m) + ESCAPE.will.caught);
    K.stats.caught = (K.stats.caught || 0) + plotters.length;
    say(`Ночью пленные пытались бежать (${names(plotters.map(m => m.name))}), но дозорный поднял крик: беглецов догнали и связали снова.`, 'people', plotters.map(m => m.id));
    return;
  }
  for (const m of plotters) escaped(a, K, m, `Ночью ${m.name}, ${gw(m, 'пленный', 'пленная')}, ${gw(m, 'бежал', 'бежала')} по сговору${plotters.length > 1 ? ' с другими' : ''}`, say);
}

// a fight in the quick mode: each captive rolls once to run in the confusion, readier when the foe is its own kind
export function captivesInFight(a, K, d, r, say) {
  const E = ESCAPE.red;
  for (const m of held(K)) {
    if (m.captive.resigned) continue;
    const kin = m.captive.from === d.kind, tool = m.gear.hand.length > 0;
    if (r() < E.base * willOf(m) * holdOf(m) * (kin ? E.kin : 1) * (tool ? E.tool : 1)) escaped(a, K, m, `В суматохе боя ${m.name}, ${gw(m, 'пленный', 'пленная')}, ${gw(m, 'бежал', 'бежала')}${kin ? ' к своим' : ''}`, say);
  }
}

// ── stage 4 (docs/CAPTIVES.md; data/captives.js FREEDOM): a resigned captive with enough service — days beside a
// master on the local map, a plot told — is freed at the evening, when the caravan has a master to vouch for it:
// a former slave, role 'former', with the loyalty of one who joined (campaign/march.js people). One who stood in
// a fight the caravan won is taken in as one of its own at the next evening.
export function freedomEvening(a, K, say) {
  const vouch = free(K).find(m => m.master && !m.former);
  for (const m of held(K)) {
    if (!vouch || !m.captive.resigned || (m.captive.service || 0) < FREEDOM.free) continue;
    unbind(K, m);
    m.former = {since: K.day, fought: false, service: m.captive.service || 0};
    m.captive = null; m.role = 'former'; m.loyalty = FREEDOM.bond.start;
    K.stats.freed = (K.stats.freed || 0) + 1;
    say(`С ${m.name} сняли путы: за ${gw(m, 'него', 'неё')} поручился ${vouch.name}. Теперь ${gw(m, 'бывший раб', 'бывшая рабыня')} — без оружия, но не в путах.`, 'people', [m.id, vouch.id]);
  }
  for (const m of K.members.filter(x => x.alive && x.former)) {
    if (!m.former.fought) continue;
    m.former = null; m.role = 'companion'; m.loyalty = 1;
    K.stats.formerMembers = (K.stats.formerMembers || 0) + 1;
    say(`${m.name} ${gw(m, 'бился', 'билась')} за караван: теперь ${gw(m, 'он', 'она')} свой и идёт до конца.`, 'people', [m.id]);
  }
}
// a fight won: the former slaves in it stood with the caravan
export const formersFought = K => { for (const m of K.members) if (m.alive && m.former) m.former.fought = true; };
