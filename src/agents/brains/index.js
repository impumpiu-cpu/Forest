// Brain registry: a species or faction names its brain by id.
import {Registry} from '../../core/registry.js';
import {colonistBrain} from './colonist.js';
import {raiderBrain} from './raider.js';
import {grazerBrain} from './grazer.js';
import {predatorBrain} from './predator.js';

export const BRAINS = new Registry('brain');
BRAINS.registerAll([colonistBrain, raiderBrain, grazerBrain, predatorBrain]);
