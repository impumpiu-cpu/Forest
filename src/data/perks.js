// Perks: the knacks a caravan's member takes as it grows (docs/CAMPAIGN.md «Перки»; plan claude/xp-plan.md, Ver_E Э3). A
// level gives one perk (campaign/perks.js pickPerk): of those whose requirement it meets — what it has done (m.acts, its work
// by skill), what it holds, its role, its race, its letters — one, chosen by its own character (its leans, values and traits),
// never by the player. A perk works one of four ways, all the game's own:
//   mods  — its body (agents/special.js refreshBody): on top of the innate, the traits and the wounds — a learned knack adds to
//           what one is (× for a multiplier, + for an addition), it does not lose to a stronger trait;  hp — × the health
//   fight — a flag the fight reads beside the role's (agents/combat.js, agents/potions.js: perkOf)
//   camp  — a hook of the campaign's day (campaign/duty.js, baggage.js, town.js, march.js, social.js: hasPerk / perkVal)
//   aura  — on the local map, from those around (here: a goblin among its own, campaign/camp.js)
//
// A requirement (req), all of which must hold:
//   level — the level it may be taken from (each further rank: + RANK_LEVEL)
//   race, group, role — the member's race; its role's group (data/roles.js); its fighting role (or a hired one)
//   notRole — not for these roles (a perk that is a role's own knack: the summoner has the call already)
//   hand — something of these forms in its hands (data/items.js `form`)
//   stat — its letters at least
//   any — at least one of [act, n]: m.acts (campaign/experience.js) — each a deed done in either mode: `fight` (fights stood),
//         `fight:<group>` — fights stood in a role of that group, `beside` — fights stood beside one of another race;
//         a deed only the local map sees (a shield over another, a foe bound) is given beside one both modes see
//   work — the experience of its work in a skill at least: {skill: xp} (m.workBy)
//   crafts — the number of skills it has worked in (m.workBy), at least
// pull — what in its character draws it to this perk: {leans: {id: w}, values: [ids], traits: [ids]} (PERK_PICK)
// ranks — how many times it may be taken (default 1)
import {Registry} from '../core/registry.js';

export const PERKS = new Registry('perk');
PERKS.registerAll([
  // ── for anyone
  {id: 'secondWind', label: 'Второе дыхание', kind: 'общие', how: 'camp', about: 'в дозоре устаёт на четверть меньше',
    req: {level: 2, any: [['watch', 5]]}, camp: {watchTired: 0.75}, pull: {leans: {persist: 1}, traits: ['diligent', 'hardy']}},
  {id: 'strongBack', label: 'Крепкая спина', kind: 'общие', how: 'camp', ranks: 2, about: 'несёт на четверть больше (за ранг)',
    req: {level: 2, stat: {S: 5}, work: {woodcutting: 10, mining: 10, construction: 10}}, camp: {carry: 0.25}, pull: {values: ['work', 'strength'], traits: ['diligent']}},
  {id: 'fieldDressing', label: 'Полевая перевязь', kind: 'общие', how: 'fight', ranks: 2, about: 'вытащенный им с того света встаёт крепче: здоровье после перевязки +10% (за ранг)',
    req: {level: 2, any: [['dress', 1], ['tend', 3], ['work:medicine', 10]]}, fight: {dressHp: 0.1}, pull: {values: ['family', 'faith'], leans: {social: 1}}},
  {id: 'relief', label: 'Сменщик', kind: 'общие', how: 'camp', about: 'охотнее соглашается отстоять дозор за уставшего',
    req: {level: 2, any: [['swap', 1]]}, camp: {swapYes: 0.3}, pull: {leans: {social: 1}, values: ['family']}},
  {id: 'pathfinder', label: 'Следопыт', kind: 'общие', how: 'camp', about: 'видит путь дальше: туман над картой поднимается шире, погоню замечают раньше',
    req: {level: 4, stat: {P: 6}, any: [['town', 3], ['watch', 10]]}, camp: {sight: 1}, pull: {leans: {curious: 1}, values: ['knowledge', 'nature', 'freedom']}},
  {id: 'oldWolf', label: 'Старый волк', kind: 'общие', how: 'mods', about: 'храбрость +0,2: видел всякое',
    req: {level: 6, any: [['fight', 6]]}, mods: {bravery: 0.2}, pull: {leans: {persist: 1}, values: ['strength'], traits: ['brave']}},
  {id: 'kinAmong', label: 'Свой среди чужих', kind: 'общие', how: 'camp', about: 'связи с иноплеменниками отряда крепнут в полтора раза быстрее',
    req: {level: 3, any: [['beside', 3]]}, camp: {bondOther: 1.5}, pull: {leans: {social: 1, curious: 0.5}}},
  {id: 'haggler', label: 'Торгаш', kind: 'общие', how: 'camp', ranks: 2, about: 'цены в городе на десятую лучше (за ранг) — продаёт дороже, покупает дешевле',
    req: {level: 3, stat: {C: 5}, any: [['trade', 3]]}, camp: {trade: 0.1}, pull: {values: ['gold'], leans: {social: 0.5}}},
  // ── the line
  {id: 'shoulder', label: 'Плечом к плечу', kind: 'линия', how: 'fight', about: 'щитом закрывает соседей от стрел в полтора раза чаще',
    req: {level: 2, hand: ['shield'], any: [['shield', 3], ['fight:линия', 3]]}, fight: {cover: 1.5}, pull: {values: ['family', 'faith'], leans: {social: 1}}},
  {id: 'breaker', label: 'Проламыватель', kind: 'линия', how: 'fight', about: 'дробящий удар молотом, палицей, кувалдой бьёт на 15% сильнее',
    req: {level: 5, stat: {S: 7}, hand: ['club', 'mace', 'warhammer', 'maul'], any: [['killBlow', 2], ['fight:линия', 4]]}, fight: {blows: {blunt: 1.15}}, pull: {values: ['strength'], leans: {persist: 1}}},
  // ── the shooters
  {id: 'steadyShot', label: 'Выждать выстрел', kind: 'дальний бой', how: 'fight', about: 'первый выстрел в каждом бою — выцеленный: меткость +0,1',
    req: {level: 2, hand: ['bow', 'longbow', 'crossbow'], notRole: ['firespitter'], any: [['hit', 10], ['fight:дальний бой', 3]]}, fight: {firstAim: 0.1}, pull: {leans: {persist: 1}, traits: ['diligent']}},
  // ── the races: what their ways make of them
  {id: 'stopIn', label: 'Подменил', kind: 'расовые', how: 'mods', about: 'человек берётся за чужое дело: учится любому ремеслу на треть быстрее',
    req: {level: 4, race: ['human'], crafts: 4}, mods: {learn: 1.3}, pull: {leans: {curious: 1}, values: ['work', 'knowledge']}},
  {id: 'findBetter', label: 'Найти получше', kind: 'расовые', how: 'camp', about: 'дварф находит у торговца вещь на ступень лучше той, что продают всем',
    req: {level: 3, race: ['dwarf'], any: [['trade', 2]]}, camp: {better: 1}, pull: {values: ['work', 'gold', 'ancestors']}},
  {id: 'useAll', label: 'Всё в дело', kind: 'расовые', how: 'camp', about: 'дварф ничего не бросает: трофеи с павших врагов уходят в полтора раза дороже',
    req: {level: 3, race: ['dwarf'], any: [['fight', 3]]}, camp: {spoils: 1.5}, pull: {values: ['gold', 'work']}},
  {id: 'bloodPrice', label: 'Кровная плата', kind: 'расовые', how: 'fight', about: 'когда рядом падает свой, орка охватывает ярость: удар ×1,2, шаг ×1,1, страха нет',
    req: {level: 3, race: ['orc'], any: [['fight', 3]]}, fight: {bloodrage: 'bloodrage', bloodReach: 6}, pull: {values: ['strength', 'family'], traits: ['brave']}},
  {id: 'tireless', label: 'Неутомимый в ярости', kind: 'расовые', how: 'fight', about: 'берсерк приходит в себя после бешенства вдвое быстрее',
    req: {level: 4, role: ['berserker'], any: [['fight', 4]]}, fight: {spent: 0.5}, pull: {values: ['strength'], leans: {persist: 1}}},
  {id: 'livingFlesh', label: 'Живая плоть', kind: 'расовые', how: 'mods', about: 'раны тролля затягиваются на треть быстрее (огонь по-прежнему их останавливает)',
    req: {level: 3, race: ['troll']}, mods: {regen: 1.3}, pull: {}},
  {id: 'herd', label: 'Стадный', kind: 'расовые', how: 'aura', about: 'гоблин трус в одиночку и смел в толпе: при трёх своих в отряде храбрость +0,3',
    req: {level: 3, race: ['goblin'], any: [['fight', 3]]}, aura: {kin: 3, mods: {bravery: 0.3}}, pull: {leans: {social: 1}}},
  {id: 'smellAmbush', label: 'Чует засаду', kind: 'расовые', how: 'camp', about: 'гнолл чует погоню: караван замечает её раньше и уходит чаще',
    req: {level: 3, race: ['gnoll']}, camp: {evade: 0.15}, pull: {values: ['nature', 'strength']}},
]);

// each further rank of a perk asks this many more levels (as the book of rules: +3 a rank)
export const RANK_LEVEL = 3;
// the pull of one's character (campaign/perks.js pickPerk): weight = base + Σ lean × w + value + trait
export const PERK_PICK = {base: 1, value: 1, trait: 1};

// ── a creature's perks on the local map (a.perks: [{id, rank}], given by campaign/camp.js from its member)
// the sum of a fight effect over its perks, × rank (for a factor: `mul`); 0 / 1 — none
export function perkOf(a, key) {
  let v = 0;
  for (const p of a?.perks || []) { const P = PERKS.has(p.id) ? PERKS.get(p.id) : null; const x = P?.fight?.[key]; if (typeof x === 'number') v += x * (p.rank || 1); }
  return v;
}
export const hasPerkA = (a, id) => !!a?.perks?.some(p => p.id === id);
// a factor of a fight effect (cover 1.5): the product over its perks; blows by type: {blunt: 1.15}
export function perkMulA(a, key, sub = null) {
  let v = 1;
  for (const p of a?.perks || []) { const P = PERKS.has(p.id) ? PERKS.get(p.id) : null; let x = P?.fight?.[key]; if (sub != null) x = x?.[sub]; if (typeof x === 'number') v *= x ** (p.rank || 1); }
  return v;
}
