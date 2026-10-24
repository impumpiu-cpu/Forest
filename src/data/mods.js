// Dictionaries of modifiers (docs/RULES.md): every key a `mods` or an `effects` may name, what it means, how it
// stacks and who reads it. A key that is not here is a mistake, and `npm run tables` says where it is.
//
// CREATURE_MODS — agent.mods, the body of one creature (agents/special.js refreshBody). It is rebuilt from its
// sources every time: species `mods` → SPECIAL (the curve of `curve`, data/curves.js) → the people's `mods` → racial
// innate traits → character traits → wounds and traumas → the creature's own extras. A key stacks by `how`:
//   mul — multiplied, neutral 1 (a trait of cold 0.6 halves what the cold does)
//   add — added, neutral 0 (aim, dodge: chances), or added on a neutral 1 (bravery: courage 1 + 0.45 for the brave)
// A key with `curve` takes the SPECIAL letter's value: a multiplier is the curve itself (for a beast, against the
// typical one of its kind), an addition is the curve's difference from the typical one, no less than `floor`.
//
// COLONY_MODS — w.mods, what the whole colony has (settlement/mods.js recomputeMods): the effects of finished
// buildings, of tame animals and of keys in the stock. A row is one setting (`add.beds`), or a family keyed by
// another table's ids (`yield` by resource, `jobSpeed` by job): the family's `keys` names that table.
//   add — summed, neutral 0;  mul — multiplied, neutral 1;  best — the best of them, neutral 1
import {Registry} from '../core/registry.js';

export const CREATURE_MODS = new Registry('creatureMod');

// (the order is the order agent.mods has always had: saves and hashes see the same object)
CREATURE_MODS.registerAll([
  {id: 'bravery', label: 'Смелость', how: 'add', base: 1, reads: 'бой и бегство, помощь раненому, дозор, выбор оружия', note: 'смелый +0,45, робкий −0,4; страх смерти после раны −0,3'},
  {id: 'cold', label: 'Холод', how: 'mul', base: 1, curve: 'cold', reads: 'тепло (data/needs.js), выбор одежды', note: 'насколько кусает холод: меньше — теплее'},
  {id: 'hunger', label: 'Голод', how: 'mul', base: 1, reads: 'сытость (data/needs.js)', note: 'как быстро хочется есть: обжора 1,35, неприхотливый 0,75'},
  {id: 'speed', label: 'Скорость', how: 'mul', base: 1, curve: 'speed', reads: 'шаг (agents/movement.js), погоня', note: 'скорость шага'},
  {id: 'work', label: 'Работа', how: 'mul', base: 1, reads: 'скорость любой работы (agents/jobRunners.js)', note: 'усердный 1,2, ленивый 0,8; тяжёлая рана 0,75'},
  {id: 'sleep', label: 'Сон', how: 'mul', base: 1, reads: 'усталость (data/needs.js)', note: 'как быстро растёт усталость'},
  {id: 'regen', label: 'Заживление', how: 'mul', base: 1, reads: 'заживление ран (agents/body.js)', note: 'у орков и троллей раны закрываются быстрее; огонь рядом останавливает тролля'},
  {id: 'learn', label: 'Учёба', how: 'mul', base: 1, curve: 'learn', reads: 'практика навыков (agents/skills.js)', note: 'общая прибавка к учёбе от Интеллекта и врождённого'},
  {id: 'str', label: 'Удар Силой', how: 'mul', base: 1, curve: 'str', reads: 'удар ближнего боя, его доля Силы (data/balance/combat.js scale)', note: 'покалеченная рука 0,85'},
  {id: 'fin', label: 'Удар Ловкостью', how: 'mul', base: 1, curve: 'fin', reads: 'удар ближнего боя, его доля Ловкости', note: 'кинжал, половина меча'},
  {id: 'swing', label: 'Пауза удара', how: 'mul', base: 1, curve: 'swing', reads: 'пауза между ударами (agents/combat.js)', note: 'меньше — бьёт чаще'},
  {id: 'sight', label: 'Обзор', how: 'mul', base: 1, curve: 'sight', reads: 'как далеко замечают врага, дозор', note: 'выбитый глаз 0,8'},
  {id: 'aim', label: 'Меткость', how: 'add', base: 0, curve: 'aim', reads: 'шанс попасть выстрелом (agents/combat.js)', note: 'выбитый глаз −0,08'},
  {id: 'dodge', label: 'Уклонение', how: 'add', base: 0, curve: 'dodge', floor: 0, reads: 'шанс, что удар пройдёт мимо (agents/combat.js)', note: 'не меньше 0 относительно типичного зверя'},
]);

export const MOD_HOWS = {mul: 'множитель (×), нейтрально 1', add: 'прибавка (+)', best: 'лучшее из (max), нейтрально 1'};

// the neutral body every creature starts from, and the keys that add rather than multiply
export const baseMods = () => Object.fromEntries(CREATURE_MODS.all().map(m => [m.id, m.base]));
export const ADD_MODS = new Set(CREATURE_MODS.filter(m => m.how === 'add').map(m => m.id));

export const COLONY_MODS = new Registry('colonyMod');

COLONY_MODS.registerAll([
  {id: 'add.beds', kind: 'add', key: 'beds', label: 'Спальные места', base: 0, reads: 'сон (agents/tasks.js): доля спящих в постели', note: 'шалаш +4, дом…'},
  {id: 'add.popCap', kind: 'add', key: 'popCap', label: 'Жителей сверх 8', base: 0, reads: 'сколько людей примет лагерь (settlement/query.js)'},
  {id: 'add.coolCamp', kind: 'add', key: 'coolCamp', label: 'Прохлада лагеря', base: 0, reads: 'колодец остужает лагерь (world/fields.js)'},
  {id: 'add.huntRange', kind: 'add', key: 'huntRange', label: 'Дальность выстрела', base: 0, reads: 'выстрел поселенца (agents/combat.js, jobRunners.js)'},
  {id: 'add.bedWarmth', kind: 'add', key: 'bedWarmth', label: 'Тёплые места', base: 0, reads: 'тепло во сне (agents/tasks.js)'},
  {id: 'mul.spoil', kind: 'mul', key: 'spoil', label: 'Порча припасов', base: 1, reads: 'склад (settlement/stock.js)', note: 'амбар, коптильня — меньше'},
  {id: 'mul.defense', kind: 'mul', key: 'defense', label: 'Урон по своим в зоне', base: 1, reads: 'бой у стен (agents/combat.js)', note: 'частокол — меньше'},
  {id: 'mul.loot', kind: 'mul', key: 'loot', label: 'Что уносят налётчики', base: 1, reads: 'грабёж склада (settlement/stock.js)'},
  {id: 'mul.douse', kind: 'mul', key: 'douse', label: 'Тушение', base: 1, reads: 'тушение пожара (agents/tasks.js)'},
  {id: 'mul.wear', kind: 'mul', key: 'wear', label: 'Износ снаряжения', base: 1, reads: 'износ вещей поселенца (agents/equipment.js)'},
  {id: 'yield', kind: 'yield', keys: 'resources', label: 'Выход ресурса', base: 1, reads: 'добыча и урожай (settlement/mods.js yieldOf)', note: 'по ресурсу: рыба, мясо, ячмень…'},
  {id: 'jobSpeed', kind: 'jobSpeed', keys: 'jobs', label: 'Скорость работы', base: 1, reads: 'работы (settlement/mods.js jobSpeedOf)', note: 'по работе: стройка, рубка, копка…'},
  {id: 'toolWear', kind: 'toolWear', keys: 'jobs', label: 'Износ инструмента', base: 1, reads: 'износ инструмента на работе (agents/jobRunners.js)', note: 'по работе'},
  {id: 'best.slingStones', kind: 'best', key: 'slingStones', label: 'Камни для пращи', base: 1, reads: 'выстрел пращой (agents/combat.js, equipment.js; data/items.js ranged.boost)', note: 'лучшее из того, что есть'},
]);

export const COLONY_KINDS = ['add', 'mul', 'yield', 'jobSpeed', 'toolWear', 'best'];

// what a colony has before anything is built (the families start empty: an id that is not there is neutral)
export function emptyColonyMods() {
  const m = Object.fromEntries(COLONY_KINDS.map(k => [k, {}]));
  for (const r of COLONY_MODS.all()) if (r.key && (r.kind === 'add' || r.kind === 'mul')) m[r.kind][r.key] = r.base;
  return m;
}

// What is wrong with an `effects` object ({add: {beds: 4}, yield: {fish: 1.3}}) → [error]; `keysOf(table)` gives the
// ids of a family's table (resources, jobs)
export function effectErrors(e, keysOf) {
  const errs = [];
  if (e == null) return errs;
  if (typeof e !== 'object' || Array.isArray(e)) return ['не набор эффектов'];
  for (const [kind, o] of Object.entries(e)) {
    if (!COLONY_KINDS.includes(kind)) { errs.push(`нет вида эффекта «${kind}»`); continue; }
    const fam = COLONY_MODS.has(kind) ? COLONY_MODS.get(kind) : null;
    for (const [k, v] of Object.entries(o || {})) {
      if (typeof v !== 'number' || !Number.isFinite(v)) errs.push(`${kind}.${k}: не число`);
      if (fam) { const ids = keysOf(fam.keys); if (ids && !ids.has(k)) errs.push(`${kind}.${k}: нет такой строки в «${fam.keys}»`); }
      else if (!COLONY_MODS.has(`${kind}.${k}`)) errs.push(`${kind}.${k}: нет в словаре «Модификаторы поселения»`);
    }
  }
  return errs;
}
