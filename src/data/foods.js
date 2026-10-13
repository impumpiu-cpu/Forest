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
]);

// food preferences of one person: {likes, dislikes} (ids from FOODS), drawn with `rnd` (0..1)
export function drawFoodPrefs(rnd) {
  const all = FOODS.all();
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
