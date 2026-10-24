// Trophies: what a beast or a monster gives beyond its plain yields (species `trophies`).
// Four parts, kept apart:
//   - what it carried (a raider's gear) goes to the armoury as before (agents/agent.js kill);
//   - its plain yields (species `yields`) come whoever killed it, as before;
//   - rare trophies: each entry {res, n, chance, tier?} is rolled once, at the death, never again — a save,
//     a load, whoever opens the carcass change nothing (agent.trophy keeps the outcome);
//   - luck: the chance of each rare entry is raised by the average Luck of the colonists who fought it,
//     × (1 + lucky × L / (L + soft)) — L 5 → ×1.25, L 10 → ×1.33. A rare weight is raised, never made: an
//     entry that is not in the beast's table never appears, however lucky the band.
// A delicate organ (`tier`) comes out whole only under a skilled hand: one of those who fought it whose
// trophyExtraction tier (Agility) reaches it; otherwise it is spoiled in the cutting. The one who gets it
// out learns from it.
import {SPECIES} from '../data/species.js';
import {NORM} from '../data/special.js';
import {canDoAction, practice} from './skills.js';
import {liveById} from './lookup.js';
import {TROPHY} from '../data/behaviour.js';
import {passes} from '../data/chance.js';

export {TROPHY};   // (data/behaviour.js)
// who of the colony struck it, with their Luck at the blow (agents/combat.js damage)
export function noteHit(t, by) {
  if (by?.faction !== 'colony' || t.faction === 'colony' || !SPECIES.get(t.species).trophies) return;
  (t.hitters ||= {})[by.id] = by.special?.L ?? NORM;
}

export const luckBoost = L => 1 + TROPHY.lucky * L / (L + TROPHY.soft);

// Decide the rare trophies of a creature the colony killed: {got: {res: n}, spoiled: [res], by: name?}.
// Once only; the outcome is kept on the creature.
export function decideTrophies(w, t, by) {
  if (t.trophy) return t.trophy;
  const table = SPECIES.get(t.species).trophies || [];
  const hit = {...(t.hitters || {})};
  if (by?.faction === 'colony') hit[by.id] ??= by.special?.L ?? NORM;
  const ids = Object.keys(hit);
  const out = t.trophy = {got: {}, spoiled: []};
  if (!table.length || !ids.length) return out;
  const L = ids.reduce((s, id) => s + hit[id], 0) / ids.length;
  const crew = ids.map(id => liveById(w, +id)).filter(Boolean);
  for (const e of table) {
    if (!passes(w.rngs.combat, Math.min(1, e.chance * luckBoost(L)))) continue;   // each on its own chance (data/chance.js)
    if ((e.tier || 1) > 1) {
      const hand = crew.filter(o => canDoAction(o, 'trophyExtraction', e.tier)).sort((x, y) => (y.skill?.trophyExtraction || 0) - (x.skill?.trophyExtraction || 0))[0];
      if (!hand) { out.spoiled.push(e.res); continue; }
      practice(hand, 'trophyExtraction', TROPHY.practice);
      out.by = hand.name; out.byF = hand.gender === 'f';
    }
    out.got[e.res] = (out.got[e.res] || 0) + e.n;
  }
  const tally = w.chronicle.trophies ||= {got: 0, spoiled: 0};
  tally.got += Object.values(out.got).reduce((s, n) => s + n, 0); tally.spoiled += out.spoiled.length;
  return out;
}
