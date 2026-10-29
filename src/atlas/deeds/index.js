// The code of the deeds, by id (the catalogue: data/deeds.js). Each: {want(a, actor, ctx) → [[plan, weight, why], …] | null,
// act?(a, actor, plan, ctx) → a chronicle line or null (the lair's role: the deed sets its party out or is done on the spot),
// told?(a, actor, plan) → a line as the leader's party sets out, arrive?(a, p, lair, L, rnd, say), home?(a, p, lair, rnd)}.
// ctx: {sp (the owner species), role ('lair' | 'leader' | 'realm'), season, r (the stream), say; a lair's: L (the lair kind);
// a realm's: realm}.
import {DEEDS} from '../../data/deeds.js';
import {raid} from './raid.js';
import {expand} from './expand.js';
import {subdue, rival} from './subdue.js';
import {strike} from './strike.js';
import {makePeace} from './makePeace.js';
import {warOn} from './warOn.js';
import {march} from './march.js';
import {raidTown} from './raidTown.js';
import {clearLair} from './clearLair.js';
import {captives} from './captives.js';
import {scout} from './scout.js';
import {liberate} from './liberate.js';

export const DOES = {raid, expand, subdue, rival, strike, makePeace, warOn, march, raidTown, clearLair, captives, scout, liberate};

for (const d of DEEDS.all()) if (!DOES[d.id]?.want) throw new Error(`deed «${d.id}» is in the catalogue (data/deeds.js) but has no code (atlas/deeds/)`);
for (const id of Object.keys(DOES)) if (!DEEDS.has(id)) throw new Error(`deed «${id}» has code but no row in data/deeds.js`);
