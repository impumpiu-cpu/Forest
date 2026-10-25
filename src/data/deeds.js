// The deeds of the world map (docs/WORLD.md «Нравы: дела логов и держав»): what a lair, its leader or a realm may set
// out to do, the way data/behaviours.js lists what a creature may do on the local map. A deed is a row here and a module
// in atlas/deeds/<id>.js: `want(a, actor, ctx)` offers plans with weights, and the party that carries the plan out is
// handled by the deed itself (`arrive`, `home`) through atlas/parties.js. The actor's brain (atlas/actor.js actorStep)
// goes lane by lane as the creature's does (reflex > red > yellow > routine): the first lane with anything on offer is
// weighed — the world's deeds are drawn by weight, not taken by the highest (a lair is many wills, not one), so the
// chronicle keeps its variety; a party already out is the actor's task: the queue waits for it to come home, an upper lane
// may call it back (atlas/parties.js goHome).
//
// Which deeds a species' lairs and realms may do is in its row (`deeds: {lair: [...], realm: [...]}` — the species'
// mores, beside its `behaviours`): the goblins raid for captives, the giants take tribute, the elves neither raid nor
// besiege. The ready lists are DEED_WAYS below.
//   id, label:  the deed and what the chronicle calls the party («выступил в набег»)
//   band:       the lane
//   party:      the kind of party it sends (atlas/parties.js BEHAVIOURS; by role, when the roles send different ones),
//               or null for a deed done on the spot
//   requires:   fields of the species row the deed reads
import {Registry} from '../core/registry.js';

export const DEED_BANDS = ['reflex', 'red', 'yellow', 'routine'];
export const DEED_BAND_LABELS = {reflex: 'рефлекс', red: 'красная', yellow: 'жёлтая', routine: 'очередь дел'};

export const DEEDS = new Registry('deed');
DEEDS.registerAll([
  // ── the leader's plans (atlas/leaders.js; the numbers: data/lairs.js LEADER.plans)
  // ── the lair's and its leader's (atlas/lairs.js, atlas/leaders.js; the numbers: data/lairs.js TRIBE_RAID, LAIR_LIFE, LEADER)
  {id: 'raid', label: 'выступил в набег', band: 'routine', party: 'leader | raid', requires: [],
    note: 'набег на ближайший город в досягаемости народа, которого раса не любит (мёртвые, демоны и звери — любой). Логово без главаря: осенью, с шансом TRIBE_RAID.chance, если сильно; звери без вожака на города не ходят; сильный набег идёт отрядом, слабый решается на месте. Главарь: отряд под его началом, добыча кормит логово, разбитый набег может стоить ему жизни; вожак зверей ходит на города реже (LEADER.beastRaid)'},
  {id: 'expand', label: 'вышел с выводком искать новое логово', band: 'routine', party: 'leader | brood', requires: [],
    note: 'выводок из сильного логова основывает новое. Без главаря: весной, с шансом рода (breed), пока своих меньше max × crowdMax; главарь ведёт выводок сам, и дочернее логово — его данник'},
  {id: 'subdue', label: 'выступил подчинять соседей', band: 'routine', party: 'leader', requires: [],
    note: 'главарь: слабейшего соседа без главаря и господина — под руку: данник каждый год отдаёт долю силы'},
  {id: 'rival', label: 'выступил войной на соперников', band: 'routine', party: 'leader', requires: [],
    note: 'главарь: война на логово-соперника (rivals рода логова): побеждённый слабеет или гибнет. (Драка соперников, чьи владения соприкасаются, — система логов, не дело: atlas/lairs.js)'},
  {id: 'strike', label: 'вылетел жечь', band: 'routine', party: 'dragon', requires: [],
    note: 'дракон: спит годами (DRAGON.sleep), летом летит на самый богатый город в досягаемости, жжёт угодья и жителей, если город его не отогнал, и летит домой спать'},
  {id: 'captives', label: 'пошёл за пленными', band: 'routine', party: 'raid | null', requires: [],
    note: 'набег за пленными (CAPTIVE_RAID): логово разумных — как набег, но город теряет жителей в полон, а не в могилы, и они живут при логове (lair.captives; караван, разбивший его людей, освобождает их); держава (орки) — набег города с воинами, пленные растят город'},
  // ── the realm's (atlas/court.js; the relations' body: atlas/diplomacy.js; the numbers: data/diplomacy.js DIPLOMACY, data/parties.js ARMY, data/peoples.js TOWN_WAR)
  {id: 'makePeace', label: 'заключила мир', band: 'red', party: null, requires: [],
    note: 'держава, уставшая от войны (отношение поднялось до peaceAt) или воюющая дольше longest лет, заключает мир прежде всех прочих дел; войска в пути поворачивают домой'},
  {id: 'warOn', label: 'объявила войну', band: 'routine', party: null, requires: [],
    note: 'отношение с соседом упало до warAt при общей границе — война; первый ход за объявившим. Кого нет в списке (эльфы) — войну не начинает, но отвечает на неё'},
  {id: 'march', label: 'собрала войско', band: 'routine', party: 'army', requires: [],
    note: 'в войне ход державы: войско из ближайшего к врагу города идёт осадой на его ближайший город (ARMY); одно войско на войну, не чаще everyYears'},
  {id: 'raidTown', label: 'пошла набегом', band: 'routine', party: null, requires: [],
    note: 'набег города с воинами на ближайший город нелюбимой державы в raidReach (DIPLOMACY): добыча растит город, отбитый набег стоит дороже; не больше raidsPerYear в год на державу. У орков'},
  {id: 'clearLair', label: 'выжгла логово', band: 'routine', party: null, requires: [],
    note: 'город идёт на логово, чьи владения до него достают (TOWN_WAR): проигравшее логово выжжено, проигравший город теряет жителей и угодье'},
]);

// the ready lists: the mores of a species' lairs — the same list serves the lair and its leader (the deed knows which
// role asks, ctx.role); what a lair does without a leader is the deed's own rule (a beast's lair raids no town)
export const DEED_WAYS = {
  lair: ['raid', 'expand', 'subdue', 'rival'],
  captors: ['raid', 'captives', 'expand', 'subdue', 'rival'],   // the camps that take people: goblins, gnolls, ogres; the necromancer's tower
  // realms: a people of the plough and the sword; the raiders (the orcs) raid too; the wardens (the elves) start no war
  people: ['makePeace', 'warOn', 'march', 'clearLair'],
  raiders: ['makePeace', 'warOn', 'march', 'raidTown', 'captives', 'clearLair'],
  wardens: ['makePeace', 'march', 'clearLair'],
  dragon: ['expand', 'strike'],   // (a dragon's lair breeds with its kind's `breed` — 0 in data/lairs.js: the deed is there for the table to turn on)
  vampire: ['expand'],
};

// the lanes of a list: band → the catalogue rows of the list in the list's order
export function deedLanes(list) {
  const lanes = Object.fromEntries(DEED_BANDS.map(b => [b, []]));
  for (const id of list) { const d = DEEDS.get(id); lanes[d.band].push(d); }
  return lanes;
}
