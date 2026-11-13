// Raider squads: a band that comes on a raid shares one plan instead of every member chasing the
// nearest foe on its own.
//   goal   — why they came: loot (the stores), kill (one chosen colonist), burn (a wooden building),
//            scout (look the camp over and bring word back), slaughter (the mindless dead: anyone alive).
//            Drawn from the band's `goals` (data/raids.js) when it arrives.
//   roles  — the task in the band (its fighting role — shield-bearer, archer… — came with it: data/roles.js):
//            front (meets the defenders), shooter (bows and slings), looter (goes for the stores while
//            the others hold the defenders off), torch (sets the fire), rear (covers the retreat),
//            beast (a war beast at its masters' side), scout.
//   morale — 1 at the start; losses, a fallen leader and the defenders' strength nearby bring it down.
//            Below the band's nerve (living bands, war beasts, the mindless dead differ) they retreat.
//   state  — march (on the plan), withdraw (the goal is reached), retreat (morale broke). On the way
//            out the rear holds off pursuers for a while.
// Plain data in w.squads ({id: squad}), members by id, saved with the world. The raider brain
// (agents/behaviours/raid.js) asks planFor() what to do; stepSquads() checks morale and the goal.
// Every squad's start and end is in the journal with its reason, and in w.behave.squads.
import {SPECIES, isMindless} from '../data/species.js';
import {leaderOf} from './auras.js';
import {RAID_BANDS} from '../data/raids.js';
import {BUILDINGS} from '../data/buildings.js';
import {colonists} from '../settlement/query.js';
import {log} from '../core/log.js';
import {esc, clamp, weighted, dist, cap} from '../core/util.js';
import {hpShare} from './agent.js';
import {cellOf} from '../world/grid.js';
import {nearestHostile, canSee} from './combat.js';
import {agentById, liveById, firstAttacker} from './lookup.js';
import {liveMembers} from './group.js';
import {SQUAD} from '../data/behaviour.js';
import {COMBAT_ROLES, LINKS} from '../data/roles.js';
import {roleTactic, bandSide, holdFoe, fightTask} from './tactics.js';
import {RANK_RULES} from '../data/ranks.js';
import {hasMark} from '../data/conditions.js';
import {brokenShare} from './morale.js';
import {MORALE} from '../data/morale.js';

export {SQUAD};   // (data/behaviour.js)
export const GOALS = {
  loot:      {label: 'грабёж', aim: 'пришли за добычей', done: 'добыча взята, уходят'},
  kill:      {label: 'расправа', aim: t => `пришли по одну душу: ${t}`, done: 'расправа свершилась, уходят'},
  burn:      {label: 'поджог', aim: 'несут факелы: хотят поджечь постройки', done: 'огонь пущен, уходят'},
  scout:     {label: 'разведка', aim: 'высматривают лагерь: это разведчики', done: 'лагерь осмотрен, уходят'},
  slaughter: {label: 'истребление', aim: 'идут на всё живое', done: 'уходят'},
};
export const ROLES = {front: 'передний боец', shooter: 'стрелок', looter: 'грабитель', torch: 'поджигатель', rear: 'прикрывает отход',
  beast: 'боевой зверь', scout: 'разведчик', leader: 'вожак'};

const table = w => w.squads || (w.squads = {});
// one more of a band joins its squad in the fight (a mount its rider fell from: agents/mount.js)
export function joinSquad(w, of, b) {
  const sq = of.squad != null ? table(w)[of.squad] : null; if (!sq) return;
  b.squad = sq.id; b.sqRole = 'beast'; if (!sq.members.includes(b.id)) sq.members.push(b.id);
}
const Label = sq => cap(RAID_BANDS.get(sq.band).label);
export const squadOf = (w, a) => (a.squad != null ? w.squads?.[a.squad] || null : null);
const membersOf = (w, sq) => liveMembers(w, sq, o => !o.gone && !o.downed && o.squad === sq.id);   // the fallen and the taken are out of it

// a fighter's weight in the odds: health × the hardest blow it can strike
export function strength(a) {
  const g = a.gear, sp = SPECIES.get(a.species);
  const blow = Math.max(g?.melee?.dmg ?? sp.attack?.power ?? 1, g?.rangedReady ? g.ranged.dmg * 0.8 : 0);
  return Math.max(0, a.hp) * blow;
}

const wooden = w => w.buildings.filter(b => b.done && b.cells.length && BUILDINGS.get(b.key).wooden);

// the colonist a kill-band came for: the one who has killed most raiders (a blood feud), otherwise the
// weakest (easy prey)
const EASY = 'самая лёгкая добыча';
function pickVictim(w) {
  const col = colonists(w).filter(a => !a.downed); if (!col.length) return null;
  const feud = col.filter(a => (a.stats?.raiders || 0) > 0).sort((x, y) => y.stats.raiders - x.stats.raiders)[0];
  return feud ? {who: feud, why: 'кровник: убивал их'} : {who: col.sort((x, y) => strength(x) - strength(y))[0], why: EASY};
}

// a new band: the plan, the leader, everyone's role
export function createSquad(w, group) {
  const band = RAID_BANDS.get(group[0].band), sqs = table(w);
  const id = w.nextSquad = (w.nextSquad || 0) + 1;
  // the dead (even with their necromancer behind) have no plan but the living and no morale to break
  const dead = group.filter(a => isMindless(SPECIES.get(a.species))).length;
  const kind = dead * 2 > group.length ? 'mindless' : 'living';
  let goal = kind === 'mindless' ? 'slaughter' : weighted(w.rngs.outside, (band.goals ? band.goals(w, group) : [['loot', 1]]).filter(([, v]) => v > 0)) || 'loot';
  let target = null, why = null;
  const tipped = goal !== 'scout' && w.scouted?.[band.id] != null;
  if (tipped) delete w.scouted[band.id];
  if (goal === 'kill') { const v = pickVictim(w); if (v) { target = v.who.id; why = v.why; } else goal = 'loot'; }
  if (goal === 'burn') { const bs = wooden(w); if (bs.length) target = bs[Math.floor(w.rngs.outside() * bs.length)].id; else goal = 'loot'; }
  // the leader: one who leads its own (species `bandHead`: the necromancer, the vampire) if there is one, otherwise the
  // strongest who is no beast
  const people = group.filter(a => !a.warBeast);
  const leader = group.find(a => !!SPECIES.get(a.species).bandHead) || people.sort((x, y) => strength(y) - strength(x))[0] || group[0];
  // an unnamed leader gets a title
  if (band.pawn && leader.name === band.pawn) leader.name = cap(band.ranks?.boss || leader.name);
  else if (kind === 'living' && group.length > 1 && SPECIES.get(leader.species).bandHead !== 'dead' && !leader.warBeast && leader.name === cap(SPECIES.get(leader.species).label)) leader.name += '-вожак';
  const sq = sqs[id] = {id, band: band.id, kind, goal, target, why, members: group.map(a => a.id), leader: leader.id, size: group.length,
    fallen: 0, home: 0, morale: 1, state: 'march', reason: null, started: w.tick, lit: null, watched: null, rearUntil: null,
    power0: group.reduce((s, a) => s + strength(a), 0)};
  // roles: beasts at their masters' side, bows shoot, a share of a looting band goes for the stores,
  // the torches for a fire, the toughest of the rest at the front, the last one covers the way out
  const rest = [];
  for (const a of group) {
    a.squad = id;
    if (a.warBeast) a.sqRole = 'beast';
    else if (goal === 'scout') a.sqRole = 'scout';
    else if (kind === 'mindless') a.sqRole = 'front';
    else if (a.fightRole && COMBAT_ROLES.has(a.fightRole) ? COMBAT_ROLES.get(a.fightRole).squad === 'shooter' && a.gear?.ranged : a.gear?.rangedReady) a.sqRole = 'shooter';   // by its role (data/roles.js), a stray by what it holds
    else rest.push(a);
  }
  // weakest first: they loot and carry the torches — never one whose role keeps it from the band's chores (a healer,
  // data/roles.js `noChores`: it tends the fallen), while anyone else is there to do them
  const chores = a => !(a.fightRole && COMBAT_ROLES.has(a.fightRole) && COMBAT_ROLES.get(a.fightRole).noChores);
  rest.sort((x, y) => (chores(y) - chores(x)) || strength(x) - strength(y));
  const able = rest.filter(chores).length || rest.length;
  const special = Math.min(able, goal === 'loot' ? Math.max(1, Math.round(rest.length * SQUAD.looters)) : goal === 'burn' ? Math.min(2, rest.length) : 0);
  rest.forEach((a, k) => { a.sqRole = k < special ? (goal === 'loot' ? 'looter' : 'torch') : 'front'; });
  const fronts = group.filter(a => a.sqRole === 'front' && a.id !== leader.id);
  if (kind === 'living' && fronts.length >= 2) fronts.sort((x, y) => strength(y) - strength(x))[0].sqRole = 'rear';
  if (!leader.warBeast && leader.sqRole !== 'scout') leader.sqRole = leader.sqRole === 'shooter' ? 'shooter' : 'leader';
  const b = w.behave; if (b) b.squads.started++;
  sq.announce = tipped ? 'tipped' : true;   // told in the journal next tick, after the arrival itself
  return sq;
}

function announce(w, sq) {
  const tipped = sq.announce === 'tipped'; sq.announce = null;
  const victim = sq.goal === 'kill' ? agentById(w, sq.target) : null;
  const g = GOALS[sq.goal], aim = typeof g.aim === 'function' ? g.aim(`<b>${esc(victim?.name || '?')}</b> (${sq.why})`) : g.aim;
  const b = sq.goal === 'burn' ? w.buildings.find(x => x.id === sq.target) : null;
  const what = b ? ` (${BUILDINGS.get(b.key).name.toLowerCase()})` : '';
  const leader = agentById(w, sq.leader);
  // the links it came in (data/roles.js LINKS): «стена щитов, налётчики»
  const kinds = [...new Set(liveMembers(w, sq).map(m => m.linkKind).filter(k => k && LINKS.has(k)))].map(k => LINKS.get(k).label);
  log(w, `${Label(sq)}: ${aim}${what}.${sq.kind === 'living' && sq.size > 1 && leader ? ` Ведёт ${esc(leader.name)}.` : ''}${kinds.length ? ` Звенья: ${kinds.join(', ')}.` : ''}${tipped ? ' Дорогу им показали разведчики.' : ''}`, 'danger');
}

// a member died (agents/agent.js kill)
export function noteFallen(w, a) {
  for (const s of Object.values(w.squads || {})) if (s.target === a.id) s.targetDown = true;   // the one they came for
  const sq = squadOf(w, a); if (!sq || a.fellNoted) return;
  a.fellNoted = true;   // fallen senseless first, killed after: one loss (agents/wounds.js)
  sq.fallen++;
  // an officer fallen: its link's share of the band is shaken at once (data/ranks.js loss)
  if (hasMark(a, 'officer') && a.id !== sq.leader && !(sq.shook ||= []).includes(a.id)) {   // (the leader's own fall: SQUAD.leaderLoss; once an officer — a healer may raise it)
    sq.shook.push(a.id);
    const link = membersOf(w, sq).filter(o => o.link === a.id && o !== a).length + 1;
    sq.shaken = (sq.shaken || 0) + RANK_RULES.loss * link / sq.size;
    if (link > 1) log(w, `Пал ${esc(a.name)}: его звено дрогнуло.`, 'danger');
  }
  if (a.id === sq.leader && sq.kind === 'living' && membersOf(w, sq).some(o => o !== a)) log(w, `Пал вожак: ${esc(a.name)}.`, 'danger', 'notice');
}
// a member left the map alive (tasks.js leave)
export function noteHome(w, a) { const sq = squadOf(w, a); if (sq) sq.home++; }

function setState(w, sq, state, reason) {
  if (sq.state !== 'march') return;
  sq.state = state; sq.reason = reason;
  if (state === 'retreat') sq.rearUntil = w.tick + SQUAD.rearHold;
  log(w, state === 'retreat' ? `${Label(sq)}: отступление, ${reason}.` : `${Label(sq)}: ${reason}.`, 'danger', state === 'retreat' ? 'notice' : undefined);
}

// the defenders' strength near any member of the band
function defenders(w, ms) {
  let s = 0;
  for (const o of colonists(w)) if (!o.sleeping && !o.captive && ms.some(m => dist(m, o) < SQUAD.view)) s += strength(o);   // a captive fights only for itself
  return s;
}

export function moraleOf(w, sq, ms = membersOf(w, sq)) {
  if (sq.kind === 'mindless') return 1;
  if (ms.some(m => leaderOf(w, m) || m.auras?.includes('lead'))) return 1;   // a boss's aura: the band holds while it stands (agents/auras.js)
  const leaderDown = !ms.some(m => m.id === sq.leader);
  const own = ms.reduce((s, a) => s + strength(a), 0), foes = defenders(w, ms);
  const odds = foes > 0 ? clamp((own / foes - 1) * SQUAD.odds, -SQUAD.odds * 1.5, SQUAD.odds) : 0;
  // the links whose officer stands hold the band together; a fallen officer shook it (data/ranks.js)
  const officers = new Set(ms.filter(m => hasMark(m, 'officer')).map(m => m.id));
  const linked = officers.size ? ms.filter(m => m.link != null && officers.has(m.link)).length / sq.size : 0;
  return 1 - SQUAD.lossWeight * sq.fallen / sq.size - (leaderDown ? SQUAD.leaderLoss : 0) + odds + RANK_RULES.rally * linked - (sq.shaken || 0);
}

function finish(w, sq) {
  delete w.squads[sq.id];
  const b = w.behave;
  const wiped = sq.home === 0;
  if (b) { if (wiped) b.squads.wiped++; else if (sq.state === 'withdraw') b.squads.goal++; else b.squads.retreat++; }
  if (wiped) log(w, sq.size > 1 ? `${Label(sq)}: разгром, ни один не ушёл (${sq.fallen} из ${sq.size}).` : `${Label(sq)}: уйти не удалось.`, 'danger', 'notice');
  else if (sq.goal === 'scout' && sq.state === 'withdraw') {
    (w.scouted ||= {})[sq.band] = w.tick;   // the next band of theirs comes sooner and bigger (outside/scripted.js)
    log(w, `Разведчики ушли и унесли весть о лагере. Жди их скоро и числом побольше.`, 'danger', 'notice');
  }
}

// once a tick (sim.js): morale, the goal, the end of a squad
export function stepSquads(w) {
  const sqs = w.squads; if (!sqs) return;
  for (const sq of Object.values(sqs)) {
    if ((w.tick + sq.id) % SQUAD.think && !sq.announce) continue;
    if (sq.announce) announce(w, sq);
    const ms = membersOf(w, sq);
    if (!ms.length) { finish(w, sq); continue; }
    if (sq.state !== 'march') continue;
    // the band's morale is its members' (agents/morale.js): it breaks when enough of them break, or fewer once its leader fell
    // (the mindless dead never break; one by one the living still may)
    const broken = brokenShare(ms), leaderDown = !ms.some(m => m.id === sq.leader), B = MORALE.squad;
    sq.morale = +(1 - broken).toFixed(3);
    if (sq.kind !== 'mindless' && (broken >= B.broken || (leaderDown && broken >= B.leaderless))) {
      const why = sq.fallen / sq.size >= 0.4 ? `потери (${sq.fallen} из ${sq.size} пали)` : leaderDown ? 'пал вожак' : 'дрогнули';
      setState(w, sq, 'retreat', why);
      continue;
    }
    // the goal
    const g = sq.goal;
    if (g === 'loot') {
      const looters = ms.filter(m => m.sqRole === 'looter');
      if (ms.some(m => m.looted) && looters.every(m => m.looted)) setState(w, sq, 'withdraw', GOALS.loot.done);
      else if (!looters.length && ms.some(m => m.looted)) setState(w, sq, 'withdraw', GOALS.loot.done);
    } else if (g === 'kill') {
      if (sq.targetDown) {
        // at a caravan's camp (campaign/camp.js) a band that came for the easiest prey is not done with one: it turns on the
        // next weakest standing, until SQUAD.campPrey of its number have fallen — or its losses break it; a feud wants one
        sq.prey = (sq.prey || 0) + 1;
        const next = w.campaign && sq.why === EASY && sq.prey < Math.ceil(sq.size * SQUAD.campPrey) ? pickVictim(w) : null;
        if (next) { sq.target = next.who.id; sq.why = next.why; sq.targetDown = false; log(w, `${Label(sq)}: один пал — идут за следующим: ${esc(next.who.name)}.`, 'danger'); }
        else setState(w, sq, 'withdraw', GOALS.kill.done);
      } else if (!agentById(w, sq.target)) { sq.goal = 'loot'; for (const m of ms) if (m.sqRole === 'front' && !m.looted && w.rngs.outside() < SQUAD.looters) m.sqRole = 'looter'; }
    } else if (g === 'burn') {
      if (sq.lit != null && w.tick - sq.lit > SQUAD.burnFor) setState(w, sq, 'withdraw', GOALS.burn.done);
      else if (sq.lit == null && !w.buildings.some(b => b.id === sq.target && b.done)) { sq.goal = 'loot'; for (const m of ms) if (m.sqRole === 'torch') m.sqRole = 'looter'; }
    } else if (g === 'scout') {
      if (sq.watched != null && w.tick - sq.watched > SQUAD.scoutWatch) setState(w, sq, 'withdraw', GOALS.scout.done);
    }
  }
}

const fight = (w, a, e) => fightTask(w, a, e);   // (agents/tactics.js; called, not copied at load: the two import each other)

// what a member of a squad does now; null when the plan has nothing to say (the brain's own default)
export function planFor(w, a, sq, radius) {
  a.sneaking = false;   // only a cutthroat's tactic creeps, each think anew (agents/tactics.js)
  // on the way out: the rear guard turns on pursuers for a while, everyone else goes
  // a looter already at the stores grabs what it can on the way out, whatever the band does
  if (a.sqRole === 'looter' && !a.looted && sq.state === 'retreat' && w.nav.get('camp')[cellOf(w, a)] <= SQUAD.grabNear) return a.task?.id === 'assault' ? a.task : {id: 'assault'};
  if (sq.state !== 'march') {
    if (a.sqRole === 'rear' && sq.state === 'retreat' && w.tick < sq.rearUntil && hpShare(a) > 0.4) {
      const e = holdFoe(w, a, nearestHostile(w, a, 8));
      if (e) return fight(w, a, e);
    }
    return {id: 'leave'};
  }
  // a blow taken or a foe at arm's length is answered whatever the plan says
  const attacker = firstAttacker(w, a, o => o.faction === 'colony' && o.task.id === 'fight');
  const close = nearestHostile(w, a, 2.5);
  const role = a.sqRole;
  if (role === 'looter') {
    // grab and run: a looter answers only someone already on it, and slips past the rest
    if (a.looted) return {id: 'leave'};
    if (attacker && dist(a, attacker) < 2.5) return fight(w, a, holdFoe(w, a, attacker));
    return a.task?.id === 'assault' ? a.task : {id: 'assault'};
  }
  if (role === 'torch' && sq.lit == null) {
    if (close) return fight(w, a, holdFoe(w, a, close));
    return a.task?.id === 'torch' ? a.task : {id: 'torch', b: sq.target};
  }
  if (role === 'scout') {
    const e = attacker || close;
    if (e) return fight(w, a, holdFoe(w, a, e));
    return a.task?.id === 'scout' ? a.task : {id: 'scout'};
  }
  if (sq.goal === 'kill') {
    const v = [liveById(w, sq.target)].find(o => o && !o.downed);
    if (v && canSee(w, a, v) && dist(a, v) < 30 && !close) return fight(w, a, v);
  }
  // the fighting role's own way (agents/tactics.js): whom to go for, keeping back, healing; else the nearest foe
  const t = roleTactic(w, a, bandSide(w, sq), radius);
  if (t) return t.id === 'fight' ? fight(w, a, holdFoe(w, a, t.target)) : t;   // its pick, but not a new one every look
  const e = holdFoe(w, a, nearestHostile(w, a, radius));
  if (e) return fight(w, a, e);
  // nobody to fight: a band that came for someone (or to cover the torches) waits at the camp
  if (sq.goal === 'kill' || sq.goal === 'burn') return a.task?.id === 'haunt' ? a.task : {id: 'haunt'};
  return null;
}

// a member's title in the fight: what it is, its fighting role, its task in the band — «гоблин-стрелок-грабитель»;
// the task is left out where it only repeats the role (a shooter shooting, a front fighter in front)
const TASK_WORD = {looter: 'грабитель', torch: 'поджигатель', rear: 'замыкающий', scout: 'разведчик', leader: 'вожак'};
export function fighterLabel(w, a, base) {
  const sq = squadOf(w, a);
  if (a.warBeast) return base;
  if (!sq) return a.fightRole && COMBAT_ROLES.has(a.fightRole) ? `${base}-${COMBAT_ROLES.get(a.fightRole).label}` : base;   // the caravan's own: its role only
  const role = a.fightRole && COMBAT_ROLES.has(a.fightRole) ? COMBAT_ROLES.get(a.fightRole).label : null;
  const task = TASK_WORD[a.sqRole] || null;
  return [base, role, task].filter(Boolean).join('-');
}

// for the card
export function squadText(w, a) {
  const sq = squadOf(w, a); if (!sq) return null;
  const goal = GOALS[sq.goal].label + (sq.goal === 'kill' ? `: ${agentById(w, sq.target)?.name || '—'}` : '');
  const state = sq.state === 'march' ? `боевой дух ${Math.round(clamp(sq.morale, 0, 1.5) * 100)}%` : sq.state === 'retreat' ? `отступают (${sq.reason})` : `уходят (${sq.reason})`;
  const left = membersOf(w, sq).length;
  const fr = a.fightRole && COMBAT_ROLES.has(a.fightRole) ? COMBAT_ROLES.get(a.fightRole).label : null;
  const lead = a.link != null && a.link !== a.id ? agentById(w, a.link) : null;
  const kind = a.linkKind && LINKS.has(a.linkKind) ? ` «${LINKS.get(a.linkKind).label}»` : '';
  const rank = hasMark(a, 'officer') ? `офицер звена${kind} из ${membersOf(w, sq).filter(o => o.link === a.id).length}; ` : lead ? `в звене${kind} ${lead.name}${lead.dead || lead.downed ? ' (пал)' : ''}; ` : kind ? `звено${kind}; ` : '';
  return `${rank}${fr ? fr + ', ' : ''}${ROLES[a.sqRole] || '—'}${a.id === sq.leader && a.sqRole !== 'leader' ? ', вожак' : ''}; цель — ${goal}; ${state}; в строю ${left} из ${sq.size}`;
}
