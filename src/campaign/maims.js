// Maims and the road's traumas of the caravan's members (Ver_E Э4; docs/CAMPAIGN.md «Увечья и травмы»; data/wounds.js
// DEATHBLOW.maim, MAIM_OF; data/conditions.js the rows).
//   m.maims  — how many maims it bears (0…DEATHBLOW.maim.max): with the last borne, the next deadly wound kills without a check
//   m.scarAt — {wound id: the counts of its deeds when it got the wound}: the answers to a wound ask the deeds done after it
//              (data/perks.js `since`)
// A maim instead of death, by the author's call: on the local map agents/wounds.js lethal makes it (senseless but not bleeding,
// a dressing wakes it; the camp's outcome brings `maimed`); in the quick mode the fight's blow that would kill makes it here.
import {DEATHBLOW, MAIM_OF, WOUNDS} from '../data/wounds.js';
import {PERKS} from '../data/perks.js';
import {ADD_MODS, CREATURE_MODS} from '../data/mods.js';
import {ROAD_TRAUMA, ACTS, XP} from '../data/experience.js';
import {campaignFact, bondOf} from './social.js';

const workSum = m => Object.values(m.workBy || {}).reduce((s, v) => s + v, 0);
// the counts a wound's answer compares with (m.acts; the work by its experience — campaign/experience.js m.workBy)
export const scarCounts = m => ({fight: m.acts?.fight || 0, hit: m.acts?.hit || 0, work: Math.round(workSum(m) * 100) / 100});   // (work: by its experience)
// a wound for life newly borne: the counts at the moment it was taken (once a wound; Р2-04)
//   called before the camp's deeds are counted in (campaign/fight.js applyCamp), with the camp's outcome `mo`:
//   — the deeds of the map up to the wound (agents/acts.js noteScarNow: mo.scarsAt) are before it; a wound with no such note —
//     the whole camp is before it (the safe side: an answer is not earned by what may have been done before the wound);
//   — the fight it was taken in is before it (`fought`: the fight is counted in after, by campaign/experience.js fightActs)
export function noteScars(m, mo = null, fought = false) {
  for (const x of m.wounds || []) {
    if (x.day != null || (m.scarAt ||= {})[x.id]) continue;
    const c = scarCounts(m);
    if (mo) {
      const at = mo.scarsAt?.[x.id], units = at ? at.work : Object.values(mo.practiced || {}).reduce((s, v) => s + v, 0);
      c.hit += at ? at.hit : (mo.acts?.hit || 0);
      c.work = Math.round((c.work + units * ACTS.get('work').xp * (m.captive ? XP.captive : 1)) * 100) / 100;
    }
    if (fought) c.fight += 1;
    m.scarAt[x.id] = c;
  }
}
// the deeds done since a wound (for data/perks.js `since`)
export function sinceScar(m, id, key) {
  const at = m.scarAt?.[id]; if (!at) return 0;
  return Math.max(0, (scarCounts(m)[key] ?? 0) - (at[key] ?? 0));
}

const sayMaim = (m, id) => {
  const f = m.gender === 'f', n = m.maims, M = DEATHBLOW.maim;
  return `${m.name} ${f ? 'выжила' : 'выжил'}, но ${f ? 'осталась увечной' : 'остался увечным'}: ${WOUNDS.get(id).label} (увечий: ${n} из ${M.max}${n >= M.max ? `; следующая смертельная рана — последняя` : ''}).`;
};
// a maim come back from the local map (campaign/fight.js applyCamp): counted, a fact, a line
//   mo — the member's outcome of the camp (its deeds up to each wound), fought — the camp was a fight (campaign/fight.js)
export function maimsIn(K, m, ids, say = () => {}, mo = null, fought = false) {
  for (const id of ids || []) {
    m.maims = (m.maims || 0) + 1; (m.maimDays ||= []).push(K.day);   // (the day of each: the card played back)
    // the fact: from the map it comes with the camp's facts, seen by those who saw the blow (agents/wounds.js maimFall); the
    // quick fight is the whole company's, so all there saw it
    if (!mo) campaignFact(K, 'maimed', {to: m.id, saw: K.members.filter(x => x.alive && x !== m && !x.captive).map(x => x.id), params: {maim: id, n: m.maims}});
    say(sayMaim(m, id), [m.id]);
  }
  noteScars(m, mo, fought);
}
// it bears all the maims it may (with the switch on): the next deadly wound kills it with no check
export const spent = m => DEATHBLOW.maim.on && !m.captive && (m.maims || 0) >= DEATHBLOW.maim.max;
// the quick mode: the blow that would kill a member maims it instead, while it may bear one more → the maim's id, or null (it dies)
export function maimInstead(K, m, r, say = () => {}) {
  const M = DEATHBLOW.maim;
  if (!M.on || m.captive || (m.maims || 0) >= M.max) return null;
  const ids = Object.values(MAIM_OF), id = ids[Math.floor(r() * ids.length) % ids.length];
  m.wounds = [...(m.wounds || []), {id, day: null, got: K.day}];
  maimsIn(K, m, [id], say, null, true);   // (the quick fight is counted in after it: campaign/fight.js fightActs)
  return id;
}

// ── the road's traumas (data/conditions.js `drawn: false`), each a check once, at its moment
// a friend seen dying: a timid one, or one whose nerve fails, may carry the night after it for life (campaign/march.js die)
export function terrorsFrom(K, gone, saw, r) {
  const T = ROAD_TRAUMA.terrors;
  for (const id of saw || []) {
    const m = K.members.find(x => x.id === id);
    if (!m?.alive || m.captive || hasWound(m, 'terrors') || bondOf(K, m.id, gone.id) < T.bond) continue;
    const timid = (m.local?.traits || []).includes('timid'); K.stats.terrorChecks = (K.stats.terrorChecks || 0) + 1;   // (the checks made: for the calibration, tools/xp-probe.mjs)
    if (r() < (timid ? T.timid : T.chance)) { m.wounds = [...(m.wounds || []), {id: 'terrors', day: null, got: K.day}]; noteScars(m); campaignFact(K, 'scarred', {to: m.id, saw: [], params: {wound: 'terrors', of: gone.id}}); }
  }
}
// a frosty day walked worn out: the fingers may freeze for good (a check on Endurance, once a day for each worn out)
export function frostbite(K, ms, frosty, tiredOf, r, say = () => {}) {
  if (!frosty) return;
  const T = ROAD_TRAUMA.frostbite;
  for (const m of ms) {
    if (!m.alive || hasWound(m, 'frostbite')) continue;
    K.stats.frostDays = (K.stats.frostDays || 0) + 1;   // (a frosty day walked: for the calibration)
    { const t = Math.round(tiredOf(m) * 10); (K.stats.frostTired ||= {})[t] = (K.stats.frostTired[t] || 0) + 1; }   // (how worn out they walked it, by tenths)
    if (tiredOf(m) < T.tired) continue;
    K.stats.frostChecks = (K.stats.frostChecks || 0) + 1;
    if (r() < T.chance * Math.max(0, 1 - (m.special?.E ?? 5) / T.endure)) {
      m.wounds = [...(m.wounds || []), {id: 'frostbite', day: null, got: K.day}]; noteScars(m);
      say(`${m.name} шёл${m.gender === 'f' ? 'а' : ''} измотанн${m.gender === 'f' ? 'ой' : 'ым'} по морозу — пальцы отморожены навсегда.`, [m.id]);
    }
  }
}
export const hasWound = (m, id) => !!m.wounds?.some(x => x.id === id);

// a wound for life and what the answers taken to it by a day eased (the card, Ver_E Э5): for each number the wound touches
// that an answer touches too — the wound's, the answer's, the two together (data/mods.js: an `add` adds, a `mul` multiplies)
//   → [{key, label, scar, perk, now, add}] — empty when no answer to it was taken by then
export function scarEased(m, id, perks) {
  const W = WOUNDS.get(id); if (!W) return [];
  const out = [];
  for (const p of perks || []) {
    const P = PERKS.get(p.id); if (!P?.answer || !(P.req?.scar || []).includes(id)) continue;
    for (const [k, v] of Object.entries(P.mods || {})) {
      const w = W.mods?.[k] ?? (k === 'hp' ? W.hp : undefined); if (w == null) continue;
      const add = ADD_MODS.has(k), now = add ? w + v : w * v;
      out.push({key: k, label: CREATURE_MODS.has(k) ? CREATURE_MODS.get(k).label : k, scar: w, perk: v, now: Math.round(now * 100) / 100, add, by: P.label});
    }
  }
  return out;
}
// for the card, as of a day shown (the day not yet stepped: as now): the wounds for life borne then — those got before it, and
// those since overcome (m.healed) — and how many maims
export function scarsOn(K, m, day) {
  const now = day >= K.day, by = x => now || x.got == null || x.got < day;
  return [...(m.wounds || []).filter(x => x.day == null && by(x)), ...(now ? [] : (m.healed || []).filter(x => by(x) && x.off >= day))];
}
// (a save from before the days were kept — no m.maimDays: the count as it is now, not a false 0)
export const maimsOn = (K, m, day) => (day >= K.day || !m.maimDays ? m.maims || 0 : m.maimDays.filter(d => d < day).length);
export const woundLabel = id => (WOUNDS.has(id) ? WOUNDS.get(id).label : id);
export const maimMax = () => DEATHBLOW.maim.max;
