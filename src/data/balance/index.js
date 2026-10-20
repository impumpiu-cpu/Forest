// The balance tables in one place (docs/BALANCE.md):
//   forms.js, materials.js — what items are shaped as and made of; data/items.js makes every pair
//   prices.js              — every price and money coefficient, and how many units share one place (stack)
//   combat.js              — the numbers of the fight itself
//   creatures.js           — the body, SPECIAL and strength rating (КС) of every species
//   rules.js, power.js     — what `npm run items` and `npm run arena` measure against (the game never reads them)
export {FORMS} from './forms.js';
export {MATERIALS} from './materials.js';
export {PRICES} from './prices.js';
export {COMBAT, CAPS} from './combat.js';
export {RULES} from './rules.js';
export {CREATURES, STRENGTH} from './creatures.js';
