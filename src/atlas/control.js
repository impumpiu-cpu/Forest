// Channels of control (docs/WORLD.md «Правители и личности»): what a person holds by its own power, apart from any office —
// the necromancer's dead, the summoner's beasts of the wood. A channel has a holder (a person or a place), what it holds,
// and a rule of loss; when the holder dies the channel goes by that rule, and nothing else goes with it. Golems are a
// forge's and a town's (atlas/golems.js), treants a grove's (atlas/wilds.js), war beasts a pit's (atlas/beasts.js): places
// hold them, so a ruler's death leaves them where they stand. The profile of a polity names the channels its ruler holds
// in person (data/polities.js `ruler.channels`).
//
//   undead   — the dead of a necromancer's tower (atlas/necro.js): raised while a master sits in it; without one the tower
//              raises none, its dead melt away (NECRO.deadFade) and the lairs that bent the knee to it go free
//   summons  — the beasts an elven summoner calls in a fight (agents/summon.js): a thing of the local map; on the world map
//              nothing is held, so nothing is lost
import {LAIRS} from '../data/lairs.js';
import {profileOf} from './polities.js';

// the channels a person holds now: [{kind, holder: person, of: lair | realm}]
export function channelsOf(a, p) {
  const out = [];
  for (const l of a.lairs || []) if (l.alive && l.leader?.id === p.id) for (const kind of profileOf(l).ruler.channels || []) out.push({kind, holder: p, of: l});
  for (const r of a.realms || []) if (r.fallen == null && r.kingdom?.court?.ruler?.person === p.id) for (const kind of profileOf(r).ruler.channels || []) out.push({kind, holder: p, of: r});
  return out;
}

// is a tower's dead held: a master sits in it (its leader) — the dead rise; without one they only fade
export const heldDead = l => !!l?.leader;

// the holder died: each channel by its rule
export function loseChannels(a, p, say, ctx = {}) {
  for (const ch of channelsOf(a, p)) {
    if (ch.kind === 'undead') {
      const l = ch.of, L = LAIRS.get(l.kind);
      l.masterless = a.hist?.year ?? 0;
      let freed = 0;
      for (const v of a.lairs || []) if (v.alive && v.lord === l.id) { v.lord = null; freed++; }
      say?.(`Мертвецы ${L.from} «${l.name}» остались без хозяина: новых больше не поднимают${freed ? `, и ${freed === 1 ? 'логово, что платило ей дань, вольно' : `${freed} логов, что платили ей дань, вольны`}` : ''}.`);
    }
    // 'summons': nothing held on the world map
  }
}
