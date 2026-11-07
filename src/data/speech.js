// What the company says at the fire (plan claude/caravan-ver_d.md D6): a speech act + the reason it rests on + the option it
// is about + the speaker's manner. The words never change the outcome: the meeting was decided (campaign/council.js) and is
// only told; a variant of a phrase is chosen by the meeting and the speaker (no draw of any stream). A reason is one the
// speaker has: its own hunger, wounds, tiredness, its caution about the night, a loss it knows of.
// the options as said: what one wants
export const SAY_OPTION = {
  'caravan.camp.food': ['встать, поохотиться', 'добыть еды, пока земля кормит'],
  'caravan.camp.heal': ['отлежаться', 'дать раненым встать на ноги'],
  'caravan.camp.build': ['встать и сладить, что нужно', 'потратить день на работу'],
  'caravan.camp.tame': ['приручить здешних зверей', 'взять зверей, пока пасутся рядом'],
  'caravan.camp.mine': ['встать и добыть руды', 'покопать жилу'],
  'caravan.camp.goOn': ['идти дальше', 'не терять дня'],
  'caravan.visit.winter': ['зимовать в городе', 'переждать мороз за стенами'],
  'caravan.visit.food': ['свернуть в город за едой', 'купить еды'],
  'caravan.visit.heal': ['в город, к лекарям', 'подлечиться в городе'],
  'caravan.visit.smith': ['к кузнецу с рудой', 'отдать руду в работу'],
  'caravan.visit.shop': ['в город за покупками', 'потратить казну'],
};
// the reasons as said (campaign/council.js scoreOne: the parts that moved one's score most)
export const SAY_WHY = {
  hunger: ['животы подвело', 'еды на донышке'],
  wounds: ['раны не заживают', 'еле на ногах держусь'],
  friend: ['свои ранены', 'нельзя бросить раненых'],
  tired: ['с ног валимся', 'ночи без сна'],
  danger: ['место недоброе', 'ночью здесь опасно'],
};
// the acts: wanting what the council took, wanting otherwise (and going with it), a short yes from the quiet ones
export const SAY_ACT = {
  for: (o, why) => `${o}${why ? ` — ${why}` : ''}.`,
  against: (o, why, took) => `я бы ${o}${why ? ` — ${why}` : ''}. Но раз решили ${took} — пойду со всеми.`,
  quiet: took => `Согласен: ${took}.`,
};
// the round of talk (campaign/council.js debate): the proposal, the objection with its reason, the proposer's answer, those
// the objection moved
export const SAY_TALK = {
  propose: o => `Предлагаю ${o}.`,
  object: (o, why) => `Нет — ${why}. Лучше ${o}.`,
  yielded: o => `Твоя правда: ${o}.`,
  met: o => `Тогда сойдёмся на том, чтобы ${o}.`,
  held: o => `Нет, всё же ${o}.`,
  swayed: 'передумали после этих слов',
};
// the manner: the sociable say more (both the want and its reason), the reserved say only the want; past `quietBelow` of the
// social leaning a voice that agrees just agrees
export const SPEECH = {quietBelow: 0.35, fullFrom: 0.6};
