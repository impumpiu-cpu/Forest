// Ranks in a band (docs/BEHAVIOUR.md «Ранги и звенья»): pawn → officer → boss. A big band is split into links, each with
// an officer at its head; above them all may stand a boss (campaign/camp.js, its aura `lead`: agents/auras.js).
//
//   officer — the strongest of its link, made finer: its body is the mark «офицер» of «Состояния» (more health, holds
//             its ground till near death), its gear a grade of quality better (`quality`). Its link — the members who
//             follow it (a.link) — bear its small aura: while it stands, they do not run from a crowd or a wound until
//             they are near death (`hurt`), and the band's spirit holds the better for them (`rally` × their share of
//             the band). Its fall takes `loss` × that share from the band's spirit at once.
//   links   — of `size` heads at most; a band of fewer than `least` thinking, carrying fighters has no officer; beasts
//             take no rank.
//   where   — camp: on the local map of a campaign's camp (the fights of the march); settlement: raids on a settlement.
//   the dead — mindless, they take no officer: the strongest bones of each link become its wight (the mark «умертвие»):
//             its link hangs on it (a.master), and when it falls, the necromancer above it if he stands (a.masterUp),
//             otherwise they lose their way and wander off (agents/behaviours/retreat.js)
// The names of the ranks are the band's own (data/raids.js `ranks`: «десятник» of the bandits, «атаман» over them).
export const RANK_RULES = {
  size: 5, least: 4,
  quality: 1,
  hurt: 0.2, rally: 0.25, loss: 0.3,
  camp: true, settlement: true,
  // what share of the strength it was bought with a band keeps once its officers are made (its weakest pawns stay home
  // for the rest): above 1 never; below 1 — the officers' spirit paid for too, which КС does not see
  // (on a settlement 0.85: a raid of 2.5 norms costs the colony as many lives as on main — docs/BEHAVIOUR.md)
  pay: {camp: 1, settlement: 0.85},
};

// the officer's rank name when its band has none of its own
export const OFFICER_DEFAULT = 'старший';
