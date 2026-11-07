// The catalogue of commands (docs/BEHAVIOUR.md «Договор решения»): every thing a mind of the game may choose, under one
// full id, with the decision point it is asked at. The old registries stay the source of their rows — the behaviours of
// the local map (data/behaviours.js) and the deeds of the world (data/deeds.js) come in through adapters, under
// `local.behaviour.<id>` and `world.deed.<id>` (the two `raid`s are two commands); the towns' and the caravan's commands,
// which had no catalogue, are rows here. Tables «Команды», «Точки решения», «Метки команд», «Профили команд».
//
//   POINTS    a decision point: who decides (`level`), how often (`clock`), how it picks (`policy`: max — the highest
//             score, draw — by weight, first — the first in the old order that offers anything, vote — the council's
//             vote, voices — each with a say scores the options, drawn from by the mean (campaign/council.js), rule — a rule that may only be allowed or not), where the code is (`code`)
//   COMMANDS  a command: its point, its lane (`band`), its marks, the source row (`src`)
//   MARKS     what a command leads to, for the profiles: hostile — it starts a hostility (a raid, a war, a lair burnt,
//             a fallen foe bound), trade — it is a trade, side — a side pursuit of the caravan (wheels, beasts, ore),
//             must — the body's own or an obligation (lying downed, fleeing fire, the body's needs, being led bound):
//             never off, whatever the profile
//   PROFILES  which commands a run allows: by marks (`offMarks`) and by ids (`off`); a run names its profile in its
//             settings (`cfg.profile`: the settlement's, the world's — the campaign goes by its world's)
//
// What «off» means (docs/BEHAVIOUR.md «Что значит выключить»): a command off is not asked for a new choice. A task it
// began goes on while the command would keep it (the local map: the command is asked, and only the task under way is
// taken from what it offers); a party it sent out comes home by its own rules. What a behaviour does every tick whatever
// the task (`always`: an aura, the gear swap, the delivery of a load) is no choice and is not off. When nothing is left
// to choose, the mind does what it does when nothing is on offer: the task under way goes on, or it waits.
import {Registry} from '../core/registry.js';
import {BEHAVIOURS} from './behaviours.js';
import {DEEDS} from './deeds.js';

export const POLICIES = {max: 'наибольшая оценка', draw: 'жребий по весу', first: 'первое по прежнему порядку', vote: 'голосование', voices: 'голоса: жребий по среднему', rule: 'правило'};
export const LEVELS = {local: 'пешка и существо', world: 'держава и логово', settlement: 'поселение', town: 'город', caravan: 'караван'};

export const POINTS = new Registry('decision point');
POINTS.registerAll([
  {id: 'local.task', level: 'local', label: 'задача существа', clock: 'тик; полный выбор по сердцебиению или событию', policy: 'max', code: 'agents/brains/tabled.js'},
  {id: 'world.deed', level: 'world', label: 'дело субъекта мира', clock: 'сезон (главарь — весна)', policy: 'draw', code: 'atlas/actor.js'},
  {id: 'settlement.council', level: 'settlement', label: 'постройка совета', clock: 'вечер', policy: 'vote', code: 'settlement/council.js'},
  // the colony's board (settlement/board.js): it knows and announces, the colonists choose (local.behaviour.flags, watch, muster, work)
  {id: 'settlement.board', level: 'settlement', label: 'флаг тревоги', clock: 'тик', policy: 'rule', code: 'settlement/board.js stepBoard'},
  {id: 'settlement.watch', level: 'settlement', label: 'место ночного дозора', clock: 'вечер', policy: 'rule', code: 'settlement/board.js stepWatch'},
  {id: 'settlement.plan', level: 'settlement', label: 'места на работах', clock: 'утро и по событию', policy: 'rule', code: 'settlement/plan.js makePlan'},
  {id: 'camp.alarm', level: 'settlement', label: 'тревога лагеря похода', clock: 'тик', policy: 'rule', code: 'campaign/camp.js raiseAlarm'},
  {id: 'town.project', level: 'town', label: 'новый проект', clock: 'сезон', policy: 'max', code: 'atlas/towns.js chooseBuilding'},
  {id: 'town.raze', level: 'town', label: 'освободить место', clock: 'сезон', policy: 'rule', code: 'atlas/build.js'},
  {id: 'town.buy', level: 'town', label: 'закупки мастерских', clock: 'сезон', policy: 'rule', code: 'atlas/treasury.js worksBuying'},
  {id: 'town.settle', level: 'town', label: 'поселенцы', clock: 'год', policy: 'rule', code: 'atlas/peoples.js sendSettlers'},
  {id: 'town.need', level: 'town', label: 'ответ на нужду', clock: 'сезон', policy: 'max', code: 'atlas/townNeeds.js stepNeeds'},
  {id: 'caravan.visit', level: 'caravan', label: 'свернуть в город', clock: 'вечер', policy: 'voices', code: 'campaign/visit.js wantVisit, campaign/council.js'},
  {id: 'caravan.camp', level: 'caravan', label: 'встать лагерем', clock: 'вечер', policy: 'voices', code: 'campaign/march.js evening, campaign/council.js'},
  {id: 'caravan.watch', level: 'caravan', label: 'подмена в дозоре', clock: 'вечер', policy: 'rule', code: 'campaign/duty.js nightWatch'},
  {id: 'caravan.quest', level: 'caravan', label: 'куда идти по квесту', clock: 'вечер', policy: 'first', code: 'campaign/quest.js questTarget'},
  {id: 'caravan.pace', level: 'caravan', label: 'темп', clock: 'день', policy: 'rule', code: 'campaign/road.js choosePace'},
  {id: 'caravan.buy', level: 'caravan', label: 'что купить в городе', clock: 'в городе', policy: 'rule', code: 'campaign/town.js wants'},
]);

// the commands of the minds that had no catalogue; the order within a point is the order the old code asked them in
const OWN = [
  {id: 'settlement.council.build', point: 'settlement.council', label: 'заложить постройку', note: 'каждый голосует за постройку с наибольшим мотивом; большинство, иначе второй тур'},
  {id: 'settlement.board.raise', point: 'settlement.board', label: 'поднять флаг', note: 'дозорный увидел врага: флаг, крик по цепочке, вес — срочность × доля угрозы, которую никто не закрыл (красный — всегда полный)'},
  {id: 'settlement.watch.post', point: 'settlement.watch', label: 'выставить дозор', note: 'вечером одно место у огня; кто встанет — решает сам'},
  {id: 'settlement.plan.places', point: 'settlement.plan', label: 'раздать места', note: 'места на работах по нуждам поселения; пешки записываются сами'},
  {id: 'camp.alarm.raise', point: 'camp.alarm', label: 'поднять лагерь', note: 'кто-то не спит и видит врага или по нашим ударили: будят всех, дружина бьёт'},
  {id: 'town.project.build', point: 'town.project', label: 'построить', note: 'по варианту на постройку: нужды × вкус народа + потоки, × тяга роли, × шум; ниже порога — ничего'},
  {id: 'town.raze.idle', point: 'town.raze', label: 'снести простаивающее', note: 'работа, что два года шла хуже четверти, при полных местах'},
  {id: 'town.raze.worst', point: 'town.raze', label: 'снести худшее', note: 'строить нечего, места полны: худшая работа ниже половины'},
  {id: 'town.buy.works', point: 'town.buy', label: 'купить для мастерских', note: 'нехватку мастерских — у городов по связям'},
  {id: 'town.settle.send', point: 'town.settle', label: 'послать поселенцев', note: 'людный город шлёт поселенцев на новое место'},
  // the councils' answers to their needs (atlas/townNeeds.js; data/townNeeds.js): each a plan for a point already there
  {id: 'town.need.build', point: 'town.need', label: 'цель стройки', note: 'жильё тесному городу, рудник или сталеварня — металлу державы: строится раньше выбора совета'},
  {id: 'town.need.settle', point: 'town.need', label: 'выслать поселенцев', note: 'тесный город шлёт поселенцев, не дожидаясь своего жребия'},
  {id: 'town.need.budget', point: 'town.need', label: 'казна на привоз', note: 'держава даёт мастерам города золото на металл, которого им не хватило из-за денег'},
  // the caravan's council (policy draw, as a realm's court): the first lane with anything on offer, a draw by weight in it —
  // data/campaign.js COUNCIL.want, × the caravan's mission (COUNCIL.mission); the order is the old one
  {id: 'caravan.visit.winter', point: 'caravan.visit', band: 'yellow', label: 'перезимовать', note: 'тощее время года и мороз: в город на зимовку'},
  {id: 'caravan.visit.food', point: 'caravan.visit', band: 'yellow', label: 'купить еды', note: 'еды меньше, чем на дни пути'},
  {id: 'caravan.visit.heal', point: 'caravan.visit', band: 'yellow', label: 'подлечить раненых', note: 'кто-то из свободных тяжело ранен'},
  {id: 'caravan.visit.smith', point: 'caravan.visit', label: 'отдать руду кузнецу', note: 'руды на вещь лучше своего металла и золото на работу'},
  {id: 'caravan.visit.shop', point: 'caravan.visit', label: 'потратить казну', note: 'казна полна и давно не были в городе'},
  {id: 'caravan.camp.food', point: 'caravan.camp', band: 'yellow', label: 'стоянка: охота и сбор', note: 'еда на исходе, земля кормит; в опасном месте не встают, если не голодны'},
  {id: 'caravan.camp.heal', point: 'caravan.camp', band: 'yellow', label: 'стоянка: отлежаться', note: 'раненые еле идут; в опасном месте не встают, если не голодны'},
  {id: 'caravan.camp.build', point: 'caravan.camp', label: 'стоянка: тележка, повозка, постройка', note: 'сыты, целы, тихо: колёса, если пригодятся в пути, иначе постройка лагеря'},
  {id: 'caravan.camp.tame', point: 'caravan.camp', label: 'стоянка: приручить', note: 'сыты, целы, тихо: здесь пасутся звери, которых не хватает'},
  {id: 'caravan.camp.mine', point: 'caravan.camp', label: 'стоянка: добыча', note: 'сыты, целы, тихо: здесь выходит руда, за которой стоит встать'},
  {id: 'caravan.watch.ask', point: 'caravan.watch', label: 'попросить подмену', note: 'уставший в дозоре просит заметно менее уставшего: кого — по связи, отдыху и его слову'},
  {id: 'caravan.watch.answer', point: 'caravan.watch', label: 'ответить на просьбу', note: 'тот, кого просят, отвечает своими правилами: да, «позже», нет'},
  {id: 'caravan.camp.goOn', point: 'caravan.camp', label: 'не вставать', note: 'когда стоянка хочется, но не нужна: идти дальше — соперник промыслов в жребии'},
  // the quest's way (policy first: the order is the search's own — the crown carried home before all, a place seen before an area)
  {id: 'caravan.quest.home', point: 'caravan.quest', label: 'домой с короной', note: 'корона у каравана: в столицу'},
  {id: 'caravan.quest.crown', point: 'caravan.quest', label: 'к короне', note: 'место короны известно или видено'},
  {id: 'caravan.quest.clue', point: 'caravan.quest', label: 'к ближнему видимому следу', note: 'след, чьё место видели'},
  {id: 'caravan.quest.search', point: 'caravan.quest', label: 'обыскать круг', note: 'известен только круг, где искать: клетка за клеткой'},
  {id: 'caravan.quest.back', point: 'caravan.quest', label: 'вернуться к оставленному', note: 'всё известное оставлено на время: к тому, что оставлено раньше всех'},
  // the pace (a rule: data/road.js PACE_RULES says which pace each keeps)
  {id: 'caravan.pace.pursued', point: 'caravan.pace', label: 'темп под погоней', note: 'за караваном идут по следу короны'},
  {id: 'caravan.pace.danger', point: 'caravan.pace', label: 'темп в опасных местах', note: 'опасность вокруг выше dangerAt'},
  // the shopping list in a town (a rule: by data/market.js BUY_ORDER, the lower first, while the gold beyond the food lasts)
  {id: 'caravan.buy.tool', point: 'caravan.buy', label: 'железный инструмент', note: 'пока инструмент хуже железного'},
  {id: 'caravan.buy.pack', point: 'caravan.buy', label: 'вьючный зверь', note: 'меньше двух одного вида'},
  {id: 'caravan.buy.pots', point: 'caravan.buy', label: 'горшки для лекаря', note: 'есть хижина лекаря, горшков мало'},
  {id: 'caravan.buy.herd', point: 'caravan.buy', label: 'стадо', note: 'молоко и мясо в пути, до предела стада'},
  {id: 'caravan.buy.cart', point: 'caravan.buy', label: 'тележка', note: 'колёс нет, а дорогой к цели идти можно'},
  {id: 'caravan.buy.mount', point: 'caravan.buy', label: 'верховой зверь', note: 'ездовых меньше, чем свободных'},
  {id: 'caravan.buy.golem', point: 'caravan.buy', label: 'голем', note: 'страж каравана, до предела'},
  {id: 'caravan.buy.wagon', point: 'caravan.buy', label: 'повозка', note: 'есть тягловый зверь и дорогой к цели идти можно'},
  {id: 'caravan.buy.building', point: 'caravan.buy', label: 'постройка лагеря', note: 'какой ещё нет'},
  {id: 'caravan.buy.armor', point: 'caravan.buy', label: 'доспех', note: 'лучше, чем у кого-то в строю'},
  {id: 'caravan.buy.weapon', point: 'caravan.buy', label: 'оружие', note: 'бьёт сильнее, чем у кого-то из бойцов'},
  {id: 'caravan.buy.potion', point: 'caravan.buy', label: 'зелья', note: 'в пояса, домой и лечебные в пустые места'},
  {id: 'caravan.buy.bonds', point: 'caravan.buy', label: 'путы для пленных', note: 'последними'},
];

// the marks (see above), by full id
export const MARKS = {
  hostile: ['local.behaviour.maul', 'local.behaviour.raid', 'local.behaviour.capture', 'local.behaviour.bind',
    'world.deed.raid', 'world.deed.captives', 'world.deed.subdue', 'world.deed.rival', 'world.deed.strike',
    'world.deed.warOn', 'world.deed.march', 'world.deed.raidTown', 'world.deed.clearLair', 'world.deed.liberate'],
  trade: ['local.behaviour.trade', 'local.behaviour.peddle', 'town.buy.works', 'town.need.budget', 'caravan.visit.smith', 'caravan.visit.shop',
    'caravan.buy.tool', 'caravan.buy.pack', 'caravan.buy.pots', 'caravan.buy.herd', 'caravan.buy.cart', 'caravan.buy.mount', 'caravan.buy.golem',
    'caravan.buy.wagon', 'caravan.buy.building', 'caravan.buy.armor', 'caravan.buy.weapon', 'caravan.buy.potion', 'caravan.buy.bonds'],
  side: ['caravan.camp.build', 'caravan.camp.tame', 'caravan.camp.mine'],
  must: ['settlement.plan.places', 'caravan.quest.home', 'local.behaviour.downed', 'local.behaviour.fleeFire', 'local.behaviour.needs', 'local.behaviour.led', 'local.behaviour.keepIn', 'local.behaviour.penned'],
};
export const MARK_LABELS = {hostile: 'вражда', trade: 'торг', side: 'побочный промысел', must: 'обязательна'};

export const PROFILES = new Registry('command profile');
PROFILES.registerAll([
  {id: 'full', label: 'всё как было', offMarks: [], off: [], note: 'все команды; эталон для сравнения'},
  {id: 'noHostile', label: 'без исходящей агрессии', offMarks: ['hostile'], off: [],
    note: 'никто не начинает враждебного: набегов, войн, походов, выжигания логов, захвата пленных; мир, оборона и отпор остаются. Вне каталога и не выключаются: драка логов, чьи владения соприкасаются (atlas/lairs.js), и война после раскола державы (atlas/realms.js)'},
  {id: 'noSide', label: 'без побочных промыслов', offMarks: ['side'], off: [], note: 'караван ходит по городам и живёт стоянками, но не строит колёс, не приручает и не добывает'},
  {id: 'isolation', label: 'без торговли', offMarks: ['trade'], off: [], note: 'ни купцов, ни закупок мастерских, ни лавок, кузнецов и покупок каравана; еду караван покупает (это не список покупок), голодного город кормит'},
  {id: 'noLeans', label: 'без влияния склонностей', offMarks: [], off: [], leans: false,
    note: 'все команды, но склонности не влияют на выбор: у пешек их добавка ноль, профиль миссии каравана нейтрален; храбрость, мировоззрение и предпочтения работ — как были'},
]);
// do the leanings weigh in a run (data/leans.js; the caravan's mission, data/campaign.js COUNCIL.mission): no — for a profile with leans: false
export const leansOn = cfg => !(cfg?.profile && PROFILES.has(cfg.profile) && PROFILES.get(cfg.profile).leans === false);

// ── the catalogue: the old registries through their adapters, then the rows above; built once, again after an edit
let built = null, era = 0;
const markOf = id => Object.keys(MARKS).filter(m => MARKS[m].includes(id));
function build() {
  const rows = [];
  for (const d of BEHAVIOURS.all()) rows.push({id: `local.behaviour.${d.id}`, point: 'local.task', src: d.id, label: typeof d.label === 'function' ? d.label({}) : d.id, band: d.band, note: d.note || ''});
  for (const d of DEEDS.all()) rows.push({id: `world.deed.${d.id}`, point: 'world.deed', src: d.id, label: d.label, band: d.band, note: d.note || ''});
  for (const c of OWN) rows.push({band: 'routine', src: c.id, ...c});
  // (a plain catalogue, not a Registry: a Registry is kept for the saves' references, and this one is rebuilt)
  const list = Object.freeze(rows.map(r => Object.freeze({...r, marks: markOf(r.id), must: MARKS.must.includes(r.id)}))), by = new Map(list.map(c => [c.id, c]));
  if (by.size !== list.length) throw new Error('команды: повтор полного id');
  return {all: () => list, has: id => by.has(id), get: id => by.get(id), filter: fn => list.filter(fn)};
}
export const commands = () => (built ||= build());
export const commandOf = id => commands().has(id) ? commands().get(id) : null;
export const localId = id => `local.behaviour.${id}`;
export const deedId = id => `world.deed.${id}`;
export const pointCommands = point => commands().filter(c => c.point === point);

// ── the profile of a run: the set of the full ids it switches off (never a `must` one), or null for none. Cached by the
// profile's id; an edit of a table here starts the cache anew (resetCommands)
const masks = new Map();
export function maskOf(cfg) {
  const id = cfg?.profile;
  if (!id || id === 'full') return null;
  let m = masks.get(id);
  if (m === undefined) {
    if (!PROFILES.has(id)) throw new Error(`профиль команд «${id}» не найден (таблица «Профили команд»)`);
    const P = PROFILES.get(id), off = new Set();
    for (const c of commands().all()) if (!c.must && (P.off.includes(c.id) || c.marks.some(k => P.offMarks.includes(k)))) off.add(c.id);
    m = off.size ? off : null;
    masks.set(id, m);
  }
  return m;
}
// is a command allowed in a run (by its full id)
export const allowed = (cfg, id) => { const m = maskOf(cfg); return !m || !m.has(id); };
// after an edit of the marks, the profiles or the registries the catalogue reads
export function resetCommands() { built = null; masks.clear(); era++; }
export const commandsEra = () => era;
// what is wrong with the catalogue: a mark or a profile naming a command that is not there, a must command a profile
// names by id (it stays on), a point with no commands
export function commandErrors() {
  const C = commands(), bad = [];
  for (const [m, ids] of Object.entries(MARKS)) for (const id of ids) if (!C.has(id)) bad.push(`метка ${m}: нет команды ${id}`);
  for (const P of PROFILES.all()) {
    for (const id of P.off) if (!C.has(id)) bad.push(`профиль ${P.id}: нет команды ${id}`); else if (C.get(id).must) bad.push(`профиль ${P.id}: ${id} обязательна, не выключается`);
    for (const k of P.offMarks) if (!MARKS[k]) bad.push(`профиль ${P.id}: нет метки ${k}`);
    if (P.offMarks.includes('must')) bad.push(`профиль ${P.id}: обязательные команды не выключаются`);
  }
  for (const p of POINTS.all()) if (!C.all().some(c => c.point === p.id)) bad.push(`точка ${p.id}: нет команд`);
  for (const c of C.all()) if (!POINTS.has(c.point)) bad.push(`команда ${c.id}: нет точки ${c.point}`);
  return bad;
}
