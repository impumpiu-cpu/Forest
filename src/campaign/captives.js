// Captives in the campaign (docs/CAPTIVES.md; numbers: data/captives.js). A captive walks with the caravan as a
// member with role 'captive' and `m.captive = {since, bonds, from}`: it eats a ration and carries a load like
// anyone, but adds nothing to the caravan's might, takes no place among those who joined, never carries the
// crown, gets no weapon. The bonds come from the baggage (K.cargo): rope, bronze or iron shackles.
//   free(K), held(K)            — those who walk free, those held
//   takeAuto(a, K, d, r, say)   — after a fight won in the quick mode: one or two of the fallen bound
//   takeFromCamp(a, K, o, say)  — the captives the camp on the local map took (campaign/camp.js outcome)
//   bondsSets(K)                — how many more the baggage can bind
import {BONDS, CAPTIVE, bestBonds} from '../data/captives.js';
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
    const m = makeMember(K, r, {race, role: 'captive', gear: C.gear, captive: {since: K.day, bonds: B.id, from: d.kind}});
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
      captive: {since: K.day, bonds: t.bonds, from: t.from || null}};
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
