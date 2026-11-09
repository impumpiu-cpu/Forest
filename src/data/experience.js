// Experience of a caravan's member (docs/CAMPAIGN.md «Опыт, дела и уровни»; plan claude/xp-plan.md). Two layers:
//   the ground — what a member went through with the company: a dangerous fight stood in, a day on the road, a ferry, a find,
//            a clue, the crown. Everyone who was there gets it; it has no letter;
//   the acts  — what one did with its own hands: a foe killed, a shot that landed, a shield held over another, a fallen one
//            dressed, a captive bound, a watch stood, a night stood for another, work done, a deal struck, a word kept. An act
//            gives a little experience and is the only thing that writes a letter of SPECIAL in `m.xpBy` — the letter the
//            evening of a new level grows (campaign/experience.js levelEvening).
// The acts are written when they happen, by the doer's id: on the local map into the agent (agents/acts.js), on the campaign's
// day straight to the member; the quick mode gives the same ground and what its summary can tell. In code an act is an `act`:
// «дела мира» are data/deeds.js, the realms' doings.
//
// ACTS — one row per kind:
//   label — what it is · why, whyF — the reason a level names («не зря …»), of him and of her · stat — the letter it writes (none: the ground; 'skill' —
//   the letter of the skill it trained; 'weapon' — S for a blow, P for a shot) · xp — experience per unit · ground — of the
//   ground layer (no letter) · captive — a captive earns it too (× XP.captive); without — a captive earns nothing of it
import {Registry} from '../core/registry.js';

export const ACTS = new Registry('act');
ACTS.registerAll([
  // ── the ground
  {id: 'fight',   ground: true, label: 'бой', xp: 40, note: '× опасность боя (сила врага / сила отряда, в пределах XP.danger); всем свободным, кто был в бою'},
  {id: 'storm',   ground: true, label: 'штурм взят', xp: 30, note: 'сверх боя, всем бившимся'},
  {id: 'boss',    ground: true, label: 'именной бой', xp: 40, note: 'главарь, стража кургана: сверх боя'},
  {id: 'road',    ground: true, label: 'день пути', xp: 2},
  {id: 'ferry',   ground: true, label: 'переправа', xp: 5},
  {id: 'find',    ground: true, label: 'находка', xp: 10},
  {id: 'clue',    ground: true, label: 'подсказка', xp: 20},
  {id: 'crown',   ground: true, label: 'корона найдена', xp: 100},
  {id: 'town',    ground: true, label: 'новый город', xp: 2},
  // ── the acts of a fight
  {id: 'killBlow', stat: 'S', label: 'поверг в рукопашной', why: 'бил врага в рукопашной', whyF: 'била врага в рукопашной', xp: 3, note: 'счёт — поверженные враги (убит или сбит с ног: один враг — один раз); опыт — × вес врага (его КС / 100)'},
  {id: 'killShot', stat: 'P', label: 'поверг выстрелом', why: 'бил врага издали', whyF: 'била врага издали', xp: 3, note: '× вес врага'},
  {id: 'hit',     stat: 'P', label: 'попал', why: 'стрелял без промаха', whyF: 'стреляла без промаха', xp: 0.2},
  {id: 'shield',  stat: 'E', label: 'поймал стрелу щитом за другого', why: 'закрывал своих щитом', whyF: 'закрывала своих щитом', xp: 0.6},
  {id: 'cover',   stat: 'E', label: 'заступился', why: 'вставал за своих', whyF: 'вставала за своих', xp: 2},
  {id: 'bind',    stat: 'A', label: 'связал врага', why: 'вязал врагов живыми', whyF: 'вязала врагов живыми', xp: 3},
  {id: 'dress',   stat: 'I', label: 'вытащил упавшего', why: 'вытаскивал упавших с того света', whyF: 'вытаскивала упавших с того света', xp: 6},
  {id: 'tend',    stat: 'I', label: 'перевязал раненого', why: 'перевязывал раненых', whyF: 'перевязывала раненых', xp: 1.5},
  {id: 'clean',   stat: null, label: 'пережил смертельную рану без следа', xp: 0, note: 'только счёт: открывает «Везучего» (data/perks.js)'},
  {id: 'slew',    stat: null, label: 'добил врага насмерть', xp: 0, note: 'только счёт: враг умер от его руки (сбитый с ног и потом добитый — у добившего; взятый живым — нет)'},
  {id: 'role',    stat: 'role', label: 'бился в своей роли', why: 'держал своё место в строю', whyF: 'держала своё место в строю', xp: 0, note: 'без опыта: буква роли с весом XP.roleWeight — тому, кто бился, но своих дел в бою не набрал'},
  // ── the acts of the road
  {id: 'work',    stat: 'skill', captive: true, label: 'работа', why: 'трудился', whyF: 'трудилась', xp: 0.02, note: 'за единицу практики (agents/skills.js practice units): 100 единиц ≈ полдня работы'},
  {id: 'game',    stat: 'P', label: 'добыл дичь', why: 'добывал дичь', whyF: 'добывала дичь', xp: 3},
  {id: 'escort',  stat: 'E', label: 'ходил провожатым', why: 'ходил рядом с теми, кто боится', whyF: 'ходила рядом с теми, кто боится', xp: 1},
  {id: 'watch',   stat: null, label: 'стоял в дозоре', xp: 2, note: 'без буквы: дозор идёт по кругу, иначе он тянул бы всех к одной букве'},
  {id: 'swap',    stat: 'C', label: 'отстоял дозор за другого', why: 'подменял уставших', whyF: 'подменяла уставших', xp: 4},
  {id: 'kept',    stat: 'C', label: 'сдержал слово', why: 'держал слово', whyF: 'держала слово', xp: 3},
  {id: 'bed',     stat: 'C', label: 'уступил койку', why: 'уступал своё', whyF: 'уступала своё', xp: 1},
  {id: 'welcome', stat: 'C', label: 'принял новичка', why: 'принимал новых', whyF: 'принимала новых', xp: 2},
  {id: 'mend',    stat: 'C', label: 'помирился', why: 'умел мириться', whyF: 'умела мириться', xp: 3},
  {id: 'propose', stat: 'C', label: 'совет принял его слово', why: 'убеждал совет', whyF: 'убеждала совет', xp: 1},
  {id: 'trade',   stat: 'C', label: 'торговал', why: 'торговался', whyF: 'торговалась', xp: 2},
  {id: 'master',  stat: 'skill', label: 'наречён мастером', why: 'стал мастером', whyF: 'стала мастером', xp: 15},
]);

// the numbers of experience:
//   need, lead — the experience of level L in all: need × (L − 1) × (L + lead); no ceiling. 5 and 4: the 2nd at 30 (~the 6th day),
//            the 5th at 180, the 10th at 630 (~the 125th day of a walk), the 20th at 2280 — measured by tools/xp-probe.mjs. (The
//            plan's 12 × L × (L − 1) gave the 10th by the 210th–290th day; its 7 × … gave it in time, but the first levels came
//            every other day: four letters in three weeks. The lead spreads the first ones out and keeps the 10th where it was.)
//   danger   — the fight's danger (the foe's might / the company's) is held within these bounds
//   captive  — × what a captive earns (work only)
//   letters  — the letters a level may grow (Luck is not trained: only a perk raises it)
//   autoWork — the units of work a day of a stop gives each one in the quick mode, where the stop is not played on the map:
//            as many as a played stop writes into a member's hands on average (tools/xp-probe.mjs), on its best skill — so the
//            choice of the mode does not change a career
//   roleWeight — what a fight without one's own acts writes into the role's letters (split between them): a weight, not
//            experience — as one dressing of a wound; it points the way when nothing else does
//   autoBy   — the skills a quick-mode stop's work is on, by the stop's purpose (campaign/march.js K.why): the member's best of
//            them; none — its best skill outside the fight's (the fight's skills are trained only in a fight)
export const XP = {need: 5, lead: 4, danger: [0.5, 3], captive: 0.5, letters: ['S', 'P', 'E', 'C', 'I', 'A'], autoWork: 270, roleWeight: 1.5,
  autoBy: {food: ['hunting', 'gathering', 'fishing', 'cooking'], heal: ['medicine', 'gathering', 'cooking'], build: ['construction', 'woodcutting', 'carpentry'], mine: ['mining', 'smithing'], tame: ['husbandry']},
  fightSkills: ['melee', 'ranged']};

// the reason a level names for work by its skill («не зря рубился в бою»); any other: «трудился: рубка леса»
// the reason a level names for the role's letter, by the role's group (data/roles.js)
export const ROLE_WHY = {'линия': ['держал своё место в строю', 'держала своё место в строю'], 'дальний бой': ['бил издали из-за строя', 'била издали из-за строя'],
  'подвижные': ['бился на краю строя', 'билась на краю строя'], 'поддержка': ['был при раненых', 'была при раненых']};
export const WORK_WHY = {melee: ['бился врукопашную', 'билась врукопашную'], ranged: ['стрелял', 'стреляла'], medicine: ['лечил раненых', 'лечила раненых']};

// the road's traumas (campaign/maims.js): night terrors — a friend (bond at least `bond`) seen dying: the chance, the timid's;
// frostbite — a frosty day walked worn out (tiredness at least `tired`): the chance × (1 − Endurance / `endure`)
// (Р3: the road now tires those on foot — DUTY.walk, more in frost and hungry — so «worn out» is the road's, not the watch's:
// tired 0.6, reached on long hungry or frosty marches; Э6 had 0.3 as a stopgap, when only the watch tired)
export const ROAD_TRAUMA = {terrors: {bond: 1, chance: 0.08, timid: 0.25}, frostbite: {tired: 0.6, chance: 0.04, endure: 12}};

// a foe's worth in a kill (agents/acts.js noteKill): its strength (КС) / `per` — a plain human with a spear is 1 — to a `round`th,
// at least `least`; × `xp` experience
export const KILL = {per: 100, round: 10, least: 0.1, xp: 3};   // (xp: the experience of a foe of weight 1)

// what a new level says of the letter grown: «Хрольф окреп»
export const GREW = {S: 'окреп', P: 'стал зорче', E: 'стал выносливее', C: 'научился ладить с людьми', I: 'стал смекалистее', A: 'стал ловчее'};
export const GREW_F = {S: 'окрепла', P: 'стала зорче', E: 'стала выносливее', C: 'научилась ладить с людьми', I: 'стала смекалистее', A: 'стала ловчее'};
