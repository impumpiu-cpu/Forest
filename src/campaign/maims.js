// Maims and the road's traumas of the caravan's members (Ver_E Э4; docs/CAMPAIGN.md «Увечья и травмы»; data/wounds.js
// DEATHBLOW.maim, MAIM_OF; data/conditions.js the rows).
//   m.maims  — how many maims it bears (0…DEATHBLOW.maim.max): with the last borne, the next deadly wound kills without a check
//   m.scarAt — {wound id: the counts of its deeds when it got the wound}: the answers to a wound ask the deeds done after it
//              (data/perks.js `since`)
// A maim instead of death, by the author's call: on the local map agents/wounds.js lethal makes it (senseless but not bleeding,
// a dressing wakes it; the camp's outcome brings `maimed`); in the quick mode the fight's blow that would kill makes it here.
import {DEATHBLOW, MAIM_OF, WOUNDS} from '../data/wounds.js';
import {ROAD_TRAUMA} from '../data/experience.js';
import {campaignFact, bondOf} from './social.js';

const workSum = m => Object.values(m.workBy || {}).reduce((s, v) => s + v, 0);
// the counts a wound's answer compares with (m.acts; the work by its experience — campaign/experience.js m.workBy)
export const scarCounts = m => ({fight: m.acts?.fight || 0, hit: m.acts?.hit || 0, work: Math.round(workSum(m) * 100) / 100});   // (work: by its experience)
// a wound for life newly borne: the counts at that moment (once a wound)
export function noteScars(m) {
  for (const x of m.wounds || []) {
    if (x.day != null || (m.scarAt ||= {})[x.id]) continue;
    m.scarAt[x.id] = scarCounts(m);
  }
}
// the deeds done since a wound (for data/perks.js `since`)
export function sinceScar(m, id, key) {
  const at = m.scarAt?.[id]; if (!at) return 0;
  return (scarCounts(m)[key] ?? 0) - (at[key] ?? 0);
}

const sayMaim = (m, id) => {
  const f = m.gender === 'f', n = m.maims, M = DEATHBLOW.maim;
  return `${m.name} ${f ? 'выжила' : 'выжил'}, но ${f ? 'осталась увечной' : 'остался увечным'}: ${WOUNDS.get(id).label} (увечий: ${n} из ${M.max}${n >= M.max ? `; следующая смертельная рана — последняя` : ''}).`;
};
// a maim come back from the local map (campaign/fight.js applyCamp): counted, a fact, a line
export function maimsIn(K, m, ids, say = () => {}) {
  for (const id of ids || []) {
    m.maims = (m.maims || 0) + 1;
    const saw = K.members.filter(x => x.alive && x !== m && !x.captive).map(x => x.id);
    campaignFact(K, 'maimed', {to: m.id, saw, params: {maim: id, n: m.maims}});
    say(sayMaim(m, id), [m.id]);
  }
  noteScars(m);
}
// the quick mode: the blow that would kill a member maims it instead, while it may bear one more → the maim's id, or null (it dies)
export function maimInstead(K, m, r, say = () => {}) {
  const M = DEATHBLOW.maim;
  if (!M.on || m.captive || (m.maims || 0) >= M.max) return null;
  const ids = Object.values(MAIM_OF), id = ids[Math.floor(r() * ids.length) % ids.length];
  m.wounds = [...(m.wounds || []), {id, day: null}];
  maimsIn(K, m, [id], say);
  return id;
}

// ── the road's traumas (data/conditions.js `drawn: false`), each a check once, at its moment
// a friend seen dying: a timid one, or one whose nerve fails, may carry the night after it for life (campaign/march.js die)
export function terrorsFrom(K, gone, saw, r) {
  const T = ROAD_TRAUMA.terrors;
  for (const id of saw || []) {
    const m = K.members.find(x => x.id === id);
    if (!m?.alive || m.captive || hasWound(m, 'terrors') || bondOf(K, m.id, gone.id) < T.bond) continue;
    const timid = (m.local?.traits || []).includes('timid');
    if (r() < (timid ? T.timid : T.chance)) { m.wounds = [...(m.wounds || []), {id: 'terrors', day: null}]; noteScars(m); campaignFact(K, 'scarred', {to: m.id, saw: [], params: {wound: 'terrors', of: gone.id}}); }
  }
}
// a frosty day walked worn out: the fingers may freeze for good (a check on Endurance, once a day for each worn out)
export function frostbite(K, ms, frosty, tiredOf, r, say = () => {}) {
  if (!frosty) return;
  const T = ROAD_TRAUMA.frostbite;
  for (const m of ms) {
    if (!m.alive || hasWound(m, 'frostbite') || tiredOf(m) < T.tired) continue;
    if (r() < T.chance * Math.max(0, 1 - (m.special?.E ?? 5) / T.endure)) {
      m.wounds = [...(m.wounds || []), {id: 'frostbite', day: null}]; noteScars(m);
      say(`${m.name} шёл${m.gender === 'f' ? 'а' : ''} измотанн${m.gender === 'f' ? 'ой' : 'ым'} по морозу — пальцы отморожены навсегда.`, [m.id]);
    }
  }
}
export const hasWound = (m, id) => !!m.wounds?.some(x => x.id === id);

// for the card
export const woundLabel = id => (WOUNDS.has(id) ? WOUNDS.get(id).label : id);
export const maimMax = () => DEATHBLOW.maim.max;
