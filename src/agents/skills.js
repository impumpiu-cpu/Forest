// How skills are read and how they grow (data/skills.js has the catalogue and the numbers).
// The one rule that ties SPECIAL to skills: a skill's letter sets its tiers, its learning speed and its
// soft ceiling. Practice comes only from work that was really done (a tick of labour that moved an
// order, a shot that left the bow), never from choosing a job, waiting for a reload or looking at a card.
import {SKILLS, TIERS, LEARN, FROM_JOB, isActive, activeSkills} from '../data/skills.js';
import {NORM} from '../data/special.js';

const clamp01 = v => Math.max(0, Math.min(1, v));

// the creature's letter for a skill (no SPECIAL: the human norm)
export const statFor = (a, skillId) => a.special?.[SKILLS.get(skillId).stat] ?? NORM;

// learning speed from the skill's own letter: 1 at 5, 1.4 at 10, 0.68 at 1, open upwards
export const letterFactor = v => Math.max(LEARN.minFactor, LEARN.base + LEARN.perPoint * v);

// the soft ceiling on the 0–1 scale: 10 × letter on the card's 0–100 scale
export const softCap = (a, skillId) => clamp01(statFor(a, skillId) / 10);

// the highest tier the letter opens (1–4)
export const tierFor = stat => TIERS.filter(t => stat >= t.min).at(-1).id;
export const skillTier = (a, skillId) => tierFor(statFor(a, skillId));

export const skillOf = (a, skillId) => a.skill?.[skillId] ?? 0;

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
