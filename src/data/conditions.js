// Conditions (docs/RULES.md), as conditions and exhaustion in D&D: everything that is wrong with a creature for a
// while or for life, in one table — what it is, where the game keeps it, what it does, how it ends.
//
//   kind  wound      — a grave wound that heals in `days` (agent.wounds, agents/wounds.js)
//         trauma     — an incurable trauma a deadly wound may leave (agent.wounds; `weight` — how often, data/anatomy.js
//                      says at which place of the body)
//         state      — a passing state kept on the creature itself (`where`: its field)
//         exhaustion — a stage of exhaustion: how many of `EXHAUSTION.needs` are at or below `EXHAUSTION.low`
//         potion     — what a potion does (data/potions.js): heal — × full health at once; cures — the states it ends
//                      ('ill' — any illness); ticks — how long it lasts (a.effects); mods, resist ({poison: ×}: what
//                      reaches it of such harm), holdBelow as a mark's; blade — on the weapon: {hits, dmg, ticks} — so
//                      many blows that strike poison what they strike (a.coat); mark — a mark for life (never twice);
//                      the brews: needs ({warmth: +}) at once, mend (× the time a grave wound has left), march (health
//                      a day on the world map), sleeps and calm (a captive: asleep the night, its will less)
//         mark       — what a creature is for life, not what is wrong with it (a.marks): a war beast's training, an
//                      officer's rank
//   mods  — what it does to the body (keys of «Модификаторы существа»); hp — × full health; special — a shift of its
//           SPECIAL ({S: +1}); holdBelow — it stands its ground until its health falls below this share
//           (agents/auras.js holdsGround); stay — ticks it fights on once nobody of its band is left to follow
//
// Wounds, traumas and the stages of exhaustion work through the body's sources (agents/special.js refreshBody).
// The states run in agents/body.js stepEffects. data/wounds.js WOUNDS is the wounds and traumas of this table.
import {Registry} from '../core/registry.js';
import {TAINT} from './afflictions.js';
import {SPECIES} from './species.js';
import {DAY} from '../core/time.js';

export const CONDITION_KINDS = {wound: 'рана', trauma: 'травма', state: 'состояние', exhaustion: 'истощение', taint: 'порча', mark: 'метка', potion: 'зелье'};

export const CONDITIONS = new Registry('condition');

CONDITIONS.registerAll([
  // ── wounds and traumas (agent.wounds)
  {id: 'grave', kind: 'wound', where: 'wounds', label: 'тяжёлая рана', note: 'заживает', days: 4, mods: {speed: 0.85, work: 0.75}},
  {id: 'limp', kind: 'trauma', where: 'wounds', label: 'хромота', note: 'на всю жизнь', trauma: true, weight: 3, mods: {speed: 0.85}},
  {id: 'maimedHand', kind: 'trauma', where: 'wounds', label: 'покалеченная рука', note: 'на всю жизнь', trauma: true, weight: 3, mods: {work: 0.85, str: 0.85, fin: 0.85}},
  {id: 'chest', kind: 'trauma', where: 'wounds', label: 'пробитая грудь', note: 'на всю жизнь', trauma: true, weight: 2, hp: 0.85, mods: {cold: 1.15}},
  {id: 'eye', kind: 'trauma', where: 'wounds', label: 'выбитый глаз', note: 'на всю жизнь', trauma: true, weight: 2, mods: {sight: 0.8, aim: -0.08}},
  {id: 'dread', kind: 'trauma', where: 'wounds', label: 'страх смерти', note: 'на всю жизнь', trauma: true, weight: 2, mods: {bravery: -0.3}},
  // ── passing states (a field of the creature)
  {id: 'downed', kind: 'state', where: 'downed', label: 'без сознания', note: 'смертельная рана, пережитая удачей: истекает кровью, пока не перевяжут (числа — «Навыки, мастера, раны» deathblow, кривые «Пережить…», «Истекает кровью»)'},
  {id: 'poisoned', kind: 'state', where: 'poison', label: 'отравлен', note: 'укус ядовитого: урон каждый тик до срока (числа — у вида, venom; × «Урон по видам» яд)'},
  {id: 'webbed', kind: 'state', where: 'webbed', label: 'в паутине', note: 'замедлен до срока (числа — у вида, web)'},
  {id: 'bleeding', kind: 'state', where: 'bleeding', label: 'кровотечение', dmg: 0.0004, ticks: 600,
    note: 'кровопускающее оружие: шанс — значение свойства bleed; dmg здоровья в тик ticks тиков; нежить не кровит'},
  {id: 'stunned', kind: 'state', where: 'stunned', label: 'оглушён', ticks: 40, slow: 0.5,
    note: 'оглушающее оружие: шанс — значение свойства stun; ticks тиков не бьёт и не стреляет, шаг × slow'},
  {id: 'drunk', kind: 'state', where: 'drankAt', label: 'во хмелю', ticks: 300, note: 'кружка браги на вечернем совете (settlement/life.js): ticks тиков; у рас, что живут брагой, — их работа и срок (brew у расы)'},
  // ── an illness, withdrawal, the rot (data/afflictions.js: how they are caught, the stages of an illness)
  {id: 'ill', kind: 'state', where: 'ill', label: 'болен', note: 'недуг со стадиями («Недуги»): стадия — что делает с телом'},
  {id: 'withdrawal', kind: 'state', where: 'withdrawal', label: 'ломка', mods: {}, note: 'привыкший к браге без кружки дольше, чем «Зависимости» days'},
  {id: 'tainted1', kind: 'taint', stage: 1, label: 'порча I', mods: {}, note: 'удары нежити; проходит сама'},
  {id: 'tainted2', kind: 'taint', stage: 2, label: 'порча II', mods: {}, note: 'порча въелась глубже'},
  {id: 'tainted3', kind: 'taint', stage: 3, label: 'порча III', mods: {}, note: 'порча на грани: тело чернеет'},
  // ── marks for life (a.marks)
  {id: 'trained', kind: 'mark', where: 'marks', label: 'выученный',
    note: 'боевой зверь банды (варг орков, гиена гноллов, паук гоблинов): вырос при людях — сильнее и крепче дикого, не бежит от толпы и раны, пока жив; оставшись без хозяев, ещё дерётся, потом уходит',
    special: {S: 1, E: 1}, mods: {}, holdBelow: 0.15, stay: 200},
  {id: 'wight', kind: 'mark', where: 'marks', label: 'умертвие',
    note: 'голова звена мертвецов (data/ranks.js): костяк, в котором воля осталась, — крепче и сильнее прочих; его звено идёт за ним, а падёт он — за некромантом, если тот жив, иначе разбредается',
    hp: 1.5, special: {S: 1, E: 1}, mods: {}},
  {id: 'officer', kind: 'mark', where: 'marks', label: 'офицер',
    note: 'голова звена в банде (data/ranks.js): крепче пешки, стоит до смерти; пока стоит, его звено не бежит',
    hp: 1.3, mods: {}, holdBelow: 0.15},
  // ── what potions do (data/potions.js): at once, for a while, on the blade
  {id: 'potHeal', kind: 'potion', label: 'зелье лечения', note: 'сразу: здоровье + heal от полного', heal: 0.6},
  {id: 'potHealStrong', kind: 'potion', label: 'зелье лечения (усиленное)', note: 'сразу: здоровье + heal, кровотечение останавливается', heal: 1, cures: ['bleeding']},
  {id: 'potAntidote', kind: 'potion', label: 'противоядие', note: 'яд из крови вон; новый яд × resist на ticks тиков', cures: ['poisoned'], ticks: 100, resist: {poison: 0.5}, mods: {}},
  {id: 'potAntidoteStrong', kind: 'potion', label: 'противоядие (усиленное)', note: 'яд и недуг вон; новый яд × resist на ticks тиков', cures: ['poisoned', 'ill'], ticks: 600, resist: {poison: 0.2}, mods: {}},
  {id: 'potBear', kind: 'potion', label: 'медвежья сила', note: 'сила и смелость на ticks тиков', ticks: 400, mods: {str: 1.2, bravery: 0.3}},
  {id: 'potBearStrong', kind: 'potion', label: 'медвежья сила (усиленная)', note: 'сила и смелость на ticks тиков; стоит, пока здоровье выше holdBelow', ticks: 600, mods: {str: 1.35, bravery: 0.3}, holdBelow: 0.2},
  {id: 'potVenom', kind: 'potion', label: 'яд на клинке', note: 'hits ударов, что дошли до тела, травят: dmg здоровья в тик ticks тиков (нежить не травится)', blade: {hits: 3, dmg: 0.0005, ticks: 200}},
  {id: 'potVenomStrong', kind: 'potion', label: 'яд на клинке (усиленный)', note: 'hits ударов травят сильнее и дольше', blade: {hits: 6, dmg: 0.0008, ticks: 240}},
  // the brews of the stock (data/potions.js home): needs — a need filled at once (+ share); mend — the time a grave
  // wound has left to heal × this; march — health a day on the campaign's world map; sleeps — a captive sleeps the night
  // through, calm — and its will to run falls by this much
  {id: 'potWarm', kind: 'potion', label: 'согревающий отвар', note: 'тепло сразу + needs; холод × cold на ticks тиков (сутки, на любой карте; на карте мира — мороз не замедляет)', needs: {warmth: 0.3}, ticks: 1200, mods: {cold: 0.5}},
  {id: 'potWarmStrong', kind: 'potion', label: 'согревающий отвар (усиленный)', note: 'тепло сразу + needs; холод × cold на ticks тиков', needs: {warmth: 0.6}, ticks: 2400, mods: {cold: 0.25}},
  {id: 'potVigor', kind: 'potion', label: 'бодрящий отвар', note: 'бодрость сразу + needs; усталость × sleep на ticks тиков (сутки, на любой карте; на карте мира — засада не застаёт врасплох)', needs: {rest: 0.3}, ticks: 1200, mods: {sleep: 0.5}},
  {id: 'potVigorStrong', kind: 'potion', label: 'бодрящий отвар (усиленный)', note: 'бодрость + needs, усталость × sleep, зоркость × sight на ticks тиков (глаза рыси)', needs: {rest: 0.5}, ticks: 2400, mods: {sleep: 0.3, sight: 1.15}},
  {id: 'potMend', kind: 'potion', label: 'укрепляющий отвар', note: 'заживление × mod mend на ticks тиков (огонь не гасит); тяжёлой ране остаётся × mend срока; в походе + march здоровья', ticks: 1200, mods: {mend: 2}, mend: 0.75, march: 0.08},
  {id: 'potMendStrong', kind: 'potion', label: 'укрепляющий отвар (усиленный)', note: 'сразу + heal; заживление × mod mend; тяжёлой ране × mend срока; в походе + march', heal: 0.2, ticks: 1200, mods: {mend: 3}, mend: 0.5, march: 0.15},
  {id: 'potSleep', kind: 'potion', label: 'сонный отвар', note: 'пленный спит всю ночь: не бежит', sleeps: true},
  {id: 'potSleepStrong', kind: 'potion', label: 'сонный отвар (усиленный)', note: 'пленный спит всю ночь, воля к побегу − calm', sleeps: true, calm: 0.1},
  // ── exhaustion: neutral for now (empty mods), ready for the numbers
  {id: 'exhausted1', kind: 'exhaustion', stage: 1, label: 'истощение I', mods: {}, note: 'одна нужда на исходе'},
  {id: 'exhausted2', kind: 'exhaustion', stage: 2, label: 'истощение II', mods: {}, note: 'две нужды на исходе'},
  {id: 'exhausted3', kind: 'exhaustion', stage: 3, label: 'истощение III', mods: {}, note: 'все три на исходе'},
]);

// a need at or below `low` counts towards exhaustion
export const EXHAUSTION = {low: 0.15, needs: ['food', 'rest', 'warmth']};

// the stage of the rot a creature carries (data/afflictions.js TAINT), as its row
export const taintRow = a => { const n = TAINT.stages.filter(x => (a.taint || 0) >= x).length; return n ? CONDITIONS.filter(c => c.kind === 'taint').find(c => c.stage === n) ?? null : null; };
export const exhaustionRow = stage => (stage > 0 ? CONDITIONS.filter(c => c.kind === 'exhaustion').find(c => c.stage === stage) ?? null : null);
// the stage a creature's needs put it at now
export function exhaustionStage(a) {
  let n = 0;
  for (const id of EXHAUSTION.needs) if (a.needs?.[id] != null && a.needs[id] <= EXHAUSTION.low) n++;
  return n && Math.min(n, exhaustionStages());
}
// how many stages of exhaustion there are (counted once: the rows are fixed, only their numbers are edited)
let stages = 0;
const exhaustionStages = () => stages || (stages = CONDITIONS.filter(c => c.kind === 'exhaustion').length);
const hasMods = row => !!row && (Object.keys(row.mods || {}).length > 0 || row.hp != null);

// what the creature is in now: [{row, until?}] — for the card and the checks
export function conditionsOf(w, a) {
  const out = [];
  for (const x of a.wounds || []) if (CONDITIONS.has(x.id)) out.push({row: CONDITIONS.get(x.id), until: x.until});
  const now = w?.tick ?? 0;
  if (a.downed) out.push({row: CONDITIONS.get('downed'), until: a.downed.until});
  if (a.poison && now < a.poison.until) out.push({row: CONDITIONS.get('poisoned'), until: a.poison.until});
  if (a.webbed && now < a.webbed.until) out.push({row: CONDITIONS.get('webbed'), until: a.webbed.until});
  if (a.bleeding && now < a.bleeding.until) out.push({row: CONDITIONS.get('bleeding'), until: a.bleeding.until});
  if (a.stunned && now < a.stunned.until) out.push({row: CONDITIONS.get('stunned'), until: a.stunned.until});
  const ex = exhaustionRow(a.exhaust || 0); if (ex) out.push({row: ex});
  if (a.ill) out.push({row: CONDITIONS.get('ill'), until: a.ill.next, ill: a.ill});
  if (a.drankAt != null) {   // a mug at the council: the evening, or as long as a race that lives on brew feels it
    const B = SPECIES.has(a.species) ? SPECIES.get(a.species).brew : null, until = a.drankAt + (B ? B.lasts * DAY : CONDITIONS.get('drunk').ticks);
    if (now < until) out.push({row: CONDITIONS.get('drunk'), until});
  }
  if (a.withdrawal) out.push({row: CONDITIONS.get('withdrawal')});
  const tr = taintRow(a); if (tr) out.push({row: tr});
  for (const id of a.marks || []) if (CONDITIONS.has(id)) out.push({row: CONDITIONS.get(id)});
  for (const e of a.effects || []) if (CONDITIONS.has(e.id) && now < e.until) out.push({row: CONDITIONS.get(e.id), until: e.until});   // a potion at work
  if (a.coat && CONDITIONS.has(a.coat.id)) out.push({row: CONDITIONS.get(a.coat.id), hits: a.coat.hits});   // poison on the blade
  return out;
}
export {hasMods as conditionHasMods};

// the marks a creature bears, as rows (a.marks: data/conditions.js kind 'mark')
export const marksOf = a => (a.marks?.length ? a.marks.filter(id => CONDITIONS.has(id)).map(id => CONDITIONS.get(id)) : []);
export const hasMark = (a, id) => !!a.marks?.includes(id);
// the potions at work on a creature (a.effects: [{id, until}]), as rows
export const effectsOf = (w, a) => (a.effects?.length ? a.effects.filter(e => CONDITIONS.has(e.id) && (!w || w.tick < e.until)).map(e => CONDITIONS.get(e.id)) : []);
// what reaches a creature of a harm (poison…) through the potions at work: × (1 when none)
export const effectResist = (w, a, kind) => effectsOf(w, a).reduce((m, r) => m * (r.resist?.[kind] ?? 1), 1);
