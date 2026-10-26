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
//             its link follows it (a.master), and when it falls, the necromancer above it if he stands (a.masterUp),
//             otherwise they lose their way and wander off (agents/behaviours/retreat.js)
// The names of the ranks are the band's own (data/raids.js `ranks`: «десятник» of the bandits, «атаман» over them).
export const RANK_RULES = {
  size: 5, least: 4,
  quality: 1,
  hurt: 0.2, rally: 0.25, loss: 0.3,
  camp: true, settlement: false,   // on a settlement they cost it too dear: the officers' spirit is no part of КС (docs/BEHAVIOUR.md)
};

export const RANK_LABELS = {pawn: 'пешка', officer: 'офицер', boss: 'босс'};
// the officer's rank name when its band has none of its own
export const OFFICER_DEFAULT = 'старший';
