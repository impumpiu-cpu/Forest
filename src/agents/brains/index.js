// Brain registry: a species or faction names its brain by id. `tabled` is the one brain for every species
// whose row lists its behaviours (agents/behaviours/, docs/BEHAVIOUR.md); the others are written by hand.
import {Registry} from '../../core/registry.js';
import {colonistBrain} from './colonist.js';
import {raiderBrain} from './raider.js';
import {predatorBrain} from './predator.js';
import {muleBrain} from './mule.js';
import {caravanBrain} from './caravan.js';
import {verminBrain} from './vermin.js';
import {livestockBrain, leaverBrain} from './livestock.js';
import {spiritBrain} from './spirit.js';
import {fugitiveBrain} from './fugitive.js';
import {tabledBrain} from './tabled.js';

export const BRAINS = new Registry('brain');
BRAINS.registerAll([tabledBrain, spiritBrain, colonistBrain, raiderBrain, predatorBrain, muleBrain, caravanBrain, verminBrain, livestockBrain, leaverBrain, fugitiveBrain]);
