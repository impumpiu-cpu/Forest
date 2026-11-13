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
//   level — the level it may be taken from
//   race, group, role — the member's race; its role's group (data/roles.js); its fighting role (or a hired one)
//   notRole — not for these roles (a perk that is a role's own knack: the summoner has the call already)
//   hand — something of these forms in its hands (data/items.js `form`)
//   stat — its letters at least
//   any — at least one of [act, n]: m.acts (campaign/experience.js) — each a deed done in either mode: `fight` (fights stood),
//         `fight:<group>` — fights stood in a role of that group, `beside` — fights stood beside one of another race;
//         a deed only the local map sees (a shield over another, a foe bound) is given beside one both modes see
//   work — the experience of its work in a skill at least: {skill: xp} (m.workBy)
//   crafts — the number of skills it has worked in (m.workBy), at least
//   scar, since — a wound it bears, and the deeds done after it (the answers to a wound)
// grant — letters it raises at once, inside the race's limits (Luck); cure — a wound it takes off
// pull — what in its character draws it to this perk: {leans: {id: w}, values: [ids], traits: [ids]} (PERK_PICK)
// rank — each rank written out whole (the author's word 13.11: a rank is its own row, never «× the rank»): what that rank
//         asks (its own `req`), what it does (its own `fight`, `camp`, `mods`, or a profile's numbers — a reach, a shape, a
//         wait); a row's keys stand over the perk's own, an empty row is the perk as written. Its number of rows is its ranks
//         (default 1). The numbers may lean on the holder's letters, never on the rank
import {Registry} from '../core/registry.js';
import {SPECIES} from './species.js';
import {roleRow} from './roles.js';

export const PERKS = new Registry('perk');
PERKS.registerAll([
  // ── for anyone
  {id: 'secondWind', label: 'Второе дыхание', kind: 'общие', how: 'camp', about: 'в дозоре устаёт на четверть меньше',
    req: {level: 2, any: [['watch', 5]]}, camp: {watchTired: 0.75}, pull: {leans: {persist: 1}, traits: ['diligent', 'hardy']}},
  {id: 'strongBack', label: 'Крепкая спина', kind: 'общие', how: 'camp', about: 'несёт больше: I — на четверть, II — вполовину',
    req: {level: 2, stat: {S: 5}, work: {woodcutting: 10, mining: 10, construction: 10}}, camp: {carry: 0.25}, pull: {values: ['work', 'strength'], traits: ['diligent']},
    rank: [{}, {req: {level: 5, stat: {S: 5}, work: {woodcutting: 10, mining: 10, construction: 10}}, camp: {carry: 0.5}}]},
  {id: 'fieldDressing', label: 'Полевая перевязь', kind: 'общие', how: 'fight', about: 'вытащенный им с того света встаёт крепче: здоровье после перевязки I — +10%, II — +20%',
    req: {level: 2, any: [['dress', 1], ['tend', 3], ['work:medicine', 10]]}, fight: {dressHp: 0.1}, pull: {values: ['family', 'faith'], leans: {social: 1}},
    rank: [{}, {req: {level: 5, any: [['dress', 2], ['tend', 6], ['work:medicine', 20]]}, fight: {dressHp: 0.2}}]},
  {id: 'relief', label: 'Сменщик', kind: 'общие', how: 'camp', about: 'охотнее соглашается отстоять дозор за уставшего',
    req: {level: 2, any: [['swap', 1]]}, camp: {swapYes: 0.3}, pull: {leans: {social: 1}, values: ['family']}},
  {id: 'pathfinder', label: 'Следопыт', kind: 'общие', how: 'camp', about: 'видит путь дальше: туман над картой поднимается шире, погоню замечают раньше',
    req: {level: 4, stat: {P: 6}, any: [['town', 3], ['watch', 10]]}, camp: {sight: 1}, pull: {leans: {curious: 1}, values: ['knowledge', 'nature', 'freedom']}},
  {id: 'oldWolf', label: 'Старый волк', kind: 'общие', how: 'mods', about: 'храбрость +0,2: видел всякое',
    req: {level: 6, any: [['fight', 6]]}, mods: {bravery: 0.2}, pull: {leans: {persist: 1}, values: ['strength'], traits: ['brave']}},
  {id: 'kinAmong', label: 'Свой среди чужих', kind: 'общие', how: 'camp', about: 'связи с иноплеменниками отряда крепнут в полтора раза быстрее',
    req: {level: 3, any: [['beside', 3]]}, camp: {bondOther: 1.5}, pull: {leans: {social: 1, curious: 0.5}}},
  {id: 'haggler', label: 'Торгаш', kind: 'общие', how: 'camp', about: 'цены в городе лучше — продаёт дороже, покупает дешевле: I — на десятую, II — на пятую',
    req: {level: 3, stat: {C: 5}, any: [['trade', 3]]}, camp: {trade: 0.1}, pull: {values: ['gold'], leans: {social: 0.5}},
    rank: [{}, {req: {level: 6, stat: {C: 5}, any: [['trade', 6]]}, camp: {trade: 0.2}}]},
  // ── the line
  {id: 'shoulder', label: 'Плечом к плечу', kind: 'линия', how: 'fight', about: 'щитом закрывает соседей от стрел в полтора раза чаще',
    req: {level: 2, hand: ['shield'], any: [['shield', 3], ['fight:линия', 3]]}, fight: {cover: 1.5}, pull: {values: ['family', 'faith'], leans: {social: 1}}},
  {id: 'breaker', label: 'Проламыватель', kind: 'линия', how: 'fight', about: 'дробящий удар молотом, палицей, кувалдой бьёт на 15% сильнее',
    req: {level: 5, stat: {S: 7}, hand: ['club', 'mace', 'warhammer', 'maul'], any: [['killBlow', 2], ['fight:линия', 4]]}, fight: {blows: {blunt: 1.15}}, pull: {values: ['strength'], leans: {persist: 1}}},
  // ── the shooters
  {id: 'steadyShot', label: 'Выждать выстрел', kind: 'дальний бой', how: 'fight', about: 'первый выстрел в каждом бою — выцеленный: меткость +0,1',
    req: {level: 2, hand: ['bow', 'longbow', 'crossbow'], notRole: ['firespitter'], any: [['hit', 10], ['fight:дальний бой', 3]]}, fight: {firstAim: 0.1}, pull: {leans: {persist: 1}, traits: ['diligent']}},
  {id: 'lucky', label: 'Везучий', kind: 'общие', how: 'grant', about: 'Удача +1 (в пределах расы): пережил смертельную рану без следа — единственный перк, двигающий букву',
    req: {level: 2, any: [['clean', 1]]}, grant: {L: 1}, pull: {}},
  {id: 'boneSetter', label: 'Костоправ', kind: 'поддержка', how: 'fight', about: 'вытащенный им с того света втрое реже уносит с собой травму',
    // (0.67 spared: a third of the traumas left — «втрое реже», Р2)
    req: {level: 5, any: [['dress', 3], ['work:medicine', 30]]}, fight: {cleanHelp: 0.67}, pull: {values: ['knowledge', 'family'], leans: {curious: 0.5}}},
  // ── the answers to a wound (Ver_E Э4): a perk that lets one live with what it bears; when one opens, it is taken first.
  //   scar — one of these wounds borne; since — deeds done after it ([act, n]: fights, hits, or `work` by its experience — campaign/maims.js scarAt)
  {id: 'oneEyed', label: 'Одноглазый стрелок', kind: 'ответ', how: 'mods', answer: true, about: 'с одним глазом снова бьёт метко: меткость +0,08 — после выбитого глаза вся, после вытекшего не вся (−0,04 остаётся); обзор не возвращается',
    // (a shooter's answer: one in a shooting role — Р2)
    req: {group: ['дальний бой'], scar: ['eye', 'blindEye'], since: [['hit', 20], ['fight', 3]]}, mods: {aim: 0.08}, pull: {}},
  {id: 'lameSly', label: 'Хромой, да хитрый', kind: 'ответ', how: 'mods', answer: true, about: 'привык беречься: уклонение +0,05',
    req: {scar: ['limp', 'shatteredLeg'], since: [['fight', 2]]}, mods: {dodge: 0.05}, pull: {}},
  {id: 'leftHand', label: 'Левой рукой', kind: 'ответ', how: 'mods', answer: true, about: 'выучился делать всё одной рукой: удар и работа крепче',
    req: {scar: ['maimedHand', 'lostArm'], since: [['work', 4]]}, mods: {fin: 1.12, str: 1.08, work: 1.12}, pull: {}},
  {id: 'overcame', label: 'Переболел', kind: 'ответ', how: 'cure', answer: true, about: 'страх смерти отпустил: травма снята',
    req: {scar: ['dread'], since: [['fight', 3]]}, cure: 'dread', pull: {}},
  {id: 'oldWound', label: 'Старая рана', kind: 'ответ', how: 'mods', answer: true, about: 'привык к ране: холод ×0,87 — после пробитой груди как у всех, после раздавленной всё же сильнее (×1,09); грудь ноет к дождю',
    // (lived with it a while first: two fights or two of work's experience since — Р2)
    req: {level: 5, scar: ['chest', 'crushedChest'], since: [['fight', 2], ['work', 2]]}, mods: {cold: 0.87}, pull: {}},
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

// ── what a creature is born with, or given by its role (plan claude/bestiary-plan.md З-1, the expert's note 13.11): the same
// book as the learned ones, one id and one effect for all — whoever holds it. Each rank its own profile (`rank`: [I, II, …]),
// not × the rank; a grant may carry its own numbers (`own`: a species' venom as it was). Never chosen at a level (learn: false)
PERKS.registerAll([
  {id: 'venom', label: 'Ядовитый укус', kind: 'врождённые', how: 'fight', learn: false, from: ['species'], who: {pawn: 'cond', monster: 'cond'},
    about: 'прошедший рукопашный удар травит: hp за тик × тиков (агенты/combat.js); нежить и механизмы не травятся',
    rank: [{dmg: 0.0004, ticks: 150}, {dmg: 0.0007, ticks: 180}, {dmg: 0.001, ticks: 220}, {dmg: 0.0015, ticks: 240}, {dmg: 0.002, ticks: 280}]},
  {id: 'web', label: 'Паутина', kind: 'врождённые', how: 'fight', learn: false, from: ['species'], who: {pawn: 'no', monster: 'cond'},
    about: 'прошедший укус опутывает: шаг × slow на ticks тиков',
    rank: [{slow: 0.75, ticks: 80}, {slow: 0.6, ticks: 100}, {slow: 0.45, ticks: 120}, {slow: 0.3, ticks: 140}, {slow: 0.2, ticks: 160}]},
  {id: 'bloodDrink', label: 'Пьёт кровь', kind: 'врождённые', how: 'fight', learn: false, from: ['species'], who: {pawn: 'no', monster: 'cond'},
    about: 'лечится долей урона прошедшего рукопашного удара',
    rank: [{share: 0.25}, {share: 0.5}, {share: 0.75}]},
  {id: 'fireproof', label: 'Огнестойкость', kind: 'врождённые', how: 'fight', learn: false, from: ['species', 'role'], who: {pawn: 'cond', monster: 'cond'},
    about: 'огонь × fire; heat — жар земли не берёт вовсе (мастер горна)',
    rank: [{fire: 0.75}, {fire: 0.4}, {fire: 0.1}]},
]);

// ── who may hold a perk (the table «Перки», the expert's: a pawn and a monster are an editor's columns, not kinds of body —
// a gnoll may be of the guild or the foe; the rule is by species, mind and body):
//   yes   — may (by its requirement)        cond  — on a condition (a race, a role, a body)
//   grant — only given (by species, role, item; never chosen at a level)     no — never
// from — where it comes from: learned (chosen at a level), species, role, item; learn — chosen at a level at all
export const PERK_WHO = {yes: 'можно', cond: 'условно', grant: 'только выдача', no: 'нельзя'};
export const PERK_FROM = {learned: 'за уровень', species: 'вид', role: 'роль', item: 'вещь'};
export function perkAccess(P) {
  const from = P.from || ['learned'], learn = P.learn ?? from.includes('learned');
  const R = P.req || {}, cond = !!(R.race || R.role || R.group || R.hand || R.scar);
  const pawn = P.who?.pawn ?? (learn ? (cond ? 'cond' : 'yes') : 'grant');
  // a camp's knack is a caravan's day: no monster has one; an answer to a wound is the caravan's own
  const monster = P.who?.monster ?? (P.how === 'camp' || P.answer || P.how === 'grant' ? 'no' : 'cond');
  return {pawn, monster, learn, from};
}
// a rank's profile: a grant's own numbers, else the perk's row for that rank (the last one past the end)
export function perkProfile(id, rank = 1, own = null) {
  if (own) return own;
  const P = PERKS.has(id) ? PERKS.get(id) : null; if (!P?.rank) return null;
  return P.rank[Math.max(0, Math.min(P.rank.length, rank) - 1)];
}
export const perkRanks = P => P.rank?.length ?? 1;
// a rank of a perk, whole: its row over the perk's own keys
export function rowOf(P, rank = 1) {
  const r = P?.rank?.[Math.max(0, Math.min(P.rank.length, rank || 1) - 1)];
  return r ? {...P, ...r} : P;
}

// what a species is born with: its `perks` ([{id, rank, own?}]) and, read as grants, the old fields (venom, web, drinks —
// the numbers kept as they were: `own`)
export function speciesGrants(sp) {
  if (!sp) return [];
  const out = (sp.perks || []).map(g => ({...g, from: 'species'}));
  const legacy = (id, own) => { if (own && !out.some(g => g.id === id)) out.push({id, rank: 1, own, from: 'species'}); };
  legacy('venom', sp.venom); legacy('web', sp.web); legacy('bloodDrink', sp.drinks ? {share: sp.drinks} : null);
  return out;
}
// a species' innate profile of a perk, or null (combat, the rating: a venomous bite, a web, blood drunk)
export function innateOf(sp, id) {
  const g = speciesGrants(sp).find(x => x.id === id);
  return g ? perkProfile(id, g.rank, g.own) : null;
}

// the pull of one's character (campaign/perks.js pickPerk): weight = base + Σ lean × w + value + trait
export const PERK_PICK = {base: 1, value: 1, trait: 1};

// ── a creature's perks on the local map: learned (a.perks: [{id, rank}], given by campaign/camp.js from its member), its
// species' and its role's grants (data/roles.js `perks`) — one list, the same id at the highest rank
export function perksOf(a) {
  const sp = SPECIES.has(a?.species ?? a?.race) ? SPECIES.get(a.species ?? a.race) : null, role = roleRow(a);
  const out = (a?.perks || []).slice();
  const add = g => { const i = out.findIndex(p => p.id === g.id); if (i < 0) out.push(g); else if ((g.rank || 1) > (out[i].rank || 1)) out[i] = g; };
  for (const g of speciesGrants(sp)) add(g);
  for (const g of role?.perks || []) add({...g, from: 'role'});
  return out;
}
// the profile of a perk one holds (any source), or null: {…rank's numbers}
export function heldOf(a, id) {
  const g = perksOf(a).find(p => p.id === id);
  return g ? perkProfile(id, g.rank || 1, g.own) : null;
}
// the sum of a fight effect over its learned perks, each at its rank's row (for a factor: `mul`); 0 / 1 — none
export function perkOf(a, key) {
  let v = 0;
  for (const p of a?.perks || []) { const P = PERKS.has(p.id) ? PERKS.get(p.id) : null; const x = P && rowOf(P, p.rank).fight?.[key]; if (typeof x === 'number') v += x; }
  return v;
}
export const hasPerkA = (a, id) => !!a?.perks?.some(p => p.id === id);
// a factor of a fight effect (cover 1.5): the product over its perks; blows by type: {blunt: 1.15}
export function perkMulA(a, key, sub = null) {
  let v = 1;
  for (const p of a?.perks || []) { const P = PERKS.has(p.id) ? PERKS.get(p.id) : null; let x = P && rowOf(P, p.rank).fight?.[key]; if (sub != null) x = x?.[sub]; if (typeof x === 'number') v *= x; }
  return v;
}
