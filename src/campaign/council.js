// The caravan's council with voices (plan claude/caravan-ver_d.md D5; docs/CAMPAIGN.md «Вечерний совет и стоянки»): the
// options are what may be done this evening (the asks of caravan.camp and caravan.visit: food on the land, a town that can be
// reached, a building that would help — campaign/march.js CAMP_ASK, visit.js VISIT_ASK); each who has a say scores every one
// of them — by its people's mission (data/campaign.js COUNCIL.mission, the context of all, counted once) bent by its own
// leanings, by its needs (hunger, its wounds and its friends', tiredness), by the danger of the night as its caution reads
// it and by the losses it remembers — and the options are drawn from by the sum of what each prefers (core/decide.js
// pickVoices) after one round of talk (debate: a proposal, an objection for a reason, the others moved, the proposer's answer).
// A danger is weighed, not a wall: a bad choice may be taken. The meeting is kept (K.social.meetings): who was
// there, what each wanted most and why, the weights, the pick — the fire's scene reads it, never asks again.
// With COUNCIL.policy 'lanes' (or a run without leanings' social side) the old way: pickLanes.
import {COUNCIL, CAMPAIGN} from '../data/campaign.js';
import {pickLanes, pickVoices} from '../core/decide.js';
import {leansOn} from '../data/commands.js';
import {TRAITS} from '../data/traits.js';
import {ensureSocial, bondOf} from './social.js';
import {tiredOf} from './duty.js';
import {missionOf, councilWeight} from './visit.js';

const V = () => COUNCIL.voice;
// what one is made of for the council: its leanings on the mission's axes (pace ← persistence, caution ← 1 − risk, side ←
// curiosity), each its people's bent by `self` of its own
function axesOf(a, K, m) {
  const M = missionOf(a, K), L = m.local?.leans || {}, mid = COUNCIL.mission.mid;
  if (!leansOn(a?.cfg)) return M;
  const brave = (m.local?.own?.mul?.bravery ?? 1) + (m.local?.traits || []).reduce((s, id) => s + (TRAITS.get(id)?.mods?.bravery ?? 0), 0);
  const own = {pace: L.persist ?? mid, caution: 1 - Math.max(0, Math.min(1, brave - mid)), side: L.curious ?? mid};
  return Object.fromEntries(Object.keys(M).map(k => [k, Math.max(0, Math.min(1, M[k] + V().self * ((own[k] ?? mid) - mid)))]));
}
// the weight of a command for one: COUNCIL.want × its mission, as councilWeight, by its own axes
function wantOf(id, v) {
  const M = COUNCIL.mission, L = M.leans[id] || {};
  const lean = Object.entries(L).reduce((s, [k, x]) => s + x * ((v[k] ?? M.mid) - M.mid) * 2, 0);
  return (COUNCIL.want[id] ?? 1) * Math.max(0, 1 + M.k * lean);
}
const FOOD = /\.(food)$/, HEAL = /\.(heal)$/, STOP = id => !id.endsWith('.goOn');
const CAMPISH = id => id.startsWith('caravan.camp.') && STOP(id);

// what one scores each option, with the reasons that moved it most
function scoreOne(a, K, m, opts, x) {
  const N = V().need, v = axesOf(a, K, m), S = ensureSocial(K), out = {}, why = {};
  // a loss it remembers: the deaths it knows of, the last `griefDays`
  const mine = new Set((m.social?.memory || []).map(e => e.fact));
  const losses = S.facts.filter(f => f.kind === 'died' && mine.has(f.id) && K.day - f.day <= N.griefDays).length;
  const caution = Math.min(1, v.caution + Math.min(N.griefCap, N.grief * losses));
  const hunger = K.hungry ? 1 : Math.max(0, Math.min(1, 1 - K.food / Math.max(1, x.need * CAMPAIGN.camp.foodDays)));
  const friendHurt = Math.max(0, ...K.members.filter(o => o.alive && o !== m && !o.captive && o.hp < CAMPAIGN.camp.badly).map(o => bondOf(K, m.id, o.id) >= N.friendAt ? bondOf(K, m.id, o.id) : 0)) / 4;
  for (const o of opts) {
    const base = wantOf(o.id, {...v, caution}), parts = {};
    if (FOOD.test(o.id)) parts.hunger = N.food * hunger;
    if (HEAL.test(o.id)) { parts.wounds = N.hurt * (1 - m.hp); if (friendHurt) parts.friend = N.friend * friendHurt; }
    if (STOP(o.id)) parts.tired = N.tired * tiredOf(m);
    if (CAMPISH(o.id) && x && !x.quiet) parts.danger = -N.danger * caution;
    const s = base + Object.values(parts).reduce((p, q) => p + q, 0) * (COUNCIL.want[o.id] ?? 1) / 2;
    out[o.id] = Math.round(s * 1000) / 1000;
    why[o.id] = Object.entries(parts).filter(([, q]) => Math.abs(q) > V().whyFrom).sort((p, q) => Math.abs(q[1]) - Math.abs(p[1])).map(([k]) => k);
  }
  return {s: out, why};
}

const topOf = (v, opts) => opts.reduce((b, o) => ((v.s[o.id] ?? 0) > (v.s[b.id] ?? 0) ? o : b), opts[0]);
// one round of talk before the draw (COUNCIL.voice.debate): a proposal, an objection for a reason one has, the others moved by
// it as they feel for the one who spoke and as it is news to them, the proposer's answer — yield, meet halfway, hold. Changes
// the scores (`scores`, in place); no draw. → what was said, or null (nobody objected for a reason: nothing to talk over)
function debate(K, scores, opts) {
  const D = V().debate; if (!D || scores.length < 2 || opts.length < 2) return null;
  const mean = id => scores.reduce((s, v) => s + Math.max(0, v.s[id] ?? 0), 0) / scores.length;
  const proposal = opts.reduce((b, o) => (mean(o.id) > mean(b.id) ? o : b), opts[0]).id;
  const fans = scores.filter(v => topOf(v, opts).id === proposal);
  if (!fans.length) return null;
  const by = fans.reduce((b, v) => ((v.s[proposal] ?? 0) > (b.s[proposal] ?? 0) ? v : b), fans[0]);
  // the objector: one with a reason of its own (its wounds, hunger, tiredness, a friend hurt, the danger) for another option,
  // which it wants more than the proposal by `objectAt` — or no more than `near` less: a reason is said even by one who would
  // go along; the strongest such voice speaks
  let ob = null, gap = -Infinity, want = null, why = null;
  for (const v of scores) {
    if (v === by) continue;
    for (const o of opts) {
      if (o.id === proposal) continue;
      const g = (v.s[o.id] ?? 0) - (v.s[proposal] ?? 0), R = (v.why[o.id] || []).find(k => D.reasons.includes(k));
      if (R && (g >= D.objectAt || g >= -D.near) && g > gap) { ob = v; gap = g; want = o.id; why = R; }
    }
  }
  if (!ob) return {proposal, by: by.id, objector: null};
  // the others hear it
  const swayed = [];
  for (const v of scores) {
    if (v === ob || v === by) continue;   // (the proposer answers by its own lights, below)
    const was = topOf(v, opts).id, news = (v.why[was] || []).includes(why) || (v.why[want] || []).includes(why) ? D.known : 1;
    const p = D.sway * Math.max(0, 1 + D.bond * Math.max(-1, Math.min(1, bondOf(K, v.id, ob.id) / D.bondTop))) * news;
    v.s[want] = (v.s[want] ?? 0) + p; v.s[proposal] = (v.s[proposal] ?? 0) - p / 2;
    if (was !== want && topOf(v, opts).id === want) swayed.push(v.id);
  }
  // the proposer answers
  let answer = 'held', meet = null;
  if ((by.s[proposal] ?? 0) - (by.s[want] ?? 0) <= D.yieldAt) { answer = 'yielded'; by.s[want] = Math.max(by.s[want] ?? 0, (by.s[proposal] ?? 0) + D.yieldAt); }
  else {
    const best = v => Math.max(...opts.map(o => v.s[o.id] ?? 0));
    const mid = opts.filter(o => o.id !== proposal && o.id !== want && (by.s[o.id] ?? 0) >= D.meetAt * best(by) && (ob.s[o.id] ?? 0) >= D.meetAt * best(ob))
      .sort((p, q) => ((by.s[q.id] ?? 0) + (ob.s[q.id] ?? 0)) - ((by.s[p.id] ?? 0) + (ob.s[p.id] ?? 0)))[0];
    if (mid) { answer = 'met'; meet = mid.id; for (const v of [by, ob]) v.s[mid.id] = (v.s[mid.id] ?? 0) + D.meet; }
  }
  return {proposal, by: by.id, objector: ob.id, want, why, swayed, answer, ...(meet ? {meet} : {})};
}

// the evening's choice of a point (caravan.camp, caravan.visit): `cmds` the point's commands, `ask(c, opts)` → an option or
// null (what may be done), `x` what the evening knows (the danger of the night: x.quiet). → as pickLanes: {option, band, opts, asked}
export function councilChoose(a, K, point, cmds, ask, r, {allowed = () => true, x = null} = {}) {
  x ||= {quiet: true};   // (a town's evening: no night out to fear)
  x.need ??= K.members.filter(m => m.alive).length * CAMPAIGN.ration;
  if ((a?.cfg?.council ?? COUNCIL.policy) !== 'voices') return pickLanes(cmds, ask, r, {allowed});
  // every option that may be taken, from every lane: an urgent need is a strong voice, not a wall that hides the rest
  const asked = [], opts = [];
  for (const c of cmds) { if (!allowed(c)) continue; asked.push(c); const o = ask(c, opts); if (o && o.score > 0) opts.push(o); }
  if (!opts.length) return {option: null, band: null, opts: [], asked};
  const real = opts.filter(o => !o.id.endsWith('.goOn'));
  if (!real.length) return {option: null, band: null, opts: [], asked};   // (the way on alone is no choice)
  const voters = K.members.filter(m => m.alive && (V().say[m.role] ?? (m.captive ? V().say.captive : 1)) > 0 && !m.captive);
  if (!voters.length) return pickLanes(cmds, ask, r, {allowed});
  const scores = voters.map(m => ({id: m.id, ...scoreOne(a, K, m, opts, x)}));
  const first = scores.map(v => ({...v, s: {...v.s}}));   // (what each wanted before the talk: the fire tells it)
  const talk = debate(K, scores, opts);
  const {option, w} = pickVoices(opts, scores, r, V().eps);
  // the meeting, as it was (for the scene at the fire and the cards)
  const S = ensureSocial(K), meet = {day: K.day, point, pick: option?.id ?? null, w: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    voices: first.map((v, k) => { const top = topOf(v, opts), now = topOf(scores[k], opts); return {id: v.id, want: top.id, why: v.why[top.id] || [], s: v.s, ...(now.id !== top.id ? {now: now.id} : {})}; }),
    ...(talk ? {debate: talk} : {}),
    away: K.members.filter(m => m.alive && !voters.includes(m)).map(m => ({id: m.id, why: m.captive ? 'captive' : 'noSay'}))};
  (S.meetings ||= []).push(meet); if (S.meetings.length > V().keep) S.meetings.splice(0, S.meetings.length - V().keep);
  return {option, band: 'council', opts: opts.map(o => ({...o, score: w[o.id]})), asked};
}
export {councilWeight};
