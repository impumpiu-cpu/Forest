// The leanings of a creature (docs/BEHAVIOUR.md «Склонности»): what it prefers among what it may do, apart from what it can do
// (skills, the body's mods), what it holds right (the world view, data/values.js), what it needs now (hunger, wounds) and what
// it has begun. Each axis is its own, 0 … 1, and two may be high at once — not shares of a whole, as a realm's rose is
// (data/mind.js). Table «Склонности».
//
//   AXES   the axes. `risk` (готовность к риску) is the creature's bravery seen as a leaning (data/mods.js bravery, the traits
//          смелый / робкий): it is not drawn and adds nothing of its own — bravery already decides the firefighting, the stand
//          against a foe, the answer to the board and the night watch, and is not counted twice
//   roll   how a leaning is drawn at birth (agents/agent.js personality, the stream `leans`: the other draws of a birth stay as
//          they were): the mean of three draws, mid ± spread — the far ends rare
//   cap    the most a leaning adds to or takes from an offer's score
//   links  which commands a leaning weighs on (the full ids of data/commands.js): the offer's score + k × (axis − 0.5) × 2, at
//          most ±cap — so a leaning of 0.5 adds nothing. `jobs` — only the work at these jobs (the land outside the camp);
//          `kept` — only the task under way (a persistent one holds harder to what it does)
// A run with the profile «без влияния склонностей» (data/commands.js leansOn) adds nothing.
export const LEAN_AXES = {
  curious: {label: 'любопытство', note: 'идёт смотреть: купец, работа в земле за лагерем'},
  social: {label: 'общительность', note: 'к людям: посидеть у огня, совет, помочь своему'},
  risk: {label: 'готовность к риску', note: 'это храбрость: тушить, стоять против врага, дозор — уже от неё; здесь не прибавляется второй раз'},
  persist: {label: 'настойчивость', note: 'держится начатой работы'},
};
export const LEANS = {
  roll: {mid: 0.5, spread: 0.3},
  cap: 0.25,
  links: [
    {cmd: 'local.behaviour.trade', axis: 'curious', k: 0.3},
    {cmd: 'local.behaviour.work', axis: 'curious', k: 0.2, jobs: ['gather', 'hunt', 'fish', 'chop', 'mine', 'dig']},
    {cmd: 'local.behaviour.company', axis: 'social', k: 0.3},
    {cmd: 'local.behaviour.council', axis: 'social', k: 0.2},
    {cmd: 'local.behaviour.aid', axis: 'social', k: 0.2},
    {cmd: 'local.behaviour.work', axis: 'persist', k: 0.2, kept: true},
  ],
};
// the axes drawn at birth (risk is the bravery's)
export const DRAWN_AXES = Object.keys(LEAN_AXES).filter(k => k !== 'risk');
// risk as a leaning, 0 … 1: bravery 0.5 … 1.5 (data/mods.js) onto the axis
export const riskOf = a => Math.max(0, Math.min(1, (a?.mods?.bravery ?? 1) - 0.5));
