// Buildings. Cost is paid when the council lays the site; colonists then add `work` labour.
// `effects` are merged into world.mods when a building is finished (see settlement/mods.js):
//   numbers under add.*  are summed, numbers under mul.* are multiplied,
//   yield.<resource> and jobSpeed.<job> multiply production.
// `motive(agent, ctx)` gives the council arguments: [[score, 'why'], ...].
import {Registry} from '../core/registry.js';

export const BUILDINGS = new Registry('building');

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
      [c.wolves ? 0.25 : 0, 'волки перехватывают зайцев']]},

  {id: 'quarry', name: 'Каменоломня', gender: 'f', cost: {wood: 20}, work: 180, max: 1, wooden: true, color: '#9b9688', mark: 'К',
    effect: 'Открывает добычу камня у скал. Камень нужен для сложных построек.',
    effects: {},  // the 'mine' job lists it in `requires`
    wish: 'говорит, что нужен камень',
    motive: (a, c) => [[0.35 + (c.wantStone ? 0.35 : 0), 'без камня дальше не построиться'], [(a.prefs.mine - 1) * 1.5, 'любит работать с камнем']]},

  {id: 'sawmill', name: 'Лесопилка', gender: 'f', cost: {wood: 30, stone: 10}, work: 240, max: 1, wooden: true, color: '#8a6a3c', mark: 'Л', needs: 'quarry',
    effect: 'Рубка идёт на 60% быстрее, каждое бревно даёт в полтора раза больше дров.',
    effects: {jobSpeed: {chop: 1.6}, yield: {wood: 1.5}},
    wish: 'хочет больше дров',
    motive: (a) => [[a.mem.walkWood, 'далеко ходить за лесом'], [(a.prefs.chop - 1) * 1.4 + a.skill.chop * 0.4, 'любит рубить лес']]},

  {id: 'smokehouse', name: 'Коптильня', gender: 'f', cost: {wood: 15, stone: 15}, work: 220, max: 1, wooden: false, color: '#a85a3a', mark: 'Кп', needs: 'quarry',
    effect: 'Ягоды и мясо перерабатываются: +40% еды, порча вдвое медленнее.',
    effects: {yield: {berries: 1.4, meat: 1.4}, mul: {spoil: 0.5}},
    wish: 'хочет запасов на чёрный день',
    motive: (a, c) => [[a.mem.hunger * 0.8, 'хочет запасов еды'], [(a.prefs.gather - 1) * 0.6 + (a.prefs.hunt - 1) * 0.6, 'добывает еду и хочет её сохранить'], [c.spoiled * 0.04, 'еда портится']]},

  {id: 'well', name: 'Колодец', gender: 'm', cost: {stone: 25}, work: 200, max: 1, wooden: false, color: '#5d93b8', mark: 'В', needs: 'quarry',
    effect: 'Тушение вдвое эффективнее, клетки у лагеря остывают быстрее.',
    effects: {mul: {douse: 2}, add: {coolCamp: 1}},
    wish: 'хочет воду рядом с лагерем',
    motive: (a, c) => [[a.mem.fire * 1.5, 'видел(а) пожар'], [c.burnt > 0 ? 0.4 : 0, 'боится огня']]},

  {id: 'palisade', name: 'Частокол', gender: 'm', cost: {wood: 45, stone: 10}, work: 300, max: 1, wooden: true, color: '#6f5a3c', mark: 'Ч', needs: 'quarry',
    effect: 'В лагере защитники получают на 40% меньше урона, налётчики уносят вдвое меньше.',
    effects: {mul: {defense: 0.6, loot: 0.5}},
    wish: 'хочет защиты от чужаков',
    motive: (a) => [[a.mem.raid * 1.5, 'дрался(ась) с налётчиками'], [a.mem.wolf * 1.4, 'боится волков']]},
]);
