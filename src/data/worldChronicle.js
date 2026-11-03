// The world's chronicle as a text by its eras (atlas/chronicle.js; docs/WORLD.md): how
// important each line is, so that a reader can take the whole of it or only what matters.
//   major  — what shapes the world: the eras, the calamities, wars and peace, realms rising and falling, towns burnt,
//            the peoples' coming, the dragon, the caravans of the campaign
//   normal — what a careful chronicler would keep: raids that struck, lairs cleared, towns founded and grown, alliances
//            of trade, hard years
//   minor  — the everyday: raids set out and beaten, broods, lairs growing old, roads, plague among beasts, rats
// A line is tested against the rules in order; the first that matches gives its level; none — `normal`. The lines of the
// calamities (topic 'calamity') and of the campaign (campaign: true) are `major` by their mark, before any rule; the
// lines of the making of the land (stage) — too.
export const LEVELS = [
  {id: 'major', label: 'важное'},
  {id: 'normal', label: 'обычное'},
  {id: 'minor', label: 'мелкое'},
];

import {TIERS, CAPITAL} from './peoples.js';
import {onEdit} from './schema/layer.js';

// a band set out on a town: «… на <the town's word in the accusative>» — every people's word of every step and of the
// crowned seat (data/peoples.js TIERS, CAPITAL `label`), made again after an edit of the tables
let marchKept = null;
onEdit(() => { marchKept = null; });
const marchRe = () => marchKept || (marchKept = new RegExp(`двинулись на|^[^:]* на (${[...new Set([...TIERS, CAPITAL].flatMap(T => Object.values(T.label).map(l => l[1])))].join('|')}) `));

export const LEVEL_RULES = [
  // major
  {level: 'major', re: /^Началась /},
  {level: 'major', re: /началась война|заключили мир|не поделили/},
  {level: 'major', re: /Раскол|объявил[аои]? себя|сгинула вместе со своей столицей|Столица державы .* перенесена/},
  {level: 'major', re: /взяло штурмом и сожгло|осталось пепелище/},
  {level: 'major', re: /и заложили .*Так начала|не нашли в этом мире земли/},
  {level: 'major', re: /^Дракон .*(проснулся|выжег)|отогнали дракона/},
  {level: 'major', re: /впервые встретились/},
  {level: 'major', re: /Курганы незапамятных времён/},
  // minor
  {level: 'minor', re: /^Молодые /},
  {level: 'minor', re: /стоит уже \d+ лет|стоят уже \d+ лет/},
  {level: 'minor', re: /^Мор/},
  {level: 'minor', re: /^Крысы/},
  {level: 'minor', re: /отбили набег|^За год отбито/},
  {level: 'minor', re: /схватились .* и отогнали/},
  {level: 'minor', re: /^Протоптали дорог|проложили морской путь/},
  {level: 'minor', re: /осели .*: каждый десятый/},
  {level: 'minor', get re() { return marchRe(); }},   // (a band set out on a town: its words from data/peoples.js)
  {level: 'minor', re: /появил(ся|ась|ось|ись) [^:]*\.$/},
  {level: 'minor', re: /живёт привозным хлебом/},
  {level: 'minor', re: /^(Год изобилия|Тяжёлые годы)/},
  {level: 'minor', re: /^На курганах /},
  // the leaders of the old lairs (atlas/leaders.js): setting out is minor; what they do, the rest
  {level: 'minor', re: /(выступил (в набег|подчинять соседей|войной на соперников)|вышел с выводком искать новое логово)/},
  {level: 'minor', re: /платят ему данью|отбились от (главаря|вожака|владыки|князя)/},
  {level: 'minor', re: /встало у «.*»: ждёт войска союзников|осадило /},
];
