// The guild's house (plan claude/guild-plan.md Г3; docs/GUILD.md «Дом гильдии»; the author's word 13.11): its rooms, each of a few
// levels, built one at a time — paid, ready at the next season's start (`HOUSE.build`); some need one of the guild's people at
// their post (`post`) and stand idle without him. Settled by campaign/house.js. A row:
//   label, about — the room and what it does (the screen's lines)
//   start  — the level the guild has at its founding (0: not built)
//   cost   — the gold of each level, from the first: cost[k] builds level k + 1
//   upkeep — gold a season for each level standing (paid with the wages)
//   post   — the one it needs at work: {label, test} (test: the letter and the least of it, or a level); none — no post
//   by     — its effect by level (index 0: none / the start's), read by the systems through campaign/house.js
//   gate   — the stage it is opened at (later stages: Г3б)
import {Registry} from '../core/registry.js';

// HOUSE — the rules of the house:
//   build   — a room or a level: one at a time, ready at the start of the next season
//   upkeep  — × each room's upkeep (one dial for all)
//   xpRef   — the planning room: a party of this many gets the errand's experience whole; fewer — more each, more — less each
//             (× xpRef / size, within `xpSpan`) — fewer hands, more risk, more experience on each (the author's word 13.11)
//   train   — the training rooms: experience a trainee gets a season (about the 1st level to the 2nd); the highest level a
//             trainee is trained to: 1 + the room's level
//   heal    — the healer's room: lasting wounds mended a season on each patient; a member's health mends × (1 + `home` ×
//             the room's level) at the house; `potions` a departing member takes, by the room's level
//   tavern  — the share of the wages the guild's people spend at its own tavern (comes back), by its level; its own income a
//             season, × the manager's Charisma over 5
//   grief   — a member dies: the devotion each who thought well of him loses (his bond above `bond`), × (1 − the chapel's share)
export const HOUSE = {
  build: 1, upkeep: 1, xpRef: 4, xpSpan: [0.5, 2],
  train: {xp: 30},
  heal: {home: 0.5},
  grief: {loss: 0.1, bond: 1},
};

export const ROOMS = new Registry('room');
ROOMS.registerAll([
  {id: 'board', label: 'Доска объявлений', about: 'Сколько договоров стоит на доске гильдии разом (сюжетные — среди них).', start: 1, cost: [0, 120, 300], upkeep: 0,
    by: {slots: [0, 4, 6, 8]}},
  {id: 'planning', label: 'Комната планирования', about: 'Сколько человек гильдия может отправить в один отряд. Меньше отряд — больше опыта каждому, но выше риск.', start: 1, cost: [0, 150, 350], upkeep: 0,
    by: {party: [0, 4, 6, 8]}},
  {id: 'barracks', label: 'Казармы', about: 'Сколько людей может жить в гильдии.', start: 1, cost: [0, 100, 250, 500], upkeep: 1,
    by: {roster: [0, 8, 12, 16, 20]}},
  {id: 'tavern', label: 'Таверна', about: 'Люди гильдии пьют своё жалованье у себя: часть его возвращается в казну; и свой доход с гостей.', start: 0, cost: [120, 250, 450], upkeep: 1,
    post: {label: 'управляющий'}, by: {back: [0, 0.15, 0.25, 0.35], income: [0, 6, 12, 20]}},
  {id: 'training', label: 'Тренировочный зал', about: 'Тренер учит новичков: за сезон — примерно с 1-го уровня до 2-го. Ученик на это время занят.', start: 0, cost: [150, 300, 500, 800], upkeep: 2,
    post: {label: 'тренер', level: 10}, by: {slots: [0, 1, 2, 3, 4]}},
  {id: 'healer', label: 'Комната лекаря', about: 'Лекарь снимает тяжёлые травмы (сезон на травму), даёт зелья в дорогу, раны дома заживают быстрее.', start: 0, cost: [120, 250, 450, 700], upkeep: 2,
    post: {label: 'лекарь', letter: 'I', least: 9}, by: {slots: [0, 1, 2, 3, 4], potions: [0, 1, 1, 2, 2]}},
  {id: 'pantry', label: 'Кладовая', about: 'Свои запасы: еда в дорогу дешевле.', start: 0, cost: [60, 150, 300], upkeep: 1,
    by: {food: [1, 0.85, 0.7, 0.55]}},
  {id: 'maps', label: 'Картографическая', about: 'Карты и слухи: больше времени на договоры, где цель ищут по следам; на последнем уровне их место известно заранее.', start: 0, cost: [100, 250, 450], upkeep: 1,
    by: {time: [1, 1.15, 1.3, 1.45], known: [false, false, false, true]}},
  {id: 'chapel', label: 'Часовня', about: 'Поминовение павших: гибель товарища меньше бьёт по верности остальных.', start: 0, cost: [80, 200], upkeep: 1,
    by: {grief: [0, 0.5, 1]}},
  {id: 'fallen', label: 'Доска павших', about: 'Имена тех, кто не вернулся. Есть всегда.', start: 1, cost: [0], upkeep: 0, by: {}},
  // ── Г3б: the armory, the merchant's room, the forge, the stable and the kennel
  {id: 'armory', label: 'Оружейная', about: 'Хранит и выдаёт оружие и доспехи.', start: 0, cost: [150, 300, 500, 800], upkeep: 1, gate: 'Г3б', by: {slots: [0, 50, 100, 150, 200]}},
  {id: 'merchant', label: 'Комната торговца', about: 'Лучшие цены на оружие и доспехи; таверне — гости; на доске — договор уровнем выше.', start: 0, cost: [200], upkeep: 1, gate: 'Г3б',
    post: {label: 'торговец', letter: 'C', least: 9}, by: {}},
  {id: 'forge', label: 'Кузница гильдии', about: 'Улучшает оружие и доспехи из оружейной, до +3: медь, железо, сталь.', start: 0, cost: [250, 450, 700], upkeep: 2, gate: 'Г3б',
    post: {label: 'кузнец', letter: 'S', least: 8}, by: {}},
  {id: 'stable', label: 'Конюшня и псарня', about: 'Ездовые и боевые звери гильдии: держать, покупать, брать в поход.', start: 0, cost: [120, 250, 400], upkeep: 2, gate: 'Г3б', by: {}},
]);
