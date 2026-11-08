// Experience, acts and levels of the caravan's members (docs/CAMPAIGN.md «Опыт, дела и уровни»; data/experience.js; plan
// claude/xp-plan.md). The one owner of `m.xp`: nothing else adds to it.
//
//   m.xp     — experience in all · m.level — 1 and up, no ceiling
//   m.xpBy   — {S, P, E, C, I, A}: the experience of the acts since the last level, by the letter they wrote; the letter a
//              level grows is read from it, then it is cleared
//   m.acts   — {act id: units}: what one has done in all (the perks' requirements read it: Ver_E Э3)
//   m.xpOf   — {act id: experience}: where the experience came from (the probe and the card)
//   m.grew   — [{level, day, stat, from, to, why}]: the levels taken, the letter each grew, the act that grew it
//   m.perks, m.maims — the perks taken and the maims borne (Э3, Э4)
// Who earns: the free living members (the core, the hired, the joined, the freed, the former slaves); a captive only by its
// work, at XP.captive; beasts, vehicles, golems and foes nothing.
import {ACTS, XP, GREW, GREW_F, WORK_WHY, ROLE_WHY} from '../data/experience.js';
import {SPECIES} from '../data/species.js';
import {SKILLS} from '../data/skills.js';
import {RETINUE} from '../data/campaign.js';
import {COMBAT_ROLES} from '../data/roles.js';
import {campaignFact} from './social.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r2 = v => Math.round(v * 100) / 100;
const alive = K => K.members.filter(m => m.alive);

// the experience level L takes in all: XP.need × (L − 1) × (L + XP.lead) — 0, 30, 70, 120, 180 … 630 at the 10th, 2280 at the 20th
export const need = L => (L <= 1 ? 0 : XP.need * (L - 1) * (L + XP.lead));
// the level a sum of experience reaches
export function levelAt(xp) { let L = 1; while (xp >= need(L + 1)) L++; return L; }

// a member's fields, as they come: a newcomer, a captive bound on the map, a save from before (the user's call: no back-filling,
// everyone of an old save starts at 1 with nothing)
export function ensureXp(m) {
  m.xp ??= 0; m.level ??= 1; m.xpBy ??= {}; m.acts ??= {}; m.xpOf ??= {}; m.workBy ??= {}; m.grew ??= []; m.perks ??= []; m.maims ??= 0;
  return m;
}

// the group of a member's role (data/roles.js): the fighters by their fighting role, the hired by what they are
const HIRE_GROUP = {sellsword: 'линия', guide: 'дальний бой'};
export const groupOf = m => (m.fight && COMBAT_ROLES.has(m.fight) ? COMBAT_ROLES.get(m.fight).group : HIRE_GROUP[m.role] || null);
// the letters a member leans to by its role (data/campaign.js RETINUE.lean), Luck aside
const leanOf = m => (RETINUE.lean[groupOf(m)] || []).filter(s => XP.letters.includes(s));

// the letter an act writes: its own, the skill's, the role's (split between the role's letters)
function lettersOf(m, A, opt) {
  if (A.ground) return [];
  if (A.stat === 'skill') { const s = opt.skill && SKILLS.has(opt.skill) ? SKILLS.get(opt.skill).stat : null; return s && XP.letters.includes(s) ? [s] : []; }
  if (A.stat === 'role') return leanOf(m);
  return XP.letters.includes(A.stat) ? [A.stat] : [];
}

// An act or a share of the ground for one member: `n` units of act `id` (data/experience.js ACTS); `opt.skill` — the skill
// a work trained; `opt.xp` — the experience of it, when the act's own rate does not say it (a fight: × its danger). Returns
// the experience given.
export function award(K, m, id, n = 1, opt = {}) {
  if (!m?.alive || !(n > 0) || !ACTS.has(id)) return 0;
  const A = ACTS.get(id);
  if (m.captive && !A.captive) return 0;
  ensureXp(m);
  const xp = (opt.xp ?? A.xp * n) * (m.captive ? XP.captive : 1);
  m.acts[id] = r2((m.acts[id] || 0) + n);
  if (!(xp > 0)) { const ls = lettersOf(m, A, opt); for (const s of ls) m.xpBy[s] = r2((m.xpBy[s] || 0) + 1e-3); return 0; }   // (an act with no experience still points the way: the role's letter)
  m.xp = r2(m.xp + xp); m.xpOf[id] = r2((m.xpOf[id] || 0) + xp);
  if (id === 'work' && opt.skill) noteWork(m, opt.skill, xp);
  const ls = lettersOf(m, A, opt);
  for (const s of ls) m.xpBy[s] = r2((m.xpBy[s] || 0) + xp / ls.length);
  return xp;
}
// everyone free and living who was there
export const share = (K, ms, id, n = 1, opt = {}) => { for (const m of ms) if (!m.captive) award(K, m, id, n, opt); };

// ── a camp on the local map (campaign/fight.js applyCamp): each one's acts and work, by its own hand
export function campActs(K, o) {
  for (const mo of o.members) {
    if (!mo.alive) continue;
    const m = K.members.find(x => x.id === mo.id); if (!m?.alive) continue;
    for (const [id, n] of Object.entries(mo.acts || {})) award(K, m, id, n);
    for (const [skill, n] of Object.entries(mo.practiced || {})) award(K, m, 'work', n, {skill});
  }
}

// ── a fight, either mode (campaign/fight.js fight): the ground for all who stood in it, by its danger; the storm and the named
// fight on top; whoever fought and did nothing of its own there gets its role's letter
export function fightActs(K, d, how, win, rec, present) {
  const theirs = rec.theirs, ours = rec.ours;
  if (!(theirs > 0) || !(ours > 0) || !rec.foes) return;
  const danger = clamp(theirs / ours, XP.danger[0], XP.danger[1]);
  const ms = present.filter(m => m.alive && !m.captive);
  share(K, ms, 'fight', 1, {xp: ACTS.get('fight').xp * danger});
  if (how === 'guard' && win) share(K, ms, 'storm');
  if (d.boss && win) share(K, ms, 'boss');
  for (const m of ms) if (!rec.acted?.has(m.id)) award(K, m, 'role');
}

// ── a day of a stop in the quick mode (campaign/march.js caravanDay): not played on the map, so each one's work is what a played
// stop gives on average (XP.autoWork units), on what it does best (its best skill; none — its liked job's skill is not known
// here, so nothing)
export function autoWork(K) {
  for (const m of alive(K)) {
    const best = Object.entries(m.local?.skill || {}).filter(([id]) => SKILLS.has(id) && SKILLS.get(id).status !== 'reserved').sort((p, q) => q[1] - p[1])[0];
    if (best) award(K, m, 'work', XP.autoWork, {skill: best[0]});
  }
}

// ── the facts of a camp or of the campaign's day (campaign/social.js takeFacts): the deeds that are acts of their doer
//   saved — dressed a fallen one · aid — tended a wound · stoodUp — stood up for another · escorted — went beside one afraid
//   yieldedBed — gave its bed · tookWatch, repaid — stood a watch for another · keptEscort — kept its word · welcomed — took a
//   newcomer in · reconciled — made it up (both)
const FACT_ACTS = {saved: 'dress', aid: 'tend', stoodUp: 'cover', escorted: 'escort', yieldedBed: 'bed', tookWatch: 'swap', repaid: 'swap', keptEscort: 'kept', welcomed: 'welcome', reconciled: 'mend'};
export function factActs(K, f) {
  const id = FACT_ACTS[f.kind]; if (!id) return;
  const byId = x => K.members.find(m => m.id === x);
  award(K, byId(f.by), id);
  if (f.kind === 'reconciled') award(K, byId(f.to), id);
}

// ── the evening (campaign/march.js caravanDay, after the company's evening): a level for each who has the experience for it.
// The letter grown: the one its acts wrote most since the last level, inside its race's limits; none written — its role's;
// at the limit — the next; all at the limit — no letter (never a letter drawn at random). A fact of the company, a line of
// the log with the act that grew it.
export function levelEvening(a, K, say = () => {}) {
  for (const m of alive(K)) {
    ensureXp(m);
    while (m.xp >= need(m.level + 1)) levelUp(K, m, say);
  }
}
const capOf = (m, s) => SPECIES.get(m.race).special?.[s]?.[1] ?? Infinity;
// the letter a level grows → {stat, why} or null
export function letterFor(m) {
  const lean = leanOf(m), may = XP.letters.filter(s => (m.special?.[s] ?? 0) < capOf(m, s));
  if (!may.length) return null;
  const by = m.xpBy || {}, rank = s => (lean.includes(s) ? 1 : 0);
  const done = may.filter(s => (by[s] || 0) > 0).sort((p, q) => (by[q] - by[p]) || (rank(q) - rank(p)) || (XP.letters.indexOf(p) - XP.letters.indexOf(q)));
  if (done.length) return {stat: done[0], why: whyOf(m, done[0]) ?? (lean.includes(done[0]) && m.acts?.role ? `role:${groupOf(m)}` : null)};
  const l = lean.find(s => may.includes(s));
  if (l) return {stat: l, why: m.acts?.role ? `role:${groupOf(m)}` : null};
  // nothing done and nothing to lean to: the letter of its best skill, if it can still grow
  const best = Object.entries(m.local?.skill || {}).filter(([id]) => SKILLS.has(id) && may.includes(SKILLS.get(id).stat)).sort((p, q) => q[1] - p[1])[0];
  return best ? {stat: SKILLS.get(best[0]).stat, why: null} : null;
}
// the act that wrote this letter most since the last level: the experience of each act since then is not kept apart, so the
// act of all the time that writes this letter most is named (the probe shows both)
function whyOf(m, stat) {
  let best = null, top = 0;
  for (const [id, xp] of Object.entries(m.xpOf || {})) {
    const A = ACTS.get(id); if (A.ground) continue;
    const ls = A.stat === 'skill' ? null : lettersOf(m, A, {});
    if (ls && !ls.includes(stat)) continue;
    if (!ls) continue;   // (a work's letter is its skill's: named apart below)
    if (xp > top) { top = xp; best = id; }
  }
  const work = Object.entries(m.workBy || {}).filter(([sk]) => SKILLS.has(sk) && SKILLS.get(sk).stat === stat).sort((p, q) => q[1] - p[1])[0];
  if (work && work[1] > top) return `work:${work[0]}`;
  return best;
}
function levelUp(K, m, say) {
  m.level++;
  const pick = letterFor(m), from = pick ? m.special[pick.stat] : null;
  if (pick) m.special[pick.stat] = from + 1;
  m.grew.push({level: m.level, day: K.day, stat: pick?.stat ?? null, from, to: pick ? from + 1 : null, why: pick?.why ?? null});
  m.xpBy = {};
  const saw = alive(K).filter(x => x !== m && !x.captive).map(x => x.id);
  campaignFact(K, 'levelUp', {by: m.id, saw, params: {level: m.level, stat: pick?.stat ?? null}});
  say(levelLine(m, pick), [m.id]);
}
// «Хрольф окреп — не зря бил врага в рукопашной (Сила 8, 4-й уровень)»
export function levelLine(m, pick) {
  const f = m.gender === 'f', lv = `${m.level}-й уровень`;
  if (!pick) return `${m.name} ${f ? 'набралась' : 'набрался'} опыта (${lv}), но дальше расти ${f ? 'ей' : 'ему'} уже некуда.`;
  const grew = (f ? GREW_F : GREW)[pick.stat], val = `${STAT_LABEL[pick.stat]} ${m.special[pick.stat]}`;
  return `${m.name} ${grew}${pick.why ? ` — не зря ${whyText(pick.why, f)}` : ''} (${val}, ${lv}).`;
}
const STAT_LABEL = {S: 'Сила', P: 'Восприятие', E: 'Выносливость', C: 'Харизма', I: 'Интеллект', A: 'Ловкость'};
function whyText(why, f) {
  if (why.startsWith('work:')) { const sk = why.slice(5); return WORK_WHY[sk]?.[f ? 1 : 0] ?? `${f ? 'трудилась' : 'трудился'}: ${SKILLS.has(sk) ? SKILLS.get(sk).label : sk}`; }
  if (why.startsWith('role:')) return ROLE_WHY[why.slice(5)]?.[f ? 1 : 0] ?? ACTS.get('role')[f ? 'whyF' : 'why'];
  const A = ACTS.get(why);
  return (f ? A.whyF : null) ?? A.why;
}

// the work a member did, by skill (for the reason of a level): kept beside m.xpOf
export function noteWork(m, skill, xp) { if (xp > 0) { const w = m.workBy ||= {}; w[skill] = r2((w[skill] || 0) + xp); } }

// a member's level on a day shown (the screen plays the days back: campaign/march.js dayShot `lv`)
// (as the screen reads a day: the summary of the day before it — ui/campaignView.js; the day not yet stepped: as it is now)
export const levelOn = (K, m, day) => (day < K.day ? (K.daily || []).filter(x => x.d < day).at(-1)?.lv?.[m.id] ?? 1 : m.level ?? 1);
// the levels of the living at the end of a day, for the day's summary
export const levelsNow = K => Object.fromEntries(K.members.filter(m => m.alive).map(m => [m.id, m.level || 1]));

// ── for the card (ui/campSocial.js), as of a day shown
// the letters as they stood on a day shown (the levels taken on it or after taken back; the day not yet stepped: as now)
// and the levels taken by then
export const grewBy = (K, m, day) => (m.grew || []).filter(g => day >= K.day || g.day < day);
export function specialOn(K, m, day) {
  const s = {...(m.special || {})};
  if (day < K.day) for (const g of m.grew || []) if (g.day >= day && g.stat) s[g.stat] -= 1;
  return s;
}
// what a level grew, in words: «Сила 6 → 7: бил врага в рукопашной»
export function growText(m, g) {
  if (!g.stat) return 'расти уже некуда';
  return `${STAT_LABEL[g.stat]} ${g.from} → ${g.to}${g.why ? `: ${whyText(g.why, m.gender === 'f')}` : ''}`;
}
