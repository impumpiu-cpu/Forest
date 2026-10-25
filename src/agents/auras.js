// Auras and marks of the ones who lead (docs/BEHAVIOUR.md «Аура вожака»). A boss on the local map (campaign/camp.js
// spawnFoe: a leader of an old lair at the head of its own, a grave's guard with its servants, the fourth in its lair)
// bears the aura `lead` (a.auras): while the bearer lives, nobody of its side runs — not from a crowd, not from a wound,
// and its band's morale does not break (agents/squad.js). The bearer itself never runs. An `officer` (a.officer: the
// band's leader under a boss) stands until near death (AURAS.officerBelow) even when the aura is gone. The behaviours
// that would take a creature off the field ask holdsGround() first: scare, leaveHurt, retreat; defendLair holds a
// retinue of beasts to the ground as a lair's guards. Nothing else changes: the aura forbids flight, it does not fight.
import {perTick} from '../core/util.js';
import {maxHp} from './agent.js';
import {AURAS} from '../data/behaviour.js';

// the live bearers of an aura on the map (a few, once a tick)
const bearers = (w, id) => perTick(w, 'auras:' + id, () => w.agents.filter(o => !o.dead && !o.gone && !o.captive && o.auras?.includes(id)));   // scan: a handful of bosses
// the bearer of `lead` on this creature's side, if one stands
export const leaderOf = (w, a) => bearers(w, 'lead').find(b => b !== a && b.faction === a.faction) || null;
// whether this creature stands its ground: a bearer of `lead` always, its side while the bearer stands, an officer until near death
export const holdsGround = (w, a) => !!a.auras?.includes('lead') || !!leaderOf(w, a) || (!!a.officer && a.hp > AURAS.officerBelow * maxHp(a));
