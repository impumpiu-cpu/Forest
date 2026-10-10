// Crafting recipes. A station building (buildings.js, `station: true`) works one order at a time;
// colonists whose job lists that station take the materials and add labour until the order is done.
//
//   at:    station building id         cost: resources taken when the order starts
//   work:  labour needed                makes: {item: id} or {resource: id, n}
//   needs: buildings that must exist    want(ctx): how badly the colony needs it now (0 = not at all)
//
// ctx (see settlement/crafting.js): pop, owned(id), likes(job), timid, stock, bows
import {Registry} from '../core/registry.js';

export const RECIPES = new Registry('recipe');

const short = (n, target) => Math.max(0, target - n);

RECIPES.registerAll([
  // clothing and armour: everyone should wear something, better pieces replace worse ones
  {id: 'clothes', at: 'crafthut', cost: {wood: 3}, work: 60, makes: {item: 'clothes'},
    want: c => (short(c.owned('clothes') + c.owned('jerkin') + c.owned('hardleather'), c.pop) ? 3 : 0)},
  {id: 'jerkin', at: 'crafthut', cost: {leather: 3}, work: 90, makes: {item: 'jerkin'},
    want: c => (short(c.owned('jerkin') + c.owned('hardleather'), c.pop) ? 2.6 : 0)},
  {id: 'hardleather', at: 'crafthut', cost: {leather: 3, bone: 3}, work: 130, makes: {item: 'hardleather'},
    want: c => (short(c.owned('hardleather'), Math.ceil(c.pop / 2)) ? 2.1 : 0)},

  // weapons
  {id: 'spear', at: 'crafthut', cost: {wood: 3, bone: 1}, work: 80, makes: {item: 'spear'},
    want: c => (short(c.melee(), c.pop) ? 1.9 : 0)},
  {id: 'club', at: 'crafthut', cost: {wood: 3}, work: 60, makes: {item: 'club'},
    want: c => (short(c.melee(), c.pop) ? 1.5 : 0)},
  {id: 'shield', at: 'crafthut', cost: {wood: 3, hide: 2}, work: 80, makes: {item: 'shield'},
    want: c => (short(c.owned('shield'), Math.ceil(c.pop / 3)) ? 1.3 : 0)},
  {id: 'staff', at: 'crafthut', cost: {wood: 2}, work: 40, makes: {item: 'staff'},
    want: c => (short(c.owned('staff'), c.timid) ? 1.0 : 0)},
  {id: 'sling', at: 'crafthut', cost: {hide: 1}, work: 40, makes: {item: 'sling'},
    want: c => (short(c.owned('sling') + c.owned('bow'), Math.max(2, Math.ceil(c.pop / 3))) ? 2.0 : 0)},
  {id: 'bow', at: 'crafthut', cost: {wood: 3, leather: 1}, work: 120, makes: {item: 'bow'}, needs: ['lodge'],
    want: c => (short(c.owned('bow'), Math.max(1, c.likes('hunt'))) ? 2.4 : 0)},
  {id: 'arrows', at: 'crafthut', cost: {wood: 1, bone: 1}, work: 35, makes: {resource: 'arrows', n: 5},
    want: c => (c.bows && c.stock('arrows') < c.bows * 10 ? 2.7 : 0)},

  // tools and gear for the back
  {id: 'axe', at: 'crafthut', cost: {wood: 2, bone: 2}, work: 90, makes: {item: 'axe'},
    want: c => (short(c.owned('axe'), Math.min(Math.ceil(c.pop / 2), 1 + c.likes('chop'))) ? 2.2 : 0)},
  {id: 'maul', at: 'crafthut', cost: {wood: 4, bone: 1}, work: 90, makes: {item: 'maul'},
    want: c => (short(c.owned('maul'), Math.min(3, 1 + c.likes('build') + c.likes('mine'))) ? 1.4 : 0)},
  {id: 'quiver', at: 'crafthut', cost: {wood: 1, hide: 1}, work: 40, makes: {item: 'quiver'},
    want: c => (short(c.owned('quiver'), c.owned('bow')) ? 3 : 0)},
  {id: 'basket', at: 'crafthut', cost: {wood: 2}, work: 40, makes: {item: 'basket'},
    want: c => (short(c.owned('basket'), Math.max(1, c.likes('gather'))) ? 1.2 : 0)},

  // processing: raw hides become leather at the tannery
  {id: 'tan', at: 'tannery', cost: {hide: 1}, work: 70, makes: {resource: 'leather', n: 1},
    want: c => (c.stock('leather') < 8 ? 2 : 0)},
]);
