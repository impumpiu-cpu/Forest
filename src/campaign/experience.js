// Experience, acts and levels of the caravan's members (docs/CAMPAIGN.md «Опыт, дела и уровни»; data/experience.js; plan
// claude/xp-plan.md). The one owner of `m.xp`: nothing else adds to it.
//
//   m.xp     — experience in all · m.level — 1 up to XP.cap (20): past it no level, no letter, no perk
//   m.xpBy   — {S, P, E, C, I, A}: the experience of the acts since the last level, by the letter they wrote; the letter a
//              level grows is read from it, then it is cleared
//   m.acts   — {act id: units}: what one has done in all (the perks' requirements read it: Ver_E Э3)
//   m.xpOf   — {act id: experience}: where the experience came from (the probe and the card)
//   m.lvOf, m.lvWork — {act id: experience}, {skill id: experience} since the last level: the reason a level names (cleared with it)
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
import {pickPerk, perkLabel} from './perks.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r2 = v => Math.round(v * 100) / 100;
const alive = K => K.members.filter(m => m.alive);

// the experience level L takes in all: XP.need × (L − 1) × (L + XP.lead) — 0, 30, 70, 120, 180 … 630 at the 10th, 2280 at the 20th
export const need = L => (L <= 1 ? 0 : XP.need * (L - 1) * (L + XP.lead));
// the level a sum of experience reaches (no further than the cap)
export function levelAt(xp) { let L = 1; while (L < XP.cap && xp >= need(L + 1)) L++; return L; }
// it stands at the last level: no more growth
export const atCap = L => L >= XP.cap;

// a member's fields, as they come: a newcomer, a captive bound on the map, a save from before (the user's call: no back-filling,
// everyone of an old save starts at 1 with nothing)
export function ensureXp(m) {
  m.xp ??= 0; m.level ??= 1; m.xpBy ??= {}; m.acts ??= {}; m.xpOf ??= {}; m.workBy ??= {}; m.lvOf ??= {}; m.lvWork ??= {}; m.grew ??= []; m.perks ??= []; m.maims ??= 0;
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
  if (!(xp > 0)) {   // an act with no experience: a count (slew); the role's still points the way, by its weight
    if (A.stat === 'role') { const ls = lettersOf(m, A, opt); for (const s of ls) m.xpBy[s] = r2((m.xpBy[s] || 0) + XP.roleWeight * n / ls.length); m.lvOf[id] = r2((m.lvOf[id] || 0) + XP.roleWeight * n); }
    return 0;
  }
  m.xp = r2(m.xp + xp); m.xpOf[id] = r2((m.xpOf[id] || 0) + xp); m.lvOf[id] = r2((m.lvOf[id] || 0) + xp);
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
    for (const [id, n] of Object.entries(mo.acts || {})) award(K, m, id, n, mo.actXp?.[id] != null ? {xp: mo.actXp[id]} : {});   // (a foe brought down: counted once, worth its weight)
    for (const [skill, n] of Object.entries(mo.practiced || {})) award(K, m, 'work', n, {skill});
  }
}

// ── a fight, either mode (campaign/fight.js fight): the ground for all who stood in it, by its danger; the storm and the named
// fight on top; whoever fought and did nothing of its own there gets its role's letter
//   rec.merit — Map(member id → the experience of its own acts in this fight), from the camp on the local map; null — the quick
//   fight, which knows no acts: there all get the ground whole
export function fightActs(K, d, how, win, rec, present) {
  const theirs = rec.theirs, ours = rec.ours;
  if (!(theirs > 0) || !(ours > 0) || !rec.foes) return;
  const danger = clamp(theirs / ours, XP.danger[0], XP.danger[1]);
  const ms = present.filter(m => m.alive && !m.captive);
  byMerit(K, ms, 'fight', ACTS.get('fight').xp * danger, rec.merit);
  // the counts the perks ask, both modes see them: fights in a role of its group, fights beside one of another race
  for (const m of ms) {
    const g = groupOf(m); if (g) m.acts[`fight:${g}`] = (m.acts[`fight:${g}`] || 0) + 1;
    if (ms.some(o => o !== m && o.race !== m.race)) m.acts.beside = (m.acts.beside || 0) + 1;
  }
  if (how === 'guard' && win) byMerit(K, ms, 'storm', ACTS.get('storm').xp, rec.merit);
  if (d.boss && win) byMerit(K, ms, 'boss', ACTS.get('boss').xp, rec.merit);
  for (const m of ms) if (!rec.acted?.has(m.id)) award(K, m, 'role');
}

// the ground of a fight by merit (XP.merit): `present` of it to each one there, the rest by its own acts against the best's
function byMerit(K, ms, id, whole, merit) {
  const best = merit ? Math.max(0, ...ms.map(m => merit.get(m.id) || 0)) : 0;
  for (const m of ms) {
    const k = !merit ? 1 : XP.merit.present + (1 - XP.merit.present) * (best > 0 ? (merit.get(m.id) || 0) / best : 0);
    award(K, m, id, 1, {xp: whole * k});
  }
}

// ── a day of a stop in the quick mode (campaign/march.js caravanDay): not played on the map, so each one's work is what a played
// stop gives on average (XP.autoWork units) — on the stop's purpose (XP.autoBy: its best skill of those), else on its best skill
// outside the fight's: the fight's skills are trained in a fight, not at a stop for food
export function autoWork(K, why = '') {
  const of = XP.autoBy[why.split(':')[0]] || null;
  for (const m of alive(K)) {
    const sk = Object.entries(m.local?.skill || {}).filter(([id]) => SKILLS.has(id) && SKILLS.get(id).status !== 'reserved' && !XP.fightSkills.includes(id)).sort((p, q) => q[1] - p[1]);
    const best = (of && sk.find(([id]) => of.includes(id))) || sk[0];
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
// Several levels in one evening (a dangerous fight: up to three) are one moment and one line: each grows the next letter its
// acts wrote (a letter grown is not grown twice that evening while another was written), then the role's; the letters written
// are cleared once, after them all.
export function levelEvening(a, K, say = () => {}) {
  for (const m of alive(K)) {
    ensureXp(m);
    const picks = [], grown = new Set(), perks = [];
    while (!atCap(m.level) && m.xp >= need(m.level + 1)) { picks.push(levelUp(K, m, grown)); const p = pickPerk(K, m); if (p) perks.push(p); }   // a perk a level, while there is one it may take (campaign/perks.js)
    if (!picks.length) continue;
    m.xpBy = {}; m.lvOf = {}; m.lvWork = {};
    say(levelLine(m, picks) + perkLine(m, perks), [m.id]);
  }
}
const capOf = (m, s) => SPECIES.get(m.race).special?.[s]?.[1] ?? Infinity;
// the letter a level grows → {stat, why} or null
export function letterFor(m, grown = new Set()) {
  const lean = leanOf(m), may = XP.letters.filter(s => (m.special?.[s] ?? 0) < capOf(m, s));
  if (!may.length) return null;
  const by = m.xpBy || {}, rank = s => (lean.includes(s) ? 1 : 0);
  const done = may.filter(s => (by[s] || 0) > 0 && !grown.has(s)).sort((p, q) => (by[q] - by[p]) || (rank(q) - rank(p)) || (XP.letters.indexOf(p) - XP.letters.indexOf(q)));
  if (done.length) return {stat: done[0], why: whyOf(m, done[0])};
  const l = lean.find(s => may.includes(s) && !grown.has(s)) ?? lean.find(s => may.includes(s));   // (the role's other letter first, if one grew tonight)
  if (l) return {stat: l, why: m.acts?.role ? `role:${groupOf(m)}` : null};
  // nothing done and nothing to lean to: the letter of its best skill, if it can still grow
  const best = Object.entries(m.local?.skill || {}).filter(([id]) => SKILLS.has(id) && may.includes(SKILLS.get(id).stat)).sort((p, q) => q[1] - p[1])[0];
  return best ? {stat: SKILLS.get(best[0]).stat, why: null} : null;
}
// the act that wrote this letter most since the last level (m.lvOf, m.lvWork): the reason is of this level, not of a life
function whyOf(m, stat) {
  let best = null, top = 0;
  for (const [id, xp] of Object.entries(m.lvOf || {})) {
    const A = ACTS.get(id); if (A.ground) continue;
    const ls = A.stat === 'skill' ? null : lettersOf(m, A, {});
    if (ls && !ls.includes(stat)) continue;
    if (!ls) continue;   // (a work's letter is its skill's: named apart below)
    if (A.stat === 'role') { if (xp > top) { top = xp; best = `role:${groupOf(m)}`; } continue; }
    if (xp > top) { top = xp; best = id; }
  }
  const work = Object.entries(m.lvWork || {}).filter(([sk]) => SKILLS.has(sk) && SKILLS.get(sk).stat === stat).sort((p, q) => q[1] - p[1])[0];
  if (work && work[1] > top) return `work:${work[0]}`;
  return best;
}
function levelUp(K, m, grown) {
  m.level++;
  const pick = letterFor(m, grown), from = pick ? m.special[pick.stat] : null;
  if (pick) { m.special[pick.stat] = from + 1; grown.add(pick.stat); }
  m.grew.push({level: m.level, day: K.day, stat: pick?.stat ?? null, from, to: pick ? from + 1 : null, why: pick?.why ?? null});
  const saw = alive(K).filter(x => x !== m && !x.captive).map(x => x.id);
  campaignFact(K, 'levelUp', {by: m.id, saw, params: {level: m.level, stat: pick?.stat ?? null}});
  return pick;
}
// one line for an evening's levels: «Хрольф окреп — не зря бил врага в рукопашной (Сила 8, 4-й уровень)»;
// «Хрольф окреп и стал выносливее — не зря бил врага в рукопашной и держал своё место в строю (Сила 8, Выносливость 7; 5-й уровень)»
export function levelLine(m, picks) {
  picks = (Array.isArray(picks) ? picks : [picks]);
  const f = m.gender === 'f', lv = `${m.level}-й уровень`, got = picks.filter(Boolean);
  if (!got.length) return `${m.name} ${f ? 'набралась' : 'набрался'} опыта (${lv}), но дальше расти ${f ? 'ей' : 'ему'} уже некуда.`;
  const grew = got.map(p => (f ? GREW_F : GREW)[p.stat]), whys = [...new Set(got.map(p => p.why).filter(Boolean).map(w => whyText(w, f)))];
  const join = xs => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} и ${xs.at(-1)}` : xs[0]);
  const vals = got.map(p => `${STAT_LABEL[p.stat]} ${m.special[p.stat]}`).join(', ');
  const more = picks.length > 1 ? (got.length < picks.length ? `, сразу ${picks.length} уровня — дальше расти ${f ? 'ей' : 'ему'} уже некуда` : `, сразу ${picks.length} уровня`) : '';
  return `${m.name} ${join(grew)}${whys.length ? ` — не зря ${join(whys)}` : ''} (${vals}; ${lv}${more}).`;
}
// «Выучил „Плечом к плечу“.»
function perkLine(m, perks) {
  if (!perks.length) return '';
  const f = m.gender === 'f', ls = perks.map(p => perkLabel(p.id, p.rank));
  return ` ${f ? 'Выучила' : 'Выучил'} ${ls.length > 1 ? `${ls.slice(0, -1).join(', ')} и ${ls.at(-1)}` : ls[0]}.`;
}
const STAT_LABEL = {S: 'Сила', P: 'Восприятие', E: 'Выносливость', C: 'Харизма', I: 'Интеллект', A: 'Ловкость'};
function whyText(why, f) {
  if (why.startsWith('work:')) { const sk = why.slice(5); return WORK_WHY[sk]?.[f ? 1 : 0] ?? `${f ? 'трудилась' : 'трудился'}: ${SKILLS.has(sk) ? SKILLS.get(sk).label : sk}`; }
  if (why.startsWith('role:')) return ROLE_WHY[why.slice(5)]?.[f ? 1 : 0] ?? ACTS.get('role')[f ? 'whyF' : 'why'];
  const A = ACTS.get(why);
  return (f ? A.whyF : null) ?? A.why;
}

// the work a member did, by skill (for the reason of a level): kept beside m.xpOf
export function noteWork(m, skill, xp) { if (xp > 0) { const w = m.workBy ||= {}, l = m.lvWork ||= {}; w[skill] = r2((w[skill] || 0) + xp); l[skill] = r2((l[skill] || 0) + xp); } }

// a member's level on a day shown (the screen plays the days back: campaign/march.js dayShot `lv`)
// (as the screen reads a day: the summary of the day before it — ui/campaignView.js; the day not yet stepped: as it is now)
// (one gone by then keeps the level it left with: the last summary that knew it, else its own)
export function levelOn(K, m, day) {
  if (day >= K.day) return m.level ?? 1;
  const D = K.daily || [];
  for (let k = D.length - 1; k >= 0; k--) if (D[k].d < day && D[k].lv?.[m.id] != null) return D[k].lv[m.id];
  // older than the days kept (K.daily holds the last few): the levels it grew before that day (each level is one row of m.grew)
  // (one summoned came at its level: the grown rows are those of this walk — campaign/ascend.js summonInto)
  return (m.summoned?.level ?? 1) + (m.grew || []).filter(g => g.day < day).length;
}
// the levels of all, the gone as they left, at the end of a day: for the day's summary
export const levelsNow = K => Object.fromEntries(K.members.map(m => [m.id, m.level || 1]));
// …and their experience, whole (the bar on the roster and the card, as of a day shown: Ver_E Э5)
export const xpNow = K => Object.fromEntries(K.members.filter(m => !m.captive).map(m => [m.id, Math.floor(m.xp || 0)]));
export function xpOn(K, m, day) {
  if (day >= K.day) return m.xp || 0;
  const D = K.daily || [];
  for (let k = D.length - 1; k >= 0; k--) if (D[k].d < day && D[k].xp?.[m.id] != null) return D[k].xp[m.id];
  return null;   // (older than the days kept, K.daily — or an old save: no bar rather than a false one)
}
// how far to the next level, 0…1, as of a day shown (null: not known)
export function toNext(K, m, day) {
  const xp = xpOn(K, m, day), L = levelOn(K, m, day); if (xp == null || atCap(L)) return null;   // (at the cap: no bar — nothing to grow to)
  const lo = need(L), hi = need(L + 1);
  return Math.max(0, Math.min(1, (xp - lo) / Math.max(1, hi - lo)));
}
// the deeds that brought it most of its experience (m.xpOf by act id, ACTS rows: data/experience.js) — for the card
export const deedsOf = (m, n = 5) => Object.entries(m.xpOf || {}).filter(([id]) => !ACTS.get(id)?.ground).sort((p, q) => q[1] - p[1]).slice(0, n).map(([id, xp]) => ({id, xp: Math.round(xp), count: id === 'work' ? 0 : m.acts?.[id] || 0, label: ACTS.get(id)?.label || id}));

// ── for the card (ui/campSocial.js), as of a day shown
// the letters as they stood on a day shown (the levels taken on it or after taken back; the day not yet stepped: as now)
// and the levels taken by then
export const grewBy = (K, m, day) => (m.grew || []).filter(g => day >= K.day || g.day < day);
export function specialOn(K, m, day) {
  const s = {...(m.special || {})};
  if (day < K.day) { for (const g of m.grew || []) if (g.day >= day && g.stat) s[g.stat] -= 1; for (const g of m.granted || []) if (g.day >= day) s[g.stat] -= g.n; }   // (and what a perk granted: «Везучий»)
  return s;
}
// what a level grew, in words: «Сила 6 → 7: бил врага в рукопашной»
export function growText(m, g) {
  if (!g.stat) return 'расти уже некуда';
  return `${STAT_LABEL[g.stat]} ${g.from} → ${g.to}${g.why ? `: ${whyText(g.why, m.gender === 'f')}` : ''}`;
}
