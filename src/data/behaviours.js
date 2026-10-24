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
//              mode) and brings no task of its own; a string: its task goes under that id (lure's `sing`);
//              otherwise its task is registered under the behaviour's id (`label`)
//   keep     — bonus the current task gets against a newcomer (0: scores alone decide)
//   requires — the species fields it reads (['flee']): tools/check-data.mjs refuses a species that lists
//              the behaviour without them
// The order in a species' list is the order of evaluation and the tie-breaker, and so part of the game's
// determinism: a list edited in the tables changes the run, as any other row edit does.
import {Registry} from '../core/registry.js';
import {ROSTER} from './behaviour.js';

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
  // ── vermin (the `vermin` block)
  {id: 'scurry', task: false, band: 'red', requires: ['vermin'], keep: 0,
    note: 'бежит от того, кто не спит и подошёл (vermin.flee); подошедший вплотную может прибить (vermin.caught); кикимору видно только вблизи (veil)'},
  {id: 'hide', label: () => 'прячется', band: 'routine', requires: ['vermin'], keep: 0,
    note: 'сидит в норе у лагеря, пока у припасов кто-то есть (пока не кончилось терпение) и после набега; нечисть — в режиме deep уходит на дальнюю свою землю'},
  {id: 'nibble', label: () => 'грызёт припасы', band: 'routine', requires: ['vermin'], keep: 0,
    note: 'когда у припасов тихо, крадётся к складу и ест открытую еду; кикимора прежде портит тушу в лесу'},
  // ── the nechist (the `spirit` block; agents/nechist.js)
  {id: 'vanish', task: false, band: 'red', requires: ['spirit'], keep: 0,
    note: 'скрывшаяся нечисть (a.hiddenUntil) никому не видна и идёт на дальнюю свою землю (hide в режиме deep); всегда: раны затягиваются дома, завеса (veil)'},
  {id: 'fightBack', task: false, band: 'red', requires: ['spirit'], keep: 0,
    note: 'обидчику рядом — удар (maul в режиме strike); русалка от раны уходит под воду, леший от толпы — в чащу'},
  {id: 'lure', label: () => 'поёт у воды', task: 'sing', band: 'routine', requires: ['spirit'], keep: 0,
    note: 'аура русалки: ночью зовёт одинокого поселенца к воде и топит, если никто не подойдёт (всегда, независимо от задачи); задача sing — ходит по берегу или ждёт идущего'},
  {id: 'astray', task: false, band: 'routine', requires: ['spirit'], keep: 0,
    note: 'аура лешего: поселенцы рядом теряют дорогу на час-два (всегда, независимо от задачи); ничего не предлагает'},
  {id: 'lurk', label: () => 'таится', band: 'routine', requires: ['spirit'], keep: 0,
    note: 'держится своей земли (лес, луг, берег) подальше от поселения'},
  // ── a tamed beast (the brain `livestock`, agents/brains/index.js) and one who left (`leaver`)
  {id: 'fendOff', task: false, band: 'red', requires: [], keep: 0,
    note: 'ручной зверь: хищник или налётчик рядом — мул лягает на месте (maul kick, stay), коза бежит (bolt)'},
  {id: 'penned', label: t => (t.mode === 'camp' ? 'держится у лагеря' : t.mode === 'to' ? 'идёт в загон' : 'в загоне'), band: 'routine', requires: [], keep: 0,
    note: 'ручной зверь: идёт в свой загон и ходит в нём с места на место; без загона держится у лагеря; раны заживают'},
  {id: 'depart', task: false, band: 'routine', requires: [], keep: 0,
    note: 'ушедший из поселения идёт к краю карты (общая задача leave)'},
  {id: 'led', label: () => 'уводят', band: 'routine', requires: [], keep: 0,
    note: 'ручной зверь, которого уводит ограбивший лагерь налётчик (a.ledBy, поход): идёт за ним и уходит с ним; вор пал — зверь остаётся скотом'},
  // ── people (agents/people.js; the roles: data/behaviour.js WAYS raider, fugitive, trader, guard; the colony's come next)
  {id: 'downed', label: () => 'лежит без сознания', band: 'reflex', requires: [], keep: 0,
    note: 'упавший без сознания после смертельного удара (agents/wounds.js) лежит и истекает кровью, пока не помогут или не выйдет время'},
  {id: 'fleeFire', task: false, band: 'reflex', requires: [], keep: 0,
    note: 'человек бежит от жара и огня рядом (общая задача flee); безмозглые мертвецы идут в огонь'},
  {id: 'escape', label: () => 'бежит из плена', band: 'routine', requires: [], keep: 0,
    note: 'беглый пленный: к краю карты так быстро, как позволяют путы; за краем ушёл, не дошёл за день — сгинул в лесах'},
  {id: 'retreat', task: false, band: 'red', requires: [], keep: 0,
    note: 'налётчик уходит с карты: потерял хозяина-некроманта или своих (боевой зверь), встало солнце (sun), тяжело ранен (кроме безмозглых)'},
  {id: 'raid', task: false, band: 'routine', requires: [], keep: 0,
    note: 'набег: план отряда (agents/squad.js), иначе ближайший враг, иначе к складу (assault); безмозглые бродят у лагеря (haunt); с добычей — домой'},
  {id: 'withCaravan', task: false, band: 'red', requires: [], keep: 0,
    note: 'люди каравана уходят с ним: гостевание кончилось, каравана нет, купец охранника пал (общая задача leave)'},
  {id: 'peddle', label: t => ({trading: 'торгует', night: 'ночует у костра', camp: 'стоит лагерем у костра'}[t.mode] || 'идёт с караваном'), task: 'travel', band: 'routine', requires: [], keep: 0,
    note: 'купец: идёт к лагерю, ждёт отставших мулов, встаёт в нескольких клетках от костра и держится места всё гостевание (settlement/trade.js)'},
  {id: 'defendCaravan', task: false, band: 'routine', requires: [], keep: 0,
    note: 'охранник каравана бьёт того, кто идёт на караван: врага рядом, волка или мула на его людях и зверях (общая задача fight)'},
  {id: 'escort', label: () => 'охраняет караван', band: 'routine', requires: [], keep: 0,
    note: 'охранник держится своего места рядом с купцом'},
  // ── the colony's people (agents/brains/colonist.js; the weights: data/behaviour.js COLONIST, ROSTER, BOARD): each offers a
  // task of agents/tasks.js; the task under way is held with ROSTER.keep (work harder: agents/behaviours/work.js keep)
  {id: 'defend', task: false, band: 'red', requires: [], keep: ROSTER.keep,
    note: 'на меня напали: смелый и здоровый дерётся (fight, рефлекс), остальные бегут к своим (runHome); в зоне поселения стоит и дерётся'},
  {id: 'needs', task: false, band: 'routine', requires: ['needs'], keep: ROSTER.keep,
    note: 'тело: поесть, поспать, согреться — по потребностям вида (data/needs.js urge); выспавшийся досыпает до рассвета'},
  {id: 'work', task: false, band: 'routine', requires: [], keep: ROSTER.keep,
    note: 'работы по вакансиям (settlement/plan.js): могу ли, хочу ли, ночь; запись на место; прикидка перед сменой дела; начатое держится; у лагеря меняет снаряжение и сдаёт груз'},
  {id: 'idle', task: false, band: 'routine', requires: [], keep: ROSTER.keep, note: 'больше нечем заняться: отдыхает у костра'},
  {id: 'company', task: false, band: 'routine', requires: [], keep: ROSTER.keep, note: 'идёт в лес вместе с одиноким сборщиком, когда там опасно (settlement/together.js)'},
  {id: 'aid', task: false, band: 'routine', requires: [], keep: ROSTER.keep, note: 'спешит к раненому в лесу или упавшему без сознания: перевязать и довести'},
  {id: 'sulk', task: false, band: 'routine', requires: [], keep: ROSTER.keep, note: 'хандра держит своё (settlement/life.js)'},
  {id: 'spellbound', task: false, band: 'routine', requires: [], keep: ROSTER.keep, note: 'чары нечисти (astray, lured) держат, пока не спадут'},
  {id: 'pray', task: false, band: 'routine', requires: [], keep: ROSTER.keep, note: 'тяжело на душе — к святилищу (днём)'},
  {id: 'council', task: false, band: 'routine', requires: [], keep: ROSTER.keep, note: 'время совета у костра'},
  {id: 'treat', task: false, band: 'routine', requires: [], keep: ROSTER.keep, note: 'тяжело ранен, есть хижина лекаря и койка — лечь'},
  {id: 'trade', task: false, band: 'routine', requires: [], keep: ROSTER.keep, note: 'торг с купцом: второй сход вечера'},
  {id: 'douse', task: false, band: 'routine', requires: [], keep: ROSTER.keep, note: 'пожар у лагеря: смелый и здоровый тушит'},
  {id: 'watch', task: false, band: 'routine', requires: [], keep: ROSTER.keep, note: 'ночная стража у огня: одно место, берёт кто хочет (settlement/board.js)'},
  {id: 'flags', task: false, band: 'routine', requires: [], keep: ROSTER.keep, note: 'крики доски: бежит на зов или бьёт врага, которого видит; зов взвешивается заново каждый раз'},
  {id: 'muster', task: false, band: 'routine', requires: [], keep: ROSTER.keep, note: 'тревога налёта: кто не видит врага, собирается у костра'},
  {id: 'reserve', task: false, band: 'routine', requires: [], keep: ROSTER.keep, note: 'красная тревога в виду: кто не идёт в бой, держится у огня или бежит к своим; тяжело раненый при враге — к своим'},
  {id: 'bind', task: false, band: 'routine', requires: [], keep: ROSTER.keep, note: 'после боя: связать упавшего врага и привести (settlement/captives.js)'},
  {id: 'assist', task: false, band: 'routine', requires: [], keep: ROSTER.keep, note: 'ученик при мастере (settlement/masters.js)'},
  {id: 'keepIn', task: false, band: 'routine', requires: [], keep: 0, note: 'пленному нельзя за периметр: всегда возвращает к огню; ничего не предлагает'},
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
    note: 'нападение на одинокого человека, когда голод (и ночь) придали смелости; отступает при подмоге (задачу maul носят и мул — режим kick, standGround — и нечисть — режим strike)'},
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
export function lanesOf(list) {
  let g = grouped.get(list);
  if (!g) {
    g = Object.fromEntries(BANDS.map(b => [b, []]));
    for (const id of list) { const d = BEHAVIOURS.get(id); g[d.band].push(d); }
    grouped.set(list, g);
  }
  return g;
}
