// Raider squads: a band that comes on a raid shares one plan instead of every member chasing the
// nearest foe on its own.
//   goal   — why they came: loot (the stores), kill (one chosen colonist), burn (a wooden building),
//            scout (look the camp over and bring word back), slaughter (the mindless dead: anyone alive).
//            Drawn from the band's `goals` (data/raids.js) when it arrives.
//   roles  — front (meets the defenders), shooter (bows and slings), looter (goes for the stores while
//            the others hold the defenders off), torch (sets the fire), rear (covers the retreat),
//            beast (a war beast at its masters' side), scout.
//   morale — 1 at the start; losses, a fallen leader and the defenders' strength nearby bring it down.
//            Below the band's nerve (living bands, war beasts, the mindless dead differ) they retreat.
//   state  — march (on the plan), withdraw (the goal is reached), retreat (morale broke). On the way
//            out the rear holds off pursuers for a while.
// Plain data in w.squads ({id: squad}), members by id, saved with the world. The raider brain
// (agents/brains/raider.js) asks planFor() what to do; stepSquads() checks morale and the goal.
// Every squad's start and end is in the journal with its reason, and in w.behave.squads.
import {SPECIES} from '../data/species.js';
import {RAID_BANDS} from '../data/raids.js';
import {BUILDINGS} from '../data/buildings.js';
import {colonists} from '../settlement/query.js';
import {log} from '../core/log.js';
import {esc, clamp, weighted} from '../core/util.js';
import {hpShare} from './agent.js';
import {cellOf} from '../world/grid.js';
import {nearestHostile, canSee} from './combat.js';

export const SQUAD = {
  think: 10,         // morale and the goal are checked this often
  view: 14,          // colony fighters this close to a member count against the band
  nerve: {living: 0.4, beasts: 0.3, mindless: -Infinity},
  leaderLoss: 0.25,  // morale lost with the leader
  lossWeight: 0.8,   // morale lost per share of the band fallen
  odds: 0.2,         // morale per unit of the strength ratio, either way (capped)
  hold: 40,          // a raider keeps its foe at least this long…
  closer: 0.55,      // …unless another is at most this share of the distance away
  scoutNear: 18,     // scouts stop this far from the camp (by the camp flow field)…
  scoutWatch: 150,   // …and watch this long
  burnNear: 1.6,     // a torch is put to a wall from this close
  burnFor: 60,       // after the fire is lit, the band lingers this long and goes
  rearHold: 150,     // the rear guard holds pursuers off this long
  looters: 0.4,      // share of a looting band sent to the stores
  grabNear: 10,      // a looter this close to the stores (camp flow field) still grabs on a retreat
};

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
const Label = sq => { const l = RAID_BANDS.get(sq.band).label; return l[0].toUpperCase() + l.slice(1); };
export const squadOf = (w, a) => (a.squad != null ? w.squads?.[a.squad] || null : null);
const byId = (w, id) => w.agents.find(o => o.id === id && !o.dead && !o.gone);
const membersOf = (w, sq) => sq.members.map(id => byId(w, id)).filter(Boolean);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// a fighter's weight in the odds: health × the hardest blow it can strike
export function strength(a) {
  const g = a.gear, sp = SPECIES.get(a.species);
  const blow = Math.max(g?.melee?.dmg ?? sp.attack?.power ?? 1, g?.rangedReady ? g.ranged.dmg * 0.8 : 0);
  return Math.max(0, a.hp) * blow;
}

const wooden = w => w.buildings.filter(b => b.done && b.cells.length && BUILDINGS.get(b.key).wooden);

// the colonist a kill-band came for: the one who has killed most raiders (a blood feud), otherwise the
// weakest (easy prey)
function pickVictim(w) {
  const col = colonists(w).filter(a => !a.downed); if (!col.length) return null;
  const feud = col.filter(a => (a.stats?.raiders || 0) > 0).sort((x, y) => y.stats.raiders - x.stats.raiders)[0];
  return feud ? {who: feud, why: 'кровник: убивал их'} : {who: col.sort((x, y) => strength(x) - strength(y))[0], why: 'самая лёгкая добыча'};
}

// a new band: the plan, the leader, everyone's role
export function createSquad(w, group) {
  const band = RAID_BANDS.get(group[0].band), sqs = table(w);
  const id = w.nextSquad = (w.nextSquad || 0) + 1;
  // the dead (even with their necromancer behind) have no plan but the living and no morale to break
  const dead = group.filter(a => SPECIES.get(a.species).mindless).length;
  const kind = dead * 2 > group.length ? 'mindless' : 'living';
  let goal = kind === 'mindless' ? 'slaughter' : weighted(w.rngs.outside, (band.goals ? band.goals(w, group) : [['loot', 1]]).filter(([, v]) => v > 0)) || 'loot';
  let target = null, why = null;
  const tipped = goal !== 'scout' && w.scouted?.[band.id] != null;
  if (tipped) delete w.scouted[band.id];
  if (goal === 'kill') { const v = pickVictim(w); if (v) { target = v.who.id; why = v.why; } else goal = 'loot'; }
  if (goal === 'burn') { const bs = wooden(w); if (bs.length) target = bs[Math.floor(w.rngs.outside() * bs.length)].id; else goal = 'loot'; }
  // the leader: the necromancer or the vampire if there is one, otherwise the strongest who is no beast
  const people = group.filter(a => !a.warBeast);
  const leader = group.find(a => a.role === 'necromancer' || a.species === 'vampire') || people.sort((x, y) => strength(y) - strength(x))[0] || group[0];
  // an unnamed leader gets a title
  if (leader.name === 'Налётчик') leader.name = 'Атаман';
  else if (kind === 'living' && group.length > 1 && !leader.role && !leader.warBeast && leader.name === SPECIES.get(leader.species).label.replace(/^./, c => c.toUpperCase())) leader.name += '-вожак';
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
    else if (a.gear?.rangedReady) a.sqRole = 'shooter';
    else rest.push(a);
  }
  rest.sort((x, y) => strength(x) - strength(y));   // weakest first: they loot and carry the torches
  const special = goal === 'loot' ? Math.max(1, Math.round(rest.length * SQUAD.looters)) : goal === 'burn' ? Math.min(2, rest.length) : 0;
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
  const victim = sq.target != null && sq.goal === 'kill' ? w.agents.find(o => o.id === sq.target) : null;
  const g = GOALS[sq.goal], aim = typeof g.aim === 'function' ? g.aim(`<b>${esc(victim?.name || '?')}</b> (${sq.why})`) : g.aim;
  const b = sq.goal === 'burn' ? w.buildings.find(x => x.id === sq.target) : null;
  const what = b ? ` (${BUILDINGS.get(b.key).name.toLowerCase()})` : '';
  const leader = w.agents.find(o => o.id === sq.leader);
  log(w, `${Label(sq)}: ${aim}${what}.${sq.kind === 'living' && sq.size > 1 && leader ? ` Ведёт ${esc(leader.name)}.` : ''}${tipped ? ' Дорогу им показали разведчики.' : ''}`, 'danger');
}

// a member died (agents/agent.js kill)
export function noteFallen(w, a) {
  for (const s of Object.values(w.squads || {})) if (s.target === a.id) s.targetDown = true;   // the one they came for
  const sq = squadOf(w, a); if (!sq) return;
  sq.fallen++;
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
  for (const o of colonists(w)) if (!o.sleeping && ms.some(m => dist(m, o) < SQUAD.view)) s += strength(o);
  return s;
}

export function moraleOf(w, sq, ms = membersOf(w, sq)) {
  if (sq.kind === 'mindless') return 1;
  const leaderDown = !ms.some(m => m.id === sq.leader);
  const own = ms.reduce((s, a) => s + strength(a), 0), foes = defenders(w, ms);
  const odds = foes > 0 ? clamp((own / foes - 1) * SQUAD.odds, -SQUAD.odds * 1.5, SQUAD.odds) : 0;
  return 1 - SQUAD.lossWeight * sq.fallen / sq.size - (leaderDown ? SQUAD.leaderLoss : 0) + odds;
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
    sq.morale = +moraleOf(w, sq, ms).toFixed(3);
    const nerve = SQUAD.nerve[sq.kind] + (RAID_BANDS.get(sq.band).nerve || 0);
    if (sq.morale < nerve) {
      const leaderDown = !ms.some(m => m.id === sq.leader);
      const why = sq.fallen / sq.size >= 0.4 ? `потери (${sq.fallen} из ${sq.size} пали)` : leaderDown ? 'пал вожак' : 'защитников больше';
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
      if (sq.targetDown) setState(w, sq, 'withdraw', GOALS.kill.done);
      else if (!w.agents.some(o => o.id === sq.target)) { sq.goal = 'loot'; for (const m of ms) if (m.sqRole === 'front' && !m.looted && w.rngs.outside() < SQUAD.looters) m.sqRole = 'looter'; }
    } else if (g === 'burn') {
      if (sq.lit != null && w.tick - sq.lit > SQUAD.burnFor) setState(w, sq, 'withdraw', GOALS.burn.done);
      else if (sq.lit == null && !w.buildings.some(b => b.id === sq.target && b.done)) { sq.goal = 'loot'; for (const m of ms) if (m.sqRole === 'torch') m.sqRole = 'looter'; }
    } else if (g === 'scout') {
      if (sq.watched != null && w.tick - sq.watched > SQUAD.scoutWatch) setState(w, sq, 'withdraw', GOALS.scout.done);
    }
  }
}

// the foe to fight, holding on to the current one unless another is much closer
function holdFoe(w, a, fresh) {
  const t = a.task?.id === 'fight' ? a.task.target : null;
  if (!t || t.dead || t.downed || !w.agents.includes(t) || !canSee(w, a, t)) return fresh;
  if (!fresh || fresh === t) return t;
  const held = w.tick - (a.task.since ?? w.tick);
  return held > SQUAD.hold || dist(a, fresh) < dist(a, t) * SQUAD.closer ? fresh : t;
}
const fight = (w, a, e) => (a.task?.id === 'fight' && a.task.target === e ? a.task : {id: 'fight', target: e, since: w.tick});

// what a member of a squad does now; null when the plan has nothing to say (the brain's own default)
export function planFor(w, a, sq, radius) {
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
  const attacker = w.agents.find(o => !o.dead && o.faction === 'colony' && o.task?.id === 'fight' && o.task.target === a);
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
    const v = w.agents.find(o => o.id === sq.target && !o.dead && !o.downed);
    if (v && canSee(w, a, v) && dist(a, v) < 30 && !close) return fight(w, a, v);
  }
  const e = holdFoe(w, a, nearestHostile(w, a, radius));
  if (e) return fight(w, a, e);
  // nobody to fight: a band that came for someone (or to cover the torches) waits at the camp
  if (sq.goal === 'kill' || sq.goal === 'burn') return a.task?.id === 'haunt' ? a.task : {id: 'haunt'};
  return null;
}

// for the card
export function squadText(w, a) {
  const sq = squadOf(w, a); if (!sq) return null;
  const goal = GOALS[sq.goal].label + (sq.goal === 'kill' ? `: ${w.agents.find(o => o.id === sq.target)?.name || '—'}` : '');
  const state = sq.state === 'march' ? `боевой дух ${Math.round(clamp(sq.morale, 0, 1.5) * 100)}%` : sq.state === 'retreat' ? `отступают (${sq.reason})` : `уходят (${sq.reason})`;
  const left = membersOf(w, sq).length;
  return `${ROLES[a.sqRole] || '—'}${a.id === sq.leader && a.sqRole !== 'leader' ? ', вожак' : ''}; цель — ${goal}; ${state}; в строю ${left} из ${sq.size}`;
}
