// The balance tables, in one place. data/items.js builds every item from its entry there plus its
// row here (statsFor). An item with no row is an error at load time, so a new item cannot slip in
// without numbers; a row with no item is caught by tools/check-data.mjs.
import {WEAPONS} from './weapons.js';
import {ARMOR} from './armor.js';
import {GEAR} from './gear.js';

export {WEAPONS, ARMOR, GEAR};
export {COMBAT, CAPS, PRICES} from './combat.js';
export {RULES} from './rules.js';

export const TABLES = {weapons: WEAPONS, armor: ARMOR, gear: GEAR};

export function rowOf(id) {
  for (const [name, t] of Object.entries(TABLES)) if (Object.hasOwn(t, id)) return {table: name, row: t[id]};
  return null;
}

// an item entry (names, slot, looks) + its balance row → the full definition. Nested blocks
// (ranged: ammo from the item, dmg and range from the row) are merged one level deep.
export function statsFor(item) {
  const found = rowOf(item.id);
  if (!found) throw new Error(`item ${item.id}: no row in data/balance (weapons.js, armor.js or gear.js)`);
  const {max, ...row} = found.row, out = {...item};
  for (const [k, v] of Object.entries(row)) out[k] = v && typeof v === 'object' && item[k] && typeof item[k] === 'object' ? {...v, ...item[k]} : v;   // the row's numbers first, then the item's own fields (ammo)
  if (max != null && item.holds) out.holds = {...item.holds, max};
  return out;
}
