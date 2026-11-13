// The guild's house (data/rooms.js; plan claude/guild-plan.md Г3; docs/GUILD.md «Дом гильдии»): its rooms and their levels, the
// one building under way, the posts (one of the guild's people at work in a room: its manager, trainer, healer…), and what the
// rooms do each season — the upkeep, the tavern's take, the trainees' lessons, the healer's patients. The rest of the guild
// reads a room's effect through `roomBy` (campaign/guild.js, campaign/contracts.js).
//   G.rooms = {id: level}; G.building = {room, level, ready (the history step it is ready at)} | null
//   a member at a post: m.guild = {state: 'post', post: room}; a trainee — {state: 'training'}; a patient — {state: 'treat'}
import {ROOMS, HOUSE} from '../data/rooms.js';
import {GUILD} from '../data/guild.js';

export const houseOf = G => { G.rooms ||= Object.fromEntries(ROOMS.all().map(R => [R.id, R.start])); if (G.building === undefined) G.building = null; return G.rooms; };
export const roomLevel = (G, id) => houseOf(G)[id] ?? ROOMS.get(id).start;
// the one at a room's post (alive, at it), or null
export const staffOf = (G, id) => G.members.find(m => m.alive && m.guild?.state === 'post' && m.guild.post === id) || null;
// a room at work: built, and its post (if it has one) held
export const working = (G, id) => roomLevel(G, id) > 0 && (!ROOMS.get(id).post || !!staffOf(G, id));
// a room's effect `key` now (its level's; a room idle for want of its post — its level 0's)
export function roomBy(G, id, key) {
  const R = ROOMS.get(id), v = R.by[key]; if (!v) return undefined;
  return v[working(G, id) ? roomLevel(G, id) : 0];
}

// ── building: one at a time, paid now, ready at the next season's start (HOUSE.build)
export function buildWhy(a, id) {
  const G = a.guild, R = ROOMS.get(id); if (!R) return 'такой комнаты нет';
  if (R.gate) return `откроется позже (${R.gate})`;
  const L = roomLevel(G, id); if (L >= R.cost.length) return 'выше строить некуда';
  if (G.building) return `уже строится: ${ROOMS.get(G.building.room).label}`;
  const cost = R.cost[L]; if (G.gold < cost) return `в казне нет ${cost} зол.`;
  return null;
}
export function build(a, id, {pay, tell}) {
  const G = a.guild, why = buildWhy(a, id); if (why) throw new Error(why[0].toUpperCase() + why.slice(1) + '.');
  const R = ROOMS.get(id), L = roomLevel(G, id), cost = R.cost[L];
  pay(G, -cost, `стройка: ${R.label}${L ? `, ${L + 1}-й уровень` : ''}`);
  G.building = {room: id, level: L + 1, ready: a.hist.step + HOUSE.build};
  tell(`Начали строить: ${R.label}${L ? ` — ${L + 1}-й уровень` : ''}. Будет готово к новому сезону.`, 'house');
}
export const nextCost = (G, id) => { const R = ROOMS.get(id), L = roomLevel(G, id); return L < R.cost.length ? R.cost[L] : null; };

// ── posts: who may hold one, setting and leaving it
export function postWhy(G, id, m) {
  const P = ROOMS.get(id)?.post; if (!P) return 'здесь не нужен работник';
  if (roomLevel(G, id) < 1) return 'комната ещё не построена';
  if (!m || !m.alive) return 'некого';
  if (!['ready', 'retired'].includes(m.guild?.state) && !(m.guild?.state === 'post' && m.guild.post === id)) return `${m.name} сейчас занят`;   // (one at rest may hold a post: campaign/retire.js)
  if (P.level && (m.level || 1) < P.level) return `${P.label} — не ниже ${P.level}-го уровня (у ${m.name} ${m.level || 1}-й)`;
  if (P.letter && (m.special?.[P.letter] ?? 5) < P.least) return `${P.label} — ${P.letter} не ниже ${P.least} (у ${m.name} ${m.special?.[P.letter] ?? 5})`;
  return null;
}
export function setPost(a, id, memberId, tell) {
  const G = a.guild, R = ROOMS.get(id), was = staffOf(G, id), m = memberId == null ? null : G.members.find(x => x.id === memberId);
  if (m && m === was) return;
  if (m) { const why = postWhy(G, id, m); if (why) throw new Error(why[0].toUpperCase() + why.slice(1) + '.'); }
  if (was) { was.guild = {state: was.retired ? 'retired' : 'ready', since: G.day}; tell(`${was.name} оставил пост: ${R.post.label} (${R.label}).`, 'house'); }
  if (m) { m.guild = {state: 'post', post: id, since: G.day}; tell(`${m.name} — ${R.post.label} (${R.label}).`, 'house'); }
}

// ── the trainees and the patients
export function trainWhy(G, m) {
  if (!working(G, 'training')) return 'тренировочный зал не работает (нет зала или тренера)';
  if (G.members.filter(x => x.alive && x.guild?.state === 'training').length >= roomBy(G, 'training', 'slots')) return 'все места в зале заняты';
  if (m.guild?.state !== 'ready') return `${m.name} сейчас занят`;
  if ((m.level || 1) >= 1 + roomLevel(G, 'training')) return `зал учит до ${1 + roomLevel(G, 'training')}-го уровня`;
  if ((m.level || 1) >= (staffOf(G, 'training')?.level || 1)) return 'ученик не может быть не ниже тренера';
  return null;
}
const wounded = m => (m.wounds || []).some(w => w.day == null);
export function treatWhy(G, m) {
  if (!working(G, 'healer')) return 'комната лекаря не работает (нет комнаты или лекаря)';
  if (G.members.filter(x => x.alive && x.guild?.state === 'treat').length >= roomBy(G, 'healer', 'slots')) return 'все места у лекаря заняты';
  if (m.guild?.state !== 'ready') return `${m.name} сейчас занят`;
  if (!wounded(m)) return `у ${m.name} нет тяжёлых травм`;
  return null;
}
export function sendTo(a, kind, memberId, tell) {
  const G = a.guild, m = G.members.find(x => x.id === memberId), why = kind === 'training' ? trainWhy(G, m) : treatWhy(G, m);
  if (why) throw new Error(why[0].toUpperCase() + why.slice(1) + '.');
  m.guild = {state: kind, since: G.day};
  tell(kind === 'training' ? `${m.name} учится у тренера.` : `${m.name} лечится у лекаря.`, 'house');
}
export function takeBack(G, memberId) {
  const m = G.members.find(x => x.id === memberId);
  if (m && (m.guild?.state === 'training' || m.guild?.state === 'treat')) m.guild = {state: 'ready', since: G.day};
}

// ── a season of the house (campaign/guild.js stepGuild, at its start, after the wages): the building ready, the upkeep, the
// tavern's take of the wages paid and its own income, the lessons and the cures of the season
//   io — {pay, tell, award (a member, the experience), level (the evening's levels)}
export function houseSeason(a, G, wagesPaid, io) {
  houseOf(G);
  finishBuilding(a, G, io.tell);
  const upkeep = ROOMS.all().reduce((s, R) => s + (R.upkeep || 0) * roomLevel(G, R.id) * HOUSE.upkeep, 0);
  if (upkeep > 0) io.pay(G, -Math.min(upkeep, Math.max(0, G.gold)), 'содержание дома');
  if (working(G, 'tavern')) {
    const back = Math.round(wagesPaid * roomBy(G, 'tavern', 'back') * 10) / 10, C = staffOf(G, 'tavern')?.special?.C ?? 5;
    const income = Math.round(roomBy(G, 'tavern', 'income') * C / 5 * (working(G, 'merchant') ? HOUSE.armory.tavern : 1) * 10) / 10;   // (the merchant's guests)
    if (back > 0) io.pay(G, back, 'таверна: жалованье пропито у своих');
    if (income > 0) io.pay(G, income, 'таверна: доход с гостей');
  }
  // the trainees: a season's lesson each; trained to the room's height — back to the house
  for (const m of G.members.filter(x => x.alive && x.guild?.state === 'training')) {
    if (!working(G, 'training')) { m.guild = {state: 'ready', since: G.day}; continue; }
    io.award(m, HOUSE.train.xp);
  }
  io.level();
  for (const m of G.members.filter(x => x.alive && x.guild?.state === 'training' && (x.level || 1) >= 1 + roomLevel(G, 'training'))) {
    m.guild = {state: 'ready', since: G.day}; io.tell(`${m.name} закончил учёбу: ${m.level || 1}-й уровень.`, 'house');
  }
  // the patients: a lasting wound mended a season each; none left — home
  for (const m of G.members.filter(x => x.alive && x.guild?.state === 'treat')) {
    if (!working(G, 'healer')) { m.guild = {state: 'ready', since: G.day}; continue; }
    const k = (m.wounds || []).findIndex(w => w.day == null);
    if (k >= 0) { m.wounds.splice(k, 1); io.tell(`Лекарь снял с ${m.name} тяжёлую травму.`, 'house'); }
    if (!wounded(m)) m.guild = {state: 'ready', since: G.day};
  }
}
// the building of a season done (at the season's end — campaign/guild.js stepGuild — and, for a save from before, at its start)
export function finishBuilding(a, G, tell) {
  if (!G.building || a.hist.step < G.building.ready) return;
  const {room, level} = G.building, R = ROOMS.get(room);
  houseOf(G)[room] = level; G.building = null;
  tell(`Готово: ${R.label}${level > 1 ? ` — ${level}-й уровень` : ''}.${R.post && !staffOf(G, room) ? ` Нужен ${R.post.label}.` : ''}`, 'house');
}
// a member dead: those who thought well of him lose a little of their devotion (HOUSE.grief), the less with a chapel
export function grieve(G, dead, bondOf, tell) {
  const H = HOUSE.grief, soft = roomBy(G, 'chapel', 'grief') || 0;
  let n = 0;
  for (const m of G.members) {
    if (m === dead || !m.alive || !m.guild || ['dead', 'left'].includes(m.guild.state)) continue;
    if (bondOf(m.id, dead.id) > H.bond) { m.devotion = Math.max(0, (m.devotion ?? GUILD.devotion.start) - H.loss * (1 - soft)); n++; }
  }
  if (n && soft) tell(`В часовне помянули ${dead.name}.`, 'house');
}
