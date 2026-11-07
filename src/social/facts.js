// The facts of the living company (plan claude/caravan-ver_d.md §3.3, §4): what happened, between whom, who saw it — as
// data, not as a line of the chronicle. A fact has a stable id (the session it happened in and its number there), its kind
// (data/social.js FACT_KINDS), the people by their member ids in their parts (`by` the doer, `to` the one it was done to,
// `saw` the witnesses), the campaign's day, the local tick when it was on a map, and what it was (params). Its text is not
// the fact: a line is made from it, never the other way round.
// Pure: no campaign, settlement or screen imports.
import {FACT_KINDS, SOCIAL} from '../data/social.js';

// a fact → its envelope
export function makeFact(id, kind, {by = null, to = null, saw = [], heard = [], day, tick = null, session = null, params = {}}) {
  if (!FACT_KINDS[kind]) throw new Error(`нет вида факта ${kind}`);
  const S = [...new Set(saw)].filter(x => x !== by && x !== to), H = [...new Set(heard)].filter(x => x !== by && x !== to && !S.includes(x));
  return {id, kind, by, to, saw: S, ...(H.length ? {heard: H} : {}), day, tick, session, params: {...params}};
}
// the part one had in a fact: 'by', 'to', 'saw', or null (did not know)
export const partIn = (f, id) => (f.by === id ? 'by' : f.to === id ? 'to' : f.saw.includes(id) ? 'saw' : (f.heard || []).includes(id) ? 'heard' : null);
// those who know a fact: first hand, and (a fate) those told of it by the company
export const knowers = f => [f.by, f.to, ...f.saw, ...(f.heard || [])].filter(x => x != null);
// a memory of a fact for one who knows it: {fact, how ('lived' — by or to it; 'saw'), day, weight}
export function memoryOf(f, id) {
  const part = partIn(f, id); if (!part) return null;
  return {fact: f.id, how: part === 'saw' || part === 'heard' ? part : 'lived', part, day: f.day, weight: FACT_KINDS[f.kind].weight[part] ?? 0};
}
// a member's memories with one more: the same fact is remembered once; past the limit the least weighty go
export function remember(list, mem) {
  if (!mem || list.some(x => x.fact === mem.fact)) return list;
  const out = [...list, mem];
  if (out.length > SOCIAL.memoryMax) { out.sort((p, q) => q.weight - p.weight || q.day - p.day); out.length = SOCIAL.memoryMax; }
  return out;
}
