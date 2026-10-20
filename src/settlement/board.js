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
//   4. weighs each flag: its urgency × the share of the threat nobody covers yet (soft places: every
//      defender lowers it for the others, a newcomer foe or a fallen defender raises it again);
//   5. wakes those who should think again — who just learned of a flag, or whose flag got heavier.
// It never names anyone and never moves anyone. The colonist's own brain (agents/brains/colonist.js)
// reads the flags it knows through flagOptions() and weighs them by itself: courage, health, distance,
// what it is doing. A threat that touches the colonist itself — a blow, a foe at arm's length — is
// answered by the colonist's reflexes as before, without the board.
//
// Plain data on the world (w.board), creatures by id; saved with it.
import {colonists, raidAlarm} from './query.js';
import {isHostile} from '../data/factions.js';
import {SPECIES} from '../data/species.js';
import {canSee} from '../agents/combat.js';
import {strength} from '../agents/squad.js';
import {liveById} from '../agents/lookup.js';
import {hpShare} from '../agents/agent.js';
import {perTick} from '../core/util.js';
import {nearAgents} from '../agents/spatial.js';
import {think} from '../agents/mind.js';
import {log} from '../core/log.js';
import {clamp, esc, g, plural} from '../core/util.js';

export const BOARD = {
  look: 5,           // a colonist looks round every this many ticks, in turn by id (as before the board)
  sight: 16,         // × mods.sight: how far a lookout sees a foe
  near: 8,           // a foe this close wakes the one who sees it at once and is urgent
  shout: 30,         // how far a cry carries
  hearAsleep: 0.1,   // × Perception: the chance a sleeper hears a cry (P 5 — every other one)
  reshout: 100,      // a threat still in view is cried again so that newcomers learn of it
  forget: 300,       // a member unseen this long is struck off the flag
  // the colony feels a threat covered at this × its strength: a raiding band came to kill, loot and burn,
  // not to trade blows one on one, so it takes more than its weight in a fight to hold it off
  margin: {raid: 1.5, other: 1.5},
  far: 40,           // nobody answers a flag further away than this
  urgency: {raid: 1.35, other: 1.1},   // the weight of an uncovered flag (× the colonist's courage)
  wake: 0.25,        // a flag this much heavier wakes those who know it
  hurt: 0.3,         // health share at or under which one does not go to a fight
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const boardOf = w => (w.board ??= {flags: {}, seq: 0});
const sightOf = a => BOARD.sight * (a.mods.sight ?? 1);

// a foe of the colony: at war with it (raiders, the nechist), or mauling one of ours
const COLONY = {faction: 'colony'};
function isFoe(o) {
  if (o.dead || o.tame || o.downed || o.faction === 'colony') return false;
  return isHostile(COLONY, o) || (o.task?.id === 'maul' && o.task.target?.faction === 'colony');
}
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
  if (f.kind === 'raid') return `налётчики (${ms.length})`;
  return ms.length > 1 ? `${sp.plural || sp.label} (${ms.length})` : sp.label;
}

// the flag's members still alive and still foes
const liveMembers = (w, f) => f.members.map(id => liveById(w, id)).filter(o => o && isFoe(o));

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

// the share of a flag still uncovered, 0…1; `without` leaves one defender out (its own weighing)
function uncovered(w, f, ms, without = null) {
  const need = ms.reduce((s, o) => s + strength(o), 0) * (f.kind === 'raid' ? BOARD.margin.raid : BOARD.margin.other);
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
  for (const o of w.agents) if (isFoe(o)) foes.push(o);
  // 1. the lookouts look round
  const seenBy = new Map();   // flag key → the first lookout who saw it this tick
  if (foes.length) {
    for (const L of col) {
      if (L.dead || L.downed || L.sleeping || (w.tick + L.id) % BOARD.look !== 0) continue;
      const r = sightOf(L);
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
  // 2–5. every flag: members, place, the cry, the weight, the wake-up, the end
  for (const f of Object.values(B.flags)) {
    for (const id of Object.keys(f.seen)) if (w.tick - f.seen[id].t > BOARD.forget) { delete f.seen[id]; f.members = f.members.filter(m => m !== +id); }
    const ms = liveMembers(w, f);
    if (!ms.length) { closeFlag(w, B, f); continue; }
    const pts = Object.values(f.seen);
    if (pts.length) { f.x = pts.reduce((s, p) => s + p.x, 0) / pts.length; f.y = pts.reduce((s, p) => s + p.y, 0) / pts.length; }
    f.label = flagLabel(w, f); f.where = whereFromCamp(w, f.x, f.y);
    const L = seenBy.get(f.key);
    if (L && (f.fresh || f.grew || w.tick - f.shoutAt >= BOARD.reshout)) shout(w, L, f);
    f.fresh = false; f.grew = false;
    f.weight = (f.kind === 'raid' || raidAlarm(w) ? BOARD.urgency.raid : BOARD.urgency.other) * uncovered(w, f, ms);
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
  // a raid has its own journal lines (agents/squad.js); beasts and the nechist get theirs here
  if (kind !== 'raid') log(w, `<b>${esc(by.name)}</b> ${g(by, 'заметил', 'заметила')} ${f.label === 'враг' ? 'врага' : esc(accOf(o))} ${f.where} и ${g(by, 'поднял', 'подняла')} тревогу.`, 'danger');
  return f;
}
const accOf = o => SPECIES.get(o.species).labelAcc || SPECIES.get(o.species).label;

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
  const out = [], r = sightOf(a);
  for (const {f, ms} of knownFlags(w, a)) {
    const base = (f.kind === 'raid' || raidAlarm(w) ? BOARD.urgency.raid : BOARD.urgency.other) * uncovered(w, f, ms, a);
    if (base <= 0) continue;
    // the closest member it can see, else the place where they were seen
    let tgt = null, td = Infinity;
    for (const o of ms) { const d = dist(a, o); if (d < td && d <= r && canSee(w, a, o)) { td = d; tgt = o; } }
    const d = tgt ? td : Math.hypot(f.x - a.x, f.y - a.y);
    if (d > BOARD.far) continue;
    const near = d <= r ? 1 : 1 - 0.5 * (d - r) / Math.max(1, BOARD.far - r);
    const score = base * a.mods.bravery * near;
    const going = answering(w, f).filter(c => c !== a);
    const why = () => `${f.byName && f.by !== a.id ? `крик: ${f.label} ${f.where}` : `${f.label} ${f.where}`}${going.length ? `, уже ${going.length > 1 ? 'идут' : 'идёт'} ${going.slice(0, 3).map(c => c.name).join(', ')}` : ''}`;
    out.push([tgt ? {id: 'fight', target: tgt, flag: f.key} : {id: 'answer', flag: f.key}, score, why, f]);
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
  const r = sightOf(a);
  let tgt = null, td = Infinity;
  for (const o of ms) { const d = dist(a, o); if (d < td && d <= r && canSee(w, a, o)) { td = d; tgt = o; } }
  if (tgt) return {f, target: tgt};
  let at = null, ad = Infinity;
  for (const p of Object.values(f.seen)) { const d = Math.hypot(p.x - a.x, p.y - a.y); if (d < ad) { ad = d; at = p; } }
  return {f, at: at || {x: f.x, y: f.y}};
}

// for the panel: the flags on the board now
export function boardSummary(w) {
  const B = w.board; if (!B) return [];
  return Object.values(B.flags).map(f => {
    const ms = liveMembers(w, f), going = answering(w, f);
    return {key: f.key, label: f.label, where: f.where, by: f.byName, byG: f.byG, weight: f.weight, known: Object.keys(f.known).length, going: going.map(c => c.name)};
  });
}
