// Buildings. Cost is paid when the council lays the site; colonists then add `work` labour.
// `effects` are merged into world.mods when a building is finished (see settlement/mods.js):
//   numbers under add.*  are summed, numbers under mul.* are multiplied,
//   yield.<resource> and jobSpeed.<job> multiply production, toolWear.<job> how fast that job's tools wear,
//   best.* keeps the largest value (one quarry is enough, a second adds nothing).
// `zone` is the radius of the settlement zone around the building (default ZONE.building);
// zones of the camp and all buildings merge into one protected area (settlement/zone.js).
// `station: true` makes the building a workplace for crafting recipes (data/recipes.js);
// `benches` is how many people can work there at once.
// `motive(agent, ctx)` gives the council arguments: [[score, 'why'], ...].
import {Registry} from '../core/registry.js';
import {oreSeen} from '../world/ores.js';

export const BUILDINGS = new Registry('building');

export const ZONE = {camp: 8, building: 5};

BUILDINGS.registerAll([
  {id: 'hut', name: 'Шалаш', gender: 'm', cost: {wood: 18}, work: 160, max: 4, wooden: true, color: '#b88a52', mark: 'Ш',
    effect: 'Сон на 60% быстрее, ночью спящие не мёрзнут. Лагерь примет на 4 жителей больше.',
    effects: {add: {beds: 4, popCap: 4}},
    wish: 'хочет своё жильё',
    motive: (a, c) => [[a.mem.cold * 1.2, 'мёрзнет по ночам'], [a.mem.tired, 'не высыпается'],
      [c.crowded ? 0.8 : 0, 'в лагере тесно'], [c.count('hut') === 0 ? 0.3 : 0, 'хочет крышу над головой']]},

  {id: 'granary', name: 'Амбар', gender: 'm', cost: {wood: 25}, work: 200, max: 1, wooden: true, color: '#c9a24a', mark: 'А',
    effect: 'Еда на складе портится в 6 раз медленнее.',
    effects: {mul: {spoil: 1 / 6}},
    wish: 'хочет надёжно хранить запасы',
    motive: (a, c) => [[c.spoiled * 0.08, 'жалко испорченную еду']]},

  {id: 'garden', name: 'Ягодный огород', gender: 'm', cost: {wood: 12, berries: 10}, work: 140, max: 2, wooden: false, color: '#c45c95', mark: 'О',
    effect: 'Рядом высаживаются 12 кустов, они плодоносят втрое быстрее диких.',
    effects: {}, onFinish: 'plantGarden',
    wish: 'хочет еду поближе к дому',
    motive: (a) => [[a.mem.hunger * 1.2, 'голодает'], [a.mem.walkFood, 'далеко ходить за ягодами'], [(a.prefs.gather - 1) * 0.6, 'любит возиться с ягодами']]},

  {id: 'lodge', name: 'Охотничий навес', gender: 'm', cost: {wood: 20}, work: 160, max: 1, wooden: true, color: '#9a7b56', mark: 'Н',
    effect: 'Луки бьют дальше на 2 клетки, каждый заяц даёт в полтора раза больше мяса.',
    effects: {add: {huntRange: 2}, yield: {meat: 1.5}},
    wish: 'хочет охотиться удачнее',
    motive: (a, c) => [[(a.prefs.hunt - 1) * 1.3, 'любит охоту'], [a.mem.chase * 1.2, 'зайцы уходят от стрел'], [c.preyCount > 6 ? 0.3 : 0, 'вокруг много зайцев'],
      [c.wolves ? 0.25 : 0, 'волки перехватывают зайцев'], [a.food?.likes === 'meat' ? 0.25 : 0, 'хочет мяса почаще']]},

  {id: 'quarry', name: 'Каменоломня', gender: 'f', cost: {wood: 20}, work: 180, max: 1, wooden: true, color: '#9b9688', mark: 'К',
    effect: 'Открывает добычу камня у скал. Отборные камни для пращи: праща бьёт в 1,6 раза сильнее.',
    effects: {best: {slingStones: 1.6}},  // the 'mine' job lists it in `requires`
    wish: 'говорит, что нужен камень',
    motive: (a, c) => [[0.35 + (c.wantStone ? 0.35 : 0), 'без камня дальше не построиться'], [(a.prefs.mine - 1) * 1.5, 'любит работать с камнем']]},

  {id: 'sawmill', name: 'Лесопилка', gender: 'f', cost: {wood: 30, stone: 10}, work: 240, max: 1, wooden: true, color: '#8a6a3c', mark: 'Л', needs: 'quarry',
    effect: 'Рубка идёт на 60% быстрее, каждое бревно даёт в полтора раза больше древесины.',
    effects: {jobSpeed: {chop: 1.6}, yield: {wood: 1.5}},
    wish: 'хочет больше древесины',
    motive: (a) => [[a.mem.walkWood, 'далеко ходить за лесом'], [(a.prefs.chop - 1) * 1.4 + a.skill.chop * 0.4, 'любит рубить лес']]},

  {id: 'smokehouse', name: 'Коптильня', gender: 'f', cost: {wood: 15, stone: 15}, work: 220, max: 1, wooden: false, color: '#a85a3a', mark: 'Кп', needs: 'quarry',
    effect: 'Ягоды, мясо и рыба перерабатываются: +40% еды, порча вдвое медленнее.',
    effects: {yield: {berries: 1.4, meat: 1.4, fish: 1.4}, mul: {spoil: 0.5}},
    wish: 'хочет запасов на чёрный день',
    motive: (a, c) => [[a.mem.hunger * 0.8, 'хочет запасов еды'], [(a.prefs.gather - 1) * 0.6 + (a.prefs.hunt - 1) * 0.6, 'добывает еду и хочет её сохранить'], [c.spoiled * 0.04, 'еда портится']]},

  {id: 'well', name: 'Колодец', gender: 'm', cost: {stone: 25}, work: 200, max: 1, wooden: false, color: '#5d93b8', mark: 'В', needs: 'quarry',
    effect: 'Тушение вдвое эффективнее, клетки у лагеря остывают быстрее.',
    effects: {mul: {douse: 2}, add: {coolCamp: 1}},
    wish: 'хочет воду рядом с лагерем',
    motive: (a, c) => [[a.mem.fire * 1.5, a.gender === 'f' ? 'видела пожар' : 'видел пожар'], [c.burnt > 0 ? 0.4 : 0, 'боится огня']]},

  {id: 'palisade', name: 'Частокол', gender: 'm', cost: {wood: 45, stone: 10}, work: 300, max: 1, wooden: true, color: '#6f5a3c', mark: 'Ч', needs: 'quarry',
    effect: 'В лагере защитники получают на 40% меньше урона, налётчики уносят вдвое меньше.',
    effects: {mul: {defense: 0.6, loot: 0.5}},
    wish: 'хочет защиты от чужаков',
    motive: (a) => [[a.mem.raid * 1.5, a.gender === 'f' ? 'дралась с налётчиками' : 'дрался с налётчиками'], [a.mem.wolf * 1.4, 'боится волков']]},

  // built by the water when it can be: the nearest lot within reach that touches a lake with fish
  {id: 'fishhut', name: 'Хижина рыбака', gender: 'f', cost: {wood: 16}, work: 160, max: 1, wooden: true, color: '#5d8fa8', mark: 'Ры',
    near: 'fish',
    effect: 'Сети и вешала для рыбы: рыбаки ловят на треть быстрее, каждая рыба даёт в полтора раза больше еды, удочки изнашиваются вдвое медленнее.',
    effects: {jobSpeed: {fish: 1.35}, yield: {fish: 1.5}, toolWear: {fish: 0.5}},
    wish: 'хочет ловить рыбу удачнее',
    motive: (a, c) => [[c.fishLakes ? 0.15 : 0, 'в озере полно рыбы'], [(a.prefs.fish - 1) * 1.4 + a.skill.fish * 0.4, 'любит рыбачить'], [a.mem.walkFish * 0.8, 'далеко носить рыбу'], [c.fishLakes ? a.mem.hunger * 0.8 : 0, 'голодает, а рыба рядом'], [c.fishLakes && a.food?.likes === 'fish' ? 0.35 : 0, 'скучает по рыбе']],
    available: w => w.lakes.some(l => l.cap > 0)},

  {id: 'crafthut', name: 'Хижина ремесленника', gender: 'f', cost: {wood: 22}, work: 180, max: 1, wooden: true, color: '#c08a4a', mark: 'Р', station: true, benches: 1,
    effect: 'Здесь делают одежду, оружие, луки, пращи, удочки, инструменты, колчаны и стрелы из дерева, кости и кожи.',
    effects: {},
    wish: 'хочет делать снаряжение',
    motive: (a, c) => [[0.35 + c.unarmed * 0.6, 'нечем отбиваться'], [a.mem.wolf + a.mem.raid, a.gender === 'f' ? 'видела опасность без оружия' : 'видел опасность без оружия'],
      [(a.prefs.craft - 1) * 1.4, 'любит мастерить'], [a.mem.cold * 0.5, 'нужна тёплая одежда']]},

  {id: 'tannery', name: 'Дубильня', gender: 'f', cost: {wood: 18, stone: 6}, work: 180, max: 1, wooden: false, color: '#7a5a3a', mark: 'Д', station: true, benches: 1, needs: 'crafthut',
    effect: 'Сырые шкуры выделывают в кожу. Кожа нужна для курток, укреплённой брони и луков.',
    effects: {},
    wish: 'хочет выделывать кожи',
    motive: (a, c) => [[c.hides * 0.08, 'шкуры пропадают зря'], [(a.prefs.tan - 1) * 1.4, 'любит выделывать кожи'], [a.mem.cold * 0.6, 'мёрзнет без кожаной одежды']]},

  // ── the iron chain: ore from the mine, charcoal from logs, bars from the furnace, blades from the forge
  {id: 'mineshaft', name: 'Рудник', gender: 'm', cost: {wood: 25, stone: 10}, work: 220, max: 1, wooden: true, color: '#7d6a58', mark: 'Рд', needs: 'quarry',
    effect: 'Открывает добычу руды в скалах: железной руды, каменного угля и самоцветов. Копают ту руду, которой на складе меньше нужного.',
    effects: {},
    wish: 'говорит, что в скалах есть руда',
    motive: (a, c) => [[c.oreSeen ? 0.3 : 0, 'в скалах видна руда'], [(a.prefs.dig - 1) * 1.5, 'любит копать руду'],
      [c.unarmed > 0.3 && c.oreSeen ? 0.2 : 0, 'из железа вышло бы оружие получше']],
    available: w => oreSeen(w)},

  {id: 'charpit', name: 'Углежогная яма', gender: 'f', cost: {wood: 14, stone: 6}, work: 160, max: 1, wooden: false, color: '#4a4440', mark: 'У', station: true, benches: 1, needs: 'quarry',
    effect: 'Брёвна томят без огня в древесный уголь. Уголь — топливо для плавильни и кузницы, а костёр на нём горит вдвое дольше.',
    effects: {},
    wish: 'хочет запасать топливо',
    motive: (a, c) => [[c.count('smelter') ? 0.55 : 0, 'плавильне нужен уголь'], [c.count('mineshaft') && !c.count('smelter') ? 0.2 : 0, 'без угля руду не расплавить'],
      [(a.prefs.charcoal - 1) * 1.4, 'любит жечь уголь'], [a.mem.cold * 0.3, 'хочет, чтобы костёр горел дольше']]},

  {id: 'smelter', name: 'Плавильня', gender: 'f', cost: {stone: 22, wood: 10}, work: 240, max: 1, wooden: false, color: '#b0603a', mark: 'Пл', station: true, benches: 1, needs: 'mineshaft',
    effect: 'Железную руду плавят на угле в слитки: 2 руды и 1 уголь дают слиток железа.',
    effects: {},
    wish: 'хочет своё железо',
    motive: (a, c) => [[c.stock('ironore') * 0.07, 'руда лежит без дела'], [(a.prefs.smith - 1) * 1.4, 'хочет работать у горна'],
      [c.unarmed * 0.4, 'нужно оружие получше']]},

  {id: 'forge', name: 'Кузница', gender: 'f', cost: {stone: 18, wood: 16, iron: 2}, work: 260, max: 1, wooden: false, color: '#8e8f96', mark: 'Кз', station: true, benches: 1, needs: 'smelter',
    effect: 'Из железа куют мечи, копья с железными наконечниками, железные топоры и ламеллярные доспехи.',
    effects: {},
    wish: 'хочет железное оружие',
    motive: (a, c) => [[c.stock('iron') * 0.12, 'железо лежит без дела'], [c.unarmed * 0.6 + (a.mem.wolf + a.mem.raid) * 0.6, 'деревом и костью не отбиться'],
      [(a.prefs.smith - 1) * 1.4, 'хочет работать у горна']]},

  {id: 'jeweler', name: 'Ювелирная мастерская', gender: 'f', cost: {wood: 14, stone: 12}, work: 200, max: 1, wooden: true, color: '#58b3a8', mark: 'Ю', station: true, benches: 1, needs: 'mineshaft',
    effect: 'Самоцветы оправляют в кость, дерево, камень и железо. Украшения копятся для торговли.',
    effects: {},
    wish: 'хочет делать красивые вещи',
    motive: (a, c) => [[c.stock('gems') * 0.08, 'самоцветы лежат без дела'], [(a.prefs.jewel - 1) * 1.5, 'любит тонкую работу']]},

  {id: 'armory', name: 'Оружейный навес', gender: 'm', cost: {wood: 20, bone: 4}, work: 160, max: 1, wooden: true, color: '#a07850', mark: 'Он', needs: 'crafthut',
    effect: 'Снаряжение чинят и хранят под навесом: оно изнашивается вдвое медленнее.',
    effects: {mul: {wear: 0.5}},
    wish: 'хочет беречь снаряжение',
    motive: (a, c) => [[a.mem.broken * 1.3, 'снаряжение ломается'], [Math.max(0, c.broken - 1) * 0.2, 'снаряжение ломается слишком часто']]},

  {id: 'watchtower', name: 'Сторожевая вышка', gender: 'f', cost: {wood: 30, bone: 4}, work: 220, max: 2, wooden: true, color: '#9c8b6e', mark: 'Вш', zone: 11,
    effect: 'Расширяет зону поселения на 11 клеток вокруг себя: здесь защитники сильнее, а волки не охотятся.',
    effects: {},
    wish: 'хочет видеть опасность издалека',
    motive: (a) => [[a.mem.wolf * 1.2 + a.mem.raid * 0.8, 'хочет видеть опасность издалека']]},
]);
