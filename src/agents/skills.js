// How skills are read and how they grow (data/skills.js has the catalogue and the numbers).
// The one rule that ties SPECIAL to skills: a skill's letter sets its tiers, its learning speed and its
// soft ceiling. Practice comes only from work that was really done (a tick of labour that moved an
// order, a shot that left the bow), never from choosing a job, waiting for a reload or looking at a card.
import {SKILLS, TIERS, LEARN, FROM_JOB, isActive, activeSkills, recipeSkill} from '../data/skills.js';
import {NORM, STATS} from '../data/special.js';
import {curve} from '../data/curves.js';

const STAT_IDS = STATS.ids();


// the creature's letter for a skill (no SPECIAL: the human norm)
export const statFor = (a, skillId) => a.special?.[SKILLS.get(skillId).stat] ?? NORM;

// learning speed from the skill's own letter: 1 at 5, 1.4 at 10, 0.68 at 1, open upwards (the curve 'skillPace')
export const letterFactor = v => curve('skillPace', v);

// the soft ceiling on the 0–1 scale: 10 × letter on the card's 0–100 scale (the curve 'skillCap')
export const softCap = (a, skillId) => curve('skillCap', statFor(a, skillId));

// the highest tier the letter opens (1–4)
export const tierFor = stat => TIERS.filter(t => stat >= t.min).at(-1).id;
export const skillTier = (a, skillId) => tierFor(statFor(a, skillId));

export const skillOf = (a, skillId) => a.skill?.[skillId] ?? 0;

// Can this creature do this? The one check the AI, the stations, the workers and the card all read.
// Pure: no random numbers, no practice. Anything with a skill and a tier is an action: a recipe
// ({skill?, at, tier}), a job ({skill, tier}), a tiered part of a job ({skill, tier} from the data).
// A refusal says why, in data the card can word:
//   {ok: false, reasons: [{code: 'tier', stat: 'S', need: 6, have: 4, tier: 3, skill: 'smithing'}]}
// Only abilities are checked here; materials, fuel, benches and targets are the system's own business.
export function actionNeed(skill, tier = 1) {
  if (!skill || (tier || 1) <= 1) return null;
  return {code: 'tier', stat: SKILLS.get(skill).stat, need: TIERS[tier - 1].min, tier, skill};
}
export function actionAccess(a, skill, tier = 1) {
  const need = actionNeed(skill, tier), reasons = [];
  if (need) { const have = statFor(a, skill); if (have < need.need) reasons.push({...need, have}); }
  return {ok: !reasons.length, reasons, skill, tier: tier || 1};
}
export const canDoAction = (a, skill, tier) => actionAccess(a, skill, tier).ok;

// a craft order of this recipe
export const recipeNeed = r => actionNeed(recipeSkill(r), r.tier);
export const recipeAccess = (a, r) => actionAccess(a, recipeSkill(r), r.tier);
export const canMake = (a, r) => recipeAccess(a, r).ok;

// a whole job: the job's own tier on its own skill (digging ore, panning gold, taking wild honey)
export const jobAccess = (a, job) => actionAccess(a, job.skill, job.tier);

// a key that is the same for any two workers whom the tiers treat alike: one letter's tier per character
export const accessKey = a => STAT_IDS.map(id => tierFor(a.special?.[id] ?? NORM)).join('');

// the reason as a phrase for the card and the log: «сила от 6, у него 4»
export const reasonText = x => (x.code === 'tier' ? `${STATS.get(x.stat).label.toLowerCase()} от ${x.need}${x.have != null ? `, сейчас ${x.have}` : ''}` : x.code);

// how much `units` of practice would add right now (pure: the card and tests use it too)
export function practiceGain(a, skillId, units = 1) {
  const cur = skillOf(a, skillId);
  if (cur >= 1 || units <= 0) return 0;
  const slow = cur >= softCap(a, skillId) ? LEARN.overCap : 1;
  return Math.min(1 - cur, LEARN.rate * units * letterFactor(statFor(a, skillId)) * (a.mods?.learn ?? 1) * slow);
}

// real work was done: the skill grows. Only colonists learn (raiders and guards keep what they came with);
// reserved skills never grow.
export function practice(a, skillId, units = 1) {
  if (!a.prefs || !a.skill || !isActive(skillId)) return 0;
  const g = practiceGain(a, skillId, units);
  if (g > 0) a.skill[skillId] = skillOf(a, skillId) + g;
  return g;
}

// A newcomer's skills: a little of everything, more where the letter is strong, never above the ceiling;
// the liked job's skill starts at 0.3 (or the ceiling, if lower). Draws one number per active skill.
export function startSkills(rng, a, likedSkill) {
  a.skill = {}; a.skillVer = 1;
  for (const s of activeSkills()) {
    const v = rng() * 0.15 * letterFactor(statFor(a, s.id));
    a.skill[s.id] = Math.min(v, softCap(a, s.id));
  }
  if (likedSkill) a.skill[likedSkill] = Math.max(a.skill[likedSkill], Math.min(0.3, softCap(a, likedSkill)));
}

// A save from before the catalogue: skills were kept under job ids. Each skill takes the best of the
// jobs that trained it; job ids that are not skills are dropped; missing skills start at 0.
export function migrateSkills(a) {
  if (!a.skill || a.skillVer === 1) return;
  const old = a.skill, out = {};
  for (const [job, v] of Object.entries(old)) for (const id of FROM_JOB[job] || []) out[id] = Math.max(out[id] ?? 0, v || 0);
  if (!a.prefs) { a.skill = out; a.skillVer = 1; return; }   // a guard or a raider: only what it had
  for (const s of activeSkills()) out[s.id] ??= 0;
  a.skill = out; a.skillVer = 1;
}
