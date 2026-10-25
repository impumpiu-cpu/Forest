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
//   party:      the kind of party it sends (atlas/parties.js BEHAVIOURS), or null for a deed done on the spot
//   requires:   fields of the species row the deed reads
import {Registry} from '../core/registry.js';

export const DEED_BANDS = ['reflex', 'red', 'yellow', 'routine'];
export const DEED_BAND_LABELS = {reflex: 'рефлекс', red: 'красная', yellow: 'жёлтая', routine: 'очередь дел'};

export const DEEDS = new Registry('deed');
DEEDS.registerAll([
  // ── the leader's plans (atlas/leaders.js; the numbers: data/lairs.js LEADER.plans)
  {id: 'raid', label: 'выступил в набег', band: 'routine', party: 'leader', requires: [],
    note: 'набег на город в досягаемости, который можно надеяться разбить: добыча кормит логово, разбитый набег может стоить главарю жизни; вожак зверей ходит на города реже (LEADER.beastRaid)'},
  {id: 'expand', label: 'вышел с выводком искать новое логово', band: 'routine', party: 'leader', requires: [],
    note: 'главарь уводит выводок из сильного логова и основывает дочернее — своего данника'},
  {id: 'subdue', label: 'выступил подчинять соседей', band: 'routine', party: 'leader', requires: [],
    note: 'слабейшего соседа без главаря и господина — под руку: данник каждый год отдаёт долю силы'},
  {id: 'rival', label: 'выступил войной на соперников', band: 'routine', party: 'leader', requires: [],
    note: 'война на логово-соперника (rivals рода логова): побеждённый слабеет или гибнет'},
]);

// the ready lists: the mores of a species' lairs (the leader's plans as they were for every lair kind — the lists part
// ways as the deeds of the lairs without a leader and of the realms arrive)
export const DEED_WAYS = {
  lair: ['raid', 'expand', 'subdue', 'rival'],
};

// the lanes of a list: band → the catalogue rows of the list in the list's order
export function deedLanes(list) {
  const lanes = Object.fromEntries(DEED_BANDS.map(b => [b, []]));
  for (const id of list) { const d = DEEDS.get(id); lanes[d.band].push(d); }
  return lanes;
}
