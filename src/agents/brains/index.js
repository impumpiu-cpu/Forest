// Brain registry: a species or faction names its brain by id.
import {Registry} from '../../core/registry.js';
import {colonistBrain} from './colonist.js';
import {raiderBrain} from './raider.js';
import {grazerBrain} from './grazer.js';
import {predatorBrain} from './predator.js';
import {muleBrain} from './mule.js';
import {caravanBrain} from './caravan.js';
import {verminBrain} from './vermin.js';

export const BRAINS = new Registry('brain');
BRAINS.registerAll([colonistBrain, raiderBrain, grazerBrain, predatorBrain, muleBrain, caravanBrain, verminBrain]);
