// The guild's branches and its move (data/guild.js GUILD.branch; plan claude/guild-plan.md Г7; docs/GUILD.md «Филиалы и
// переезд»; the author's word 14.11). A branch is a second house of the guild in another town: a manager at his post there, a
// few contracts of its town on the board, a few more at the door from its land, its town's goods for the armory, its own fame
// in its town; a party for a contract of its town sets out from it. A member lives at one house: the guild's, or a branch's —
// from one to another by the road. The guild may move: to a branch's town (a season or two), or to a town where it buys a house
// (a year or two); it takes nothing in meanwhile, its rooms lose a level or two, and the old house becomes a branch.
//   G.branches = [{town, opened: {year, season}, manager (a member's id) | null, fame, seeded}]
//   a member living at a branch: m.house = its town (none: at the guild's house); his post there: m.guild = {state: 'post',
//     post: 'branch', branch (its town)}; on the road between houses: m.guild = {state: 'road', since, until, to, then}
//   G.moving = {to, from, until (the history step it is done at), branch (to a branch's town), forced (the old town fell)} | null
import {isLive as live, release, leaveGuild} from './roster.js';
import {GUILD} from '../data/guild.js';
import {ROOMS} from '../data/rooms.js';
import {RETINUE, CAMPAIGN} from '../data/campaign.js';
import {scaleOf, townLabel, atWar} from '../atlas/index.js';
import {cellDist, refuse} from '../core/util.js';
import {levelOf, tierOf, postBranch, dropContracts} from './contracts.js';
import {houseOf} from './house.js';

const B = () => GUILD.branch;
const r1 = x => Math.round(x * 10) / 10;
const townOf = (a, id) => a.towns.find(t => t.id === id) || null;
const inTown = t => (t ? `${townLabel(t, 3)} ${t.name}` : 'городе');   // «в городе Брод»
const toTown = t => (t ? `${townLabel(t, 1)} ${t.name}` : 'город');     // «в город Брод»
const outNow = G => (G.live || []).filter(K => !K.closed);

export const branchesOf = G => (G.branches ||= []);
export const branchAt = (G, town) => branchesOf(G).find(b => b.town === town) || null;
// how many branches the guild's level allows (GUILD.branch.at)
export const branchesMost = G => B().at.filter(L => levelOf(G) >= L).length;
export const branchCost = G => B().cost[Math.min(B().cost.length - 1, branchesOf(G).length)];
// the town a member lives in: a branch's, or the guild's
export const houseTown = (G, m) => m.house ?? G.town;
export const managerOf = (G, br) => (br?.manager == null ? null : G.members.find(m => m.id === br.manager && m.alive && m.guild?.state === 'post' && m.guild.post === 'branch' && m.guild.branch === br.town) || null);
const besieged = (a, t) => (a.parties || []).some(p => p.siege && p.target === t.id && p.state === 'stay');
const realmOfG = (a, G) => townOf(a, G.town)?.realm ?? G.realm;
// why a branch stands idle now (null: at work)
export function branchIdle(a, G, br) {
  const t = townOf(a, br.town);
  if (!t?.alive) return 'город пал';
  if (G.moving) return 'гильдия переезжает';
  if (branchesOf(G).indexOf(br) >= branchesMost(G)) return `гильдии ${levelOf(G)}-го уровня столько филиалов не положено`;
  if (t.realm != null && atWar(a, realmOfG(a, G), t.realm)) return 'его держава воюет с нашей';
  if (besieged(a, t)) return 'город в осаде';
  if (!managerOf(G, br)) return 'нет управляющего';
  return null;
}
export const branchWorks = (a, G, br) => !!br && !branchIdle(a, G, br);
// the manager's Charisma (GUILD.branch.manager): the fee at the branch's door, its town's prices
const cOf = m => m?.special?.C ?? 5;
const within = x => Math.min(B().manager.span[1], Math.max(B().manager.span[0], x));
export const feeK = (G, br) => within(1 - B().manager.fee * (cOf(managerOf(G, br)) - 5));
export const priceK = (G, br) => within(1 - B().manager.price * (cOf(managerOf(G, br)) - 5));
// local fame (GUILD.branch.fame): the pay of its town's contracts, one tier above the guild's from `tier`
export const payK = br => 1 + Math.min(B().fame.payMost, B().fame.pay * (br.fame || 0));
export const tierAt = (G, br) => Math.min(5, tierOf(G) + ((br.fame || 0) >= B().fame.tier ? 1 : 0));
// the guild seen from a town (the contracts' machinery: the issuer, the road, the camps)
export function viewAt(a, G, town) {
  const t = townOf(a, town), V = Object.create(G);
  V.town = town; V.realm = t?.realm ?? G.realm; V.people = RETINUE[t?.people] ? t.people : G.people;
  return V;
}
// the people of a town at the door: its own people if they make a company (data/campaign.js RETINUE), else the guild's
export const doorOf = (a, G, town) => { const t = townOf(a, town); return {capital: town, people: RETINUE[t?.people] ? t.people : G.people, realm: t?.realm ?? G.realm}; };

// ── opening and closing
export function openWhy(a, G, town) {
  if (G.phase !== 'open') return 'гильдия закрыта';
  if (G.moving) return 'гильдия переезжает';
  const t = townOf(a, town); if (!t?.alive) return 'такого города нет';
  if (town === G.town) return 'здесь дом гильдии';
  if (branchAt(G, town)) return 'здесь уже есть филиал';
  const most = branchesMost(G); if (branchesOf(G).length >= most) return most ? `больше ${most} ${most === 1 ? 'филиала' : 'филиалов'} гильдии ${levelOf(G)}-го уровня не держать` : `первый филиал — с ${B().at[0]}-го уровня гильдии`;
  if (t.realm != null && atWar(a, realmOfG(a, G), t.realm)) return 'держава этого города воюет с нашей';
  const c = branchCost(G); if (G.gold < c) return `в казне нет ${c} зол.`;
  return null;
}
export function openBranch(a, G, town, {pay, tell}) {
  const why = openWhy(a, G, town); refuse(why);
  const t = townOf(a, town), c = branchCost(G);
  pay(G, -c, `филиал в ${inTown(t)}`);
  branchesOf(G).push({town, opened: {year: a.hist?.year ?? 0, season: a.hist?.season ?? 0}, manager: null, fame: 0});
  tell(`Гильдия открыла филиал в ${inTown(t)}. Нужен управляющий — без него филиал стоит.`, 'house');
}
// a branch let go (or lost): its people on the road to the guild's house, its contracts off the board
export function closeBranch(a, G, town, {tell}, why = null) {
  const br = branchAt(G, town); if (!br) return;
  const t = townOf(a, town), home = townOf(a, G.moving?.to ?? G.town);
  G.branches = branchesOf(G).filter(b => b !== br);
  for (const m of G.members) {
    if (!live(m)) continue;
    if (m.guild.state === 'post' && m.guild.post === 'branch' && m.guild.branch === town) release(G, m);
    if (m.house === town && ['ready', 'retired'].includes(m.guild.state)) sendOff(a, G, m, home?.id ?? G.town);
    else if (m.guild.state === 'road' && m.guild.to === town) m.guild.to = home?.id ?? G.town;
  }
  dropContracts(a, G, rec => rec.branch === town, why ? 'филиал потерян' : 'гильдия закрыла филиал', {tell, r: () => 0});
  tell(why ? `Гильдия потеряла филиал в ${inTown(t)}: ${why}. Его люди идут домой.` : `Гильдия закрыла филиал в ${inTown(t)}.`, why ? 'death' : 'house');
}

// ── the manager: one of the guild (GUILD.branch.manager.level and up) at his post at the branch; one living elsewhere goes there
// by the road first and takes it when he comes
export function managerWhy(a, G, town, m) {
  const br = branchAt(G, town); if (!br) return 'здесь нет филиала';
  if (!m || !m.alive) return 'некого';
  if (managerOf(G, br) === m) return null;
  if (!['ready', 'retired'].includes(m.guild?.state)) return `${m.name} сейчас занят`;
  if ((m.level || 1) < B().manager.level) return `управляющий — не ниже ${B().manager.level}-го уровня (у ${m.name} ${m.level || 1}-й)`;
  if (houseTown(G, m) !== town) return transferWhy(a, G, m, town);
  return null;
}
export function setManager(a, G, town, id, io) {
  const br = branchAt(G, town), t = townOf(a, town), was = managerOf(G, br), m = id == null ? null : G.members.find(x => x.id === id);
  if (!br) throw new Error('Здесь нет филиала.');
  if (m && m === was) return;
  if (m) { const why = managerWhy(a, G, town, m); refuse(why); }
  if (was) { release(G, was); io.tell(`${was.name} оставил филиал в ${inTown(t)}.`, 'house'); }
  br.manager = null;
  if (!m) return;
  if (houseTown(G, m) === town) { take(G, br, m); io.tell(`${m.name} — управляющий филиала в ${inTown(t)}.`, 'house'); return; }
  transfer(a, G, m.id, town, io, 'manage');
}
const take = (G, br, m) => { br.manager = m.id; m.guild = {state: 'post', post: 'branch', branch: br.town, since: G.day}; };

// ── the road between houses: its days (GUILD.branch.road), the gold a day of it
export function roadDays(a, from, to) {
  const p = townOf(a, from), q = townOf(a, to); if (!p || !q) return B().road.least;
  return Math.max(B().road.least, Math.round(cellDist(a, p.i, q.i) / (CAMPAIGN.speed * scaleOf(a))));
}
const houses = (a, G) => [G.town, ...branchesOf(G).map(b => b.town), ...(G.moving ? [G.moving.to] : [])].filter(id => townOf(a, id)?.alive);
export const roadGold = (a, G, m, to) => r1(roadDays(a, houseTown(G, m), to) * B().road.gold);
export function transferWhy(a, G, m, to) {
  if (!m || !m.alive) return 'некого';
  if (G.moving) return 'гильдия переезжает';
  if (!['ready', 'retired'].includes(m.guild?.state)) return `${m.name} сейчас занят`;
  if (!houses(a, G).includes(to)) return 'там нет дома гильдии';
  if (houseTown(G, m) === to) return `${m.name} и так там`;
  const g = roadGold(a, G, m, to); if (G.gold < g) return `в казне нет ${g} зол. на дорогу`;
  return null;
}
export function transfer(a, G, id, to, {pay, tell}, then = null) {
  const m = G.members.find(x => x.id === id), why = transferWhy(a, G, m, to);
  refuse(why);
  const g = roadGold(a, G, m, to), t = townOf(a, to);
  if (g > 0) pay(G, -g, `дорога: ${m.name} — в ${toTown(t)}`);
  sendOff(a, G, m, to, then);
  tell(`${m.name} ${m.gender === 'f' ? 'отправилась' : 'отправился'} в ${toTown(t)}${then === 'manage' ? ' управлять филиалом' : ''}: ${m.guild.until - G.day} дн. пути.`, 'people');
}
function sendOff(a, G, m, to, then = null) { m.guild = {state: 'road', since: G.day, until: G.day + roadDays(a, houseTown(G, m), to), to, then}; }
// a day of the guild (campaign/guild.js homeDay): those on the road come to their house (a house gone — on to the guild's)
export function roadDay(a, G, tell) {
  for (const m of G.members) {
    if (!m.alive || m.guild?.state !== 'road' || G.day < m.guild.until) continue;
    const {to, then} = m.guild;
    const home = G.moving?.to ?? G.town;
    if (!houses(a, G).includes(to) && to !== home) { m.house = to; sendOff(a, G, m, home); continue; }   // (the house gone: on to the guild's — its own gone too, he waits there)
    if (to === G.town) delete m.house; else m.house = to;
    release(G, m);
    const br = branchAt(G, to);
    if (then === 'manage' && br && !managerOf(G, br) && !G.moving) { take(G, br, m); tell(`${m.name} ${m.gender === 'f' ? 'приняла' : 'принял'} филиал в ${inTown(townOf(a, to))}.`, 'house'); }
  }
}
// those back from the road at `town` (an expedition's start: campaign/guild.js closeExpedition) — at its house, or on to the guild's
export function settleAt(a, G, ms, town) {
  const ok = houses(a, G).includes(town);
  for (const m of ms) {
    if (ok && town === G.town) { delete m.house; continue; }
    m.house = town;
    if (!ok) sendOff(a, G, m, G.moving?.to ?? G.town);
  }
}

// ── a season (campaign/guild.js stepGuild, at its start): the move done, the branches' upkeep, the towns fallen, the guild's own
// town fallen (to the nearest branch — a forced move)
export function branchSeason(a, G, io) {
  if (G.moving && (a.hist.step >= G.moving.until || !townOf(a, G.moving.to)?.alive)) settleMove(a, G, io);
  for (const br of [...branchesOf(G)]) if (!townOf(a, br.town)?.alive) closeBranch(a, G, br.town, io, 'город пал');
  if (!G.moving && !townOf(a, G.town)?.alive) {
    const to = branchesOf(G).map(b => townOf(a, b.town)).filter(Boolean).sort((p, q) => roadDays(a, G.town, p.id) - roadDays(a, G.town, q.id))[0];
    if (to) {
      const [lo, hi] = B().move.branch, n = lo + Math.floor(io.r() * (hi - lo + 1));
      G.moving = {to: to.id, from: G.town, until: a.hist.step + n, branch: true, forced: true};
      for (const c of G.chores || []) for (const id of c.ids) { const m = G.members.find(x => x.id === id); if (m && live(m)) release(G, m); }
      G.chores = []; G.offers = []; G.recruits = (G.recruits || []).filter(m => m.family);   // (the deeds of the fallen town are over)
      for (const m of G.members) if (live(m) && m.house == null && m.guild.state !== 'road' && m.guild.state !== 'expedition') { sendOff(a, G, m, to.id); }
      io.tell(`Город гильдии пал. Гильдия уходит в свой филиал в ${toTown(to)}: дом придётся ставить заново.`, 'death', true);
    }
  }
  const n = branchesOf(G).length, up = n * B().upkeep;
  if (up > 0) io.pay(G, -Math.min(up, Math.max(0, G.gold)), `содержание ${n === 1 ? 'филиала' : 'филиалов'}`);
}
// a season's posting at the branches at work (campaign/contracts.js postBranch); io — {r, tell}
export function branchContracts(a, G, io) {
  if (G.moving) return;
  for (const br of branchesOf(G)) if (branchWorks(a, G, br)) postBranch(a, viewAt(a, G, br.town), br, {slots: B().slots, most: tierAt(G, br), k: payK(br)}, io);
}
// the fame a contract of a branch's town brought (or cost): kept by the branch too
export function localFame(G, town, d) {
  const br = branchAt(G, town); if (!br || !d) return;
  br.fame = Math.max(0, r1((br.fame || 0) + d * B().fame.share));
}

// ── the move (GUILD.branch.move)
export const moveSpan = (G, to) => (branchAt(G, to) ? B().move.branch : B().move.bare);
export const moveCost = (G, to) => (branchAt(G, to) ? 0 : B().move.house);
// tied to the town the guild leaves: wed in it, a kin of its people, a child growing up in it
export function tiedHere(a, G, m) {
  if (m.wedTown) return 'семья в городе';
  if (m.kinOfPerson != null && (a.persons || []).some(p => p.id === m.kinOfPerson && p.alive)) return 'родня в городе';
  if ((G.children || []).some(c => !c.grown && (c.kin || []).some(k => k.id === m.id))) return 'растут дети';
  return null;
}
export function moveWhy(a, G, to) {
  if (G.phase !== 'open') return 'гильдия закрыта';
  if (G.moving) return 'гильдия уже переезжает';
  const t = townOf(a, to); if (!t?.alive) return 'такого города нет';
  if (to === G.town) return 'гильдия и так здесь';
  if (outNow(G).length) return 'отряды в пути: дождитесь их';
  if ((G.chores || []).length) return 'люди на делах в городе';
  if (t.realm != null && atWar(a, realmOfG(a, G), t.realm)) return 'держава этого города воюет с нашей';
  const c = moveCost(G, to); if (G.gold < c) return `дом там стоит ${c} зол.`;
  return null;
}
// the move begun: the house bought (no branch there), the people at the guild's house on the road — those tied to the town stay
// at it (it becomes a branch, if there is a place for one) or, with no branch to stay at, may leave
export function moveGuild(a, G, to, io) {
  const why = moveWhy(a, G, to); refuse(why);
  const t = townOf(a, to), br = branchAt(G, to), [lo, hi] = moveSpan(G, to), n = lo + Math.floor(io.r() * (hi - lo + 1)), from = townOf(a, G.town);
  const c = moveCost(G, to); if (c) io.pay(G, -c, `дом гильдии в ${inTown(t)}`);
  G.moving = {to, from: G.town, until: a.hist.step + n, branch: !!br};
  const keep = keepOld(a, G, G.moving);
  G.offers = []; G.recruits = (G.recruits || []).filter(m => m.family);   // (its own grown children wait for the new door)
  const stay = [], left = [];
  for (const m of G.members) {
    if (!live(m) || m.house != null || m.guild.state === 'road') continue;
    const tie = tiedHere(a, G, m);
    if (tie && keep) { stay.push(m); continue; }
    if (tie && io.r() < B().move.stay) { leaveGuild(a, G, m, `остался в ${inTown(from)}: ${tie}`); left.push(m); continue; }
    if (m.guild.state !== 'ready' && m.guild.state !== 'retired') release(G, m);
    sendOff(a, G, m, to);
  }
  io.tell(`Гильдия переезжает в ${toTown(t)}: ${n} ${n === 1 ? 'сезон' : n < 5 ? 'сезона' : 'сезонов'} без новых дел.${stay.length ? ` Остаются в ${inTown(from)}: ${stay.map(m => m.name).join(', ')}.` : ''}${left.length ? ` Ушли из гильдии, не бросив своих: ${left.map(m => m.name).join(', ')}.` : ''}`, 'start', true);
  return G.moving;
}
// (a story's step, the guild's own errand: the guild's wherever its house is — never a branch's, never dropped by a move)
const theirs = rec => rec.chain != null || rec.issuer?.kind === 'guild';
// whether the old house will be a branch once the move is done (a place for one, the new house's branch not counted)
const keepOld = (a, G, M) => !!townOf(a, M.from)?.alive && branchesOf(G).filter(b => b.town !== M.to).length < branchesMost(G);
// the move done: the house at the new town (its rooms a level or two lower, the building under way left behind), the old one a
// branch (if there is a place for one) with its contracts, those living at the new town home
function settleMove(a, G, io) {
  const M = G.moving, t = townOf(a, M.to), old = townOf(a, M.from);
  if (!t?.alive) { G.moving = null; io.tell(`Переезд сорван: ${toTown(t)} больше нет.`, 'death', true); return; }
  const keep = keepOld(a, G, M), rooms = houseOf(G), lose = M.branch && !M.forced ? B().move.lose.branch : B().move.lose.bare, lost = [];
  for (const R of ROOMS.all()) { const L = rooms[R.id] ?? R.start, L2 = Math.max(R.start, L - lose); if (L2 < L) lost.push(R.label); rooms[R.id] = L2; }
  G.building = null;
  // the branches: the new house's struck off, the old house one of them (with the board's own contracts, not the stories)
  G.branches = branchesOf(G).filter(b => b.town !== M.to);
  const C = a.contracts?.records || [];
  if (keep) { G.branches.push({town: M.from, opened: {year: a.hist?.year ?? 0, season: a.hist?.season ?? 0}, manager: null, fame: 0, seeded: true}); for (const rec of C) if (rec.state === 'open' && rec.branch == null && !theirs(rec)) rec.branch = M.from; }
  else dropContracts(a, G, rec => rec.branch == null && !theirs(rec), 'гильдия переехала', {tell: io.tell, r: () => 0});
  for (const rec of C) if (rec.state === 'open' && rec.branch === M.to) delete rec.branch;
  // the people: those still at the old house stay at it (a branch now) or set out; those of the new town are home. A post no
  // longer there — of a room lost, of the branch that is now the house, of one left behind — is given up
  const free = m => release(G, m);
  for (const m of G.members) {
    if (!live(m)) continue;
    const st = m.guild.state, room = st === 'post' && m.guild.post !== 'branch';
    if (st === 'post' && m.guild.post === 'branch' && m.guild.branch === M.to) free(m);
    if (m.house == null && st !== 'road') {
      if (room || st === 'training' || st === 'treat') free(m);
      if (keep) m.house = M.from; else sendOff(a, G, m, M.to);
    } else if (room && !rooms[m.guild.post]) free(m);
    if (m.house === M.to) delete m.house;
  }
  G.town = M.to; G.realm = t.realm; if (RETINUE[t.people]) G.people = t.people;
  G.moving = null;
  io.tell(`Гильдия переехала в ${toTown(t)}.${lost.length ? ` Заново отстраивать: ${lost.join(', ')}.` : ''}${keep ? ` Старый дом в ${inTown(old)} — теперь филиал.` : ''}`, 'start', true);
}
