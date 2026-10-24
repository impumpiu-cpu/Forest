// Behaviours (docs/BEHAVIOUR.md): the catalogue of what a creature can do, one row per thing, so a species
// is a list of them in its row (`behaviours: ['bolt', 'graze', …]`, data/behaviour.js WAYS) and not a brain
// written for it by hand. This file names them for the tables and the checks; the code of each — what it
// wants and how it is done — lives in agents/behaviours/ under the same id, as a job names its runner
// (data/jobs.js) and agents/jobRunners.js does the work. The tabled brain (agents/brains/tabled.js) asks
// every listed behaviour what it wants and runs the winner as the creature's task.
//
//   band     — its lane in the choice: reflex (fire, a blow on oneself) > red (a foe, the alarm) >
//              yellow (the body at its limit, a cry) > routine (the queue of ordinary things). The brain
//              takes the first lane that offers anything: a red option is never weighed against the queue,
//              it interrupts it; when it is over, the queue goes on
//   task     — false: the behaviour offers a task another one owns (sniffHay offers `graze` in the `hay`
//              mode) and brings no task of its own; otherwise its task is registered under its id (`label`)
//   keep     — bonus the current task gets against a newcomer (0: scores alone decide)
//   requires — the species fields it reads (['flee']): tools/check-data.mjs refuses a species that lists
//              the behaviour without them
// The order in a species' list is the order of evaluation and the tie-breaker, and so part of the game's
// determinism: a list edited in the tables changes the run, as any other row edit does.
import {Registry} from '../core/registry.js';

export const BANDS = ['reflex', 'red', 'yellow', 'routine'];
export const BAND_LABELS = {reflex: 'рефлекс', red: 'красная тревога', yellow: 'жёлтая тревога', routine: 'очередь дел'};

export const BEHAVIOURS = new Registry('behaviour');
BEHAVIOURS.registerAll([
  {id: 'bolt', label: () => 'убегает', band: 'red', requires: ['flee'], keep: 0,
    note: 'бежит от огня и от того, кого боится (flee.from); стадный — по тревоге стада'},
  {id: 'alert', label: () => 'насторожился', band: 'yellow', requires: ['herd'], keep: 0,
    note: 'стадный зверь: стоит и смотрит, пока тревога стада не дошла до него'},
  {id: 'sniffHay', task: false, band: 'yellow', requires: [], keep: 0,
    note: 'пастух с сеном рядом: стоит и нюхает (задача graze в режиме hay)'},
  {id: 'leave', task: false, band: 'routine', requires: ['leaveChance'], keep: 0,
    note: 'с шансом leaveChance за тик уходит с карты насовсем (общая задача leave)'},
  {id: 'rest', label: () => 'дремлет', band: 'routine', requires: [], keep: 0,
    note: 'ночью (restAt, обычно 0.7) сидит на месте'},
  {id: 'graze', label: () => 'пасётся', band: 'routine', requires: ['grazes'], keep: 0,
    note: 'щиплет траву на своём лугу (grazes.terrain); стадный — на пастбище стада'},
  // ── a big grazer that stands its ground (the `mule` block)
  {id: 'shunFire', task: false, band: 'red', requires: [], keep: 0,
    note: 'бежит от огня (bolt в режиме fire) — для того, кто больше ничего не боится'},
  {id: 'standGround', task: false, band: 'red', requires: ['mule'], keep: 0,
    note: 'не бежит: лягает подошедшего (maul в режиме kick), несётся на стрелявшего, бык стада заступается; тяжело раненый хромает прочь (bolt)'},
  {id: 'pack', label: () => 'везёт поклажу', band: 'yellow', requires: [], keep: 0,
    note: 'вьючный мул (a.owner): идёт за своим купцом; купец пропал — уходит с карты'},
  {id: 'drawOff', label: () => 'отходит от опасности', band: 'yellow', requires: ['herd'], keep: 0,
    note: 'стадный зверь, который не бежит (лось): отступает от того, что подошло к стаду слишком близко'},
  // ── a predator (agents/hunting.js; the numbers: the species' `predator` block and PROWL of data/behaviour.js)
  {id: 'defendLair', task: false, band: 'reflex', requires: ['predator'], keep: 0,
    note: 'страж логова (a.defend, campaign/camp.js): держит его до конца — maul в режиме lair, без страха и бегства'},
  {id: 'scare', task: false, band: 'red', requires: ['predator'], keep: 0,
    note: 'что отгоняет хищника: огонь (bolt), толпа людей (bolt), зона поселения (roam в режиме shy)'},
  {id: 'leaveHurt', task: false, band: 'red', requires: ['predator'], keep: 0,
    note: 'тяжело раненый уходит с карты; ночной (nocturnal) — на рассвете'},
  {id: 'feed', label: () => 'ест добычу', band: 'routine', requires: ['predator'], keep: 0,
    note: 'ест тушу (agents/carcass.js): свою добычу или чужую, которую чует голодным'},
  {id: 'chase', label: () => 'гонит добычу', band: 'routine', requires: ['predator'], keep: 0,
    note: 'охота стаей на дичь: голодный смотрит далеко, сытый берёт что под носом; присоединяется к погоне вожака'},
  {id: 'maul', label: t => (t.mule ? (t.charging ? 'несётся на обидчика' : 'лягается') : 'нападает'), band: 'routine', requires: ['predator'], keep: 0,
    note: 'нападение на одинокого человека, когда голод (и ночь) придали смелости; отступает при подмоге (задачу maul носит и мул, agents/brains/mule.js)'},
  {id: 'catchBreath', task: false, band: 'routine', requires: ['predator'], keep: 0,
    note: 'выдохся в погоне — отдыхает (rest в режиме winded), пока не отдышится'},
  {id: 'wanderOff', task: false, band: 'routine', requires: ['predator'], keep: 0,
    note: 'голодная стая без добычи в виду уходит искать другие угодья (вожак решает за всех)'},
  {id: 'roam', label: () => 'рыщет', band: 'routine', requires: ['predator'], keep: 0,
    note: 'вожак выбирает, куда идти (голодный — по следу добычи), остальные держатся за ним'},
]);
for (const d of BEHAVIOURS.all()) {
  if (!BANDS.includes(d.band)) throw new Error(`behaviour ${d.id}: no band «${d.band}»`);
  if (d.task !== false && !d.label) throw new Error(`behaviour ${d.id}: a task without a label`);
}

// a species' behaviours grouped by lane, in list order; cached per list (a table edit gives a new list)
const grouped = new WeakMap();
export function lanesOf(sp) {
  const list = sp.behaviours;
  let g = grouped.get(list);
  if (!g) {
    g = Object.fromEntries(BANDS.map(b => [b, []]));
    for (const id of list) { const d = BEHAVIOURS.get(id); g[d.band].push(d); }
    grouped.set(list, g);
  }
  return g;
}
