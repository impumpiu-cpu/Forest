// Crafting recipes. A station building (buildings.js, `station: true`) works one order at a time;
// colonists whose job lists that station take the materials and add labour until the order is done.
//
//   at:    station building id         cost: resources taken when the order starts
//   work:  labour needed                makes: {item: id} or {resource: id, n}
//   needs: buildings that must exist    want(ctx): how badly the colony needs it now (0 = not at all)
//   fuel:  units of furnace heat taken with the materials;  heat: how hot a fire it needs — 1: wood will
//          do (copper, bronze, gold, silver), 2 (default): coal (iron). Fuel is picked in settlement/stock.js
//   tool:  a town-made tool that must be in the stock (cupels for silver)
//   skill: the skill the order trains and reads (data/skills.js); by default the station's (STATION_SKILL)
//   tier:  1–4 (data/skills.js TIERS), 1 by default. Above 1 only a worker whose letter for the recipe's
//          skill reaches the tier may take the order (agents/skills.js recipeAccess): a sword needs S 6,
//          cupellation of silver needs I 6. T1 recipes stay open to anyone, so everyone can learn
//
// ctx (see settlement/crafting.js): pop, owned(id), likes(job), fans(food), fishing (a lake has fish),
//   season (id), drying (racks work this season), stockpile (×: how keen on stores — autumn most),
//   stores (dried and salted food in stock), timid, stock, bows, has(building), fuel,
//   silvered() (silver blades owned), silverFoes (times something that fears silver came), placers (the river has gold sand),
//   food (all food in stock), freeSlots (furniture places free in buildings, less what lies in stock),
//   spare(res) (stock beyond 0.6 × what the colony keeps of it: resource `keep`, else `target`, else 20)
//
// Work is labour-ticks; a day is 1200 ticks and a craftsman adds about 1.2–1.7 per tick, so roughly:
// a weapon or tool takes half a day, armour a full day, tanning a hide or a batch of arrows
// an hour or two.
import {Registry} from '../core/registry.js';
import {LUXURY} from './luxury.js';
import {FURNITURE} from './furniture.js';

export const RECIPES = new Registry('recipe');

const short = (n, target) => Math.max(0, target - n);
// silvered forge blades: a few while silver is spare; once something that fears silver has come, many
const silverWant = (c, calm, alarm) => (c.silverFoes
  ? (c.stock('silverBar') >= 1 && short(c.silvered(), Math.ceil(c.pop / 2)) ? alarm : 0)
  : (c.stock('silverBar') >= 2 && short(c.silvered(), Math.ceil(c.pop / 4)) ? calm : 0));

// stores for the winter: dried and salted food the colony aims to have per colonist (about a month of lean days)
const STORES_PER_HEAD = 10;

RECIPES.registerAll([
  // clothing and armour: everyone should wear something, better pieces replace worse ones
  // bast clothes: linden bark stripped from the logs — rough, but anyone can make them from day one
  {id: 'clothes', skill: 'tailoring', at: 'crafthut', cost: {wood: 3}, work: 1300, makes: {item: 'clothes'},
    want: c => (short(c.owned('clothes') + c.owned('jerkin') + c.owned('hardleather'), c.pop) ? 3 : 0)},
  // a fur coat for everyone before the cold sets in (wanted from late summer)
  {id: 'furcoat', tier: 2, skill: 'leatherwork', at: 'crafthut', cost: {hide: 3, leather: 1}, work: 1200, makes: {item: 'furcoat'},
    want: c => (c.season !== 'spring' && short(c.owned('furcoat'), c.pop) ? (c.season === 'summer' ? 1.6 : 2.9) : 0)},
  {id: 'jerkin', tier: 2, skill: 'leatherwork', at: 'crafthut', cost: {leather: 3}, work: 1500, makes: {item: 'jerkin'},
    want: c => (short(c.owned('jerkin') + c.owned('hardleather'), c.pop) ? 2.6 : 0)},
  {id: 'hardleather', tier: 3, skill: 'leatherwork', at: 'crafthut', cost: {leather: 3, bone: 3}, work: 1800, makes: {item: 'hardleather'},
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
  {id: 'sling', skill: 'leatherwork', at: 'crafthut', cost: {hide: 1}, work: 600, makes: {item: 'sling'},
    want: c => (short(c.owned('sling') + c.owned('bow'), Math.max(2, Math.ceil(c.pop / 3))) ? 2.0 : 0)},
  // the bow is the better hunting weapon and needs the hunters' lodge; the sling needs nothing
  {id: 'bow', tier: 2, at: 'crafthut', cost: {wood: 3, leather: 1, rope: 1}, work: 800, makes: {item: 'bow'}, needs: ['lodge'],
    want: c => (short(c.owned('bow'), Math.max(1, c.likes('hunt'))) ? 2.4 : 0)},
  {id: 'arrows', at: 'crafthut', cost: {wood: 1, bone: 1}, work: 150, makes: {resource: 'arrows', n: 5},
    want: c => (c.bows && c.stock('arrows') < c.bows * 10 ? 2.7 : 0)},

  // tools and gear for the back
  {id: 'axe', at: 'crafthut', cost: {wood: 2, bone: 2}, work: 700, makes: {item: 'axe'},
    want: c => (short(c.owned('axe'), Math.min(Math.ceil(c.pop / 2), 1 + c.likes('chop'))) ? 2.2 : 0)},
  {id: 'maul', at: 'crafthut', cost: {wood: 4, bone: 1}, work: 750, makes: {item: 'maul'},
    want: c => (short(c.owned('maul'), Math.min(3, 1 + c.likes('build') + c.likes('mine'))) ? 1.4 : 0)},
  {id: 'quiver', skill: 'leatherwork', at: 'crafthut', cost: {wood: 1, hide: 1}, work: 450, makes: {item: 'quiver'},
    want: c => (short(c.owned('quiver'), c.owned('bow')) ? 3 : 0)},
  {id: 'basket', skill: 'tailoring', at: 'crafthut', cost: {reeds: 4}, work: 450, makes: {item: 'basket'},
    want: c => (short(c.owned('basket'), Math.max(1, c.likes('gather'))) ? 1.2 : 0)},

  // rods, like bows and slings, come from the craftsman's hut: one for everyone who likes fishing or
  // loves eating fish, at least two — as long as there is a lake with fish
  {id: 'rod', at: 'crafthut', cost: {wood: 3}, work: 500, makes: {item: 'rod'},
    want: c => (c.fishing && short(c.owned('rod'), Math.max(2, c.likes('fish') + c.fans('fish'))) ? 2.4 : 0)},

  // ── coal: logs smoulder under turf into coal; more when the furnace and the forge burn it
  {id: 'charcoal', at: 'charpit', cost: {wood: 4}, work: 260, makes: {resource: 'coal', n: 3},
    want: c => (c.has('smelter') ? (c.fuel < 16 ? 1.8 : 0) : (c.stock('coal') < 6 ? 0.8 : 0))},

  // ── the furnace: iron on coal; bronze, gold and silver melt on a wood fire too. Melting is metallurgy (I):
  // plain ore and native metal anyone can melt, gold dust takes care (T2), cupelling silver from ore skill (T3)
  {id: 'smelt', at: 'smelter', cost: {ironore: 2}, fuel: 1, heat: 2, work: 320, makes: {resource: 'iron', n: 1},
    want: c => (c.stock('iron') < 10 ? 2.2 : 0)},
  {id: 'smeltBronze', at: 'smelter', cost: {bronzeOre: 2}, fuel: 1, heat: 1, work: 280, makes: {resource: 'bronze', n: 1},
    want: c => (c.stock('bronze') < 8 ? 2.0 : 0)},
  {id: 'goldDustBar', tier: 2, at: 'smelter', cost: {goldDust: 12}, fuel: 0.5, heat: 1, work: 200, makes: {resource: 'goldBar', n: 1},
    want: () => 1.3},
  {id: 'goldNuggetBar', at: 'smelter', cost: {goldNugget: 1}, fuel: 0.5, heat: 1, work: 120, makes: {resource: 'goldBar', n: 1},
    want: () => 1.2},
  {id: 'silverOreBar', tier: 3, at: 'smelter', cost: {silverOre: 3}, fuel: 1, heat: 1, tool: 'cupels', work: 320, makes: {resource: 'silverBar', n: 1},
    want: () => 1.4},
  {id: 'silverNativeBar', at: 'smelter', cost: {silverNative: 1}, fuel: 0.5, heat: 1, work: 120, makes: {resource: 'silverBar', n: 1},
    want: () => 1.2},
  // bronze cast in clay moulds at the furnace: no anvil needed
  // a silver dagger cast whole: no iron and no forge needed, the first answer to a vampire
  {id: 'silverknife', tier: 2, skill: 'smithing', at: 'smelter', cost: {silverBar: 2, leather: 1}, fuel: 0.5, heat: 1, work: 500, makes: {item: 'silverknife'},
    want: c => (c.silverFoes ? (c.stock('silverBar') >= 2 && short(c.silvered(), Math.ceil(c.pop / 2)) ? (c.has('forge') ? 1.4 : 2.4) : 0)
      : c.stock('silverBar') >= 4 && c.silvered() < 1 ? 0.6 : 0)},
  {id: 'bronzespear', tier: 2, skill: 'smithing', at: 'smelter', cost: {bronze: 2, wood: 1}, fuel: 0.5, heat: 1, work: 600, makes: {item: 'bronzespear'},
    want: c => (short(c.owned('sword') + c.owned('ironspear') + c.owned('bronzespear'), c.pop) ? 2.0 : 0)},
  {id: 'bronzeaxe', skill: 'smithing', at: 'smelter', cost: {bronze: 2, wood: 1}, fuel: 0.5, heat: 1, work: 600, makes: {item: 'bronzeaxe'},
    want: c => (short(c.owned('ironaxe') + c.owned('bronzeaxe'), Math.min(Math.ceil(c.pop / 2), 1 + c.likes('chop'))) ? 1.9 : 0)},

  // shackles for captives (data/captives.js): a pair while the colony has none to spare and metal to spare
  {id: 'shacklesBronze', skill: 'smithing', at: 'smelter', cost: {bronze: 2}, fuel: 0.5, heat: 1, work: 400, makes: {resource: 'shacklesBronze', n: 1},
    want: c => (c.stock('shacklesBronze') + c.stock('shacklesIron') < 2 && c.spare('bronze') >= 2 ? 0.5 : 0)},

  // ── the forge: iron blades and lamellar armour; each piece takes one fuel. Forging is smithing (S): an axe
  // head anyone can beat out (T1, the apprentice's work), a spear point wants a stronger arm (T2), a sword and
  // lamellar a real smith (T3), a silvered sword a master (T4)
  {id: 'sword', tier: 3, at: 'forge', cost: {iron: 3, leather: 1}, fuel: 1, work: 900, makes: {item: 'sword'},
    want: c => (short(c.owned('sword'), Math.ceil(c.pop / 2)) ? 2.5 : 0)},
  {id: 'ironspear', tier: 2, at: 'forge', cost: {iron: 2, wood: 2}, fuel: 1, work: 700, makes: {item: 'ironspear'},
    want: c => (short(c.owned('sword') + c.owned('ironspear'), c.pop) ? 2.3 : 0)},
  {id: 'ironaxe', at: 'forge', cost: {iron: 2, wood: 1}, fuel: 1, work: 700, makes: {item: 'ironaxe'},
    want: c => (short(c.owned('ironaxe'), Math.min(Math.ceil(c.pop / 2), 1 + c.likes('chop'))) ? 2.0 : 0)},
  {id: 'shacklesIron', at: 'forge', cost: {iron: 2}, fuel: 1, work: 500, makes: {resource: 'shacklesIron', n: 1},
    want: c => (c.stock('shacklesIron') < 2 && c.spare('iron') >= 2 ? 0.55 : 0)},
  // silvered blades for what fears silver (agents/combat.js): a few, while there is silver to spare
  // Before anyone has seen a vampire: a few, while there is silver to spare. Once one has come
  // (ctx.silverFoes): a silver blade for every second colonist, and the last bar goes into it.
  {id: 'swordSilver', tier: 4, at: 'forge', cost: {iron: 3, leather: 1, silverBar: 1}, fuel: 1, work: 1100, makes: {item: 'sword', silver: true},
    want: c => silverWant(c, 1.3, 2.6)},
  {id: 'spearSilver', tier: 3, at: 'forge', cost: {iron: 2, wood: 2, silverBar: 1}, fuel: 1, work: 900, makes: {item: 'ironspear', silver: true},
    want: c => silverWant(c, 1.2, 2.4)},
  {id: 'lamellar', tier: 3, at: 'forge', cost: {iron: 4, leather: 2}, fuel: 2, work: 1600, makes: {item: 'lamellar'},
    want: c => (short(c.owned('lamellar'), Math.ceil(c.pop / 2)) ? 2.1 : 0)},

  // ── the jeweller: a gem set into bone, wood, stone or iron (data/luxury.js); the scarcer piece goes first
  ...LUXURY.all().map(l => ({id: l.id, tier: l.tier, at: 'jeweler', cost: {gems: l.gems, ...l.setting}, work: l.work, makes: {resource: l.id, n: 1},
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
  {id: 'kasha', at: 'hearth', cost: {barley: 2}, work: 100, makes: {resource: 'kasha', n: 1}, want: c => (c.stock('kasha') < c.pop * 0.6 ? 1.9 : 0)},
  {id: 'stewTurnip', at: 'hearth', cost: {turnip: 1, meat: 1}, work: 120, makes: {resource: 'stew', n: 1}, want: c => (c.stock('stew') < c.pop ? 2.15 : 0)},
  {id: 'stewTurnipFish', at: 'hearth', cost: {turnip: 1, fish: 1}, work: 120, makes: {resource: 'stew', n: 1}, want: c => (c.stock('stew') < c.pop ? 2.05 : 0)},
  {id: 'stewStores', at: 'hearth', cost: {jerky: 1, driedBerries: 1}, work: 140, makes: {resource: 'stew', n: 1}, want: c => (c.stock('stew') < c.pop * 0.5 ? 1.2 : 0)},
  {id: 'stewSalted', at: 'hearth', cost: {saltMeat: 1, driedBerries: 1}, work: 140, makes: {resource: 'stew', n: 1}, want: c => (c.stock('stew') < c.pop * 0.5 ? 1.1 : 0)},

  // ── the outpost's crafts: rope, rough cloth, pots, boards
  {id: 'rope', skill: 'tailoring', at: 'crafthut', cost: {fiber: 3}, work: 160, makes: {resource: 'rope', n: 1},
    want: c => (c.stock('rope') < 6 ? 1.7 : 0)},
  {id: 'cloth', at: 'loom', cost: {fiber: 3}, work: 300, makes: {resource: 'cloth', n: 1},
    want: c => (c.stock('cloth') < 8 ? 1.5 : 0)},
  {id: 'linen', tier: 2, skill: 'tailoring', at: 'crafthut', cost: {cloth: 2}, work: 900, makes: {item: 'linen'},
    want: c => (short(c.owned('linen') + c.owned('furcoat') + c.owned('jerkin') + c.owned('hardleather'), c.pop) ? 2.2 : 0)},
  {id: 'pots', at: 'potter', cost: {clay: 2, wood: 1}, work: 300, makes: {resource: 'pots', n: 3},
    want: c => (c.stock('pots') < Math.min(30, c.food / 5) ? 1.6 : 0)},
  {id: 'planks', at: 'sawmill', cost: {wood: 3}, work: 260, makes: {resource: 'planks', n: 2},
    want: c => (c.stock('planks') < 24 ? 1.6 : 0)},

  // ── from the pen: cheese pressed at the hearth keeps all winter (better with salt), wool spun and
  // woven into coats and cloth
  {id: 'cheeseSalt', tier: 2, at: 'hearth', cost: {milk: 3, salt: 0.5}, work: 160, makes: {resource: 'cheese', n: 1.5},
    want: c => (c.stock('milk') >= 3 ? 2.3 : 0)},
  {id: 'cheese', tier: 2, at: 'hearth', cost: {milk: 3}, work: 160, makes: {resource: 'cheese', n: 1},
    want: c => (c.stock('milk') >= 4 ? 2.25 : 0)},
  {id: 'woolens', tier: 2, skill: 'tailoring', at: 'crafthut', cost: {wool: 4}, work: 1100, makes: {item: 'woolens'},
    want: c => (short(c.owned('woolens') + c.owned('furcoat'), c.pop) ? 2.4 : 0)},
  {id: 'clothWool', at: 'loom', cost: {wool: 2}, work: 260, makes: {resource: 'cloth', n: 1},
    want: c => (c.stock('cloth') < 8 && c.stock('wool') > 6 ? 1.4 : 0)},

  // ── home brew, set in pots by the hearth: only from what is left over after the stores are full
  ...[['bragaHoney', {honey: 1, berries: 2}, 3], ['bragaBarley', {barley: 3}, 3], ['bragaBerries', {berries: 4}, 2]].map(([id, cost, n]) => ({
    id, tier: 2, at: 'hearth', cost, work: 200, makes: {resource: 'braga', n},
    want: c => (c.stock('braga') < c.pop * 2 && c.food > c.pop * 6 && Object.entries(cost).every(([r, v]) => c.stock(r) > v + c.pop * 0.5) ? 0.9 : 0)})),

  // ── furniture (data/furniture.js): made while there is a free place for it in a solid building, and
  // only from what the colony has to spare (beyond what it keeps of each material); the finer piece first
  ...FURNITURE.filter(f => f.recipe).map(f => ({id: 'furn_' + f.id, ...f.recipe, makes: {resource: f.id, n: 1},
    want: c => (c.freeSlots > 0 && Object.entries(f.recipe.cost).every(([r, v]) => c.spare(r) >= v) ? 0.7 + f.comfort * 4 : 0)})),

  // the dead ends of the woods put to use: fox fur lines a coat, wax becomes candles for the shrine
  {id: 'furlined', tier: 3, skill: 'leatherwork', at: 'crafthut', cost: {hide: 2, furs: 2, leather: 1}, work: 1300, makes: {item: 'furlined'},
    want: c => (c.season !== 'spring' && c.stock('furs') >= 2 && short(c.owned('furlined'), Math.ceil(c.pop / 3)) ? 2.0 : 0)},
  {id: 'candles', at: 'crafthut', cost: {wax: 1}, work: 120, makes: {resource: 'candles', n: 4},
    want: c => (c.has('shrine') && c.stock('candles') < 8 ? 0.8 : 0)},
  // gold panning needs a pan, as long as the river has gold sand
  {id: 'pan', at: 'crafthut', cost: {wood: 2}, work: 300, makes: {item: 'pan'},
    want: c => (c.placers && short(c.owned('pan'), Math.max(2, Math.ceil(c.pop / 5), c.likes('pan'))) ? 1.6 : 0)},
  // the quern: barley ground to flour, flour baked to bread at the hearth
  {id: 'flour', at: 'quern', cost: {barley: 2}, work: 140, makes: {resource: 'flour', n: 2},
    want: c => (c.stock('barley') > c.pop + 2 && c.stock('flour') < c.pop ? 1.5 : 0)},
  {id: 'bread', at: 'hearth', cost: {flour: 2}, work: 140, makes: {resource: 'bread', n: 3},
    want: c => (c.stock('bread') < c.pop * 2 ? 2.0 : 0)},

  // processing: raw hides become leather at the tannery
  {id: 'tan', at: 'tannery', cost: {hide: 1}, work: 150, makes: {resource: 'leather', n: 1},
    want: c => (c.stock('leather') < 8 ? 2 : 0)},
]);
