// The court of a realm — its mind (docs/WORLD.md «Нравы»): the realm's role of the actor's brain (atlas/actor.js). Every
// season each living realm looks at the deeds of its people's row (`deeds.realm`, data/deeds.js; the code in atlas/deeds/:
// peace, war, the march of an army, the orcs' raid, a lair cleared) and does one — the upper lanes first (a weary realm
// makes peace before anything else), the rest drawn by weight. The relations themselves — the attitude's drift, trade,
// the front — are the body, kept yearly by atlas/diplomacy.js; the realm's inner life (schisms, the kingdom's ledger,
// the finds of its scholars) stays its own systems. The court draws from the history's stream, as the lairs do.
import {WORLD_PEOPLES} from '../data/peoples.js';
import {SPECIES} from '../data/species.js';
import {actorStep} from './actor.js';
import {MIND, deedVector, along} from '../data/mind.js';
import {DOES} from './deeds/index.js';
import {realmTowns} from './realms.js';

const realmRole = {
  list: [],
  party: () => null,   // a realm is many wills: its armies out stop no other deed (one army of a war at a time is the march's own rule)
  // the council's wind leans the court: a deed's weight × (1 + MIND.deed × the wind along its vector) (atlas/mind.js)
  weigh: (a, realm, d) => { const v = deedVector(d.id); return v && realm.mind ? 1 + MIND.deed * along(v, realm.mind.wind) : 1; },
  setOut(a, realm, [plan, , , d], ctx) { const line = DOES[d.id].act?.(a, realm, plan, ctx); if (line) ctx.say(line); },
};

// the species of a realm's people, and so its mores
export const realmSpecies = (a, realm) => SPECIES.get(WORLD_PEOPLES.get(realm.people).race);

// a season of the courts
export function stepCourts(a, rnd, season, say) {
  for (const realm of a.realms || []) {
    if (!realmTowns(a, realm.id).length) continue;   // a realm without towns is gone (atlas/realms.js seatFallen)
    const sp = realmSpecies(a, realm), list = sp.deeds?.realm || [];
    if (!list.length) continue;
    actorStep(a, realm, {...realmRole, list}, {sp, realm, role: 'realm', season, r: rnd, say});
  }
}
