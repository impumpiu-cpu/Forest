// Perks of the caravan's members (data/perks.js; docs/CAMPAIGN.md «Перки»; plan claude/xp-plan.md, Ver_E Э3).
//   m.perks — [{id, rank, day, why}]: the perks taken, their rank, the day, the deed that opened it (a requirement's key)
// A level (campaign/experience.js levelEvening) offers what the member meets the requirement of and has not taken to its last
// rank; one is taken — by its own character, from its own stream of the campaign's lots (`perks`), never by the player.
// The hooks of the campaign's day read a member's perk (perkRank, perkVal) or the company's best (companyVal); the local map
// reads them from the agent (data/perks.js perkOf: campaign/camp.js gives the agent its member's perks).
import {PERKS, RANK_LEVEL, PERK_PICK} from '../data/perks.js';
import {COMBAT_ROLES} from '../data/roles.js';
import {gearDef} from '../local/index.js';
import {draw} from './start.js';
import {campaignFact} from './social.js';
import {sinceScar, hasWound} from './maims.js';
import {SPECIES} from '../data/species.js';

const groupOfM = m => (m.fight && COMBAT_ROLES.has(m.fight) ? COMBAT_ROLES.get(m.fight).group : m.role === 'sellsword' ? 'линия' : m.role === 'guide' ? 'дальний бой' : null);

// the rank of a perk a member has taken (0 — none)
export const perkRank = (m, id) => m?.perks?.find(p => p.id === id)?.rank || 0;
// a camp effect of a member: Σ over its perks of `camp[key]` × rank (a multiplier's excess: 0.25 × 2 ranks → 0.5)
export function perkVal(m, key) {
  let v = 0;
  for (const p of m?.perks || []) { const P = PERKS.has(p.id) ? PERKS.get(p.id) : null; if (P?.camp?.[key] != null) v += (typeof P.camp[key] === 'number' ? P.camp[key] : 1) * (p.rank || 1); }
  return v;
}
// the multiplier form of an effect given as a factor (watchTired 0.75): the factor of its rank (0.75 per rank)
export function perkMul(m, key) {
  let v = 1;
  for (const p of m?.perks || []) { const P = PERKS.has(p.id) ? PERKS.get(p.id) : null; if (P?.camp?.[key] != null) v *= P.camp[key] ** (p.rank || 1); }
  return v;
}
// the company's best of an effect among the free living (one haggler bargains for all)
export const companyVal = (K, key) => Math.max(0, ...K.members.filter(m => m.alive && !m.captive).map(m => perkVal(m, key)));
export const companyMul = (K, key) => Math.max(1, ...K.members.filter(m => m.alive && !m.captive).map(m => perkMul(m, key)));

// the key of the requirement that holds for a member, or null: the deed that opened it (for the line and the card)
function count(m, key) {
  if (key.startsWith('work:')) return m.workBy?.[key.slice(5)] || 0;
  return m.acts?.[key] || 0;
}
// does the member meet the perk's requirement for rank `rank`? → the reason (the deed or 'level'), or null
export function meets(m, P, rank = 1) {
  const R = P.req || {};
  if ((m.level || 1) < (R.level || 1) + (rank - 1) * RANK_LEVEL) return null;
  if (R.race && !R.race.includes(m.race)) return null;
  if (R.group && !R.group.includes(groupOfM(m))) return null;
  if (R.role && !R.role.includes(m.fight) && !R.role.includes(m.role)) return null;
  if (R.notRole && (R.notRole.includes(m.fight) || R.notRole.includes(m.role))) return null;
  if (R.hand && !(m.gear?.hand || []).some(id => R.hand.includes(gearDef(id)?.form))) return null;
  for (const [s, v] of Object.entries(R.stat || {})) if ((m.special?.[s] ?? 0) < v) return null;
  if (R.crafts && Object.keys(m.workBy || {}).length < R.crafts) return null;
  if (R.scar) {   // an answer to a wound: it bears one, and has done enough since it
    const sc = R.scar.filter(id => hasWound(m, id)); if (!sc.length) return null;
    if (R.since && !sc.some(id => R.since.some(([k, n]) => sinceScar(m, id, k) >= n))) return null;
    if (!R.any && !R.work) return `scar:${sc[0]}`;
  }
  if (P.grant && Object.entries(P.grant).every(([st, v]) => (m.special?.[st] ?? 0) + v > (SPECIES.get(m.race).special?.[st]?.[1] ?? Infinity))) return null;   // (a letter at its race's limit: nothing to grant)
  let why = 'level';
  if (R.work) { const w = Object.entries(R.work).find(([sk, v]) => (m.workBy?.[sk] || 0) >= v); if (!w) return null; why = `work:${w[0]}`; }
  if (R.any) { const a = R.any.find(([k, n]) => count(m, k) >= n * rank); if (!a) return null; why = a[0]; }
  return why;
}
// what a member may take now: [{P, rank, why}]
export function offered(m) {
  const out = [];
  for (const P of PERKS.all()) {
    const rank = perkRank(m, P.id) + 1;
    if (rank > (P.ranks || 1)) continue;
    const why = meets(m, P, rank);
    if (why) out.push({P, rank, why});
  }
  return out;
}
// how strongly its character draws a member to a perk (data/perks.js `pull`, PERK_PICK)
export function pullOf(m, P) {
  const Q = P.pull || {}, L = m.local?.leans || {};
  let w = PERK_PICK.base;
  for (const [id, k] of Object.entries(Q.leans || {})) w += k * (L[id] || 0);
  for (const v of Q.values || []) if ((m.values || []).includes(v)) w += PERK_PICK.value;
  for (const t of Q.traits || []) if ((m.local?.traits || []).includes(t)) w += PERK_PICK.trait;
  return w;
}
// A level's perk: one of those offered, by its character's pull, from the campaign's own stream; taken, it is a fact. → the
// row taken or null
export function pickPerk(K, m) {
  let opts = offered(m);
  if (!opts.length) return null;
  const answers = opts.filter(o => o.P.answer); if (answers.length) opts = answers;   // an answer to a wound is taken first (the author's call)
  const ws = opts.map(o => pullOf(m, o.P)), sum = ws.reduce((s, w) => s + w, 0), D = draw(K, 'perks'), r = D.r() * sum; D.done();
  let k = 0, acc = ws[0];
  while (acc < r && k < opts.length - 1) acc += ws[++k];
  const {P, rank, why} = opts[k];
  const had = m.perks.find(p => p.id === P.id);
  if (had) Object.assign(had, {rank, day: K.day}); else m.perks.push({id: P.id, rank, day: K.day, why});
  for (const [st, v] of Object.entries(P.grant || {})) m.special[st] = Math.min((m.special[st] ?? 0) + v, SPECIES.get(m.race).special?.[st]?.[1] ?? Infinity);   // «Везучий»: a letter at once, inside the race
  if (P.cure) { m.wounds = (m.wounds || []).filter(x => x.id !== P.cure); if (!m.wounds.length) m.wounds = null; campaignFact(K, 'overcame', {by: m.id, saw: K.members.filter(x => x.alive && x !== m && !x.captive).map(x => x.id), params: {wound: P.cure}}); }   // «Переболел»
  const saw = K.members.filter(x => x.alive && x !== m && !x.captive).map(x => x.id);
  campaignFact(K, 'perkTaken', {by: m.id, saw, params: {perk: P.id, rank}});
  return {id: P.id, rank, why};
}
// a perk in words: «Плечом к плечу» / «Торгаш II»
export const perkLabel = (id, rank = 1) => `«${PERKS.get(id).label}»${rank > 1 ? ` ${['', 'I', 'II', 'III'][rank] || rank}` : ''}`;
// the perks as they stood on a day shown (the screen plays the days back)
export const perksBy = (K, m, day) => (m.perks || []).filter(p => day >= K.day || p.day < day);
// for the card: what a perk does, and the deed that opened it, in words
export const perkAbout = id => PERKS.get(id).about;
const WHY = {clean: 'пережил смертельную рану без следа', watch: 'стоял в дозорах', swap: 'подменял уставших', trade: 'торговал', town: 'видел города', fight: 'прошёл бои', beside: 'бился рядом с иноплеменниками',
  shield: 'закрывал щитом', hit: 'стрелял метко', dress: 'вытаскивал упавших', tend: 'перевязывал', killBlow: 'повергал врагов', level: 'дорос'};
export function perkWhy(why) {
  if (why.startsWith('work:')) return 'работа';
  if (why.startsWith('scar:')) return 'жить с раной';
  if (why.startsWith('fight:')) return `бои в строю: ${why.slice(6)}`;
  return WHY[why] || why;
}
