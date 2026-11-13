// The acts of a fight (agents/abilities.js; the perks of `how: 'act'` in data/perks.js — a fire's breath, a tail's sweep, a
// roar; plan claude/bestiary-plan.md З-2). What an act does is its perk's rank, written out; here — how any act is carried:
//   look      — every this many ticks one with an act ready looks for a use of it (not every tick: the cost)
//   edge      — the reach of a shape is counted from the body's edge: + this many cells (a dragon's head is not its middle)
//   interrupt — a wind-up broken (stunned) waits this many ticks before the next try
//   slack     — one stepping out of a shape aims this many degrees past its rim, and `out` cells past its end
//   pace      — × one's step while it gets out of the way (a run)
//   shift     — one with a mind whose ready cone has its own in the way steps aside: `ways` spots `by` cells off, for up to
//               `ticks`, while a foe is within the reach + `far`
//   dodged    — × the harm to one who dodged inside the shape (and no burning, no knock)
//   aim       — the act is begun only when a foe stands in the shape at least this deep in it (× its length): not at the rim
export const ABILITY = {
  look: 4,
  edge: 0.6,
  interrupt: 40,
  slack: 18, out: 1.5,
  pace: 1.35,
  aim: 0.85,
  shift: {ways: 8, by: 1.6, ticks: 14, far: 2},
  there: 0.25,   // (close enough to the spot stepped to)
  dodged: 0.5,
  eps: 1e-6,
};

// flight (the perk «Полёт», agents/abilities.js stepFlight):
//   hitUp — a blade reaches one high in the air only from this far (a spear's 1.85: yes; a sword's 1.25: no)
//   land  — it comes down for a foe within its reach + this
export const FLIGHT = {hitUp: 1.8, land: 0.3};
