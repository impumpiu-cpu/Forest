// The company's social state between the maps (docs/CAMPAIGN.md «Живая команда: договор»; plan claude/caravan-ver_d.md).
// The campaign owns it: K.social. A camp on the local map gets a snapshot — the bonds between those present, keyed by the
// members' ids and laid onto the map's own agent ids when they are all made — and gives back what the bonds came to; the
// campaign takes that back once per camp (the session: the camp's seed). Bonds to one not on the map are kept as they were.
// Fading: the map's day fades the bonds (settlement/relations.js daily); on a day with no such day on a map, the campaign's
// own day does — never both for one day.
//   K.social = {version, relations: {A: {B: v}}, why: {A: {B: [fact id]}}, facts: [fact], applied: {session: day}}
//   m.social = {mood: [{id, text, mood, endDay, span}], memory: [{fact, how, part, day, weight}]}
import {REL} from '../data/colony.js';
import {OPINION} from '../data/relations.js';
import {DAY, dayLen} from '../core/time.js';
import {SOCIAL, STORY, TRUST, GRIEF, WELCOME, JUDGE} from '../data/social.js';
import {makeFact} from '../social/facts.js';
import {knowers, memoryOf, remember, partIn as partOf} from '../social/facts.js';
import {FACT_KINDS} from '../data/social.js';
const FACT_KINDS_OF = f => FACT_KINDS[f.kind] || {weight: {}};

export const SOCIAL_VERSION = 1;

// the container, made or brought up to date (a save from before has none): idempotent
export function ensureSocial(K) {
  const S = K.social ||= {};
  S.version ??= SOCIAL_VERSION; S.relations ||= {}; S.why ||= {}; S.facts ||= []; S.commitments ||= []; S.applied ||= {}; S.faded ||= {};
  return S;
}
const clampV = v => Math.max(-OPINION.grudgeCap, Math.min(OPINION.grudgeCap, v));

// the bonds between those of `ids`, as a plain copy for a camp's setup: {A: {B: v}}
export function bondsAmong(K, ids) {
  const R = ensureSocial(K).relations, keep = new Set(ids.map(String)), out = {};
  for (const a of keep) for (const [b, v] of Object.entries(R[a] || {})) if (keep.has(b) && b !== a) (out[a] ||= {})[b] = v;
  return out;
}
// what a camp gave back: for each member on the map, its bonds to the others who were there (member id → value), whatever
// they came to there (faded, grown, gone); the bonds to those not on the map stay
export function takeBonds(K, present, back) {
  const R = ensureSocial(K).relations, here = new Set(present.map(String));
  for (const a of here) {
    const row = R[a] || {}, got = back?.[a] || {};
    for (const b of Object.keys(row)) if (here.has(b)) delete row[b];
    for (const [b, v] of Object.entries(got)) if (b !== a && here.has(b)) row[b] = clampV(v);
    if (Object.keys(row).length) R[a] = row; else delete R[a];
  }
}
// the session of a camp is taken back once, and only on the day it was played (a camp is played and taken back the same day
// of the walk: campaign/fight.js): an outcome of a day before — however long ago, after a save — is old and refused; so the
// ledger need keep only the last days' sessions
export function takeOnce(K, session, day = K.day) {
  const S = ensureSocial(K);
  if (day !== K.day || S.applied[session] != null) return false;
  S.applied[session] = K.day;
  for (const [k, d] of Object.entries(S.applied)) if (d < K.day - 1) delete S.applied[k];
  return true;
}
// the campaign's day: the bonds between the members fade, once a day of the walk — the one owner of their time (a map of
// the day does not fade them: settlement/relations.js daily), to those present and to those away alike
export function fadeDay(K) {
  const S = ensureSocial(K);
  S.faded = {};   // (a save from before kept the maps' days here)
  for (const m of K.members) if (m.social?.mood?.length) m.social.mood = m.social.mood.filter(e => e.endDay > K.day);   // what ran out is gone
  for (const [a, row] of Object.entries(S.relations)) {
    for (const [b, v] of Object.entries(row)) { const x = v * (v > 0 ? REL.fadeGood : REL.fade); if (Math.abs(x) < REL.forget) delete row[b]; else row[b] = x; }
    if (!Object.keys(row).length) delete S.relations[a];
  }
}

// the mood a member carries out of a camp: its fresh thoughts with what is left of them, by the campaign's day (a camp's tick
// is within its day: `S.day` the day, the camp's ticks counted from its start)
export function moodOut(day, tick, diary, w = null) {
  const D = dayLen(w);   // (a camp's slower sun: core/time.js dayScale)
  return (diary || []).filter(e => e.until > tick).map(e => ({id: e.id, text: e.text, mood: e.mood, endDay: day + (e.until - tick) / D, span: (e.until - e.t) * DAY / D}));   // (span: in a settlement's ticks)
}
// and into the next: what is left of it at this camp's start; what ran out on the way is gone
export function moodIn(day, tick, mood, w = null) {
  const D = dayLen(w);
  return (mood || []).filter(e => e.endDay > day).map(e => { const until = tick + Math.round((e.endDay - day) * D); return {t: until - Math.round(e.span * D / DAY), id: e.id, text: e.text, mood: e.mood, until}; });
}

// the facts a camp noted (settlement/facts.js), taken into the campaign: kept, remembered by those who know them first hand,
// and named as the reasons of the bonds they moved (`params.bond`: to → by, by → to). The bond's value came with the camp's
// bonds (takeBonds): a fact adds nothing to it a second time.
export function takeFacts(K, facts) {
  if (!facts?.length) return;
  const S = ensureSocial(K), byId = new Map(K.members.map(m => [m.id, m])), seen = new Set(S.facts.map(f => f.id));
  for (const f of facts) {
    if (seen.has(f.id)) continue;
    S.facts.push(f); seen.add(f.id);
    for (const id of knowers(f)) { const m = byId.get(id); if (m) (m.social ||= {}).memory = remember(m.social.memory || [], memoryOf(f, id)); }
    const why = (a, b) => { if (a == null || b == null) return; const row = S.why[a] ||= {}, l = row[b] ||= []; if (!l.includes(f.id)) l.push(f.id); if (l.length > SOCIAL.whyMax) l.shift(); };
    if (f.params?.bond?.to) why(f.to, f.by);
    if (f.params?.bond?.by) why(f.by, f.to);
  }
  pruneFacts(K);
}
// past the limit the oldest facts go — but none a memory or a bond's reason still points to
function pruneFacts(K) {
  const S = ensureSocial(K); if (S.facts.length <= SOCIAL.factsMax) return;
  const held = new Set();
  for (const m of K.members) for (const x of m.social?.memory || []) held.add(x.fact);
  for (const row of Object.values(S.why)) for (const l of Object.values(row)) for (const id of l) held.add(id);
  let over = S.facts.length - SOCIAL.factsMax;
  S.facts = S.facts.filter(f => over <= 0 || held.has(f.id) || (over--, false));
}
// the reasons of what A feels for B: the facts, oldest first
export const reasonsOf = (K, a, b) => (K.social?.why?.[a]?.[b] || []).map(id => K.social.facts.find(f => f.id === id)).filter(Boolean);

// a member's fate as a fact of the campaign (social/fate.js: 'died', 'taken', 'escaped', 'sold', 'left'), known to those
// still with the company — `heard` when they were not there to see it (a death on a quiet stop's map, a captive gone in the
// night) — and the loss as each of them takes it
// a fact of the campaign's own day (not of a camp's map): its id by the day and a number; kept as a camp's facts are
export function campaignFact(K, kind, parts) {
  const S = ensureSocial(K), n = (S.factN = (S.factN || 0) + 1);
  const f = makeFact(`${K.seed}:d${K.day}#${n}`, kind, {...parts, day: K.day});
  takeFacts(K, [f]);
  return f;
}
// a bond moved by a deed of the campaign's day (the watch, campaign/duty.js): the one place it is moved, the fact its reason
export function bondBy(K, from, to, v, f) {
  if (!v) return;
  const S = ensureSocial(K), row = S.relations[from] ||= {};
  row[to] = clampV((row[to] || 0) + v);
  if (f) { const l = (S.why[from] ||= {})[to] ||= []; if (!l.includes(f.id)) l.push(f.id); if (l.length > SOCIAL.whyMax) l.shift(); }
}
export const bondOf = (K, from, to) => K.social?.relations?.[from]?.[to] || 0;

// a fate (social/fate.js) as the company comes to know it: who saw it (on a camp's map: settlement/facts.js noteSeen — `seen`)
// knows it so; the others hear it from one of them — the one who was closest to the gone (its bond), else the lower id — and
// remember from whom; if nobody saw it, they know only that it is gone, not how (a `missing` fact). Without `seen`: a fate of
// the campaign's day (all saw it), or `heard` — told by the most talkative of them
export function noteFate(K, m, kind, {heard = false, seen = null, params = {}} = {}) {
  const here = K.members.filter(x => x.alive && x !== m && !x.captive).map(x => x.id), R = ensureSocial(K).relations;
  const bondTo = id => R[id]?.[m.id] || 0, byBond = (p, q) => bondTo(q) - bondTo(p) || p - q;
  let saw, told, teller = null;
  if (seen) { saw = here.filter(id => seen.includes(id)); told = here.filter(id => !saw.includes(id)); teller = saw.slice().sort(byBond)[0] ?? null; }
  else if (heard) { saw = []; told = here; teller = here.map(id => K.members.find(x => x.id === id)).sort((p, q) => (q.local?.leans?.social ?? 0) - (p.local?.leans?.social ?? 0) || p.id - q.id)[0]?.id ?? null; }
  else { saw = here; told = []; }
  // nobody saw it: what the company knows is that it is gone — a fact of its own (`missing`, the true fate in params.was for the
  // world and the chronicle, never read as the death or the capture: campaign/council.js losses, the cards); it grieves nobody
  // yet — the fate is not known (a later word of a witness would make the true fact: none comes today)
  if (seen && teller == null) return campaignFact(K, 'missing', {to: m.id, saw: [], heard: told, params: {...params, was: kind}});
  const f = campaignFact(K, kind, {to: m.id, saw, heard: told, params: teller != null ? {...params, teller} : params});
  if (teller != null) for (const id of told) { const x = K.members.find(o => o.id === id), e = x?.social?.memory?.find(q => q.fact === f.id); if (e && id !== teller) e.from = teller; }
  grieve(K, m, kind, [...saw, ...told]);
  return f;
}
// the loss: by the bond each had with the one gone (K.social.relations, personal), a mood for some days (m.social.mood)
export function grieve(K, gone, kind, ids) {
  const G = GRIEF[kind === 'died' ? 'died' : kind === 'taken' ? 'taken' : kind === 'left' ? 'left' : null]; if (!G) return;
  const R = ensureSocial(K).relations, f = gone.gender === 'f';
  for (const id of ids) {
    const m = K.members.find(x => x.id === id); if (!m?.alive) continue;
    const v = R[id]?.[gone.id] || 0, side = v >= 1 ? 'friend' : v <= -1 ? 'foe' : 'known', mood = G[side];
    if (!mood) continue;
    const T = GRIEF.text, text = kind === 'died' ? (side === 'friend' ? T.grieve(gone.name, f) : side === 'foe' ? T.relief(gone.name) : T.mourn(gone.name, f))
      : kind === 'taken' ? T.takenFriend(gone.name) : side === 'foe' ? T.relief(gone.name) : T.leftFriend(gone.name);
    ((m.social ||= {}).mood ||= []).push({id: `loss:${kind}`, text, mood, endDay: K.day + G.days, span: G.days * DAY});
  }
}

// a newcomer (hired, joined, freed — not a captive: campaign/town.js, fight.js): the most sociable of the free, if sociable
// enough (leans.social ≥ WELCOME.from), takes it in — a fact, and the bond both ways
export function welcome(K, m) {
  if (m.captive) return null;
  const by = K.members.filter(x => x.alive && x !== m && !x.captive && (x.local?.leans?.social ?? 0) >= WELCOME.from)
    .sort((p, q) => (q.local.leans.social - p.local.leans.social) || (p.id - q.id))[0];
  if (!by) return null;
  const f = campaignFact(K, 'welcomed', {by: by.id, to: m.id, saw: K.members.filter(x => x.alive && x !== by && x !== m).map(x => x.id), params: {bond: WELCOME.bond}});
  bondBy(K, m.id, by.id, WELCOME.bond.to, f); bondBy(K, by.id, m.id, WELCOME.bond.by, f);
  return f;
}
// a captive sold (campaign/slavery.js): those who hold mercy high or freedom dear take it ill — each its own fact and mood
export function judge(K, sold) {
  for (const m of K.members) {
    if (!m.alive || m.captive || m === sold) continue;
    if (!((m.align?.mercy ?? 0) >= JUDGE.mercy || (m.values || []).some(v => JUDGE.values.includes(v)))) continue;
    campaignFact(K, 'frowned', {by: m.id, saw: [], params: {sold: sold.id}});
    ((m.social ||= {}).mood ||= []).push({id: 'frowned', text: JUDGE.text, mood: JUDGE.mood, endDay: K.day + JUDGE.days, span: JUDGE.days * DAY});
  }
}

// the evening's talk: what one lived through yesterday or today — a rescue, a wound dressed, a defence — it tells the others
// round the fire; who did not know it, knows it now as heard, and from whom. The fact itself is the same one: a story told
// is no second rescue (the bond is not moved again). Who does not hear: the captives, those gone. Called once a day.
export function tell(K) {
  const S = ensureSocial(K); if (S.told === K.day) return; S.told = K.day;
  const here = K.members.filter(m => m.alive && !m.captive), byId = new Map(K.members.map(m => [m.id, m]));
  for (const f of S.facts) {
    if (f.day < K.day - 1 || FACT_KINDS_OF(f).fate) continue;
    const teller = [f.to, f.by].map(id => byId.get(id)).find(m => m?.alive && !m.captive && (FACT_KINDS_OF(f).weight[partOf(f, m.id)] ?? 0) >= SOCIAL.tellFrom);
    if (!teller) continue;
    for (const m of here) {
      if (m === teller || (m.social?.memory || []).some(x => x.fact === f.id) || knowers(f).includes(m.id)) continue;
      const w = (FACT_KINDS_OF(f).weight.saw ?? 0) / 2;
      (m.social ||= {}).memory = remember(m.social.memory || [], {fact: f.id, how: 'heard', part: 'heard', from: teller.id, day: K.day, weight: w});
    }
  }
}

// ── the stories of the company (data/social.js STORY)
// a good turn paid back: one worn out on tonight's watch (`tired`) is relieved, unasked, by one it did a good turn to lately,
// fresher than it — the one who owes. → [the one who takes the watch, the fact] or null (campaign/duty.js nightWatch)
export function repayer(K, m, free, tiredOf) {
  const S = ensureSocial(K), T = STORY, paid = new Set(S.facts.filter(f => f.kind === 'repaid').map(f => f.params?.for));
  const turns = S.facts.filter(f => T.good.includes(f.kind) && f.by === m.id && f.to != null && f.to !== m.id && K.day - f.day <= T.days && !paid.has(f.id));
  for (const f of turns.slice().reverse()) {
    const o = free.find(x => x.id === f.to && tiredOf(x) <= tiredOf(m) - T.gap);
    if (o) return [o, f];
  }
  return null;
}
// a grudge softened, a quarrel made up (STORY): for one who holds a grudge against another — a bond at `grudge` or below, made
// by a fact it knows (`sour`: the last quarrel between them, a word broken to it) — a good turn in need the other did it after
// that fact softens it: its bond rises (the lift is the fact's, `thankful`), on its side only. When both then stand at `peace` or
// above, they are reconciled — a fact of the pair, told. Called once a day. → the facts of it
export function reconcile(K, say = () => {}) {
  const S = ensureSocial(K), T = STORY, R = S.relations, here = K.members.filter(m => m.alive && !m.captive), byId = new Map(here.map(m => [m.id, m])), out = [];
  const between = (f, a, b) => (f.by === a && f.to === b) || (f.by === b && f.to === a);
  for (const a of here) {
    if ((a.align?.mercy ?? 0) < T.mercyFrom) continue;   // (a merciless heart keeps its grudge)
    const mine = new Set((a.social?.memory || []).map(x => x.fact));
    for (const [bid, v] of Object.entries(R[a.id] || {})) {
      const b = byId.get(+bid); if (!b || v > T.grudge) continue;
      // the grudge's cause: the last sour fact between them that a knows of; none known — nothing to forgive by a deed
      const sour = S.facts.filter(f => T.sour.includes(f.kind) && between(f, a.id, b.id) && mine.has(f.id)).at(-1); if (!sour) continue;
      // the good turn after it, not yet thanked for by a
      const help = S.facts.filter(f => T.need.includes(f.kind) && f.by === b.id && f.to === a.id && f.day >= sour.day && f.id !== sour.id && K.day - f.day <= T.days && !S.facts.some(g => g.kind === 'thankful' && g.by === a.id && g.params?.for === f.id)).at(-1);
      if (!help || help.day < sour.day || (help.day === sour.day && S.facts.indexOf(help) < S.facts.indexOf(sour))) continue;
      const f = campaignFact(K, 'thankful', {by: a.id, to: b.id, saw: here.map(m => m.id), params: {for: help.id, over: sour.id}});
      bondBy(K, a.id, b.id, Math.min(T.thank, T.made - v), f); out.push(f);
      // both at peace now: reconciled — one fact for the pair, said once
      if (bondOf(K, a.id, b.id) >= T.peace && bondOf(K, b.id, a.id) >= T.peace && !S.facts.some(g => g.kind === 'reconciled' && between(g, a.id, b.id) && g.day >= sour.day)) {
        const g = campaignFact(K, 'reconciled', {by: a.id, to: b.id, saw: here.map(m => m.id), params: {for: help.id}}); out.push(g);
        say(`${a.name} и ${b.name} помирились: после того как ${b.name} ${b.gender === 'f' ? 'выручила' : 'выручил'} в беде, старая обида забыта.`, [a.id, b.id]);
      } else say(`${a.name} уже не так зл${a.gender === 'f' ? 'а' : ''} на ${b.name}: ${b.gender === 'f' ? 'та выручила' : 'тот выручил'} в беде.`, [a.id, b.id]);
    }
  }
  return out;
}

// how one who is not of the core trusts the company, −1 … 1 (data/social.js TRUST): its bonds to the core, less the words
// broken to it lately (campaign/people.js: the day's loyalty and a hireling's opinion move by it)
export function trustOf(K, m, coreIds) {
  const S = ensureSocial(K), row = S.relations[m.id] || {};
  const bonds = coreIds.filter(id => id !== m.id).map(id => row[id] || 0);
  const mean = bonds.length ? bonds.reduce((x, y) => x + y, 0) / bonds.length / TRUST.top : 0;
  const broke = S.facts.filter(f => f.kind === 'brokeWord' && f.to === m.id && K.day - f.day <= TRUST.days).length;
  return Math.max(-1, Math.min(1, mean - TRUST.broke * broke));
}
