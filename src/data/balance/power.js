// Power levels (PL) of an item, by data/balance/rules.js; read by tools/items-check.mjs and tools/arena.mjs,
// never by the game. One level is × RULES.step to damage per tick (attack) or to how long one lasts (defence).
import {RULES} from './rules.js';

export const toPL = x => Math.log(x) / Math.log(RULES.step);

// d: an item definition (data/items.js, or a finer one from agents/equipment.js itemDef);
// ref: the reference weapon's definition (PL 0)
export const attackPL = (d, ref) => (d.melee ? toPL((d.melee.dmg / d.melee.cd) / (ref.melee.dmg / ref.melee.cd)) : null);
// a shot against a blow: the same base, the hit chance of a middling shooter at half range
export const shotPL = (d, ref) => (d.ranged ? toPL((d.ranged.dmg * 0.17 / d.ranged.cd) * 0.5 / (ref.melee.dmg / ref.melee.cd * 0.16)) : null);
export const defencePL = d => toPL(1 / (1 - (d.armor || 0))) + toPL(1 / (1 - (d.block || 0)));
export const toolPL = d => Math.max(0, ...Object.values(d.tool || {}).map(m => toPL(m)));
