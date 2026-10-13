// What a balance run measures. Each metric is sampled once a game day (and at the end).
// Add a line here and it appears in the CSV, the console summary and the report's metric picker.
//   group — for the report's picker; fmt — digits after the point; get(w) → number.
import {Registry} from '../core/registry.js';
import {RESOURCES} from './resources.js';
import {colonists, ofSpecies, foodTotal} from '../settlement/query.js';
import {moodOf} from '../agents/mind.js';
import {fishTotals} from '../world/lakes.js';
import {raidThreat, raidSize} from '../settlement/threat.js';
import {colonyReport} from '../outside/report.js';

export const METRICS = new Registry('metric');

const deaths = (w, key) => w.chronicle.deaths[key] || 0;
const allDeaths = w => Object.values(w.chronicle.deaths).reduce((s, v) => s + v, 0);
const avg = (xs, f) => (xs.length ? xs.reduce((s, x) => s + f(x), 0) / xs.length : 0);

METRICS.registerAll([
  {id: 'pop', label: 'Жители', group: 'Люди', fmt: 0, get: w => colonists(w).length},
  {id: 'arrived', label: 'Пришло переселенцев', group: 'Люди', fmt: 0, get: w => w.chronicle.people.filter(p => !p.founder).length},
  {id: 'deaths', label: 'Смертей всего', group: 'Люди', fmt: 0, get: allDeaths},
  {id: 'deathsRaid', label: 'Убиты налётчиками', group: 'Люди', fmt: 0, get: w => deaths(w, 'налётчики')},
  {id: 'deathsWolf', label: 'Убиты волками', group: 'Люди', fmt: 0, get: w => deaths(w, 'волки')},
  {id: 'deathsOther', label: 'Умерли от голода, холода, огня', group: 'Люди', fmt: 0, get: w => allDeaths(w) - deaths(w, 'налётчики') - deaths(w, 'волки')},
  {id: 'mood', label: 'Среднее настроение', group: 'Люди', fmt: 2, get: w => avg(colonists(w), a => moodOf(w, a))},
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
  {id: 'threat', label: 'Угроза налёта', group: 'Оборона', fmt: 1, get: raidThreat},
  {id: 'raidSize', label: 'Размер следующей банды', group: 'Оборона', fmt: 0, get: raidSize},
  {id: 'raids', label: 'Набегов было', group: 'Оборона', fmt: 0, get: w => w.stats.raids},
  {id: 'raidersKilled', label: 'Налётчиков убито', group: 'Оборона', fmt: 0, get: w => w.chronicle.raidersKilled},
  {id: 'hares', label: 'Зайцев на карте', group: 'Природа', fmt: 0, get: w => ofSpecies(w, 'hare').length},
  {id: 'hunted', label: 'Зайцев добыто', group: 'Природа', fmt: 0, get: w => w.stats.hunted},
  {id: 'wolves', label: 'Волков на карте', group: 'Природа', fmt: 0, get: w => ofSpecies(w, 'wolf').length},
  {id: 'wolfAttacks', label: 'Нападений волков', group: 'Природа', fmt: 0, get: w => w.stats.wolfAttacks},
  {id: 'fish', label: 'Рыбы в озёрах', group: 'Природа', fmt: 0, get: w => fishTotals(w)[0]},
  {id: 'burnt', label: 'Выгорело клеток', group: 'Природа', fmt: 0, get: w => w.stats.burntCells},
]);

export const sampleMetrics = w => Object.fromEntries(METRICS.all().map(m => [m.id, m.get(w)]));
