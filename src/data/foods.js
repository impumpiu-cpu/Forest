// Food. Every entry here becomes a stock resource tagged 'food' (see data/resources.js), so a new
// food is one line in this list plus a source for it (a job, an animal's yields, a recipe).
//
//   nutrition: how much one portion fills the stomach (1 = an ordinary meal)
//   spoil:     how fast it rots in the stock (1 = berries; a granary and a smokehouse slow it down)
//   loot:      how many portions raiders carry off at once
//   taste:     how much people like it on average, −1…+1; it tilts who picks it as a favourite
//   kind:      a word for the person card ('растительная', 'рыбная', 'мясная' …)
//   eat:       optional thought id for when someone eats it (data/thoughts.js)
//   value:     price of one portion in imperial gold (what a trader pays or asks, data/trade.js)
//   keepPerHead: portions per colonist the colony holds back when it sells to a trader
//   map(w, i): optional, where it can be gathered on the resource layer, in `mapColor`
//   of:        a preserved food: which fresh food it was made from (a taste for fish is a taste for dried fish)
//   dish:      a cooked dish (from the hearth): eaten first while it is hot, never anyone's "favourite"
//   group:     section on the stock panel (default 'Еда');  noFav: never drawn as someone's favourite
// At a meal people take a dish first, then what spoils fastest, and keep dried and salted food
// for later; their favourite food (or anything made from it) wins over all of that.
//
// Each colonist gets a favourite and a disliked food (agents/agent.js). At a meal they take the
// favourite when the stock has it, never the disliked one unless nothing else is left; either
// choice leaves a thought in the diary and colours the mood.
import {Registry} from '../core/registry.js';

export const FOODS = new Registry('food');

FOODS.registerAll([
  {id: 'berries', label: 'ягоды', kind: 'растительная', nutrition: 1.0, spoil: 1.0, loot: 4, taste: 0, value: 0.2, keepPerHead: 2, color: '#c45c95',
    map: (w, i) => w.grid.food[i], mapColor: [214, 84, 160]},
  // fish lives in lakes (world/lakes.js); the layer shows how full each lake is
  {id: 'fish', label: 'рыба', kind: 'рыбная', nutrition: 1.4, spoil: 2, loot: 3, taste: 0.1, value: 0.3, keepPerHead: 1, color: '#6fa8c8',
    map: (w, i) => { const id = w.grid.lake?.[i]; const l = id >= 0 ? w.lakes[id] : null; return l?.cap ? 0.25 + 0.75 * l.fish / l.cap : 0; },
    mapColor: [96, 176, 236]},
  {id: 'meat', label: 'мясо', kind: 'мясная', nutrition: 1.6, spoil: 2.5, loot: 3, taste: 0.3, value: 0.4, keepPerHead: 1, color: '#d0786a', eat: 'ateMeat'},

  // wild honey keeps forever and everyone likes it, but it is too rare to be anyone's staple
  {id: 'honey', label: 'мёд', kind: 'сладкая', noFav: true, nutrition: 1.2, spoil: 0.01, loot: 2, taste: 0.7, value: 1, keepPerHead: 1, color: '#e8b030'},
  // from the fields (data/crops.js): grain keeps well raw and makes porridge; turnips keep through the winter
  {id: 'barley', label: 'ячмень', kind: 'зерно', noFav: true, nutrition: 0.8, spoil: 0.05, loot: 4, taste: -0.1, value: 0.25, keepPerHead: 4, color: '#d8c27a'},
  {id: 'turnip', label: 'репа', kind: 'растительная', noFav: true, nutrition: 1.0, spoil: 0.3, loot: 4, taste: 0, value: 0.2, keepPerHead: 3, color: '#d9b6c8'},

  // from the pen (settlement/herd.js): milk sours in a day or two, cheese pressed from it keeps all winter
  {id: 'milk', label: 'молоко', kind: 'молочная', noFav: true, nutrition: 0.7, spoil: 4, loot: 2, taste: 0.3, value: 0.2, keepPerHead: 0, color: '#f2efe4'},
  {id: 'cheese', label: 'сыр', short: 'сыр', of: 'milk', group: 'Заготовки', nutrition: 2.2, spoil: 0.05, loot: 3, taste: 0.4, value: 1.2, keepPerHead: 2, color: '#e6c860'},

  // cooked at the hearth from two portions: more filling than both, a hot meal lifts the mood, but it does not keep
  {id: 'kasha', label: 'каша', kind: 'горячая', dish: true, nutrition: 2.4, spoil: 2, loot: 1, taste: 0.4, value: 0.6, keepPerHead: 0, color: '#e0c890', eat: 'ateHot'},
  {id: 'stew', label: 'похлёбка', kind: 'горячая', dish: true, nutrition: 3.0, spoil: 3, loot: 1, taste: 0.6, value: 0.8, keepPerHead: 0, color: '#d9a35a', eat: 'ateHot'},

  // preserved on the racks: dried in the sun and wind (not in winter), or salted with bought salt (any time)
  {id: 'driedBerries', label: 'сушёные ягоды', short: 'сушёные ягоды', of: 'berries', group: 'Заготовки', nutrition: 1.3, spoil: 0.12, loot: 4, taste: -0.1, value: 0.4, keepPerHead: 4, color: '#8e3f6b'},
  {id: 'driedFish', label: 'вяленая рыба', short: 'вяленая рыба', of: 'fish', group: 'Заготовки', nutrition: 1.2, spoil: 0.15, loot: 3, taste: -0.1, value: 0.5, keepPerHead: 3, color: '#a99a76'},
  {id: 'jerky', label: 'вяленое мясо', short: 'вяленое мясо', of: 'meat', group: 'Заготовки', nutrition: 1.4, spoil: 0.12, loot: 3, taste: 0, value: 0.6, keepPerHead: 3, color: '#8a4a3a'},
  {id: 'saltFish', label: 'солёная рыба', short: 'солёная рыба', of: 'fish', group: 'Заготовки', nutrition: 1.3, spoil: 0.04, loot: 3, taste: 0, value: 0.6, keepPerHead: 3, color: '#9fb6c2'},
  {id: 'saltMeat', label: 'солонина', short: 'солонина', of: 'meat', group: 'Заготовки', nutrition: 1.5, spoil: 0.04, loot: 3, taste: 0.05, value: 0.7, keepPerHead: 3, color: '#b0645a'},
]);

// foods someone can call their favourite: the fresh ones (dried fish counts as fish)
export const BASE_FOODS = () => FOODS.filter(f => !f.of && !f.dish && !f.noFav);
export const tasteOf = f => f.of || f.id;

// food preferences of one person: {likes, dislikes} (ids from FOODS), drawn with `rnd` (0..1)
export function drawFoodPrefs(rnd) {
  const all = BASE_FOODS();
  if (all.length < 2) return {likes: all[0]?.id ?? null, dislikes: null};
  // tastier food is more often a favourite and less often disliked
  const pick = (skip, sign) => {
    const opts = all.filter(f => f.id !== skip), ws = opts.map(f => Math.max(0.15, 1 + sign * (f.taste || 0)));
    let r = rnd() * ws.reduce((s, x) => s + x, 0);
    for (let k = 0; k < opts.length; k++) { r -= ws[k]; if (r <= 0) return opts[k].id; }
    return opts[opts.length - 1].id;
  };
  const likes = pick(null, 1);
  return {likes, dislikes: pick(likes, -1)};
}
