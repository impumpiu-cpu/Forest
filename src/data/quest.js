// The quest of the campaign (campaign/quest.js): a crown lost where the world's own history would lose it,
// three clues that narrow down where it lies, rumours in the towns, guardians that grow stronger the
// further from home, the world that learns of the crown and sends its bands after the caravan.
// Distances are cells of a 192-high world (× the world's scale) unless said otherwise.

export const QUEST = {
  // the crown's names, one drawn for a campaign: [as named, accusative, gender]
  names: [['Венец Первых Королей', 'Венец Первых Королей', 'm'], ['Железная корона', 'Железную корону', 'f'], ['Корона Зари', 'Корону Зари', 'f'],
    ['Венец Семи Звёзд', 'Венец Семи Звёзд', 'm'], ['Холодная корона', 'Холодную корону', 'f'], ['Корона Предков', 'Корону Предков', 'f'],
    ['Венец Основателя', 'Венец Основателя', 'm'], ['Терновый венец', 'Терновый венец', 'm']],
  // where the crown may lie, by the world's history: weight of each kind of place
  //   barrow — an ancient barrow (the old king took it to his grave); dragon — a dragon's lair;
  //   ruin — a lair the peoples cleared, a burnt town (it vanished in the fall); dread — a living lair of
  //   the dead (a necromancer's tower, a vampire's manor, a wights' barrow)
  crownAt: {barrow: 3, dragon: 2, dread: 2, ruin: 1.5},
  // the clues: three places on the way, each farther from home than the last (at these shares of the
  // way to the crown), scattered off the straight line by up to `scatter` of its length
  clueAt: [0.3, 0.55, 0.8], scatter: 0.3,
  // what a clue is, by the place it is found in: a sage of a friendly town (no guard), a living lair (its
  // owners guard it), a barrow or ruin (the dead or the outlaws who settled there)
  clueKinds: {town: 1.2, lair: 1, barrow: 1, ruin: 1},
  // what each clue tells of the crown: the circle it narrows it to (cells), the last one shows the place
  narrow: [30, 12, 0],
  // where a clue is: told as a circle of this radius, its centre off the place by up to `off` × the radius
  area: 7, off: 0.7,
  // the search: within this of the place the scouts see it (+ the fog's sight); a search of an area walks
  // to a cell of it, at most `tries` cells before the council gives it up for a while (`rest` days)
  sight: 1.5, tries: 6, rest: 30,
  // a guarded place: the guards' strength — base + perDiag × the distance from home as a share of the
  // world's diagonal (× crown for the crown's own); the council storms it when the company is this whole,
  // and after a lost storm waits `retry` days
  guard: {base: 0.7, perDiag: 1.8, crown: 1.25, max: 3}, storm: 0.75, retry: 12,
  // rumours in a friendly town: a hint where an unknown clue lies, for `price` gold or free to a speaker
  // with Charisma `charm` and more; at most one a visit, with this chance
  rumour: {chance: 0.6, price: 3, charm: 7},
  // the way home with the crown: the world sends its bands after the caravan — one every `every` days,
  // (no more than `at` on its trail at once), of strength base + per year carried, at most max; they hunt from
  // the edge of the bubble and go home after a fight, won or lost
  pursuit: {every: 30, at: 2, base: 0.9, perYear: 0.3, max: 2.6},
};
