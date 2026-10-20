// The colony's board (docs/MIND.md): the overmind knows and announces, every colonist wants and chooses.
//
// Once a tick, before the creatures step, the board:
//   1. looks round through the lookouts — the colonists whose turn it is ((tick + id) % LOOK), awake and
//      on their feet; each sees the colony's foes (raiders, the nechist, anything mauling one of ours)
//      within its own sight and only those it can see (combat.js canSee);
//   2. keeps one flag per threat — a raiding band, a wolf pack, a lone foe — with where its members were
//      last seen, how strong they are, and who of ours is answering it;
//   3. cries out: a lookout who sees a new threat (or one still in view, every RESHOUT ticks) shouts,
//      everyone awake within SHOUT hears it at once and shouts on (a relay, no delay), and a sleeper
//      hears it with a chance by Perception. Who heard knows of the flag; nobody else does;
//   4. weighs each flag. A red flag — a raid, or a foe attacking one of ours — cannot be ignored and does
//      not get lighter, however many answer it, until it is over (the raiders are dead or fall back,
//      the attack stops); who does not fight keeps out of harm's way rather than going back to work.
//      A yellow flag — a wolf about, the nechist not attacking anyone — has soft places: its urgency ×
//      the share of the threat nobody covers yet; every defender lowers it for the others, a newcomer
//      foe or a fallen defender raises it again;
//   5. wakes those who should think again — who just learned of a flag, or whose flag got heavier.
// The board also holds the council's standing rule, the night watch (docs/MIND.md stage 2): one place,
// posted every evening at WATCH.from; whoever takes it does so for reasons of their own (courage, a
// rested body, sharp eyes, not having watched last night), keeps the fire and looks round for everyone
// all night, and sleeps it off in the morning. By night everyone else sees half as far, except by the fire.
// It never names anyone and never moves anyone. The colonist's own brain (agents/brains/colonist.js)
// reads the flags it knows through flagOptions() and weighs them by itself: courage, health, distance,
// what it is doing. A threat that touches the colonist itself — a blow, a foe at arm's length — is
// answered by the colonist's reflexes as before, without the board.
//
// Plain data on the world (w.board), creatures by id; saved with it.
import {colonists} from './query.js';
import {isHostile} from '../data/factions.js';
import {SPECIES} from '../data/species.js';
import {canSee} from '../agents/combat.js';
import {strength, squadOf} from '../agents/squad.js';
import {liveById} from '../agents/lookup.js';
import {hpShare} from '../agents/agent.js';
import {perTick} from '../core/util.js';
import {nearAgents} from '../agents/spatial.js';
import {think} from '../agents/mind.js';
import {log} from '../core/log.js';
import {clamp, esc, g, plural} from '../core/util.js';
import {nightness, hourOf, dayOf, DAY, HOUR} from '../core/time.js';

export const BOARD = {
  look: 5,           // a colonist looks round every this many ticks, in turn by id (as before the board)
  sight: 16,         // × mods.sight: how far a lookout sees a foe
  near: 8,           // a foe this close wakes the one who sees it at once and is urgent
  shout: 30,         // how far a cry carries
  hearAsleep: 0.1,   // × Perception: the chance a sleeper hears a cry (P 5 — every other one)
  reshout: 100,      // a threat still in view is cried again so that newcomers learn of it
  forget: {red: 300, yellow: 100},   // a member unseen this long is struck off the flag
  margin: 1.5,       // a yellow flag is covered at this × the threat's strength
  far: 40,           // nobody answers a flag further away than this
  // the weight of a flag (× the colonist's courage; a yellow one × its uncovered share): a raid, an
  // attack on one of ours, the nechist about, a beast about
  urgency: {raid: 1.35, attack: 1.1, nechist: 1.1, beast: 0.9, chase: 1.0},   // chase: raiders going off with our goods
  reserve: 1.05,     // a red flag in sight, not fought: keep out of harm's way (the fire, the settlement)
  wake: 0.25,        // a flag this much heavier wakes those who know it
  hurt: 0.3,         // health share at or under which one does not go to a fight
};

// the night watch: the council's standing rule
export const WATCH = {
  from: 21, till: 6,  // hours of the night it covers
  take: 1.2,          // the weight of taking it (× how willing one is, 0.1…1.2)
  post: 1.6,          // the weight of staying on it once taken (a tired body may still win: asleep on watch)
  offDuty: 1.5,       // the morning after: sleep it off, until the rest is back or noon
  noon: 12,
  fireLight: 6,       // the campfire lights this far: full sight by night
  fuel: 0.75,         // a tended fire burns this share of the wood an untended one does
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const boardOf = w => (w.board ??= {flags: {}, seq: 0});
// how far a colonist sees a foe: by night half as far, except by a burning campfire and on watch
function sightOf(w, a) {
  const base = BOARD.sight * (a.mods.sight ?? 1);
  if (isWatchman(w, a) || (w.campLit && Math.hypot(a.x - w.camp.x, a.y - w.camp.y) <= WATCH.fireLight)) return base;
  return base * (1 - 0.5 * nightness(w));
}

// attacking one of ours right now: a beast that mauls, a raider that fights
const attacking = o => (o.task?.id === 'maul' || o.task?.id === 'fight') && o.task.target?.faction === 'colony';
// a raider of a squad on the march (agents/squad.js): the raid itself, not one falling back or leaving
export const marching = (w, o) => { if (o.faction !== 'raiders') return false; const sq = squadOf(w, o); return !sq || sq.state === 'march'; };
// a threat to the colony: whatever attacks one of ours; raiders while their squad is on the march, and
// after it falls back or leaves only those carrying our goods off (a chase, a yellow flag); the nechist;
// a beast of prey
const COLONY = {faction: 'colony'};
function isFoe(w, o) {
  if (o.dead || o.tame || o.downed || o.faction === 'colony') return false;
  if (attacking(o)) return true;
  if (o.faction === 'raiders') return marching(w, o) || !!o.loot;
  return isHostile(COLONY, o) || o.faction === 'predators';
}
// a red flag: a raid on the march, or any of its members attacking one of ours. A squad that falls back
// with our goods on its back is a yellow flag: the chase
const isRaid = (w, f, ms) => f.kind === 'raid' && ms.some(o => marching(w, o));
const isRed = (f, ms, w) => isRaid(w, f, ms) || ms.some(attacking);
const urgencyOf = (w, f, ms) => (isRaid(w, f, ms) ? BOARD.urgency.raid : ms.some(attacking) ? BOARD.urgency.attack
  : f.kind === 'raid' ? BOARD.urgency.chase : BOARD.urgency[f.kind] ?? BOARD.urgency.beast);
// which flag a foe belongs to: its raiding squad (agents/squad.js; one raid, not the band's kind), its
// pack, or itself
const keyOf = o => (o.squad != null ? 'squad:' + o.squad : o.pack != null ? 'pack:' + o.pack : 'one:' + o.id);
const kindOf = o => (o.faction === 'raiders' ? 'raid' : o.faction === 'nechist' ? 'nechist' : 'beast');

// where a point lies from the camp, in words
const SIDES = ['к востоку', 'к юго-востоку', 'к югу', 'к юго-западу', 'к западу', 'к северо-западу', 'к северу', 'к северо-востоку'];
export function whereFromCamp(w, x, y) {
  const dx = x - w.camp.x, dy = y - w.camp.y;
  if (Math.hypot(dx, dy) < 12) return 'у самого лагеря';
  return SIDES[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8] + ' от лагеря';
}

// what the flag is about, for people: «волк», «волки (3)», «Серые волки (5)»
function flagLabel(w, f) {
  const ms = f.members.map(id => liveById(w, id)).filter(Boolean);
  if (!ms.length) return f.label || 'враг';
  const sp = SPECIES.get(ms[0].species);
  if (f.kind === 'raid') return ms.some(o => marching(w, o)) ? `налётчики (${ms.length})` : `уходят с добычей (${ms.length})`;
  return ms.length > 1 ? `${sp.plural || sp.label} (${ms.length})` : sp.label;
}

// the flag's members still alive and still foes
const liveMembers = (w, f) => f.members.map(id => liveById(w, id)).filter(o => o && isFoe(w, o));

// who of ours is answering each flag: fighting one of its members or on the way to it. Counted once a
// tick over the whole colony; a colonist who takes a flag in the middle of the tick is added at once
// (noteChoice), so the next one to weigh it already sees the place taken
const answerers = w => perTick(w, 'board.answer', () => {
  const by = {}, flags = w.board?.flags || {}, owner = new Map();
  for (const f of Object.values(flags)) for (const id of f.members) owner.set(id, f.key);
  for (const c of colonists(w)) {
    if (c.dead || c.downed) continue;
    const t = c.task, key = t?.id === 'answer' ? t.flag : t?.id === 'fight' && t.target ? owner.get(t.target.id) : null;
    if (key && flags[key]) (by[key] ||= []).push(c);
  }
  return by;
});
const answering = (w, f) => (answerers(w)[f.key] || []).filter(c => !c.dead && !c.downed);

// the share of a flag still uncovered, 0…1; `without` leaves one defender out (its own weighing).
// A red flag is never covered: it stays open until it is over
function uncovered(w, f, ms, without = null) {
  if (isRed(f, ms, w)) return 1;
  const need = ms.reduce((s, o) => s + strength(o), 0) * BOARD.margin;
  if (need <= 0) return 0;
  const covered = answering(w, f).reduce((s, c) => s + (c === without ? 0 : strength(c)), 0);
  return clamp(1 - covered / need, 0, 1);
}

// ── the cry: everyone awake within reach hears it and cries on; a sleeper may hear it
function shout(w, from, f) {
  const rolled = new Set(), queue = [from], b = w.behave?.board;
  f.shoutAt = w.tick;
  if (b) b.shouts++;
  while (queue.length) {
    const s = queue.shift();
    for (const c of nearAgents(w, s.x, s.y, BOARD.shout)) {
      if (c.faction !== 'colony' || c.dead || c.downed || f.known[c.id] || rolled.has(c.id) || dist(c, s) > BOARD.shout) continue;
      if (c.sleeping) {
        rolled.add(c.id);
        if (w.rngs.alarm() >= BOARD.hearAsleep * (c.special?.P ?? 5)) continue;
        if (b) b.heardAsleep++;
      }
      learn(w, c, f, s);
      if (!c.sleeping) queue.push(c);   // the relay: who heard and is awake cries on
    }
  }
}

// a colonist learns of a flag: by seeing the threat itself or by hearing someone cry out
function learn(w, c, f, by) {
  if (f.known[c.id]) return;
  f.known[c.id] = true;
  c.think = 0;   // the alarm clock: think again now
  if (by && by !== c) think(w, c, 'heardAlarm', {who: by.name, gender: by.gender, what: f.label, where: f.where});
}

// ── once a tick (sim.js), before the creatures step
export function stepBoard(w) {
  const B = boardOf(w), col = colonists(w);
  if (!col.length && !Object.keys(B.flags).length) return;
  const foes = [];
  for (const o of w.agents) if (isFoe(w, o)) foes.push(o);
  // 1. the lookouts look round
  const seenBy = new Map();   // flag key → the first lookout who saw it this tick
  if (foes.length) {
    for (const L of col) {
      // the night watchman looks round every tick, everyone else in turn
      if (L.dead || L.downed || L.sleeping || ((w.tick + L.id) % BOARD.look !== 0 && !isWatchman(w, L))) continue;
      const r = sightOf(w, L);
      for (const o of foes) {
        const d = dist(L, o);
        if (d > r || !canSee(w, L, o)) continue;
        const key = keyOf(o);
        let f = B.flags[key];
        if (!f) f = B.flags[key] = newFlag(w, B, key, o, L);
        if (!f.members.includes(o.id)) { f.members.push(o.id); f.grew = true; }
        f.seen[o.id] = {x: o.x, y: o.y, t: w.tick};
        if (!seenBy.has(key)) seenBy.set(key, L);
        if (!f.known[L.id]) learn(w, L, f, null);
        // a foe this close: the one who sees it thinks again at once (not mid-fight or mid-flight)
        if (d <= BOARD.near && L.task?.id !== 'fight' && L.task?.id !== 'runHome') L.think = 0;
      }
    }
  }
  stepWatch(w, B);
  // 2–5. every flag: members, place, the cry, the weight, the wake-up, the end
  for (const f of Object.values(B.flags)) {
    const forget = f.red ? BOARD.forget.red : BOARD.forget.yellow;
    for (const id of Object.keys(f.seen)) if (w.tick - f.seen[id].t > forget) { delete f.seen[id]; f.members = f.members.filter(m => m !== +id); }
    const ms = liveMembers(w, f);
    if (!ms.length) { closeFlag(w, B, f); continue; }
    f.red = isRed(f, ms, w);
    if (f.red && !f.redLogged) { f.redLogged = true; logRed(w, f, ms, seenBy.get(f.key)); }
    const pts = Object.values(f.seen);
    if (pts.length) { f.x = pts.reduce((s, p) => s + p.x, 0) / pts.length; f.y = pts.reduce((s, p) => s + p.y, 0) / pts.length; }
    f.label = flagLabel(w, f); f.where = whereFromCamp(w, f.x, f.y);
    const L = seenBy.get(f.key);
    if (L && (f.fresh || f.grew || w.tick - f.shoutAt >= BOARD.reshout)) shout(w, L, f);
    f.fresh = false; f.grew = false;
    f.weight = urgencyOf(w, f, ms) * uncovered(w, f, ms);
    for (const c of answering(w, f)) f.answered[c.id] = true;
    if (f.weight - f.wokeAt >= BOARD.wake) { for (const id of Object.keys(f.known)) { const c = liveById(w, id); if (c) c.think = 0; } }
    if (f.weight - f.wokeAt >= BOARD.wake || f.weight < f.wokeAt) f.wokeAt = f.weight;
  }
}

function newFlag(w, B, key, o, by) {
  const kind = kindOf(o);
  const f = {key, id: ++B.seq, kind, members: [], seen: {}, x: o.x, y: o.y, by: by.id, byName: by.name, byG: by.gender, started: w.tick,
    known: {}, answered: {}, ignored: {}, killed: {}, shoutAt: -Infinity, weight: 0, wokeAt: 0, fresh: true, grew: false};
  f.label = flagLabel(w, {...f, members: [o.id]}); f.where = whereFromCamp(w, o.x, o.y);
  const b = w.behave?.board; if (b) b.flags++;
  return f;
}

// the journal hears of a red alarm once, when it turns red (a raid has its own lines, agents/squad.js):
// a wolf seen about is the colony's everyday, a wolf on one of ours is news
function logRed(w, f, ms, spotter) {
  const b = w.behave?.board; if (b) b.red++;
  if (f.kind === 'raid') return;
  const att = ms.find(attacking), v = att?.task.target, by = spotter || liveById(w, f.by);
  if (!att || !v) return;
  log(w, `${by && by !== v ? `<b>${esc(by.name)}</b> ${g(by, 'поднял', 'подняла')} тревогу: ` : 'Тревога: '}${esc(SPECIES.get(att.species).label)} ${att.task.id === 'maul' ? 'набросился' : 'напал'} на <b>${esc(v.name)}</b> ${f.where}.`, 'danger');
}

function closeFlag(w, B, f) {
  delete B.flags[f.key];
  const who = Object.keys(f.answered).map(id => liveById(w, +id)).filter(Boolean);
  const b = w.behave?.board;
  if (b) { b.closed++; b.responders += who.length; if (!who.length) b.unanswered++; }
  if (f.kind === 'raid' || !who.length) return;
  const names = who.map(c => `<b>${esc(c.name)}</b>`);
  const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' и ' + names.at(-1) : names[0];
  const killed = Object.keys(f.killed).length > 0 && f.members.every(id => f.killed[id] || !liveById(w, id));
  const many = names.length > 1;
  log(w, `${list} ${killed ? (many ? 'одолели' : g(who[0], 'одолел', 'одолела')) : (many ? 'отогнали' : g(who[0], 'отогнал', 'отогнала'))}: ${esc(f.label)}.`, 'danger');
}

// agents/agent.js kill(): a flag remembers which of its members fell (the sweep of the dead forgets them)
export function noteBoardDeath(w, a) {
  const B = w.board; if (!B) return;
  for (const f of Object.values(B.flags)) if (f.members.includes(a.id)) f.killed[a.id] = true;
}

// ── the night watch
const watchNight = w => { const h = hourOf(w.tick); return h >= WATCH.from || h < WATCH.till ? dayOf(w.tick) - (h < WATCH.till ? 1 : 0) : null; };
export const isWatchman = (w, a) => { const W = w.board?.watch; return !!W && W.by === a.id && W.night === watchNight(w) && a.task?.id === 'watch'; };
export const watchOnPost = w => { const W = w.board?.watch; if (!W || W.by == null || W.night !== watchNight(w)) return false; const a = liveById(w, W.by); return !!a && a.task?.id === 'watch' && !a.sleeping; };

function stepWatch(w, B) {
  const night = watchNight(w), W = B.watch;
  if (night != null && (!W || W.night !== night)) {
    if (W && !W.done) endWatch(w, W);
    B.watch = {night, by: null, name: null, done: false};
  } else if (night == null && W && !W.done) endWatch(w, W);
}
// morning: the watchman goes to sleep it off; a night nobody watched is remembered
function endWatch(w, W) {
  W.done = true;
  const b = w.behave?.board;
  const a = W.by != null ? liveById(w, W.by) : null;
  if (!a) { if (b) b.unwatched = (b.unwatched || 0) + 1; if (colonists(w).some(c => !c.dead)) log(w, 'Ночью у огня никто не дежурил.', 'people'); return; }
  if (b) b.watched = (b.watched || 0) + 1;
  a.lastWatch = W.night;
  a.offDuty = dayOf(w.tick) * DAY + WATCH.noon * HOUR;
  if (a.task?.id === 'watch') a.task.over = true;
  think(w, a, 'watchDone');
}

// the colonist's choice (agents/brains/colonist.js): take the watch, keep it, or sleep it off after
export function watchOption(w, a) {
  const W = w.board?.watch, night = watchNight(w);
  if (a.offDuty > w.tick && a.needs.rest < 0.95) return [{id: 'sleep'}, WATCH.offDuty, () => 'отсыпается после ночного дозора'];
  if (night == null || !W || W.night !== night || W.done) return null;
  if (W.by === a.id) return [{id: 'watch'}, WATCH.post, () => 'на посту у огня'];
  if (W.by != null || a.lastWatch === night - 1 || hpShare(a) < 0.5) return null;
  // willing: brave, rested, sharp-eyed; a timid or worn-out one leaves it to others
  const willing = clamp(0.5 + 0.4 * (a.mods.bravery - 1) + 0.8 * (a.needs.rest - 0.6) + 0.05 * ((a.special?.P ?? 5) - 5), 0.1, 1.2);
  return [{id: 'watch'}, WATCH.take * willing, () => 'ночной дозор у огня: место свободно'];
}
// after the choice: the place is taken at once (one place, not soft); a watchman whose body wins over the
// post falls asleep on watch — the journal hears of it
export function noteWatch(w, a, best, prev) {
  const W = w.board?.watch; if (!W || W.done) return;
  if (best.id === 'watch' && W.by == null) {
    W.by = a.id; W.name = a.name;
    think(w, a, 'tookWatch');
    log(w, `<b>${esc(a.name)}</b> ${g(a, 'вызвался', 'вызвалась')} дежурить ночью у огня.`, 'people');
  } else if (W.by === a.id && prev === 'watch' && best.id === 'sleep' && !W.slept) {
    W.slept = true;
    const b = w.behave?.board; if (b) b.sleptOnWatch = (b.sleptOnWatch || 0) + 1;
    think(w, a, 'sleptOnWatch');
    log(w, `Дозорный <b>${esc(a.name)}</b> ${g(a, 'уснул', 'уснула')} на посту.`, 'people');
  }
}

// ── what the colonist's brain reads

// the flags a colonist knows of, with their live members
export function knownFlags(w, a) {
  const B = w.board; if (!B) return [];
  const out = [];
  for (const f of Object.values(B.flags)) {
    if (!f.known[a.id]) continue;
    const ms = liveMembers(w, f);
    if (ms.length) out.push({f, ms});
  }
  return out;
}

// a red flag this colonist knows of with a foe of it within r (its own sight): the one who does not
// fight it keeps out of harm's way (agents/brains/colonist.js) rather than going back to work
export function redInSight(w, a, r) {
  for (const {f, ms} of knownFlags(w, a)) if (isRed(f, ms, w) && ms.some(o => dist(a, o) <= r)) return f;
  return null;
}

// a raid on the board: the gathering at the fire (agents/tasks.js muster) holds while it is
export const raidOnBoard = w => Object.values(w.board?.flags || {}).some(f => f.kind === 'raid' && f.red);

// the closest live member of a known flag within r, or null
export function knownFoeWithin(w, a, r) {
  let best = null, bd = r;
  for (const {ms} of knownFlags(w, a)) for (const o of ms) { const d = dist(a, o); if (d <= bd) { bd = d; best = o; } }
  return best;
}

// the options the known flags give a colonist: [task, score, why], weighed by the colonist itself —
// the flag's weight without its own share, × courage, less with distance; healthy enough to go
export function flagOptions(w, a) {
  if (hpShare(a) <= BOARD.hurt) return [];
  const out = [], r = sightOf(w, a);
  for (const {f, ms} of knownFlags(w, a)) {
    const base = urgencyOf(w, f, ms) * uncovered(w, f, ms, a);
    if (base <= 0) continue;
    // the closest member it can see, else the place where they were seen
    let tgt = null, td = Infinity;
    for (const o of ms) { const d = dist(a, o); if (d < td && d <= r && canSee(w, a, o)) { td = d; tgt = o; } }
    // a raid is met together: one who cannot see the raiders gathers at the fire with the others
    // (agents/brains/colonist.js muster) instead of running out to meet the band alone. A chase after
    // raiders going off with our goods is run after, from afar too
    if (!tgt && isRaid(w, f, ms)) continue;
    const d = tgt ? td : Math.hypot(f.x - a.x, f.y - a.y);
    if (d > BOARD.far) continue;
    const near = d <= r ? 1 : 1 - 0.5 * (d - r) / Math.max(1, BOARD.far - r);
    const score = base * a.mods.bravery * near;
    const going = answering(w, f).filter(c => c !== a);
    const why = () => `${f.byName && f.by !== a.id ? `крик: ${f.label} ${f.where}` : `${f.label} ${f.where}`}${going.length ? `, уже ${going.length > 1 ? 'идут' : 'идёт'} ${going.slice(0, 3).map(c => c.name).join(', ')}` : ''}`;
    out.push([tgt ? {id: 'fight', target: tgt, flag: f.key} : {id: 'answer', flag: f.key}, score, why, f, isRed(f, ms, w)]);
  }
  return out;
}

// after the choice: a colonist who knew of a flag it could answer and chose something else says why in
// its diary, once per flag; one who took it, once too
export function noteChoice(w, a, best, flagOpts) {
  for (const [t, s, , f] of flagOpts) {
    const took = (best.id === 'answer' && best.flag === f.key) || (best.id === 'fight' && best.flag === f.key);
    if (took) { const by = answerers(w); if (!(by[f.key] ||= []).includes(a)) by[f.key].push(a); if (!f.answered[a.id]) { f.answered[a.id] = true; think(w, a, 'answeredAlarm', {what: f.label, where: f.where}); } continue; }
    if (f.ignored[a.id] || f.answered[a.id]) continue;
    f.ignored[a.id] = true;
    const b = w.behave?.board; if (b) b.ignored++;
    const ms = liveMembers(w, f), going = answering(w, f).filter(c => c !== a);
    const why = going.length && uncovered(w, f, ms, a) < 0.5 ? `туда уже ${going.length > 1 ? 'пошли' : g(going[0], 'пошёл', 'пошла')} ${going.slice(0, 2).map(c => c.name).join(' и ')}`
      : a.mods.bravery < 0.8 ? 'не хватило духу'
      : best.id === 'job' && best.job === a.likes ? 'любимое дело не бросишь'
      : best.id === 'sleep' ? 'сон сморил' : 'было не до того';
    think(w, a, 'ignoredAlarm', {what: f.label, why});
  }
}

// the «answer» task (agents/tasks.js): a foe of the flag the colonist can see now, else the nearest
// place one was seen; null when the flag is gone
export function flagLead(w, a, key) {
  const f = w.board?.flags[key]; if (!f) return null;
  const ms = liveMembers(w, f); if (!ms.length) return null;
  const r = sightOf(w, a);
  let tgt = null, td = Infinity;
  for (const o of ms) { const d = dist(a, o); if (d < td && d <= r && canSee(w, a, o)) { td = d; tgt = o; } }
  if (tgt) return {f, target: tgt};
  let at = null, ad = Infinity;
  for (const p of Object.values(f.seen)) { const d = Math.hypot(p.x - a.x, p.y - a.y); if (d < ad) { ad = d; at = p; } }
  return {f, at: at || {x: f.x, y: f.y}};
}

// for the panel: who keeps the watch tonight
export function watchSummary(w) {
  const W = w.board?.watch;
  if (!W || W.done || W.night !== watchNight(w)) return null;
  return {by: W.name, slept: !!W.slept, onPost: watchOnPost(w)};
}

// for the panel: the flags on the board now
export function boardSummary(w) {
  const B = w.board; if (!B) return [];
  return Object.values(B.flags).map(f => {
    const ms = liveMembers(w, f), going = answering(w, f);
    return {key: f.key, red: !!f.red, label: f.label, where: f.where, by: f.byName, byG: f.byG, weight: f.weight, known: Object.keys(f.known).length, going: going.map(c => c.name)};
  });
}
