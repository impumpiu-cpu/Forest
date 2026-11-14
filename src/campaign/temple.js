// The Temple of All Gods (data/rooms.js `temple`, HOUSE.temple; plan claude/guild-plan.md Г8; docs/GUILD.md «Храм всех богов»;
// the author's word 14.11): the guild's door to the ascended (campaign/ascend.js) — the pool of fighters of both games, kept in
// the browser outside every world (ui/heroes.js). For gold one of the guild at its house is raised among them — he leaves the
// guild, with all he became and the gear on him; and one of them is summoned into the guild — mortal again, his death for good
// (the registry gives him up the moment he is called: no undo). Pure: the registry is handed in and handed back.
import {HOUSE} from '../data/rooms.js';
import {SPECIES} from '../data/species.js';
import {XP} from '../data/experience.js';
import {lifeOf, townLabel} from '../atlas/index.js';
import {roomBy, roomLevel} from './house.js';
import {ASCEND, emptyRegistry, snapshotOf, summonable, takeHeroes, applySnapshot} from './ascend.js';

const year = a => a.hist?.year ?? 0;
const T = () => HOUSE.temple;
export const templeOn = G => roomLevel(G, 'temple') > 0;
const k = G => roomBy(G, 'temple', 'price') || 1;
export const ascendPrice = (G, m) => Math.round((T().ascend.base + T().ascend.perLevel * (m.level || 1)) * k(G));
export const summonPrice = (G, s) => Math.round((T().summon.base + T().summon.perLevel * Math.min(s.level || 1, XP.cap)) * k(G));

// ── raising one of the guild: at its house (not on the road, not at a branch, not away), alive
export function templeAscendWhy(a, G, m) {
  if (!templeOn(G)) return 'храма нет';
  if (!m || !m.alive) return 'некого';
  if (!['ready', 'retired', 'post'].includes(m.guild?.state)) return `${m.name} сейчас занят`;
  if (m.house != null) return `${m.name} живёт в филиале`;
  const p = ascendPrice(G, m); if (G.gold < p) return `в казне нет ${p} зол.`;
  return null;
}
// → the registry with him in it; he leaves the guild (io: {pay, tell, parted})
export function templeAscend(a, G, id, reg, io) {
  const m = G.members.find(x => x.id === id), why = templeAscendWhy(a, G, m);
  if (why) throw new Error(why[0].toUpperCase() + why.slice(1) + '.');
  const t = a.towns.find(x => x.id === G.town), p = ascendPrice(G, m);
  const view = {seed: G.seed, capital: G.town, capitalName: t?.name || G.name, people: G.people, day: G.day, members: [m], phase: 'temple'};
  const snap = {...snapshotOf(a, view, m), uid: `${G.seed}:temple:${year(a)}:${G.day}:${m.id}`,
    life: m.born != null ? {age: Math.max(0, year(a) - m.born), rest: m.dies != null ? Math.max(1, m.dies - year(a)) : null} : null};
  const R = reg?.v === ASCEND.version ? {...reg, heroes: [...reg.heroes]} : emptyRegistry();
  R.heroes.push(snap);
  while (R.heroes.length > ASCEND.keep) R.heroes.shift();
  io.pay(G, -p, `Храм всех богов: вознесение — ${m.name}`);
  m.guild = {state: 'left', since: G.day}; m.left = {day: G.day, year: year(a), why: 'вознесён в Храме всех богов'}; m.ascended = {year: year(a), uid: snap.uid};
  io.parted?.(m);
  io.tell(`${m.name} ${m.gender === 'f' ? 'вознесена' : 'вознесён'} в Храме всех богов${t ? ` в ${townLabel(t, 3)} ${t.name}` : ''}. ${m.gender === 'f' ? 'Её' : 'Его'} можно призвать снова — в гильдию или в Поход.`, 'people', true);
  return R;
}

// ── summoning: those of the registry of a race the guild's town takes in (as a campaign's capital: campaign/ascend.js)
export const templeSummonable = (a, G, reg) => (templeOn(G) ? summonable(a, G.town, reg) : []);
export function templeSummonWhy(a, G, reg, uid, room) {
  if (!templeOn(G)) return 'храма нет';
  if (G.moving) return 'гильдия переезжает';
  const s = templeSummonable(a, G, reg).find(h => h.uid === uid); if (!s) return 'этого вознесённого сюда не призвать';
  if (!room) return 'в казармах нет места';
  const p = summonPrice(G, s); if (G.gold < p) return `в казне нет ${p} зол.`;
  return null;
}
// → {reg (without him), m (the guild's member now)}; io: {pay, tell, room (a place in the barracks), body () — a newcomer's body
// to put him into (the guild's door: campaign/guild.js rollRecruits)}
export function templeSummon(a, G, reg, uid, io) {
  const why = templeSummonWhy(a, G, reg, uid, io.room); if (why) throw new Error(why[0].toUpperCase() + why.slice(1) + '.');
  const s = templeSummonable(a, G, reg).find(h => h.uid === uid), p = summonPrice(G, s);
  const {reg: R, snaps} = takeHeroes(reg, [uid]);
  const m = applySnapshot(io.body(), snaps[0]);
  // his years: those he had (raised from a guild), or a grown one's of his race; his end of age as far off as it was
  const B = SPECIES.get(m.race)?.body || {}, age = s.life?.age ?? (B.adult ?? 16) + 4;
  m.born = year(a) - age; m.dies = year(a) + (s.life?.rest ?? Math.max(1, Math.round(lifeOf(m.race, 1) - age)));
  m.given = m.name.split(' ')[0];
  m.guild = {state: 'ready', since: G.day}; m.core = true; m.joined = 0;
  io.pay(G, -p, `Храм всех богов: призван — ${m.name}`);
  io.tell(`В Храме всех богов ${m.gender === 'f' ? 'призвана' : 'призван'} ${m.name} (${m.level || 1}-й уровень): ${s.story?.from ? `в прошлый раз — из ${s.story.from}` : 'из вознесённых'}. ${m.gender === 'f' ? 'Она снова смертна' : 'Он снова смертен'}: смерть будет навсегда.`, 'people', true);
  return {reg: R, m};
}
