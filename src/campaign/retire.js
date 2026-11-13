// Rest and retirement (data/guild.js GUILD.retire; plan Г4, the author's word 13.11): one old or maimed asks to rest; at rest he
// stays at the house — never in a party, but he may hold a post (a trainer, a healer, a manager) on a pension; or he is let go
// from the guild — with honour (a gift from the treasury) or without. Pure records on the member:
//   m.retired = {day, year} — at rest (his state 'retired', or 'post' at a post); m.asks = {why, year} — he has asked to rest
import {GUILD} from '../data/guild.js';
import {moodBy, parted} from './kin.js';

const R_ = GUILD.retire;
const year = a => a.hist?.year ?? 0;
const live = m => m.alive && m.guild && !['dead', 'left'].includes(m.guild.state);

// why he would rest now: 'годы' (he has lived `old` of his years), 'увечья' (`maims` lasting maims) — or null
export function restWhy(a, m) {
  if (m.dies != null && m.born != null && year(a) - m.born >= R_.old * (m.dies - m.born)) return 'годы';
  if ((m.maims || 0) >= R_.maims) return 'увечья';
  return null;
}
// a season: those who would rest ask; one who asked and is still unheard grows sour
export function restSeason(a, G, r, tell) {
  for (const m of G.members) {
    if (!live(m) || m.retired) continue;
    if (m.asks) { if (m.guild.state === 'ready') moodBy(m, -R_.refused); continue; }
    const why = restWhy(a, m);
    if (why && m.guild.state === 'ready' && r() < R_.ask) {
      m.asks = {why, year: year(a)};
      tell(`${m.name} просится на покой: ${why === 'годы' ? 'годы уже не те' : 'увечья не дают ходить в походы'}.`);
    }
  }
}

// ── the player's: to rest at the house, back to the ranks, let go
export function retireWhy(G, m) {
  if (!m || !live(m)) return 'некого';
  if (m.retired) return `${m.name} уже на покое`;
  if (!['ready', 'post'].includes(m.guild.state)) return `${m.name} сейчас занят`;
  return null;
}
export function retire(a, id, tell) {
  const G = a.guild, m = G.members.find(x => x.id === id), why = retireWhy(G, m);
  if (why) throw new Error(why[0].toUpperCase() + why.slice(1) + '.');
  m.retired = {day: G.day, year: year(a)};
  if (m.asks) moodBy(m, R_.glad);
  m.asks = null;
  if (m.guild.state === 'ready') m.guild = {state: 'retired', since: G.day};
  tell(`${m.name} ${m.gender === 'f' ? 'ушла' : 'ушёл'} на покой: живёт при гильдии${m.guild.state === 'post' ? ' и остаётся на посту' : ''}.`);
}
export function unretireWhy(G, m) {
  if (!m || !live(m) || !m.retired) return 'не на покое';
  if (m.guild.state !== 'retired') return `${m.name} на посту — сначала снимите с поста`;
  return null;
}
export function unretire(a, id, tell) {
  const G = a.guild, m = G.members.find(x => x.id === id), why = unretireWhy(G, m);
  if (why) throw new Error(why[0].toUpperCase() + why.slice(1) + '.');
  m.retired = null; m.guild = {state: 'ready', since: G.day};
  tell(`${m.name} снова в строю.`);
}
// the gift of one let go with honour
export const giftOf = m => R_.gift.base + R_.gift.perLevel * (m.level || 1);
export function dismissWhy(G, m, honour) {
  if (!m || !live(m)) return 'некого';
  if (!['ready', 'retired', 'post'].includes(m.guild.state)) return `${m.name} сейчас занят`;
  if (honour && G.gold < giftOf(m)) return `в казне нет ${giftOf(m)} зол. на прощальный дар`;
  return null;
}
//   io — {pay, tell, bondOf}
export function dismiss(a, id, honour, io) {
  const G = a.guild, m = G.members.find(x => x.id === id), why = dismissWhy(G, m, honour);
  if (why) throw new Error(why[0].toUpperCase() + why.slice(1) + '.');
  if (honour) io.pay(G, -giftOf(m), `прощальный дар: ${m.name}`);
  m.guild = {state: 'left', since: G.day}; m.asks = null;
  m.left = {day: G.day, year: year(a), why: honour ? 'отставка с почётом' : 'уволен'};
  parted(G, m);
  if (!honour) for (const x of G.members) if (x !== m && live(x) && io.bondOf(x.id, m.id) > GUILD.muster.friend / 2) x.devotion = Math.max(0, Math.round(((x.devotion ?? GUILD.devotion.start) - R_.fired) * 100) / 100);
  io.tell(honour ? `${m.name} ${m.gender === 'f' ? 'ушла' : 'ушёл'} в отставку с почётом: прощальный дар — ${giftOf(m)} зол.` : `${m.name} ${m.gender === 'f' ? 'уволена' : 'уволен'} из гильдии.`);
}
// a season's wage of one at rest: the pension's share (at a post — the whole)
export const wageShare = m => (m.retired && m.guild?.state !== 'post' ? R_.pension : 1);
