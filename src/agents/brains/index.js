// Brain registry: a species or faction names its brain by id. `tabled` is the one brain for every species whose
// row lists its behaviours (data/behaviours.js, docs/BEHAVIOUR.md); `livestock` and `leaver` are lists of their own
// run the same way (a tamed goat thinks as livestock, not as a goat); the people's brains are written by hand.
import {Registry} from '../../core/registry.js';
import {colonistBrain} from './colonist.js';
import {raiderBrain} from './raider.js';
import {caravanBrain} from './caravan.js';
import {fugitiveBrain} from './fugitive.js';
import {tabledBrain, tabledStep} from './tabled.js';
import {WAYS} from '../../data/behaviour.js';

export const BRAINS = new Registry('brain');
// a brain that is a list of behaviours of its own (data/behaviour.js WAYS), whatever the species: a tamed beast, one who left
const listBrain = (id, behaviours) => ({id, behaviours, step(w, a) { tabledStep(w, a, behaviours); }});
BRAINS.registerAll([tabledBrain, listBrain('livestock', WAYS.livestock), listBrain('leaver', WAYS.leaver), listBrain('led', WAYS.led), colonistBrain, raiderBrain, caravanBrain, fugitiveBrain]);
