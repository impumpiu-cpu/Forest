// Crafting recipes. A station building (buildings.js, `station: true`) works one order at a time;
// colonists whose job lists that station take the materials and add labour until the order is done.
//
//   at:    station building id         cost: resources taken when the order starts
//   work:  labour needed                makes: {item: id} or {resource: id, n}
//   needs: buildings that must exist    want(ctx): how badly the colony needs it now (0 = not at all)
//   fuel:  units of furnace fuel (charcoal or coal, whichever there is more of) taken with the materials
//
// ctx (see settlement/crafting.js): pop, owned(id), likes(job), fans(food), fishing (a lake has fish),
//   season (id), drying (racks work this season), stockpile (×: how keen on stores — autumn most),
//   stores (dried and salted food in stock), timid, stock, bows, has(building), fuel
//
// Work is labour-ticks; a day is 1200 ticks and a craftsman adds about 1.2–1.7 per tick, so roughly:
// a weapon or tool takes half a day, armour a full day, tanning a hide or a batch of arrows
// an hour or two.
import {Registry} from '../core/registry.js';
import {LUXURY} from './luxury.js';

export const RECIPES = new Registry('recipe');

const short = (n, target) => Math.max(0, target - n);

// stores for the winter: dried and salted food the colony aims to have per colonist (about a month of lean days)
const STORES_PER_HEAD = 10;

RECIPES.registerAll([
  // clothing and armour: everyone should wear something, better pieces replace worse ones
  {id: 'clothes', at: 'crafthut', cost: {wood: 3}, work: 1300, makes: {item: 'clothes'},
    want: c => (short(c.owned('clothes') + c.owned('jerkin') + c.owned('hardleather'), c.pop) ? 3 : 0)},
  // a fur coat for everyone before the cold sets in (wanted from late summer)
  {id: 'furcoat', at: 'crafthut', cost: {hide: 3, leather: 1}, work: 1200, makes: {item: 'furcoat'},
    want: c => (c.season !== 'spring' && short(c.owned('furcoat'), c.pop) ? (c.season === 'summer' ? 1.6 : 2.9) : 0)},
  {id: 'jerkin', at: 'crafthut', cost: {leather: 3}, work: 1500, makes: {item: 'jerkin'},
    want: c => (short(c.owned('jerkin') + c.owned('hardleather'), c.pop) ? 2.6 : 0)},
  {id: 'hardleather', at: 'crafthut', cost: {leather: 3, bone: 3}, work: 1800, makes: {item: 'hardleather'},
    want: c => (short(c.owned('hardleather'), Math.ceil(c.pop / 2)) ? 2.1 : 0)},

  // weapons
  {id: 'spear', at: 'crafthut', cost: {wood: 3, bone: 1}, work: 700, makes: {item: 'spear'},
    want: c => (short(c.melee(), c.pop) ? 1.9 : 0)},
  {id: 'club', at: 'crafthut', cost: {wood: 3}, work: 600, makes: {item: 'club'},
    want: c => (short(c.melee(), c.pop) ? 1.5 : 0)},
  {id: 'shield', at: 'crafthut', cost: {wood: 3, hide: 2}, work: 700, makes: {item: 'shield'},
    want: c => (short(c.owned('shield'), Math.ceil(c.pop / 3)) ? 1.3 : 0)},
  {id: 'staff', at: 'crafthut', cost: {wood: 2}, work: 600, makes: {item: 'staff'},
    want: c => (short(c.owned('staff'), c.timid) ? 1.0 : 0)},
  {id: 'sling', at: 'crafthut', cost: {hide: 1}, work: 600, makes: {item: 'sling'},
    want: c => (short(c.owned('sling') + c.owned('bow'), Math.max(2, Math.ceil(c.pop / 3))) ? 2.0 : 0)},
  // the bow is the better hunting weapon and needs the hunters' lodge; the sling needs nothing
  {id: 'bow', at: 'crafthut', cost: {wood: 3, leather: 1}, work: 800, makes: {item: 'bow'}, needs: ['lodge'],
    want: c => (short(c.owned('bow'), Math.max(1, c.likes('hunt'))) ? 2.4 : 0)},
  {id: 'arrows', at: 'crafthut', cost: {wood: 1, bone: 1}, work: 150, makes: {resource: 'arrows', n: 5},
    want: c => (c.bows && c.stock('arrows') < c.bows * 10 ? 2.7 : 0)},

  // tools and gear for the back
  {id: 'axe', at: 'crafthut', cost: {wood: 2, bone: 2}, work: 700, makes: {item: 'axe'},
    want: c => (short(c.owned('axe'), Math.min(Math.ceil(c.pop / 2), 1 + c.likes('chop'))) ? 2.2 : 0)},
  {id: 'maul', at: 'crafthut', cost: {wood: 4, bone: 1}, work: 750, makes: {item: 'maul'},
    want: c => (short(c.owned('maul'), Math.min(3, 1 + c.likes('build') + c.likes('mine'))) ? 1.4 : 0)},
  {id: 'quiver', at: 'crafthut', cost: {wood: 1, hide: 1}, work: 450, makes: {item: 'quiver'},
    want: c => (short(c.owned('quiver'), c.owned('bow')) ? 3 : 0)},
  {id: 'basket', at: 'crafthut', cost: {wood: 2}, work: 450, makes: {item: 'basket'},
    want: c => (short(c.owned('basket'), Math.max(1, c.likes('gather'))) ? 1.2 : 0)},

  // rods, like bows and slings, come from the craftsman's hut: one for everyone who likes fishing or
  // loves eating fish, at least two — as long as there is a lake with fish
  {id: 'rod', at: 'crafthut', cost: {wood: 3}, work: 500, makes: {item: 'rod'},
    want: c => (c.fishing && short(c.owned('rod'), Math.max(2, c.likes('fish') + c.fans('fish'))) ? 2.4 : 0)},

  // ── charcoal: logs smoulder under turf into charcoal; more when the furnace and the forge burn it
  {id: 'charcoal', at: 'charpit', cost: {wood: 4}, work: 260, makes: {resource: 'charcoal', n: 3},
    want: c => (c.has('smelter') ? (c.fuel < 16 ? 1.8 : 0) : (c.stock('charcoal') < 6 ? 0.8 : 0))},

  // ── the furnace: two ore and one fuel make a bar of iron
  {id: 'smelt', at: 'smelter', cost: {ironore: 2}, fuel: 1, work: 320, makes: {resource: 'iron', n: 1},
    want: c => (c.stock('iron') < 10 ? 2.2 : 0)},

  // ── the forge: iron blades and lamellar armour; each piece takes one fuel
  {id: 'sword', at: 'forge', cost: {iron: 3, leather: 1}, fuel: 1, work: 900, makes: {item: 'sword'},
    want: c => (short(c.owned('sword'), Math.ceil(c.pop / 2)) ? 2.5 : 0)},
  {id: 'ironspear', at: 'forge', cost: {iron: 2, wood: 2}, fuel: 1, work: 700, makes: {item: 'ironspear'},
    want: c => (short(c.owned('sword') + c.owned('ironspear'), c.pop) ? 2.3 : 0)},
  {id: 'ironaxe', at: 'forge', cost: {iron: 2, wood: 1}, fuel: 1, work: 700, makes: {item: 'ironaxe'},
    want: c => (short(c.owned('ironaxe'), Math.min(Math.ceil(c.pop / 2), 1 + c.likes('chop'))) ? 2.0 : 0)},
  {id: 'lamellar', at: 'forge', cost: {iron: 4, leather: 2}, fuel: 2, work: 1600, makes: {item: 'lamellar'},
    want: c => (short(c.owned('lamellar'), Math.ceil(c.pop / 2)) ? 2.1 : 0)},

  // ── the jeweller: a gem set into bone, wood, stone or iron (data/luxury.js); the scarcer piece goes first
  ...LUXURY.all().map(l => ({id: l.id, at: 'jeweler', cost: {gems: l.gems, ...l.setting}, work: l.work, makes: {resource: l.id, n: 1},
    want: c => Math.max(0, l.want - c.stock(l.id) * l.fade)})),

  // ── food for the lean months (data/foods.js). Fresh food beyond what the colony eats in a few
  // days is dried (not in winter) or salted; autumn makes everyone keener on it.
  ...[['driedBerries', {berries: 3}, 2, 200, 'drying'], ['driedFish', {fish: 2}, 2, 220, 'drying'], ['jerky', {meat: 2}, 2, 220, 'drying'],
      ['saltFish', {fish: 2, salt: 1}, 2, 150, null], ['saltMeat', {meat: 2, salt: 1}, 2, 150, null]].map(([id, cost, n, work, needsWeather]) => {
    const raw = Object.keys(cost)[0];
    return {id, at: 'dryrack', cost, work, makes: {resource: id, n},
      want: c => ((needsWeather && !c.drying) || c.stores >= c.pop * STORES_PER_HEAD || c.stock(raw) < c.pop * 1.5 + cost[raw] ? 0 : (needsWeather ? 1.3 : 1.6) * c.stockpile)};
  }),

  // ── the hearth: a hot stew from two portions; fresh food first, the stores only when there is none
  {id: 'stewMeat', at: 'hearth', cost: {meat: 1, berries: 1}, work: 120, makes: {resource: 'stew', n: 1}, want: c => (c.stock('stew') < c.pop ? 2.2 : 0)},
  {id: 'stewFish', at: 'hearth', cost: {fish: 1, berries: 1}, work: 120, makes: {resource: 'stew', n: 1}, want: c => (c.stock('stew') < c.pop ? 2.1 : 0)},
  {id: 'stewMeatFish', at: 'hearth', cost: {meat: 1, fish: 1}, work: 120, makes: {resource: 'stew', n: 1}, want: c => (c.stock('stew') < c.pop ? 2.0 : 0)},
  {id: 'stewStores', at: 'hearth', cost: {jerky: 1, driedBerries: 1}, work: 140, makes: {resource: 'stew', n: 1}, want: c => (c.stock('stew') < c.pop * 0.5 ? 1.2 : 0)},
  {id: 'stewSalted', at: 'hearth', cost: {saltMeat: 1, driedBerries: 1}, work: 140, makes: {resource: 'stew', n: 1}, want: c => (c.stock('stew') < c.pop * 0.5 ? 1.1 : 0)},

  // processing: raw hides become leather at the tannery
  {id: 'tan', at: 'tannery', cost: {hide: 1}, work: 150, makes: {resource: 'leather', n: 1},
    want: c => (c.stock('leather') < 8 ? 2 : 0)},
]);
