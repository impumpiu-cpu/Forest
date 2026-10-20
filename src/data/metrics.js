// What a balance run measures. Each metric is sampled once a game day (and at the end).
// Add a line here and it appears in the CSV, the console summary and the report's metric picker.
//   group — for the report's picker; fmt — digits after the point; get(w) → number.
import {Registry} from '../core/registry.js';
import {activeSkills} from './skills.js';
import {RESOURCES} from './resources.js';
import {colonists, ofSpecies, foodTotal} from '../settlement/query.js';
import {moodOf} from '../agents/mind.js';
import {fishTotals} from '../world/lakes.js';
import {raidThreat, raidStrength, colonyStrength} from '../settlement/threat.js';
import {colonyReport} from '../outside/report.js';
import {DAY} from '../core/time.js';
import {SPECIES} from './species.js';

export const METRICS = new Registry('metric');

const deaths = (w, key) => w.chronicle.deaths[key] || 0;
const allDeaths = w => Object.values(w.chronicle.deaths).reduce((s, v) => s + v, 0);
const RACE_IDS = () => new Set(SPECIES.filter(s => s.rel).map(s => s.id));
const share = (w, k) => (w.behave?.ticks ? w.behave[k] / w.behave.ticks * 100 : 0);
const perDay = (w, k) => (w.behave?.ticks ? w.behave[k] / (w.behave.ticks / DAY) : 0);
const outcomePerDay = (w, k) => (w.behave?.ticks ? (w.behave.outcomes?.[k] || 0) / (w.behave.ticks / DAY) : 0);
const avg = (xs, f) => (xs.length ? xs.reduce((s, x) => s + f(x), 0) / xs.length : 0);

METRICS.registerAll([
  {id: 'pop', label: 'Жители', group: 'Люди', fmt: 0, get: w => colonists(w).length},
  {id: 'arrived', label: 'Пришло переселенцев', group: 'Люди', fmt: 0, get: w => w.chronicle.people.filter(p => !p.founder).length},
  {id: 'deaths', label: 'Смертей всего', group: 'Люди', fmt: 0, get: allDeaths},
  {id: 'deathsRaid', label: 'Убиты налётчиками', group: 'Люди', fmt: 0, get: w => deaths(w, 'налётчики')},
  // the chronicle keys deaths by beasts with the beast's plural name, other causes with «от …» (settlement/chronicle.js)
  {id: 'deathsWolf', label: 'Убиты зверями и нечистью', group: 'Люди', fmt: 0, get: w => Object.entries(w.chronicle.deaths).filter(([k]) => k !== 'налётчики' && !k.startsWith('от ')).reduce((s, [, v]) => s + v, 0)},
  {id: 'deathsOther', label: 'Умерли от голода, холода, огня, яда', group: 'Люди', fmt: 0, get: w => Object.entries(w.chronicle.deaths).filter(([k]) => k.startsWith('от ')).reduce((s, [, v]) => s + v, 0)},
  {id: 'mood', label: 'Среднее настроение', group: 'Люди', fmt: 2, get: w => avg(colonists(w), a => moodOf(w, a))},
  // skills (data/skills.js): how far the best trade of each colonist has come, and how broad they are
  {id: 'skillTop', label: 'Лучший навык жителя, в среднем', group: 'Люди', fmt: 0, get: w => avg(colonists(w), a => 100 * Math.max(0, ...activeSkills().map(s => a.skill?.[s.id] || 0)))},
  {id: 'skillMean', label: 'Средний навык жителя', group: 'Люди', fmt: 0, get: w => avg(colonists(w), a => 100 * activeSkills().reduce((t, s) => t + (a.skill?.[s.id] || 0), 0) / activeSkills().length)},
  // the deadly wound (agents/wounds.js) and luck in a fight
  {id: 'fallsDown', label: 'Упали без сознания', group: 'Люди', fmt: 0, get: w => w.chronicle.falls?.down || 0},
  {id: 'fallsSaved', label: 'Спасены после падения', group: 'Люди', fmt: 0, get: w => w.chronicle.falls?.saved || 0},
  {id: 'fallsBled', label: 'Истекли кровью', group: 'Люди', fmt: 0, get: w => w.chronicle.falls?.bled || 0},
  {id: 'traumas', label: 'Неизлечимых травм', group: 'Люди', fmt: 0, get: w => w.chronicle.falls?.traumas || 0},
  {id: 'critShare', label: 'Доля критических ударов, %', group: 'Оборона', fmt: 1, get: w => (w.chronicle.combat?.hits ? 100 * w.chronicle.combat.crits / w.chronicle.combat.hits : 0)},
  {id: 'fine', label: 'Добротных вещей и лучше', group: 'Поселение', fmt: 0, get: w => Object.values(w.chronicle.fine || {}).reduce((t, n) => t + n, 0)},
  {id: 'trophies', label: 'Редких трофеев добыто', group: 'Природа', fmt: 0, get: w => w.chronicle.trophies?.got || 0},
  {id: 'trophiesSpoiled', label: 'Трофеев испорчено', group: 'Природа', fmt: 0, get: w => w.chronicle.trophies?.spoiled || 0},
  {id: 'food', label: 'Еда в запасе', group: 'Запасы', fmt: 0, get: foodTotal},
  ...RESOURCES.all().map(r => ({id: 'res_' + r.id, label: r.label, group: 'Запасы', fmt: 0, get: w => w.stock[r.id] || 0})),
  {id: 'gold', label: 'Золотых в казне', group: 'Торговля', fmt: 1, get: w => w.stock.gold || 0},
  {id: 'caravans', label: 'Караванов было', group: 'Торговля', fmt: 0, get: w => w.trade.visits},
  {id: 'tradeEarned', label: 'Выручено у торговцев', group: 'Торговля', fmt: 0, get: w => w.trade.earned},
  {id: 'tradeSpent', label: 'Потрачено у торговцев', group: 'Торговля', fmt: 0, get: w => w.trade.spent},
  {id: 'mules', label: 'Диких мулов на карте', group: 'Природа', fmt: 0, get: w => w.agents.filter(a => a.species === 'mule' && a.faction === 'wild').length},
  {id: 'buildings', label: 'Зданий построено', group: 'Поселение', fmt: 0, get: w => w.buildings.filter(b => b.done).length},
  {id: 'crafted', label: 'Вещей сделано', group: 'Поселение', fmt: 0, get: w => w.stats.crafted},
  {id: 'broken', label: 'Вещей сломано', group: 'Поселение', fmt: 0, get: w => w.stats.broken},
  {id: 'armed', label: 'Вооружённых', group: 'Оборона', fmt: 0, get: w => colonyReport(w).armed},
  {id: 'armour', label: 'Сумма брони', group: 'Оборона', fmt: 2, get: w => colonyReport(w).armour},
  {id: 'threat', label: 'Уровень угрозы', group: 'Оборона', fmt: 1, get: raidThreat},
  {id: 'raidKs', label: 'Угроза: КС следующей банды', group: 'Оборона', fmt: 0, get: raidStrength},
  {id: 'colonyKs', label: 'КС колонии по слухам', group: 'Оборона', fmt: 0, get: colonyStrength},
  {id: 'raids', label: 'Набегов было', group: 'Оборона', fmt: 0, get: w => w.stats.raids},
  {id: 'raidersKilled', label: 'Налётчиков убито', group: 'Оборона', fmt: 0, get: w => w.chronicle.raidersKilled},
  {id: 'hares', label: 'Зайцев на карте', group: 'Природа', fmt: 0, get: w => ofSpecies(w, 'hare').length},
  {id: 'hunted', label: 'Зайцев добыто', group: 'Природа', fmt: 0, get: w => w.stats.hunted},
  {id: 'wolves', label: 'Волков на карте', group: 'Природа', fmt: 0, get: w => ofSpecies(w, 'wolf').length},
  {id: 'wolfAttacks', label: 'Нападений волков', group: 'Природа', fmt: 0, get: w => w.stats.wolfAttacks},
  {id: 'fish', label: 'Рыбы в озёрах', group: 'Природа', fmt: 0, get: w => fishTotals(w)[0]},
  {id: 'burnt', label: 'Выгорело клеток', group: 'Природа', fmt: 0, get: w => w.stats.burntCells},
  // how creatures behave (settlement/behaviour.js): rates per colonist and day, shares of colonist time
  {id: 'invalid', label: 'Недопустимых состояний (должно быть 0)', group: 'Поведение', fmt: 0, get: w => w.behave?.invalid || 0},
  {id: 'idle', label: 'Простой, % времени', group: 'Поведение', fmt: 1, get: w => share(w, 'idle')},
  {id: 'crowd', label: 'Толпа: доля работающих на самом людном деле, %', group: 'Поведение', fmt: 0, get: w => (w.behave.crowdTicks ? 100 * w.behave.crowd / w.behave.crowdTicks : 0)},
  {id: 'fireless', label: 'Ночь без огня (нет дров), % ночных тиков', group: 'Поведение', fmt: 1, get: w => (w.behave.nightTicks ? 100 * w.behave.fireless / w.behave.nightTicks : 0)},
  {id: 'muster', label: 'В тревоге у костра, % времени', group: 'Поведение', fmt: 1, get: w => share(w, 'muster')},
  {id: 'switches', label: 'Смен дела на человека в день', group: 'Поведение', fmt: 1, get: w => perDay(w, 'switches')},
  {id: 'stops', label: 'Брошено дел на человека в день', group: 'Поведение', fmt: 2, get: w => perDay(w, 'stops')},
  // how jobs end (agents/lifecycle.js): the share carried through, and the others per colonist and day
  // jobs are cycles (chop, carry home, chop again) that mostly end by a need or the council taking over:
  // «interrupted» is normal; what matters is the share that ended in a refusal (blocked or impossible)
  {id: 'jobsFailed', label: 'Поручений сорвано (заблокировано или невозможно), %', group: 'Поведение', fmt: 1, get: w => { const o = w.behave?.outcomes || {}, n = Object.values(o).reduce((s, v) => s + v, 0); return n ? ((o.blocked || 0) + (o.impossible || 0)) / n * 100 : 0; }},
  {id: 'jobsDone', label: 'Поручений доведено до конца, на человека в день', group: 'Поведение', fmt: 2, get: w => outcomePerDay(w, 'done')},
  {id: 'jobsBlocked', label: 'Поручений заблокировано, на человека в день', group: 'Поведение', fmt: 2, get: w => outcomePerDay(w, 'blocked')},
  {id: 'jobsImpossible', label: 'Поручений невозможно, на человека в день', group: 'Поведение', fmt: 2, get: w => outcomePerDay(w, 'impossible')},
  {id: 'jobsInterrupted', label: 'Поручений прервано, на человека в день', group: 'Поведение', fmt: 2, get: w => outcomePerDay(w, 'interrupted')},
  {id: 'noPath', label: 'Отказов «пути нет» всего', group: 'Поведение', fmt: 0, get: w => w.behave?.noPath || 0},
  {id: 'noPathColony', label: 'Отказов «пути нет» у поселенцев', group: 'Поведение', fmt: 0, get: w => Object.entries(w.behave?.noPathBy || {}).filter(([k]) => RACE_IDS().has(k.split(':')[0])).reduce((s, [, v]) => s + v, 0)},
  {id: 'react', label: 'Реакция на нападение, тиков', group: 'Поведение', fmt: 1, get: w => (w.behave?.react.n ? w.behave.react.sum / w.behave.react.n : 0)},
  {id: 'reactMissed', label: 'Нападений без ответа', group: 'Поведение', fmt: 0, get: w => w.behave?.react.missed || 0},
  // the colony's board (settlement/board.js): threats spotted, cries, who answered
  {id: 'alarms', label: 'Тревог поднято (угроз на доске)', group: 'Поведение', fmt: 0, get: w => w.behave?.board?.flags || 0},
  {id: 'alarmResponders', label: 'Откликнулось на тревогу, человек в среднем', group: 'Поведение', fmt: 1, get: w => (w.behave?.board?.closed ? w.behave.board.responders / w.behave.board.closed : 0)},
  {id: 'alarmUnanswered', label: 'Тревог без отклика', group: 'Поведение', fmt: 0, get: w => w.behave?.board?.unanswered || 0},
  {id: 'alarmIgnored', label: 'Слышали тревогу и не пошли (раз)', group: 'Поведение', fmt: 0, get: w => w.behave?.board?.ignored || 0},
  {id: 'alarmHeardAsleep', label: 'Спящих разбудил крик', group: 'Поведение', fmt: 0, get: w => w.behave?.board?.heardAsleep || 0},
  // raider bands (agents/squad.js): how their visits ended
  {id: 'squads', label: 'Отрядов налётчиков пришло', group: 'Поведение', fmt: 0, get: w => w.behave?.squads?.started || 0},
  {id: 'squadsGoal', label: 'Отрядов ушло, добившись цели', group: 'Поведение', fmt: 0, get: w => w.behave?.squads?.goal || 0},
  {id: 'squadsRetreat', label: 'Отрядов отступило (сломлен дух)', group: 'Поведение', fmt: 0, get: w => w.behave?.squads?.retreat || 0},
  {id: 'squadsWiped', label: 'Отрядов разбито наголову', group: 'Поведение', fmt: 0, get: w => w.behave?.squads?.wiped || 0},
  // pack hunts and carcasses (agents/carcass.js)
  {id: 'packHunts', label: 'Охот стаей за день', group: 'Поведение', fmt: 2, get: w => (w.behave?.ticks ? (w.behave.hunts?.started || 0) / (w.behave.ticks / DAY / Math.max(1, colonists(w).length)) : 0)},
  {id: 'packHuntKill', label: 'Охот стаей удачных, %', group: 'Поведение', fmt: 0, get: w => { const h = w.behave?.hunts || {}, n = Object.entries(h).filter(([k]) => !['started', 'upyr'].includes(k)).reduce((s, [, v]) => s + v, 0); return n ? (h.kill || 0) / n * 100 : 0; }},
  {id: 'carcasses', label: 'Туш на земле', group: 'Поведение', fmt: 0, get: w => (w.carcasses || []).length},
  {id: 'carcassUpyrs', label: 'Упырей поднялось из туш', group: 'Поведение', fmt: 0, get: w => w.behave?.hunts?.upyr || 0},
  // doing things together (settlement/together.js)
  {id: 'company', label: 'Сопровождают в лесу, % времени', group: 'Поведение', fmt: 1, get: w => share(w, 'company')},
  {id: 'escorts', label: 'Сопровождений на человека в день', group: 'Поведение', fmt: 2, get: w => (w.behave?.ticks ? (w.behave.social?.escort || 0) / (w.behave.ticks / DAY) : 0)},
  {id: 'aids', label: 'Раненых перевязано в лесу', group: 'Поведение', fmt: 0, get: w => w.behave?.social?.aid || 0},
  {id: 'yields', label: 'Коек уступлено', group: 'Поведение', fmt: 0, get: w => w.behave?.social?.yield || 0},
  {id: 'calmed', label: 'Ссор отложено из-за опасности', group: 'Поведение', fmt: 0, get: w => w.behave?.social?.calm || 0},
  {id: 'mended', label: 'Обид забыто после общей беды', group: 'Поведение', fmt: 0, get: w => w.behave?.social?.bond || 0},
]);

export const sampleMetrics = w => Object.fromEntries(METRICS.all().map(m => [m.id, m.get(w)]));
