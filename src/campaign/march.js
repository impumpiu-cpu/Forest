// A day of the caravan, inside the world's day (atlas/history.js stepHistory → stepParties → onDay).
//   morning — after a quiet night: what was found while they packed up;
//   day     — the march along the path (as fast as the slowest), or a camp: hunting, gathering, healing;
//   meal    — they eat a ration each, as far as the food goes; hungry days slow them and wear them down;
//   evening — the council: the goal reached? camp to forage or to heal? the way to the goal;
//   night   — something may find the camp: the fight is settled at once (this stage: no local map).
// The campaign ends when the goal is reached and the caravan is home, or when all eight are dead.
import {findPath, moveCost} from '../atlas/roads.js';
import {scaleOf} from '../atlas/tectonics.js';
import {townAt} from '../atlas/peoples.js';
import {trades, atWar} from '../atlas/diplomacy.js';
import {realmLabel} from '../atlas/realms.js';
import {biomeAt} from '../atlas/biomes.js';
import {townLabel} from '../atlas/towns.js';
import {SEASONS} from '../data/seasons.js';
import {SPECIES} from '../data/species.js';
import {ITEMS} from '../data/items.js';
import {EFFECTS, NORM} from '../data/special.js';
import {CAMPAIGN, FOES, RETINUE} from '../data/campaign.js';
import {SEASONS_PER_YEAR} from '../data/atlas.js';
import {plural, clamp} from '../core/util.js';
import {richness, seasonFood, dangers, nightRisk} from './land.js';
import {draw} from './start.js';

const SEASON_LIST = SEASONS.all();
const between = (r, [lo, hi]) => lo + r() * (hi - lo);
const xyOf = (a, i) => [i % a.w, (i / a.w) | 0];

// the A* buffers of the campaign, kept beside the world, never saved
const SCRATCH = new WeakMap();
export const scratch = a => { let s = SCRATCH.get(a); if (!s) SCRATCH.set(a, s = {g: new Float64Array(a.n).fill(Infinity), came: new Int32Array(a.n), touched: []}); return s; };

export const alive = K => K.members.filter(m => m.alive);
export const ended = K => ['won', 'lost', 'timeout'].includes(K.phase);
const rank = (K, m) => RETINUE[K.people][m.role][0];

// a line of the campaign's log; `world` — also into the world's chronicle
export function say(a, K, text, kind = 'march', world = false) {
  const H = a.hist, line = {day: K.day, year: H.year, season: H.season, i: K.i, text, kind};
  K.log.push(line);
  if (world) a.chronicle.push({era: H.era, year: H.year, season: H.season, text, campaign: true});
}

// the fog lifts in a circle around a cell
export function reveal(a, K, i, r) {
  const [x0, y0] = xyOf(a, i), rr = Math.ceil(r);
  for (let y = Math.max(0, y0 - rr); y <= Math.min(a.h - 1, y0 + rr); y++) for (let x = Math.max(0, x0 - rr); x <= Math.min(a.w - 1, x0 + rr); x++)
    if ((x - x0) ** 2 + (y - y0) ** 2 <= r * r) K.seen[y * a.w + x] = 1;
}

// ── the members
const itemDef = id => (ITEMS.has(id) ? ITEMS.get(id) : null);
export function memberMight(m) {
  const M = CAMPAIGN.might, s = m.special || {};
  const dmg = Math.max(0, ...m.gear.hand.map(id => itemDef(id)?.melee?.dmg ?? 0), itemDef(m.gear.hand.find(id => itemDef(id)?.ranged))?.ranged?.dmg ?? 0);
  const armor = itemDef(m.gear.body)?.armor ?? 0;
  return M[m.role] * (1 + M.perDmg * Math.max(0, dmg - 1)) * (1 + M.perArmor * armor) * (1 + M.perStr * ((s.S ?? NORM) - NORM)) * (0.3 + 0.7 * m.hp);
}
// how fast a member walks against a human of average Agility; the wounded limp
const memberPace = m => (SPECIES.get(m.race).speed / SPECIES.get('human').speed) * EFFECTS.speed(m.special || {A: NORM}) * (0.55 + 0.45 * clamp(m.hp / 0.6, 0, 1));
export const caravanMight = K => alive(K).reduce((s, m) => s + memberMight(m), 0);

// cells a day: as the slowest walks, slower hungry and in frost
export function pace(a, K, seasonId) {
  const ms = alive(K); if (!ms.length) return 0;
  let v = CAMPAIGN.speed * scaleOf(a) * Math.min(...ms.map(memberPace));
  if (K.hungry > 0) v *= CAMPAIGN.hunger.slow;
  if (seasonId === 'winter' && a.f.temp[K.i] - a.f.trange[K.i] / 2 < 0) v *= CAMPAIGN.frost;
  return v;
}

function die(a, K, m, why) {
  m.alive = false; m.hp = 0; m.died = {day: K.day, year: a.hist.year, why};
  const left = alive(K).length;
  say(a, K, `${m.name}, ${rank(K, m)}, ${why}.${left ? ` Осталось ${left} из ${K.members.length}.` : ''}`, 'death', !left);
}

// ── the day
function march(a, K, v) {
  let budget = 1, moved = 0;
  while (budget > 0 && K.path && K.k < K.path.length) {
    const next = K.path[K.k], nx = next % a.w + 0.5, ny = ((next / a.w) | 0) + 0.5;
    const d = Math.hypot(nx - K.x, ny - K.y), c = moveCost(a, next, K.people);
    if (c === Infinity) { K.path = null; break; }
    const sp = v / Math.max(0.3, c), can = sp * budget;
    if (can >= d) { K.x = nx; K.y = ny; K.i = next; K.k++; budget -= d / sp; moved += d; }
    else { K.x += (nx - K.x) / d * can; K.y += (ny - K.y) / d * can; moved += can; budget = 0; }
  }
  K.stats.walked += moved;
  return moved;
}

// where the caravan is now, in words: for the log when it enters a realm or a land
function entered(a, K, before) {
  const b = biomeAt(a, K.i), t = townAt(a, K.i);
  if (t && t.id !== before.town) say(a, K, `Караван пришёл в ${townLabel(t, 1)} ${t.name}${t.realm && t.realm !== K.realm ? ` (${realmLabel(a, t.realm)})` : ''}.`);
  else if (b && b.id !== before.biome && !t) say(a, K, `Караван идёт ${b.where}.`, 'land');
}

function evening(a, K) {
  const ms = alive(K), need = ms.length * CAMPAIGN.ration;
  // the goal: there and back
  if (K.goal != null && K.i === K.goal && K.phase === 'out') {
    say(a, K, `Караван дошёл до цели — ${biomeAt(a, K.i)?.where || 'на край света'}. Поручение исполнено, пора домой.`, 'goal', true);
    K.phase = 'back'; K.goal = K.home; K.path = null;
  } else if (K.phase === 'back' && K.i === K.home) {
    const t = a.towns.find(x => x.id === K.capital);
    say(a, K, `Караван вернулся в ${t ? `${townLabel(t, 1)} ${t.name}` : 'родные края'}: ${ms.length} из ${K.members.length}, ${Math.round(K.day / 120 * 10) / 10} лет в пути.`, 'home', true);
    K.phase = 'won'; return;
  }
  // a camp: to forage when the food runs short and the land can feed them, to heal the wounded
  const rich = richness(a, K.i), core = ms.reduce((s, m) => s + m.hp, 0) / ms.length;
  const C0 = CAMPAIGN.camp;
  if (K.camp > 0 && ((K.why === 'food' && K.food >= C0.full * CAMPAIGN.pack * ms.length) || (K.why === 'heal' && core >= C0.healed))) K.camp = 0;
  if (K.camp > 0) K.camp--;
  else {
    const C = CAMPAIGN.camp, badly = ms.some(m => m.hp < C.badly);
    let why = K.food < need * C.foodDays && rich >= C.foodLand ? 'food' : core < C.hp || badly ? 'heal' : '';
    // a long camp where something hunts at night is death: they look for a quieter place, unless they already starve
    if (why && !K.hungry && nightRisk(a, K.i) > C.danger && K.path && K.k < K.path.length) why = '';
    if (why && K.why !== why) {
      K.camp = C.maxDays; K.why = why; K.stats.camps++;
      const left = Math.floor(K.food / need);
      say(a, K, why === 'food' ? `${left > 0 ? `Еды осталось на ${left} ${plural(left, 'день', 'дня', 'дней')}` : 'Еды не осталось'}: совет решил встать лагерем, охотиться и собирать.` : 'Раненые еле идут: совет решил встать лагерем и отлежаться.', 'camp');
    } else if (!why) K.why = '';
  }
  // the way to the goal
  if (!K.path || K.k >= K.path.length) {
    if (K.goal != null && K.i !== K.goal) {
      const p = findPath(a, K.i, K.goal, K.people, scratch(a));
      if (p) { p.reverse(); K.path = p.slice(1); K.k = 0; }
      else { K.path = null; say(a, K, 'Дороги к цели нет: караван топчется на месте.', 'lost'); }
    }
  }
}

function night(a, K) {
  const {r, done} = draw(K, 'night');
  const near = townAt(a, K.i), friendly = near && near.realm && (near.realm === K.realm || (trades(a, K.realm, near.realm) && !atWar(a, K.realm, near.realm)));
  const ds = dangers(a, K.i);
  let p = CAMPAIGN.night.base + ds.reduce((s, d) => s + d.p, 0);
  if (friendly) p *= CAMPAIGN.night.friendly;
  p = Math.min(CAMPAIGN.night.max, p);
  if (r() < p) {
    // which danger it was
    let x = r() * (ds.reduce((s, d) => s + d.p, 0) || 1), d = ds[0] || {kind: 'wolves', strength: 0.7};
    for (const o of ds) { x -= o.p; if (x <= 0) { d = o; break; } }
    fight(a, K, d, r);
  } else {
    // a quiet night: a little found in the morning while they packed
    const M = CAMPAIGN.morning;
    if (r() < M.food * Math.min(1.2, richness(a, K.i) + 0.2)) { const n = Math.round(between(r, M.foodN)); K.food += n; K.stats.finds++; if (r() < 0.25) say(a, K, `Утром подстрелили дичь: +${n} ${plural(n, 'паёк', 'пайка', 'пайков')}.`, 'find'); }
    if (r() < M.treasure) { const g = Math.round(between(r, M.gold)); K.gold += g; K.stats.finds++; say(a, K, `Утром у ручья нашли оброненный кошель: ${g} ${plural(g, 'золотой', 'золотых', 'золотых')}.`, 'find'); }
  }
  done();
}

// a fight at the camp, settled at once: the foe's might against the caravan's
function fight(a, K, d, r) {
  const F = CAMPAIGN.fight, foe = FOES[d.kind], E = foe.might * (d.strength ?? 1) * between(r, [0.6, 1.4]), P = caravanMight(K);
  const share = P / (P + E), win = r() < share;
  K.stats.fights++;
  // the blows: more when they lose, mostly on the knights, who shield the squires
  let hurt = E * (F.hurt[0] + (F.hurt[1] - F.hurt[0]) * (1 - share)) * (win ? 1 : F.lostHurt);
  const hit = [];
  while (hurt > 0 && alive(K).length) {
    const ms = alive(K), wts = ms.map(m => (m.role === 'knight' ? F.shield : 1));
    let x = r() * wts.reduce((s, v) => s + v, 0), m = ms[0];
    for (let q = 0; q < ms.length; q++) { x -= wts[q]; if (x <= 0) { m = ms[q]; break; } }
    const b = between(r, F.blow); m.hp -= b; hurt -= b * 2;
    if (!hit.includes(m)) hit.push(m);
    if (m.hp <= 0) { if (win) m.hp = F.saved; else die(a, K, m, `пал в ночном бою (${foe.label})`); }
  }
  const where = d.label ? ` — ${d.label}` : '';
  if (!alive(K).length) return;
  if (win) {
    K.stats.won++;
    const loot = Math.round(between(r, F.loot)); K.food += loot;
    say(a, K, `Ночью на лагерь напали ${foe.label}${where}. Отбились${hit.length ? `, ранены: ${hit.filter(m => m.alive).map(m => m.name).join(', ') || 'никто'}` : ' без ран'}; с убитых взяли еды на ${loot} ${plural(loot, 'паёк', 'пайка', 'пайков')}.`, 'fight');
  } else {
    K.stats.fled++;
    const lost = Math.round(K.food * F.lost); K.food -= lost;
    say(a, K, `Ночью на лагерь напали ${foe.label}${where}. Не устояли и бежали в темноте${lost ? `, бросив ${lost} ${plural(lost, 'паёк', 'пайка', 'пайков')}` : ''}${hit.length ? `; ранены: ${hit.filter(m => m.alive).map(m => m.name).join(', ') || '—'}` : ''}.`, 'fight');
    K.camp = 0; K.why = '';
  }
}

// one day of the campaign (the world's day `day` of the current season)
export function caravanDay(a, K, day) {
  if (ended(K)) return;
  const seasonId = SEASON_LIST[a.hist.season].id, ms = alive(K), before = {town: townAt(a, K.i)?.id, biome: biomeAt(a, K.i)?.id};
  const {r, done} = draw(K, 'day');
  // the day: a camp or the march; food from the land either way
  const rich = richness(a, K.i) * seasonFood(a, K.i, seasonId), Fo = CAMPAIGN.forage;
  const camping = K.camp > 0 || !K.path || K.k >= K.path.length;
  if (!camping) march(a, K, pace(a, K, seasonId));
  K.food += ms.length * (camping ? Fo.camp : Fo.march) * rich * (1 - Fo.spread / 2 + Fo.spread * r());
  // the meal
  const need = ms.length * CAMPAIGN.ration, eat = Math.min(K.food, need), fed = eat / need;
  K.food = Math.max(0, K.food - eat);
  // the chronicle tells of a hunger that matters: a new one after a while, its end after a few days of it
  const HT = CAMPAIGN.hunger.tell;
  if (fed < CAMPAIGN.hunger.starveAt) {
    if (!K.hungry && K.day - (K.hungerTold ?? -999) > HT.again) { say(a, K, 'Еда кончилась: едят то, что поймают по дороге. Идут вдвое медленнее, раны не заживают.', 'hunger'); K.hungerTold = K.day; }
    K.hungry++; K.stats.hungryDays++;
  } else if (K.hungry) { if (K.hungry >= HT.over) say(a, K, `Голод отступил после ${K.hungry} ${plural(K.hungry, 'дня', 'дней', 'дней')}.`, 'hunger'); K.hungry = 0; }
  for (const m of ms) {
    if (K.hungry > CAMPAIGN.hunger.wasteAfter) { m.hp -= CAMPAIGN.hunger.waste * (0.5 + r()); if (m.hp <= 0) { die(a, K, m, 'умер от голода'); continue; } }
    else if (!K.hungry) m.hp = Math.min(1, m.hp + (camping ? CAMPAIGN.heal.camp : CAMPAIGN.heal.march));
  }
  done();
  // the food they can carry
  K.food = Math.min(K.food, CAMPAIGN.pack * alive(K).length);
  if (alive(K).length) { entered(a, K, before); evening(a, K); }
  if (alive(K).length && !ended(K)) night(a, K);
  // the end
  if (!alive(K).length && !ended(K)) {
    K.phase = 'lost';
    say(a, K, 'Никого из тех, кто вышел из столицы, не осталось в живых. Караван не дойдёт.', 'end', true);
  }
  if (!ended(K) && K.day >= CAMPAIGN.maxYears * 30 * SEASONS_PER_YEAR) { K.phase = 'timeout'; say(a, K, `Прошло ${CAMPAIGN.maxYears} лет: караван так и не вернулся.`, 'end', true); }
  reveal(a, K, K.i, CAMPAIGN.fog.sight * scaleOf(a));
  K.track.push([Math.round(K.x * 100) / 100, Math.round(K.y * 100) / 100]);
  const p = (a.parties || []).find(x => x.id === K.party);
  if (p) { p.x = K.x; p.y = K.y; p.i = K.i; p.men = alive(K).length; p.goal = K.goal; if (ended(K)) p.state = 'gone'; }
  K.day++;
}
