// Buildings. Cost is paid when the council lays the site; colonists then add `work` labour.
// `portable: true` — a simple building a campaign's wagon can carry packed (data/transport.js CAMP_FX).
// `effects` are merged into world.mods when a building is finished (see settlement/mods.js):
//   numbers under add.*  are summed, numbers under mul.* are multiplied,
//   yield.<resource> and jobSpeed.<job> multiply production, toolWear.<job> how fast that job's tools wear,
//   best.* keeps the largest value (one quarry is enough, a second adds nothing).
// `heat: {to, add, fuel}` — a lived-in building with its own hearth: while the camp fire burns it
//   warms its cells by `add` per tick up to `to` °C and burns `fuel` from the stock per tick;
//   people go to the nearest warm place to get warm. `bedWarmth` (in add) is how much a night there
//   warms its sleepers: a hut is drafty and needs a big fire, a log house holds heat on little wood.
// `lot: [w, h]` — the building's size in cells (default 2×2); `soil: true` — it is placed on the most
//   fertile ground near the camp rather than the nearest free spot (fields, gardens), and drawn as land.
// `zone` is the radius of the settlement zone around the building (default ZONE.building);
// zones of the camp and all buildings merge into one protected area (settlement/zone.js).
// `station: true` makes the building a workplace for crafting recipes (data/recipes.js);
// `benches` is how many people can work there at once.
// `motive(agent, ctx)` gives the council arguments: [[score, 'why'], ...].
// `key: resource` — a town-made tool (data/resources.js, tag 'key') only traders bring: the building is
//   not even considered until the colony has one, and it goes into the building (it is in `cost` too).
// `furnish: true` — a solid building that takes up to FURNISH_MAX pieces of furniture from the stock
//   (data/furniture.js); what they add up to is its standing (settlement/life.js). Huts, fields, pits
//   and fences take none.
// `pen: n` — a fenced pen for n places of tame animals (settlement/herd.js).
// `captureOnly: true` — never built by the council (it can only be captured, later).
// `walkTo: true` — people walk to it for something other than crafting (a flow field 'station:<id>').
import {Registry} from '../core/registry.js';
import {oreSeen} from '../world/ores.js';
import {SPECIES} from './species.js';

// free places in the pens (settlement/herd.js has the same; this table cannot import it)
const penRoom = w => w.buildings.reduce((s, b) => s + (b.done && b.key === 'pen' ? 6 : 0), 0)
  - w.agents.reduce((s, a) => s + (a.tame && !a.dead ? SPECIES.get(a.species).tame.space : 0), 0);

export const BUILDINGS = new Registry('building');

export const ZONE = {camp: 8, building: 5};

BUILDINGS.registerAll([
  // the shelter of the first season: poles and bark from what lies around. Drafty: in a hard
  // winter its fire eats wood and its sleepers still get cold.
  {id: 'hut', portable: true, name: 'Шалаш', gender: 'm', cost: {wood: 18}, work: 160, max: 4, wooden: true, color: '#b88a52', mark: 'Ш',
    heat: {to: 20, add: 3, fuel: 0.0016},
    effect: 'Сон на 60% быстрее. Лагерь примет на 4 жителей больше. Продувается: зимой греет плохо и съедает много дров.',
    effects: {add: {beds: 4, popCap: 4, bedWarmth: 2}},
    wish: 'хочет своё жильё',
    motive: (a, c) => [[a.mem.cold * 1.2, 'мёрзнет по ночам'], [a.mem.tired, 'не высыпается'],
      [c.crowded ? 0.8 : 0, 'в лагере тесно'], [c.count('hut') === 0 ? 0.3 : 0, 'хочет крышу над головой']]},

  // the log house: hewn boards, a reed-thatched roof, clay-daubed walls. Warm on little wood.
  {id: 'house', name: 'Изба', gender: 'f', cost: {planks: 16, reeds: 8, clay: 6, rope: 2}, work: 320, max: 6, wooden: true, color: '#a0703a', mark: 'И', needs: 'sawmill',
    heat: {to: 26, add: 4.5, fuel: 0.0004}, furnish: true,
    effect: 'Тёплый дом из тёса под камышовой кровлей, стены обмазаны глиной: 4 места, зимой тепло на малых дровах. Лагерь примет на 4 жителей больше.',
    effects: {add: {beds: 4, popCap: 4, bedWarmth: 4}},
    wish: 'хочет тёплый дом',
    motive: (a, c) => [[a.mem.cold * 1.6, 'мёрзнет в шалаше'], [c.season === 'autumn' ? 0.8 : c.season === 'winter' ? 0.6 : 0.15, 'зимовать в шалаше нельзя'],
      [c.crowded ? 0.7 : 0, 'в лагере тесно'], [c.count('hut') ? 0.2 : 0, 'хочет жить по-людски']]},

  {id: 'granary', name: 'Амбар', gender: 'm', cost: {wood: 25}, work: 200, max: 1, wooden: true, color: '#c9a24a', mark: 'А', furnish: true,
    effect: 'Еда на складе портится в 6 раз медленнее.',
    effects: {mul: {spoil: 1 / 6}},
    wish: 'хочет надёжно хранить запасы',
    motive: (a, c) => [[c.spoiled * 0.08, 'жалко испорченную еду']]},

  // a field: a fenced shed and sixteen ploughed plots around it; sown with seed bought from traders
  {id: 'field', name: 'Поле', gender: 'n', cost: {wood: 8, rope: 2}, work: 200, max: 3, wooden: true, color: '#8a7040', mark: 'П',
    lot: [4, 4], soil: true,
    effect: 'Распахивают 16 грядок на самой плодородной земле поблизости: на хорошей почве хлеб растёт быстрее и родит больше. Весной и летом сеют ячмень, репу или лён (семена — у торговцев, с урожая часть возвращается), осенью жнут. Несжатое к зиме побьёт мороз.',
    effects: {}, onFinish: 'plowField',
    available: w => ['seedBarley', 'seedTurnip', 'seedFlax'].some(s => (w.stock[s] || 0) >= 2),
    wish: 'хочет своё поле',
    motive: (a, c) => [[0.5, 'семена есть, а сеять негде'], [a.mem.hunger * 0.9, 'голодает'], [c.season === 'winter' ? -0.4 : 0, 'зимой не пашут'], [(a.prefs.farm - 1) * 1.5, 'любит землю']]},

  {id: 'garden', name: 'Ягодный огород', gender: 'm', cost: {wood: 12, berries: 10}, work: 140, max: 2, wooden: false, color: '#c45c95', mark: 'О',
    lot: [4, 3], soil: true,
    effect: 'На лучшей земле поблизости высаживают 12 кустов: они плодоносят втрое быстрее диких, а на жирной почве ещё быстрее.',
    effects: {}, onFinish: 'plantGarden',
    wish: 'хочет еду поближе к дому',
    motive: (a) => [[a.mem.hunger * 1.2, 'голодает'], [a.mem.walkFood, 'далеко ходить за ягодами'], [(a.prefs.gather - 1) * 0.6, 'любит возиться с ягодами']]},

  {id: 'lodge', portable: true, name: 'Охотничий навес', gender: 'm', cost: {wood: 20}, furnish: true, work: 160, max: 1, wooden: true, color: '#9a7b56', mark: 'Н',
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

  // no sawmill out here: two men and a pit saw on trestles; boards (тёс) for log houses
  {id: 'sawmill', name: 'Козлы для распила', gender: 'pl', cost: {wood: 20, rope: 2, pitsaw: 1}, key: 'pitsaw', work: 180, max: 1, wooden: true, color: '#8a6a3c', mark: 'Тс', station: true, benches: 2,
    effect: 'Брёвна распускают продольной пилой (её привозят торговцы) на тёс: из него рубят избы. Рядом удобнее колоть дрова: рубка на треть быстрее.',
    effects: {jobSpeed: {chop: 1.3}},
    wish: 'хочет тёс на избы',
    motive: (a, c) => [[a.mem.cold * 0.8 + (c.season === 'summer' || c.season === 'autumn' ? 0.4 : 0.1), 'без тёса избу не срубить'], [a.mem.walkWood * 0.6, 'далеко ходить за лесом'],
      [(a.prefs.saw - 1) * 1.4, 'любит работать с деревом']]},

  // ── the outpost's crafts
  {id: 'loom', name: 'Ткацкий станок', gender: 'm', cost: {wood: 12, rope: 2}, furnish: true, work: 160, max: 1, wooden: true, color: '#c8b48a', mark: 'Тк', station: true, benches: 1,
    effect: 'Из волокна ткут грубый холст: на рубахи, на продажу. Тонкое сукно и полотно — только у торговцев.',
    effects: {},
    wish: 'хочет ткать',
    motive: (a, c) => [[a.mem.cold * 0.5, 'нужна одежда'], [c.stock('fiber') * 0.03, 'волокно лежит без дела'], [(a.prefs.weave - 1) * 1.4, 'любит ткать']]},

  {id: 'potter', name: 'Гончарная яма', gender: 'f', cost: {wood: 8, clay: 6}, work: 140, max: 1, wooden: false, color: '#a8653e', mark: 'Гн', station: true, benches: 1,
    effect: 'Из глины лепят и обжигают горшки: в горшках еда портится медленнее и крысы до неё не добираются.',
    effects: {},
    wish: 'хочет хранить еду в горшках',
    motive: (a, c) => [[c.spoiled * 0.06, 'еда портится'], [c.rats * 0.25, 'крысы таскают припасы'], [c.stock('clay') * 0.03, 'глина есть, горшков нет'], [(a.prefs.pottery - 1) * 1.4, 'любит лепить']]},

  {id: 'smokehouse', name: 'Коптильня', gender: 'f', cost: {wood: 15, stone: 15}, furnish: true, work: 220, max: 1, wooden: false, color: '#a85a3a', mark: 'Кп', needs: 'quarry',
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
  {id: 'fishhut', portable: true, name: 'Хижина рыбака', gender: 'f', cost: {wood: 16}, furnish: true, work: 160, max: 1, wooden: true, color: '#5d8fa8', mark: 'Ры',
    near: 'fish',
    effect: 'Сети и вешала для рыбы: рыбаки ловят на треть быстрее, каждая рыба даёт в полтора раза больше еды, удочки изнашиваются вдвое медленнее.',
    effects: {jobSpeed: {fish: 1.35}, yield: {fish: 1.5}, toolWear: {fish: 0.5}},
    wish: 'хочет ловить рыбу удачнее',
    motive: (a, c) => [[c.fishLakes ? 0.15 : 0, 'в озере полно рыбы'], [(a.prefs.fish - 1) * 1.4 + (a.skill.fishing || 0) * 0.4, 'любит рыбачить'], [a.mem.walkFish * 0.8, 'далеко носить рыбу'], [c.fishLakes ? a.mem.hunger * 0.8 : 0, 'голодает, а рыба рядом'], [c.fishLakes && a.food?.likes === 'fish' ? 0.35 : 0, 'скучает по рыбе']],
    available: w => w.lakes.some(l => l.cap > 0)},

  {id: 'crafthut', portable: true, name: 'Хижина ремесленника', gender: 'f', cost: {wood: 22}, furnish: true, work: 180, max: 1, wooden: true, color: '#c08a4a', mark: 'Р', station: true, benches: 1,
    effect: 'Здесь делают одежду, оружие, луки, пращи, удочки, инструменты, колчаны и стрелы из дерева, кости и кожи.',
    effects: {},
    wish: 'хочет делать снаряжение',
    motive: (a, c) => [[0.35 + c.unarmed * 0.6, 'нечем отбиваться'], [a.mem.wolf + a.mem.raid, a.gender === 'f' ? 'видела опасность без оружия' : 'видел опасность без оружия'],
      [(a.prefs.craft - 1) * 1.4, 'любит мастерить'], [a.mem.cold * 0.5, 'нужна тёплая одежда']]},

  {id: 'tannery', name: 'Дубильня', gender: 'f', cost: {wood: 18, stone: 6}, furnish: true, work: 180, max: 1, wooden: false, color: '#7a5a3a', mark: 'Д', station: true, benches: 1, needs: 'crafthut',
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

  // the furnace takes whatever there is to melt: iron on coal, bronze, gold and silver on wood too;
  // bellows (a town-made tool in the stock) save fuel and time but are not needed
  {id: 'smelter', name: 'Сыродутный горн', gender: 'm', cost: {stone: 22, wood: 10, clay: 6}, work: 240, max: 1, wooden: false, color: '#b0603a', mark: 'Пл', station: true, benches: 1, needs: 'quarry',
    effect: 'Глиняная печь. На дровах плавят медно-оловянную руду в бронзу, золотой песок и серебро в слитки, льют бронзовые топоры, наконечники и колокола; железо плавят только на угле. Покупные кузнечные меха экономят четверть топлива и ускоряют работу. Городской домны здесь не построить.',
    effects: {},
    available: w => oreSeen(w) || (w.plantBeds?.placer?.length || 0) > 0,
    wish: 'хочет своего металла',
    motive: (a, c) => [[(c.stock('ironore') + c.stock('bronzeOre') + c.stock('silverOre')) * 0.07 + c.stock('goldDust') * 0.03, 'руда лежит без дела'],
      [(a.prefs.smith - 1) * 1.4, 'хочет работать у горна'], [c.unarmed * 0.4, 'нужно оружие получше']]},

  {id: 'forge', portable: true, name: 'Походная кузня', gender: 'f', cost: {stone: 18, wood: 16, iron: 2, anvil: 1}, key: 'anvil', furnish: true, work: 260, max: 1, wooden: false, color: '#8e8f96', mark: 'Кз', station: true, benches: 1, needs: 'smelter',
    effect: 'Навес, горн и покупная наковальня: куют мечи, копья с железными наконечниками, железные топоры, ламеллярные доспехи и оковку для сундуков. Кольчуги и тонкие клинки — только у торговцев.',
    effects: {},
    wish: 'хочет железное оружие',
    motive: (a, c) => [[c.stock('iron') * 0.12, 'железо лежит без дела'], [c.unarmed * 0.6 + (a.mem.wolf + a.mem.raid) * 0.6, 'деревом и костью не отбиться'],
      [(a.prefs.smith - 1) * 1.4, 'хочет работать у горна']]},

  {id: 'jeweler', name: 'Верстак резчика', gender: 'm', cost: {wood: 14, stone: 12, gemtools: 1}, key: 'gemtools', furnish: true, work: 200, max: 1, wooden: true, color: '#58b3a8', mark: 'Ю', station: true, benches: 1, needs: 'mineshaft',
    effect: 'Покупными резцами и лучковым сверлом самоцветы оправляют в кость, дерево, камень и железо; режут ларцы. Украшения копятся для торговли.',
    effects: {},
    wish: 'хочет делать красивые вещи',
    motive: (a, c) => [[c.stock('gems') * 0.08, 'самоцветы лежат без дела'], [(a.prefs.jewel - 1) * 1.5, 'любит тонкую работу']]},

  // ── food for the lean months
  {id: 'dryrack', name: 'Вешала и бочки', gender: 'pl', cost: {wood: 14}, work: 140, max: 1, wooden: true, color: '#b08850', mark: 'Вш', station: true, benches: 2,
    effect: 'Заготовки на зиму: ягоды, рыбу и мясо вялят на ветру (кроме зимы), а с покупной солью солят в бочках. Вяленое и солёное почти не портится.',
    effects: {},
    wish: 'хочет запасти еды на зиму',
    motive: (a, c) => [[c.season === 'autumn' ? 0.9 : c.season === 'summer' ? 0.5 : 0.2, c.season === 'autumn' ? 'зима на носу, надо запасаться' : 'хочет запасов на зиму'],
      [c.spoiled * 0.05, 'еда портится'], [a.mem.hunger * 0.6, 'помнит голод'], [(a.prefs.preserve - 1) * 1.4, 'любит заготовки']]},

  {id: 'hearth', name: 'Очаг', gender: 'm', cost: {stone: 8, wood: 6}, furnish: true, work: 140, max: 1, wooden: false, color: '#c4703a', mark: 'Оч', station: true, benches: 1, needs: 'quarry',
    effect: 'Здесь варят похлёбку из двух припасов: она сытнее, чем они порознь, и горячая еда поднимает настроение. Похлёбка не хранится.',
    effects: {},
    wish: 'хочет горячей еды',
    motive: (a, c) => [[a.mem.hunger * 0.7, 'голодает'], [a.mem.cold * 0.5, 'хочет горячего в холода'], [c.season === 'winter' ? 0.4 : 0, 'зимой без горячего тяжко'],
      [(a.prefs.cook - 1) * 1.4, 'любит стряпать']]},

  // the healer's hut: the wounded lie here and a healer tends them, many times faster than wounds
  // close by themselves; herbs make the treatment work fully (settlement/healing.js)
  {id: 'healerhut', portable: true, name: 'Хижина лекаря', gender: 'f', cost: {wood: 20}, furnish: true, work: 180, max: 1, wooden: true, color: '#8fcf86', mark: 'Лк',
    effect: 'Раненые лежат здесь, а лекарь их выхаживает: раны затягиваются в несколько раз быстрее, с травами — ещё быстрее. Лекарь же собирает лечебные травы.',
    effects: {}, beds: 3,
    wish: 'хочет, чтобы раненых было где лечить',
    motive: (a, c) => [[c.wounded * 1.6, 'раненые долго не встают'], [c.hurt(a) < 0.7 ? (1 - c.hurt(a)) * 1.4 : 0, a.gender === 'f' ? 'сама изранена' : 'сам изранен'],
      [(a.mem.wolf + a.mem.raid) * 0.4, 'после стычек некому лечить'], [(a.prefs.heal - 1) * 1.5, 'хочет лечить людей']]},

  {id: 'armory', name: 'Оружейный навес', gender: 'm', cost: {wood: 20, bone: 4}, furnish: true, work: 160, max: 1, wooden: true, color: '#a07850', mark: 'Он', needs: 'crafthut',
    effect: 'Снаряжение чинят и хранят под навесом: оно изнашивается вдвое медленнее.',
    effects: {mul: {wear: 0.5}},
    wish: 'хочет беречь снаряжение',
    motive: (a, c) => [[a.mem.broken * 1.3, 'снаряжение ломается'], [Math.max(0, c.broken - 1) * 0.2, 'снаряжение ломается слишком часто']]},

  // ── herding: a fenced pen for tamed goats and mules (settlement/herd.js)
  {id: 'pen', name: 'Загон', gender: 'm', cost: {wood: 14, rope: 2}, work: 160, max: 2, wooden: true, color: '#9a8a5a', mark: 'Зг',
    lot: [4, 4], pen: 6,
    effect: 'Изгородь на 6 мест: козе нужно одно, мулу два. Скотник приручает диких коз и мулов охапкой сена, доит коз, стрижёт шерсть; летом скот пасётся в загоне, зимой ест сено. Ручной мул возит брёвна и камень и тянет соху.',
    effects: {},
    // the first when there are wild goats or mules about; a second only when the first is full
    available: w => (w.buildings.some(b => b.key === 'pen') ? penRoom(w) < 2
      : w.agents.some(o => o.faction === 'wild' && (o.species === 'goat' || o.species === 'mule') && o.owner == null)),
    wish: 'хочет держать скот',
    motive: (a, c) => [[c.wildHerd && !c.count('pen') ? 0.45 : 0, 'по округе бродят дикие козы'], [c.herdFull ? 0.6 : 0, 'в загоне тесно'],
      ...(c.count('pen') ? [] : [[a.mem.hunger * 0.5, 'скот кормит и в голодный год'], [a.mem.cold * 0.3, 'из шерсти выйдет тёплая одежда'], [(a.prefs.herd - 1) * 1.5, 'любит возиться со скотиной']])]},

  // ── the shrine: a carved idol under a little roof, the graves beside it (settlement/life.js)
  {id: 'shrine', name: 'Святилище', gender: 'n', cost: {wood: 14, stone: 6}, work: 200, max: 1, wooden: true, color: '#d6b8e6', mark: 'Св', needs: 'quarry',
    furnish: true, walkTo: true,
    effect: 'Резной идол под навесом и погост рядом. Тот, кому тяжело на душе, приходит сюда помолиться; умерших здесь хоронят с обрядом, и скорбь отпускает живых вдвое быстрее.',
    effects: {},
    wish: 'хочет место, где можно помолиться',
    motive: (a, c) => [[a.mem.grief * 1.2, 'некому проводить умерших по-людски'], [c.gloomy * 1.2, 'многие пали духом'], [c.graves ? 0.25 : 0, 'могилы стоят без присмотра'],
      [(a.prefs.build - 1) * 0.3 + 0.1, 'хочет святое место']]},

  // the quern: two stones turned by hand; barley becomes flour, flour becomes bread at the hearth
  {id: 'quern', name: 'Ручные жернова', gender: 'pl', cost: {stone: 10, wood: 4}, work: 120, max: 1, wooden: false, color: '#b8a888', mark: 'Жр', station: true, benches: 1, needs: 'quarry',
    effect: 'Ячмень мелют в муку, из муки на очаге пекут хлеб: он сытнее зерна и хранится дольше каши.',
    effects: {},
    available: w => (w.stock.barley || 0) >= 4,
    wish: 'хочет хлеба',
    motive: (a, c) => [[c.stock('barley') * 0.04, 'ячмень лежит, а хлеба нет'], [(a.prefs.cook - 1) * 0.8, 'любит стряпать']]},

  // the magma forge: only in a region with magma, and the outpost can never build one itself — it may be
  // captured later, on the global map. Here so that the rest of the game can name it.
  {id: 'magmaforge', name: 'Магмовая кузня', gender: 'f', cost: {stone: 999}, work: 9999, max: 1, wooden: false, color: '#d0502a', mark: 'Мг', captureOnly: true,
    effect: 'Кузня на живом жару магмы: только в ней куют мифрил. Форпосту её не построить — её можно лишь захватить.',
    effects: {}, wish: '', motive: () => []},

  {id: 'watchtower', name: 'Сторожевая вышка', gender: 'f', cost: {wood: 30, bone: 4}, work: 220, max: 2, wooden: true, color: '#9c8b6e', mark: 'Вш', zone: 11,
    effect: 'Расширяет зону поселения на 11 клеток вокруг себя: здесь защитники сильнее, а волки не охотятся.',
    effects: {},
    wish: 'хочет видеть опасность издалека',
    motive: (a) => [[a.mem.wolf * 1.2 + a.mem.raid * 0.8, 'хочет видеть опасность издалека']]},
]);
