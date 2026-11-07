// The living company's numbers (docs/CAMPAIGN.md «Живая команда: договор»; plan claude/caravan-ver_d.md). Facts, who comes to
// know them, how many are kept. (A table in «Настройки → Таблицы» — when the layer's numbers settle: plan D8.)
export const SOCIAL = {
  // a witness of a fact on the local map: awake, standing, this many cells off at most (× how far it sees in the dark,
  // agents/combat.js darkness), and the doer or the one it was done to in its sight (agents/combat.js canSee)
  see: 10,
  // facts the campaign keeps (the oldest go first, the ones a memory or a bond still points to stay)
  factsMax: 1500,
  // memories a member keeps (the least weighty fade first) and the facts a bond keeps as its reasons
  memoryMax: 60, whyMax: 6,
  // the evening's talk (campaign/social.js tell): a fact of the last day weighty enough for one who lived it (its weight for
  // that part at least `tellFrom`) is told by it to those of the company who did not know — they know it as heard, from it
  tellFrom: 0.5,
};

// the kinds of fact (src/social/facts.js): what it weighs in a memory, 0 … 1, by the part one had in it —
// `by` the doer, `to` the one it was done to, `saw` a witness
// (`once`: noted once a camp for the same pair — a deed that goes on for hours is one fact; `pair`: the two are equal in it)
export const FACT_KINDS = {
  aid:       {label: 'помощь раненому', weight: {to: 0.6, by: 0.3, saw: 0.15}},
  boundAfter: {label: 'перевязали после боя', weight: {to: 0.5, saw: 0.2}},   // (by the company: no single saviour)
  saved:     {label: 'спас упавшего', weight: {to: 1, by: 0.5, saw: 0.3}},
  stoodUp:   {label: 'заступился', weight: {to: 0.6, by: 0.3, saw: 0.15}},
  escorted:  {label: 'пошёл провожатым', weight: {to: 0.25, by: 0.15, saw: 0.05}, once: true},
  yieldedBed: {label: 'уступил койку', weight: {to: 0.4, by: 0.3, saw: 0.1}},
  quarrel:   {label: 'ссора', weight: {to: 0.35, by: 0.35, saw: 0.1}, pair: true},
  workedWith: {label: 'работали рядом', weight: {to: 0.1, by: 0.1, saw: 0}, pair: true, once: true},
  foughtBeside: {label: 'бились плечом к плечу', weight: {to: 0.4, by: 0.4, saw: 0.1}, pair: true, once: true},
  // the fates (social/fate.js): `to` the one it befell; those present learn it — saw it, or heard of it from the company
  died:      {label: 'гибель', weight: {to: 1, saw: 0.8, heard: 0.6}, fate: true},
  taken:     {label: 'уведён в плен', weight: {to: 1, saw: 0.7, heard: 0.5}, fate: true},
  escaped:   {label: 'пленный бежал', weight: {to: 1, saw: 0.3, heard: 0.2}, fate: true},
  sold:      {label: 'продан', weight: {to: 1, saw: 0.4, heard: 0.3}, fate: true},
  left:      {label: 'ушёл', weight: {to: 1, saw: 0.3, heard: 0.2}, fate: true},
  // the watch (campaign/duty.js): `by` the one who asks or answers for it, `to` the other
  asked:     {label: 'попросил сменить в дозоре', weight: {to: 0.2, by: 0.25, saw: 0.05}},
  tookWatch: {label: 'отстоял дозор за другого', weight: {to: 0.5, by: 0.3, saw: 0.1}},
  brokeWord: {label: 'не сдержал слово', weight: {to: 0.6, by: 0.3, saw: 0.15}},
  wordFailed: {label: 'не смог сдержать слово', weight: {to: 0.3, by: 0.2, saw: 0.05}},
  // the peaceful life (campaign/company.js welcome; social.js judge)
  welcomed:  {label: 'принял новичка', weight: {to: 0.4, by: 0.2, saw: 0.05}},
  frowned:   {label: 'не одобрил продажу пленного', weight: {by: 0.3, saw: 0.05}},
};
// the newcomer (campaign/social.js welcome): the most sociable of the free takes it in — the bond both ways
export const WELCOME = {bond: {to: 0.6, by: 0.3}, from: 0.55};
// a captive sold (campaign/social.js judge): one who holds mercy high (align.mercy ≥ `mercy`) or freedom dear takes it ill —
// a mood for `days` days, and it is remembered
export const JUDGE = {mercy: 2, values: ['freedom', 'family'], mood: -0.12, days: 5, text: 'Продали человека, будто скотину. Не по мне это.'};

// a loss as each takes it (campaign/social.js grieve): by what one felt for the one gone, its mood for `days` days —
// a friend's death weighs, a stranger's a little, one who was hated may even ease; the living gone weigh less
export const GRIEF = {
  died: {friend: -0.3, known: -0.08, foe: 0.04, days: 4}, taken: {friend: -0.2, known: -0.05, foe: 0, days: 3},
  left: {friend: -0.1, known: 0, foe: 0.03, days: 2},
  // the lines of the diary
  text: {grieve: (n, g) => `Не могу забыть: ${n} ${g ? 'погибла' : 'погиб'}.`, mourn: (n, g) => `Жаль ${n}: ${g ? 'погибла' : 'погиб'}.`, relief: n => `Без ${n} как-то легче.`,
    takenFriend: n => `${n} увели в плен. Что с ним теперь?`, leftFriend: n => `${n} ушёл от нас — жаль.`},
};

// The night's watch on the road (campaign/duty.js; plan claude/caravan-ver_d.md D3; the user's choices, 07.11.2026: the watch
// weighs only on tiredness — the night's fights are as before; tiredness slows healing and leaves less rest on a camp; the
// watch goes round by turns). Tiredness 0 … 1 (m.social.load.tired).
export const DUTY = {
  watch: 2,            // watchmen a night at most…
  per: 4,              // …one for every this many who may stand it (at least one)
  badly: 0.35,         // one this hurt does not stand watch (as CAMPAIGN.camp.badly)
  tiredWatch: 0.45,    // a night on watch adds this
  rest: {march: 0.15, camp: 0.3, town: 0.5},   // a night's sleep takes this off: after a day's march, on a camp, in a town
  healCut: 0.3,        // healing × (1 − healCut × tired)
  campRest: 0.3,       // on a camp's map the need of rest starts this × tired lower
  // a request to be relieved (Ensemble's way: the asker's wish, then the one asked answers by its own rules)
  askAt: 0.6,          // one this tired, on tonight's watch, asks to be relieved
  promiseDays: 3,      // a promise «later» («your next turn») holds a round of the watch and this many nights over, else it lapses
  gap: 0.25,           // one asks only someone at least this much less tired than itself…
  reask: 6,            // …and not one who said no in the last this many days
  // the answer: the sum of the rules that hold (each a reason); ≥ 0 — yes, ≥ −later — «later», else no
  answer: {base: 0.2, bond: 0.2, tired: -1, owes: 0.35, broke: -0.4, lazy: -0.3, diligent: 0.2, noise: 0.1},   // (noise: ± this)
  later: 0.25,
  toldNo: 1,           // a refusal goes into the chronicle only from one the asker counts a friend (bond at least this): the rest are facts
  shirkAt: 0.7,        // a lazy one this tired, who owes the asker nothing, may just not get up
  // who is asked: the bond to it, how rested it is, what one knows of its word
  pick: {bond: 0.3, rested: 1, kept: 0.4, broke: -0.6},
  // what it comes to between the two: creditor → debtor
  bond: {kept: 0.8, broke: -1, no: -0.2},
};
