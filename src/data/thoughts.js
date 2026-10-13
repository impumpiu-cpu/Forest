// Thoughts: what a colonist remembers from the day. Systems call think(w, agent, id, ctx);
// the entry goes to the colonist's diary and colours their mood for `lasts` ticks.
//   text(a, ctx): the diary line (use g(a, m, f) for gendered words)
//   mood: −1 … +1 while fresh, fading to zero over `lasts`
//   once: the same thought is not repeated within this many ticks
import {Registry} from '../core/registry.js';
import {g} from '../core/util.js';
import {DAY, HOUR} from '../core/time.js';

export const THOUGHTS = new Registry('thought');

THOUGHTS.registerAll([
  // arrival
  {id: 'founded', mood: 0.2, lasts: DAY, text: a => `${g(a, 'Пришёл', 'Пришла')} с остальными к броду и разбил${g(a, '', 'а')} лагерь.`},
  {id: 'arrived', mood: 0.15, lasts: DAY, text: a => `${g(a, 'Пришёл', 'Пришла')} в поселение, надеется прижиться.`},

  // body
  {id: 'ateHungry', mood: 0.1, lasts: 4 * HOUR, once: 4 * HOUR, text: (a, c) => `Наконец ${g(a, 'поел', 'поела')}: ${c.food}.`},
  {id: 'ateLiked', mood: 0.18, lasts: 6 * HOUR, once: 6 * HOUR, text: (a, c) => `${g(a, 'Поел', 'Поела')} любимой еды: ${c.food}. Хорошо!`},
  {id: 'ateDisliked', mood: -0.12, lasts: 5 * HOUR, once: 5 * HOUR, text: (a, c) => `Пришлось есть ${c.food}, а ${g(a, 'он', 'она')} это терпеть не может.`},
  {id: 'ateMeat', mood: 0.15, lasts: 6 * HOUR, once: 6 * HOUR, text: a => `${g(a, 'Поел', 'Поела')} жареного мяса. Сытно.`},
  {id: 'starving', mood: -0.35, lasts: 8 * HOUR, once: 8 * HOUR, text: () => 'Голодает. Запасы пусты.'},
  {id: 'freezing', mood: -0.25, lasts: 8 * HOUR, once: 8 * HOUR, text: a => `${g(a, 'Замёрз', 'Замёрзла')} до костей.`},
  {id: 'exhausted', mood: -0.2, lasts: 6 * HOUR, once: 8 * HOUR, text: () => 'Валится с ног от усталости.'},
  {id: 'sleptHut', mood: 0.15, lasts: 10 * HOUR, once: 10 * HOUR, text: a => `Хорошо ${g(a, 'выспался', 'выспалась')} в шалаше, в тепле.`},
  {id: 'sleptOutside', mood: -0.05, lasts: 8 * HOUR, once: 10 * HOUR, text: () => 'Спал у костра под открытым небом.'},
  {id: 'wounded', mood: -0.3, lasts: DAY, once: 6 * HOUR, text: a => `Тяжело ${g(a, 'ранен', 'ранена')}.`},

  // work
  {id: 'likedWork', mood: 0.12, lasts: 6 * HOUR, once: 8 * HOUR, text: (a, c) => `С удовольствием ${g(a, 'взялся', 'взялась')} за любимое дело: ${c.job}.`},
  {id: 'dislikedWork', mood: -0.1, lasts: 6 * HOUR, once: 8 * HOUR, text: (a, c) => `Нехотя ${g(a, 'пошёл', 'пошла')} ${c.job}: не по душе.`},
  {id: 'madeItem', mood: 0.2, lasts: DAY, text: (a, c) => `${g(a, 'Сделал', 'Сделала')} своими руками: ${c.item}.`},
  {id: 'finishedBuilding', mood: 0.2, lasts: DAY, text: (a, c) => `${g(a, 'Положил', 'Положила')} последнее бревно: ${c.building} готов${c.f ? 'а' : ''}.`},
  {id: 'newBuilding', mood: 0.1, lasts: DAY, text: (a, c) => `Радуется: в поселении появил${c.f ? 'ась' : 'ся'} ${c.building}.`},
  {id: 'huntKill', mood: 0.2, lasts: 12 * HOUR, once: 2 * HOUR, text: (a, c) => `Удачная охота: ${g(a, 'подстрелил', 'подстрелила')} ${c.prey}.`},
  {id: 'newGear', mood: 0.15, lasts: DAY, once: 4 * HOUR, text: (a, c) => `${g(a, 'Взял', 'Взяла')} со склада: ${c.items}.`},
  {id: 'gearBroke', mood: -0.15, lasts: 12 * HOUR, text: (a, c) => `Сломал${g(a, 'ся', 'ась')} ${c.item}… обидно.`},

  // danger
  {id: 'fledFire', mood: -0.25, lasts: DAY, once: 6 * HOUR, text: a => `${g(a, 'Бежал', 'Бежала')} от пожара. Страшно.`},
  {id: 'wolfAttack', mood: -0.4, lasts: 2 * DAY, once: 4 * HOUR, text: a => `На ${g(a, 'него', 'неё')} напали волки.`},
  {id: 'escapedWolves', mood: 0.15, lasts: DAY, once: 4 * HOUR, text: a => `${g(a, 'Отбился', 'Отбилась')} от волков. Жив${g(a, '', 'а')}!`},
  {id: 'killedWolf', mood: 0.25, lasts: DAY, text: a => `${g(a, 'Убил', 'Убила')} волка. Шкура пойдёт в дело.`},
  {id: 'raidAlarm', mood: -0.15, lasts: 12 * HOUR, once: 12 * HOUR, text: a => `Тревога! ${g(a, 'Бросил', 'Бросила')} работу и ${g(a, 'побежал', 'побежала')} к костру.`},
  {id: 'killedRaider', mood: 0.15, lasts: DAY, text: a => `${g(a, 'Сразил', 'Сразила')} налётчика.`},
  {id: 'grief', mood: -0.35, lasts: 2 * DAY, text: (a, c) => `Скорбит: ${c.name} ${c.f ? 'погибла' : 'погиб'}.`},

  // council
  {id: 'councilWon', mood: 0.12, lasts: DAY, text: (a, c) => `На совете ${g(a, 'говорил', 'говорила')} за ${c.choice} (${c.why}). Совет согласился.`},
  {id: 'councilLost', mood: -0.05, lasts: DAY, text: (a, c) => `На совете ${g(a, 'говорил', 'говорила')} за ${c.choice} (${c.why}), но решили иначе: ${c.decision}.`},
  {id: 'councilSaving', mood: 0, lasts: DAY, text: (a, c) => `На совете ${g(a, 'говорил', 'говорила')} за ${c.choice} (${c.why}). Будем копить.`},
]);

export const MOOD_LABELS = [
  [0.45, ['счастлив', 'счастлива']],
  [0.15, ['в хорошем настроении', 'в хорошем настроении']],
  [-0.15, ['спокоен', 'спокойна']],
  [-0.45, ['не в духе', 'не в духе']],
  [-Infinity, ['подавлен', 'подавлена']],
];
