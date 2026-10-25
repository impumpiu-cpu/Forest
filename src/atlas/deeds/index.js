// The code of the deeds, by id (the catalogue: data/deeds.js). Each: {want(a, actor, ctx) → [[plan, weight, why], …] | null,
// told?(a, actor, plan) → a chronicle line as the party sets out, arrive?(a, p, lair, L, rnd, say), home?(a, p, lair)}.
import {DEEDS} from '../../data/deeds.js';
import {raid} from './raid.js';
import {expand} from './expand.js';
import {subdue, rival} from './subdue.js';

export const DOES = {raid, expand, subdue, rival};

for (const d of DEEDS.all()) if (!DOES[d.id]?.want) throw new Error(`deed «${d.id}» is in the catalogue (data/deeds.js) but has no code (atlas/deeds/)`);
for (const id of Object.keys(DOES)) if (!DEEDS.has(id)) throw new Error(`deed «${id}» has code but no row in data/deeds.js`);
