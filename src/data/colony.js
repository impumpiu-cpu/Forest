// Settlement tuning moved out of the logic (docs/SETTLEMENT.md): the colony's relations, life, healing, herds,
// threat, the day's plan, the furnace, the job board and watch, doing things together, gold veins. The logic files
// import these; the tables (data/schema/index.js, group «Поселение») show and edit them.
import {DAY, HOUR} from '../core/time.js';

export const REL = {
  dislike: -2,          // opinion at or below this weighs on the mood
  friend: 2.5,          // at or above this cheers up
  quarrelEvery: 2 * HOUR,
  quarrelNear: 4,       // cells apart
  quarrelBase: 0.05,    // chance per check and per point of mutual dislike past −2
  quarrelMax: 0.35,
  grudge: 0.6,          // a quarrel adds this much to the grudge on both sides
  fade: 0.96,           // grudges shrink this much each day
  fadeGood: 0.985,      // good memories, this much
  settlerFloor: -1,     // a race the colony dislikes worse than this does not come
};

export const LIFE = {
  unburiedAfter: 0.6 * DAY,   // a body lying this long weighs on everyone
  gloomBelow: -0.35,          // mood at dawn that counts as a gloomy day
  sulkFrom: 2,                // gloomy days in a row before someone sulks…
  sulkChance: 0.5,
  leaveAfter: 5,              // …and before they may leave (if still below leaveBelow)
  leaveBelow: -0.5, leaveChance: 0.35,
  hangover: 0.15,             // chance a cup of braga costs a sore head
  feastEvery: 6 * DAY,        // a feast for all at most this often
  prayGap: DAY,               // one prayer a day is enough
};

// a prayer (agents/tasks.js pray): the building prayed at, how long it takes (ticks)
export const PRAYER = {at: 'shrine', ticks: 60};

export const HEAL = {
  seekBelow: 0.75,  // a colonist this hurt (share of health) goes to the healer's hut…
  until: 0.97,      // …and stays until healed this far
  rate: 0.0022,     // health per tick a patient gets from a healer working at speed 1
  noHerbs: 0.4,     // without herbs the healer manages this share of it
  perHerb: 0.35,    // health healed per herb used
};

export const HERD = {
  graze: {spring: 0.8, summer: 0.9, autumn: 0.5, winter: 0.4},   // share of the food the pen gives (in winter: twigs and bark)
  winterMilk: 0.3,          // milk in winter, ×
  milkCap: 4,               // milk a goat holds before it goes to waste
  hungryDays: 3,            // days in a row with less than starveBelow of its food before it breaks out
  starveBelow: 0.55,
  reach: 75,                // how far from the camp the herder goes for a wild one
  slaughterBelow: 1.5,      // food per colonist below which a goat is slaughtered…
  keepGoats: 2,             // …as long as this many are left
  meatBelow: 4,            // regular slaughter of grown surplus livestock below this food per colonist
  breeders: 2,             // keep this many grown, breeding animals of each kind
};

export const THREAT = {
  perDay: 0.4,          // level a day
  perRaid: 1,           // level for every raid already sent
  perColonyKs: 1 / 180, // level per point of the colony's rating in the rumours (a colony of ten ≈ 1000 КС → 5.5)
  heads: [2, 1 / 3],    // the band in bandits of its level: 2 + level / 3 (counted in whole steps)…
  maxHeads: 16,         // …and no more than this many
  scouted: 1.3,         // a band whose scouts came home is this much stronger
  // the threat in КС: heads × one bandit of the level × this. Before the rating, bands were counted by a
  // price per head that undercounted trolls, giants, ogres, dark elves and upyrs (a band of them came at
  // 0.2–0.7 of the bandits' strength); now every band is as strong as its threat, and this keeps the
  // average band of a level where it was
  share: 0.75,
};

export const PLAN = {
  fuelDays: 3,        // keep this many days of firewood ahead…
  fuelDaysCold: 5,    // …and this many when it freezes
  foodDays: 6,        // days of food the colony likes to have ahead
  ration: 0.9,        // food a colonist eats a day, for counting the days ahead (settlement/plan.js, settlement/stats.js)…
  rationFloor: 0.5,   // …and no less than this a day however few they are
  foodDaysAutumn: 12, // …before winter (autumn): stock up
  minWeight: 0.08,    // a job wanted less than this gets no place
  // how a vacancy pulls a colonist's choice (vacancyPull): × and + on the job's own score
  mine: [1.5, 0.3],   // a place this colonist holds today (as the roster's own job used to)
  open: [0.6, 0.9, 0.3],   // a place free: × 0.6 + 0.9 × open share, + 0.3 × open share
  wanted: [0.85, 0],  // a job the colony wants but whose places are all taken (or that got none): a fallback
  none: [0.6, 0],     // a job the colony does not want tomorrow
  // a colonist's own fitness for a place, added while some of it is open
  skill: 0.15,        // × skill / 10
  best: 0.15,         // the colony's best at the job's skill
  habit: 0.12,        // the same job as yesterday
  buildCrew: {most: 4, perSite: 2},   // builders at once: two to an open site, at most `most` (settlement/plan.js crewCap)
};

// ── furnace fuel. A recipe asks for `fuel` units of heat at a `heat` level (data/recipes.js); each fuel
// resource with a `furnace` block (data/resources.js) gives heat up to its `tier` and needs `per`
// units of itself for one unit of heat: wood (tier 1, 3 logs a unit) melts copper, gold and silver;
// iron needs coal (tier 2). Magma (tier 3) will burn nothing, later. Kузнечные меха in the stock
// save a quarter of the fuel (FURNACE.bellows).
export const FURNACE = {bellows: 0.75, bellowsWork: 1.25, bellowsFine: 0.05, coalSpare: 6};

export const BOARD = {
  look: 5,           // a colonist looks round every this many ticks, in turn by id (as before the board)
  sight: 16,         // × mods.sight: how far a lookout sees a foe
  near: 8,           // a foe this close wakes the one who sees it at once and is urgent
  shout: 30,         // how far a cry carries
  hearAsleep: 0.1,   // × Perception: the chance a sleeper hears a cry (P 5 — every other one)
  reshout: 100,      // a threat still in view is cried again so that newcomers learn of it
  forget: {red: 300, yellow: 100},   // a member unseen this long is struck off the flag
  margin: 1.5,       // a yellow flag is covered at this × the threat's strength
  far: 40,           // nobody answers a flag further away than this
  // the weight of a flag (× the colonist's courage; a yellow one × its uncovered share): a raid, an
  // attack on one of ours, the nechist about, a beast about
  urgency: {raid: 1.35, attack: 1.1, nechist: 1.1, beast: 0.9, chase: 1.0, escape: 0.95},   // chase: raiders going off with our goods; escape: captives running away
  reserve: 1.05,     // a red flag in sight, not fought: keep out of harm's way (the fire, the settlement)
  wake: 0.25,        // a flag this much heavier wakes those who know it
  hurt: 0.3,         // health share at or under which one does not go to a fight
};

// the night watch: the council's standing rule
export const WATCH = {
  from: 21, till: 6,  // hours of the night it covers
  take: 1.2,          // the weight of taking it (× how willing one is, 0.1…1.2)
  post: 1.6,          // the weight of staying on it once taken (a tired body may still win: asleep on watch)
  offDuty: 1.5,       // the morning after: sleep it off, until the rest is back or noon
  noon: 12,
  fireLight: 6,       // the campfire lights this far: full sight by night
  torch: 0.5,         // the watchman's torch takes back this share of what the night takes of his sight
  fuel: 0.75,         // a tended fire burns this share of the wood an untended one does
};

export const TOGETHER = {
  riskFrom: 0.3,       // a gatherer is worth escorting from this risk up…
  riskTill: 0.15,      // …and the escort goes back to its own work below this
  escortShare: 0.2,    // at most this share of the colony escorts at a time
  keep: 2.2,           // the escort stays this close
  guard: 8,            // and takes on anything hostile this close to its charge
  aidBelow: 0.4,       // health share under which a colonist out in the woods needs help
  aidEvery: 12 * HOUR, // once dressed, not again for this long
  aidHeal: 0.2,        // of max health, more with the healer's skill
  aidFallen: 1.7,      // how urgent a fallen colonist is: above fighting a foe close by (1.35 × bravery)
  aidPractice: 60,     // medicine practice for a life saved (units of agents/skills.js practice)
  far: 40,             // nobody goes further than this to escort or help
  mate: 0.05,          // a friend (or a foe) on the same job, ± per person…
  mateCap: 0.1,        // …at most
  yieldGap: 0.3,       // a patient gives the bed up to someone this much worse off…
  yieldFrom: 0.5,      // …when itself is at least this healthy
  bondEscort: 0.05,    // per hour side by side
  bondDefend: 0.5,     // standing up for someone in a fight
  bondAid: 1,          // a wound dressed in the woods
  bondWork: 0.04,      // per hour on the same job close by
  bondTrouble: 0.3,    // having fought the same raid
  mendTrouble: 0.8,    // …more for two who could not stand each other
};

export const PRECIOUS = {
  veinChance: 0.02,     // per worked-out vein, in a region that allows a gold vein
  veinCells: [2, 4],    // rock cells that turn into gold quartz
  fameVein: 6,          // added to the raid threat by the rumour of gold…
  fameMithril: 4,       // …and of mithril
};

// the evening council at the campfire (settlement/council.js): the hours it sits (from, to), the share of the colony that
// must come before it starts (`quorum`), unless it is this many hours (`late`) before the end; the pull a goal gives to work
// that brings what it lacks (`goalPull`), a colonist's fondness for building (`buildPref`) and the random sway of a vote
// (`noise`) in the arguments; the share of the day's memories kept after it (`memory`)
export const COUNCIL = {from: 19, to: 21.5, quorum: 0.7, late: 0.3, goalPull: 0.3, buildPref: 0.2, noise: 0.25, memory: 0.4};

// the stores (settlement/stock.js, settlement/buildings.js): portions a pot holds (`potHolds`), what of the open food a
// granary keeps out of reach (`granary`), how much of the money a forged chest keeps from raiders (`chest`), the spoiling
// of food a tick (`spoil`) and how much slower it spoils in pots (`sealed`); the wood never spent on building — `fuelCold`
// when the night ahead (`fuelHour` o'clock) is colder than `coldBelow`°, else `fuelMild`
export const STORE = {potHolds: 6, granary: 0.5, chest: 0.4, spoil: 0.00015, sealed: 0.6, fuelHour: 3, coldBelow: 6, fuelCold: 10, fuelMild: 4};

// the camp (settlement/query.js): how many people it takes in before any building adds room (`popBase`); the raid alarm is
// raised when a raider would reach the camp within `alarmHours` hours at `alarmPace` of its own pace (woods and detours)
export const CAMP_LIFE = {popBase: 8, alarmHours: 12, alarmPace: 0.8};
