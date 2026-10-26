// Auras and marks of the ones who lead (docs/BEHAVIOUR.md «Аура вожака»). A boss on the local map (campaign/camp.js
// spawnFoe: a leader of an old lair at the head of its own, a grave's guard with its servants, the fourth in its lair)
// bears the aura `lead` (a.auras): while the bearer stands in the fight, nobody of its side — those who came with it, `a.side`
// set by spawnFoe — runs — not from a crowd, not from a wound,
// and its band's morale does not break (agents/squad.js). The bearer itself never runs. An `officer` (a.officer: the
// band's leader under a boss) stands until near death (AURAS.officerBelow) even when the aura is gone. The behaviours
// that would take a creature off the field ask holdsGround() first: scare, leaveHurt, retreat; defendLair holds a
// retinue of beasts to the ground as a lair's guards. Nothing else changes: the aura forbids flight, it does not fight.
import {perTick} from '../core/util.js';
import {maxHp} from './agent.js';
import {AURAS} from '../data/behaviour.js';

// the live bearers of an aura on the map (a few, once a tick)
const bearers = (w, id) => perTick(w, 'auras:' + id, () => w.agents.filter(o => !o.dead && !o.gone && !o.captive && !o.downed && o.auras?.includes(id)));   // scan: a handful of bosses
// the bearer of `lead` this creature came with, if it stands (its side is those it came with, not its faction: a pack of
// wolves wandering in, a band of the colony's own raiders hold nothing from a boss across the map)
export const leaderOf = (w, a) => (a.side == null ? null : bearers(w, 'lead').find(b => b !== a && b.id === a.side) || null);
// whether this creature stands its ground: a bearer of `lead` always, its side while the bearer stands, an officer until near death
export const holdsGround = (w, a) => !!a.auras?.includes('lead') || !!leaderOf(w, a) || (!!a.officer && a.hp > AURAS.officerBelow * maxHp(a));
