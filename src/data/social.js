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
};

// the kinds of fact (src/social/facts.js): what it weighs in a memory, 0 … 1, by the part one had in it —
// `by` the doer, `to` the one it was done to, `saw` a witness
// (`once`: noted once a camp for the same pair — a deed that goes on for hours is one fact; `pair`: the two are equal in it)
export const FACT_KINDS = {
  aid:       {label: 'помощь раненому', weight: {to: 0.6, by: 0.3, saw: 0.15}},
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
};

// a loss as each takes it (campaign/social.js grieve): by what one felt for the one gone, its mood for `days` days —
// a friend's death weighs, a stranger's a little, one who was hated may even ease; the living gone weigh less
export const GRIEF = {
  died: {friend: -0.3, known: -0.08, foe: 0.04, days: 4}, taken: {friend: -0.2, known: -0.05, foe: 0, days: 3},
  left: {friend: -0.1, known: 0, foe: 0.03, days: 2},
  // the lines of the diary
  text: {grieve: (n, g) => `Не могу забыть: ${n} ${g ? 'погибла' : 'погиб'}.`, mourn: (n, g) => `Жаль ${n}: ${g ? 'погибла' : 'погиб'}.`, relief: n => `Без ${n} как-то легче.`,
    takenFriend: n => `${n} увели в плен. Что с ним теперь?`, leftFriend: n => `${n} ушёл от нас — жаль.`},
};
