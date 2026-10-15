// Skills: practical mastery that grows from doing the thing. Separate from JOBS: a job is what a
// colonist chooses to do (for the AI and for likes), a skill is what that doing trains and reads.
// One job may train several skills (the healer tends with medicine and picks herbs with gathering;
// a smith casts with metallurgy and forges with smithing), and a skill may be trained by several jobs.
//
// Every skill hangs on one SPECIAL letter (`stat`). The letter decides three things for the skill
// (agents/skills.js):
//   - tiers: which actions of the skill are open at all (T1 always; T2 from 4, T3 from 6, T4 from 8);
//   - learning: how fast practice turns into skill;
//   - the soft ceiling: above 10 × letter (0–1 scale: letter / 10) practice barely helps.
// The scale is absolute: a dwarf's strength 12 opens the same tiers as a human's 12 would, so a race
// that is stronger by nature is a better smith by nature.
// Luck (L) has no skill of its own: it changes how a chance falls, it does not train.
//
// status: 'active'   — something in the game trains and reads it;
//         'reserved' — a stable id for a later activity (trade, talk, trophies, …). A reserved skill
//                      is never liked, never trained and never shown until its mechanics exist.
// Values live in agent.skill[id] on the 0–1 scale (the card shows 0–100).
import {Registry} from '../core/registry.js';

export const SKILLS = new Registry('skill');

SKILLS.registerAll([
  // ── S: strength
  {id: 'woodcutting',  stat: 'S', label: 'рубка леса',          short: 'рубка'},
  {id: 'mining',       stat: 'S', label: 'горное дело',         short: 'горн. дело'},
  {id: 'construction', stat: 'S', label: 'строительство',       short: 'стройка'},
  {id: 'smithing',     stat: 'S', label: 'кузнечное дело',      short: 'ковка'},
  {id: 'melee',        stat: 'S', label: 'ближний бой',         short: 'бой'},

  // ── P: perception
  {id: 'gathering',    stat: 'P', label: 'собирательство',      short: 'сбор'},
  {id: 'hunting',      stat: 'P', label: 'охота',               short: 'охота'},
  {id: 'ranged',       stat: 'P', label: 'стрельба',            short: 'стрельба'},
  {id: 'fishing',      stat: 'P', label: 'рыбалка',             short: 'рыбалка'},
  {id: 'scouting',     stat: 'P', label: 'разведка',            short: 'разведка', status: 'reserved'},
  {id: 'scavenging',   stat: 'P', label: 'поиск трофеев',       short: 'поиск', status: 'reserved'},

  // ── E: endurance
  {id: 'farming',      stat: 'E', label: 'земледелие',          short: 'поле'},
  {id: 'athletics',    stat: 'E', label: 'физическая подготовка', short: 'тяжести'},
  {id: 'survival',     stat: 'E', label: 'походное выживание',  short: 'выживание', status: 'reserved'},

  // ── C: charisma
  {id: 'husbandry',    stat: 'C', label: 'обращение с животными', short: 'скот'},
  {id: 'barter',       stat: 'C', label: 'торговля',            short: 'торг', status: 'reserved'},
  {id: 'persuasion',   stat: 'C', label: 'убеждение',           short: 'убеждение', status: 'reserved'},
  {id: 'leadership',   stat: 'C', label: 'руководство',         short: 'руководство', status: 'reserved'},

  // ── I: intelligence
  {id: 'medicine',     stat: 'I', label: 'медицина',            short: 'лечение'},
  {id: 'metallurgy',   stat: 'I', label: 'металлургия',         short: 'плавка'},
  {id: 'cooking',      stat: 'I', label: 'стряпня и заготовки', short: 'кухня'},
  {id: 'alchemy',      stat: 'I', label: 'алхимия',             short: 'алхимия', status: 'reserved'},
  {id: 'appraisal',    stat: 'I', label: 'оценка вещей',        short: 'оценка', status: 'reserved'},

  // ── A: agility
  {id: 'carpentry',    stat: 'A', label: 'работа по дереву',    short: 'дерево'},
  {id: 'tailoring',    stat: 'A', label: 'ткачество и шитьё',   short: 'шитьё'},
  {id: 'leatherwork',  stat: 'A', label: 'обработка кожи',      short: 'кожи'},
  {id: 'pottery',      stat: 'A', label: 'гончарное дело',      short: 'гончар'},
  {id: 'jewelry',      stat: 'A', label: 'ювелирное дело',      short: 'ювелир'},
  {id: 'trophyExtraction', stat: 'A', label: 'извлечение трофеев', short: 'трофеи', status: 'reserved'},
  {id: 'stealth',      stat: 'A', label: 'скрытность',          short: 'скрытность', status: 'reserved'},
]);
for (const s of SKILLS.all()) s.status ??= 'active';

export const isActive = id => SKILLS.has(id) && SKILLS.get(id).status === 'active';
export const activeSkills = () => SKILLS.filter(s => s.status === 'active');

// Tiers of an action, by the letter it needs. T1 is open to anyone able to do the action at all; above
// it the letter must reach `min`. Actions and recipes name their tier (from stage 2 on); the card shows
// how far each skill reaches.
export const TIERS = [
  {id: 1, min: 0, label: 'простое'},
  {id: 2, min: 4, label: 'обычное'},
  {id: 3, min: 6, label: 'сложное'},
  {id: 4, min: 8, label: 'мастерское'},
];

// How skill grows (agents/skills.js practice()):
//   gain = rate × units × letterFactor × mods.learn × (above the ceiling ? overCap : 1), at most 1
//   letterFactor = max(minFactor, base + perPoint × letter): 1 at the human norm 5, 1.4 at 10, 0.68 at 1
// One unit is one tick of real work (the old rate); a shot that was really fired counts as `shot` units.
export const LEARN = {
  rate: 0.0006,
  base: 0.6, perPoint: 0.08, minFactor: 0.3,
  overCap: 0.1,      // above 10 × letter practice gives a tenth
  shot: 10,          // one fired shot ≈ the old per-tick gain over a bow's reload
  blow: 6,           // one melee blow struck (a blow comes about twice as often as a shot)
  kill: 20,          // game brought down: the stalk paid off
};

// Which skill a craft order trains and reads: the recipe's own `skill`, else its station's.
export const STATION_SKILL = {
  crafthut: 'carpentry', sawmill: 'carpentry',
  loom: 'tailoring', tannery: 'leatherwork', potter: 'pottery', jeweler: 'jewelry',
  charpit: 'metallurgy', smelter: 'metallurgy', forge: 'smithing',
  quern: 'cooking', hearth: 'cooking', dryrack: 'cooking',
};
export const recipeSkill = r => r.skill || STATION_SKILL[r.at];

// Old saves kept skill under job ids. Each skill starts from the best of the jobs that trained it
// (a smith's skill becomes both smithing and metallurgy; nothing is lost, nothing is given twice).
export const FROM_JOB = {
  gather: ['gathering'], fiber: ['gathering'], reeds: ['gathering'], honey: ['gathering'], flaxseed: ['gathering'],
  salt: ['gathering'], pan: ['gathering'],
  chop: ['woodcutting'], mine: ['mining'], dig: ['mining'], clay: ['mining'],
  fish: ['fishing'], hunt: ['hunting', 'ranged'],
  craft: ['carpentry', 'tailoring', 'leatherwork'], saw: ['carpentry'],
  charcoal: ['metallurgy'], smith: ['smithing', 'metallurgy'], jewel: ['jewelry'],
  farm: ['farming'], mow: ['farming'],
  mill: ['cooking'], preserve: ['cooking'], cook: ['cooking'],
  weave: ['tailoring'], pottery: ['pottery'], tan: ['leatherwork'],
  heal: ['medicine'], herd: ['husbandry'], bury: ['athletics'], build: ['construction'],
};
