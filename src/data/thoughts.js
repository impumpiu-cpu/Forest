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
  {id: 'ateHot', mood: 0.2, lasts: 8 * HOUR, once: 6 * HOUR, text: (a, c) => `${g(a, 'Поел', 'Поела')} горячего: ${c.food}. Сразу теплее.`},
  {id: 'ateMeat', mood: 0.15, lasts: 6 * HOUR, once: 6 * HOUR, text: a => `${g(a, 'Поел', 'Поела')} жареного мяса. Сытно.`},
  {id: 'starving', mood: -0.35, lasts: 8 * HOUR, once: 8 * HOUR, text: () => 'Голодает. Запасы пусты.'},
  {id: 'freezing', mood: -0.25, lasts: 8 * HOUR, once: 8 * HOUR, text: a => `${g(a, 'Замёрз', 'Замёрзла')} до костей.`},
  {id: 'exhausted', mood: -0.2, lasts: 6 * HOUR, once: 8 * HOUR, text: () => 'Валится с ног от усталости.'},
  {id: 'sleptHouse', mood: 0.22, lasts: 10 * HOUR, once: 10 * HOUR, text: (a, c) => `Выспал${g(a, 'ся', 'ась')} в тёплой избе${c.fine ? ', среди добротных вещей' : ''}. Хорошо!`},
  {id: 'sleptHut', mood: 0.06, lasts: 10 * HOUR, once: 10 * HOUR, text: a => `Переночевал${g(a, '', 'а')} в шалаше: тесно и сквозит, но всё лучше, чем под небом.`},
  {id: 'sleptOutside', mood: -0.05, lasts: 8 * HOUR, once: 10 * HOUR, text: () => 'Спал у костра под открытым небом.'},
  {id: 'wounded', mood: -0.3, lasts: DAY, once: 6 * HOUR, text: a => `Тяжело ${g(a, 'ранен', 'ранена')}.`},
  // the deadly wound (agents/wounds.js)
  {id: 'fell', mood: -0.5, lasts: DAY, text: a => `Упал${g(a, '', 'а')} без сознания. Последнее, что помнит, — удар.`},
  {id: 'survived', mood: 0.4, lasts: 2 * DAY, text: (a, c) => `${c.name ? `${c.name} ${c.gender === 'f' ? 'вытащила' : 'вытащил'}` : 'Вытащили'} с того света. Жив${g(a, '', 'а')}!`},
  // masters (settlement/masters.js)
  {id: 'namedMaster', mood: 0.5, lasts: 3 * DAY, text: (a, c) => `Совет нарёк ${g(a, 'его', 'её')} при всех: ${c.title}. Честь!`},
  {id: 'masterNamed', mood: 0.03, lasts: DAY, once: DAY, text: (a, c) => `${c.name} теперь ${c.title}: будет у кого поучиться.`},
  // captives (settlement/captives.js)
  {id: 'captured', mood: -0.5, lasts: 3 * DAY, text: (a, c) => `Очнул${g(a, 'ся', 'ась')} связанн${g(a, 'ым', 'ой')} в чужом лагере${c.bonds ? ` — ${c.bonds}` : ''}. Жив${g(a, '', 'а')}, но в плену.`},
  {id: 'tookCaptive', mood: 0.12, lasts: DAY, text: (a, c) => `Связал${g(a, '', 'а')} упавшего врага: ${c.name} теперь пленный.`},
  {id: 'trauma', mood: -0.4, lasts: 4 * DAY, text: (a, c) => `${c.what[0].toUpperCase() + c.what.slice(1)}: это теперь навсегда.`},
  {id: 'woundHealed', mood: 0.25, lasts: DAY, text: () => 'Тяжёлая рана наконец затянулась.'},

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
  {id: 'wolfAttack', mood: -0.4, lasts: 2 * DAY, once: 4 * HOUR, text: (a, c) => `На ${g(a, 'него', 'неё')} напали ${c.who || 'волки'}.`},
  {id: 'escapedWolves', mood: 0.15, lasts: DAY, once: 4 * HOUR, text: (a, c) => `${g(a, 'Отбился', 'Отбилась')}: ${c.who || 'волки'} отступили. Жив${g(a, '', 'а')}!`},
  {id: 'killedWolf', mood: 0.25, lasts: DAY, text: (a, c) => `${g(a, 'Убил', 'Убила')} ${c.beast || 'волка'}. Шкура пойдёт в дело.`},
  {id: 'raidAlarm', mood: -0.15, lasts: 12 * HOUR, once: 12 * HOUR, text: a => `Тревога! ${g(a, 'Бросил', 'Бросила')} работу и ${g(a, 'побежал', 'побежала')} к костру.`},
  {id: 'killedRaider', mood: 0.15, lasts: DAY, text: a => `${g(a, 'Сразил', 'Сразила')} врага.`},
  // neighbours (settlement/relations.js)
  {id: 'quarrel', mood: -0.2, lasts: 12 * HOUR, text: (a, c) => `${g(a, 'Поругался', 'Поругалась')} с ${c.name}. До сих пор зло берёт.`},
  {id: 'dislikesNeighbour', mood: -0.1, lasts: DAY, once: DAY, text: (a, c) => `Терпеть не может ${c.name}, а жить приходится бок о бок.`},
  {id: 'goodCompany', mood: 0.1, lasts: DAY, once: DAY, text: (a, c) => `Рад${g(a, '', 'а')}, что рядом ${c.name}: с таким соседом легче.`},
  // doing things together (settlement/together.js)
  {id: 'escorted', mood: 0.06, lasts: 6 * HOUR, once: 6 * HOUR, text: (a, c) => `В лесу неспокойно, но ${c.name} ${g(c, 'пошёл', 'пошла')} рядом. Вдвоём не так страшно.`},
  // the alarm (settlement/board.js): a cry heard, a flag taken or left
  {id: 'heardAlarm', mood: -0.05, lasts: 6 * HOUR, once: HOUR, text: (a, c) => `${g(a, 'Услышал', 'Услышала')}, как ${c.who} кричит: ${c.what} ${c.where}.`},
  {id: 'answeredAlarm', mood: 0.05, lasts: 8 * HOUR, once: HOUR, text: (a, c) => `${g(a, 'Схватил', 'Схватила')} оружие и ${g(a, 'побежал', 'побежала')} на крик: ${c.what} ${c.where}.`},
  {id: 'ignoredAlarm', mood: 0, lasts: 6 * HOUR, once: HOUR, text: (a, c) => `Слышал${g(a, '', 'а')} тревогу (${c.what}), но не ${g(a, 'пошёл', 'пошла')}: ${c.why}.`},
  {id: 'tookWatch', mood: 0.05, lasts: 8 * HOUR, once: 12 * HOUR, text: a => `${g(a, 'Вызвался', 'Вызвалась')} дежурить ночью у огня.`},
  {id: 'watchDone', mood: 0.08, lasts: 10 * HOUR, once: 12 * HOUR, text: a => `${g(a, 'Отдежурил', 'Отдежурила')} ночь у огня. Теперь бы выспаться.`},
  {id: 'sleptOnWatch', mood: -0.2, lasts: DAY, once: 12 * HOUR, text: a => `${g(a, 'Уснул', 'Уснула')} на посту. Стыдно.`},
  {id: 'stoodUp', mood: 0.12, lasts: DAY, once: 6 * HOUR, text: (a, c) => `Когда на меня кинулись, ${c.name} ${g(c, 'встал', 'встала')} рядом. Этого не забыть.`},
  {id: 'aided', mood: 0.15, lasts: DAY, once: 12 * HOUR, text: (a, c) => `${g(a, 'Лежал', 'Лежала')} раненый в лесу, а ${c.name} ${g(c, 'пришёл и перевязал', 'пришла и перевязала')}. Есть на кого положиться.`},
  {id: 'gaveAid', mood: 0.08, lasts: 12 * HOUR, once: 12 * HOUR, text: (a, c) => `${g(a, 'Перевязал', 'Перевязала')} ${c.name} прямо в лесу и ${g(a, 'довёл', 'довела')} до своих.`},
  {id: 'gotBed', mood: 0.08, lasts: 12 * HOUR, once: 12 * HOUR, text: (a, c) => `${c.name} ${g(c, 'уступил', 'уступила')} мне койку у лекаря. Добрая душа.`},
  {id: 'yieldedBed', mood: 0.04, lasts: 12 * HOUR, once: 12 * HOUR, text: (a, c) => `${g(a, 'Уступил', 'Уступила')} койку ${c.name}: тому хуже. Долежу и так.`},
  {id: 'sharedTrouble', mood: 0.1, lasts: DAY, once: DAY, text: (a, c) => `Плечом к плечу с ${c.name} отбивались от налётчиков. Что там было между нами — уже не важно.`},
  {id: 'sober', mood: -0.12, lasts: 12 * HOUR, once: DAY, text: a => `Без браги ${g(a, 'сам', 'сама')} не ${g(a, 'свой', 'своя')}: руки не слушаются.`},
  {id: 'beerFed', mood: 0.2, lasts: 12 * HOUR, once: 12 * HOUR, text: a => `Кружка браги — и сыт${g(a, '', 'а')}, и весел${g(a, '', 'а')}. Как дома под горой.`},
  // the nechist (agents/brains/spirit.js)
  {id: 'leshyLost', mood: -0.15, lasts: 12 * HOUR, once: 6 * HOUR, text: a => `${g(a, 'Заплутал', 'Заплутала')} в трёх соснах: тропа водила по кругу. Леший шалит.`},
  {id: 'foundWay', mood: 0.05, lasts: 4 * HOUR, once: 6 * HOUR, text: a => `${g(a, 'Выбрался', 'Выбралась')} к знакомой тропе.`},
  {id: 'lured', mood: -0.3, lasts: DAY, once: 12 * HOUR, text: a => `Ночью у воды кто-то звал по имени. Ноги сами ${g(a, 'пошли', 'пошли')}…`},
  {id: 'resistedSong', mood: -0.05, lasts: 12 * HOUR, once: 12 * HOUR, text: a => `Ночью у воды кто-то звал. ${g(a, 'Не поддался', 'Не поддалась')}, но до утра не спалось.`},
  {id: 'grief', mood: -0.35, lasts: 2 * DAY, text: (a, c) => `Скорбит: ${c.name} ${c.f ? 'погибла' : 'погиб'}.`},

  // healing
  {id: 'treated', mood: 0.2, lasts: DAY, text: (a, c) => `Встал${g(a, '', 'а')} на ноги: выходил${c.name ? ' лекарь ' + c.name : 'и в хижине лекаря'}.`},
  {id: 'healedSomeone', mood: 0.18, lasts: DAY, once: 4 * HOUR, text: (a, c) => `${g(a, 'Выходил', 'Выходила')} раненого: ${c.name}.`},

  // trade
  {id: 'tradeDay', mood: 0.12, lasts: DAY, once: DAY, text: (a, c) => `${g(a, 'Был', 'Была')} на торге у купца ${c.trader}.${c.got ? ' Купили: ' + c.got + '.' : ' Купить ничего не решились.'}`},

  // herding
  {id: 'tamedBeast', mood: 0.25, lasts: DAY, text: (a, c) => `${g(a, 'Приручил', 'Приручила')} ${c.beast}. Назвали: ${c.name}.`},
  {id: 'kicked', mood: -0.15, lasts: 12 * HOUR, once: 4 * HOUR, text: a => `Дикий мул ${g(a, 'его', 'её')} лягнул. Не дался.`},

  // precious finds
  {id: 'goldStrike', mood: 0.3, lasts: 2 * DAY, text: () => 'В скалах нашли золотую жилу! Разбогатеем.'},
  {id: 'mithrilFound', mood: 0.2, lasts: DAY, text: () => 'Рудокопы достали мифрил. Говорят, купцы за него дадут целое состояние.'},

  // the dead and the shrine
  {id: 'funeral', mood: 0.08, lasts: DAY, text: (a, c) => `Похоронили: ${c.name}. Пусть земля будет пухом.`},
  {id: 'funeralRite', mood: 0.18, lasts: DAY, text: (a, c) => `Проводили ${c.name} у святилища, как положено. На душе стало легче.`},
  {id: 'unburied', mood: -0.2, lasts: DAY, once: DAY, text: () => 'Мёртвые лежат непогребённые. Нехорошо это.'},
  {id: 'prayed', mood: 0.2, lasts: DAY, once: 12 * HOUR, text: a => `${g(a, 'Помолился', 'Помолилась')} у святилища. Отпустило.`},

  // brew and gloom
  {id: 'drank', mood: 0.16, lasts: 10 * HOUR, once: 12 * HOUR, text: a => `${g(a, 'Выпил', 'Выпила')} вечером браги. Полегчало.`},
  {id: 'feast', mood: 0.3, lasts: DAY, once: 12 * HOUR, text: a => `Пировали всем поселением: брага, песни у костра.`},
  {id: 'hangover', mood: -0.1, lasts: DAY, once: DAY, text: a => `Наутро голова тяжёлая: перебрал${g(a, '', 'а')} браги.`},
  {id: 'sulking', mood: -0.05, lasts: 6 * HOUR, once: DAY, text: () => 'Всё валится из рук. Ничего не хочется.'},
  {id: 'someoneLeft', mood: -0.15, lasts: DAY, text: (a, c) => `${c.name} ${c.f ? 'ушла' : 'ушёл'} из поселения. Неужто так плохо у нас?`},

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
