// The ferry (docs/CAMPAIGN.md «Переправа»; numbers: data/transport.js FERRY): a goal with no way to it by land — a grave
// on another land, home from there — is reached over the water as a service, not a fleet. In a town of the caravan's land
// where it is let in (campaign/town.js standing) with fishers, a pier or a harbour at the sea (data/transport.js FERRY.from;
// a hut on a lake is not the sea: the water must join), someone takes them: to the shore of the goal's land nearest the goal,
// and back from there when they come again. One deal, both ways, paid at the start; short of gold, they take what there is
// (a diffuse world: there is always a boat). Everyone goes, the beasts and the wheels with them.
// K.ferry = {port, portI, landing, way: [water cells, port → landing], days, state: 'go'|'aboard'|'landed', dir, left, waitTill}
// Aboard (caravanDay): the days pass — food, wounds, memory, bonds go on; no march, no forage, no camp, no meetings, no
// night attacks, no watch of the company (the boat's crew keeps it), no grazing; the boat's catch feeds them (FERRY.fed);
// the mark of the caravan sails on the map.
import {moveCost} from '../atlas/roads.js';
import {seaWay} from '../atlas/sea.js';
import {scaleOf} from '../atlas/tectonics.js';
import {townLabel} from '../atlas/towns.js';
import {FERRY} from '../data/transport.js';
import {CAMPAIGN} from '../data/campaign.js';
import {DIRS8} from '../atlas/heap.js';
import {cellDist, between, plural, centreOf, tenth} from '../core/util.js';
import {standing} from './town.js';
import {draw} from './start.js';
import {mouths} from './captives.js';

const xy = (a, i) => [i % a.w, (i / a.w) | 0];
// the cells the caravan's people can walk to from i (the land it stands on)
export function landOf(a, i, people) {
  const seen = new Uint8Array(a.n), queue = [i]; seen[i] = 1;
  while (queue.length) {
    const c = queue.pop(), [x, y] = xy(a, c);
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx, ny = y + dy, j = ny * a.w + nx;
      if (nx >= 0 && ny >= 0 && nx < a.w && ny < a.h && !seen[j] && moveCost(a, j, people) < Infinity) { seen[j] = 1; queue.push(j); }
    }
  }
  return seen;
}
// the sea cells beside a land cell
function shoreWater(a, i) {
  const [x, y] = xy(a, i), out = [];
  for (const [dx, dy] of DIRS8) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < a.w && ny < a.h && a.f.ocean[ny * a.w + nx]) out.push(ny * a.w + nx); }
  return out;
}
// the sea joined to these cells (one body of water)
function waterOf(a, starts) {
  const seen = new Uint8Array(a.n), queue = [...starts]; for (const s of starts) seen[s] = 1;
  while (queue.length) {
    const c = queue.pop(), [x, y] = xy(a, c);
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx, ny = y + dy, j = ny * a.w + nx;
      if (nx >= 0 && ny >= 0 && nx < a.w && ny < a.h && !seen[j] && a.f.ocean[j]) { seen[j] = 1; queue.push(j); }
    }
  }
  return seen;
}
const hasBoats = t => t.alive && FERRY.from.some(id => t.built.includes(id));
// the towns a deal can be struck in: on this land, letting the caravan in, with boats at the sea
const portsOn = (a, K, land) => (a.towns || []).filter(t => hasBoats(t) && land[t.i] && standing(a, K, t) && shoreWater(a, t.i).length).sort((p, q) => p.id - q.id);

// the lands joined to the caravan's home over the water from a port of its land: for the quest's places
// (campaign/epic.js: a grave over the sea is sought there, not replaced) → mask of the cells, or null with none
export function overSea(a, K, home) {
  const ports = portsOn(a, K, home); if (!ports.length) return null;
  const water = waterOf(a, ports.flatMap(t => shoreWater(a, t.i))), out = new Uint8Array(a.n), done = new Uint8Array(a.n);
  for (let i = 0; i < a.n; i++) {
    if (home[i]) { out[i] = 1; continue; }
    if (done[i] || a.f.ocean[i] || moveCost(a, i, K.people) === Infinity || !shoreWater(a, i).some(j => water[j])) continue;
    const L = landOf(a, i, K.people);
    for (let j = 0; j < a.n; j++) if (L[j]) { out[j] = 1; done[j] = 1; }
  }
  return out;
}

// the price of a deal (both ways): FERRY.price a day of the way, for the company, its beasts, its wheels
const priceOf = (K, days) => tenth(days * (FERRY.price.base + FERRY.price.head * K.members.filter(m => m.alive).length + FERRY.price.beast * K.beasts.filter(b => b.hp > 0).length + FERRY.price.wheels * K.vehicles.length));
const daysOf = (a, way) => Math.max(1, Math.ceil(way.length / (FERRY.speed * scaleOf(a))));

// a new deal for a goal over the water: the port of this land nearest the way, the shore of the goal's land nearest the goal
function findDeal(a, K, goal, mine) {
  const there = landOf(a, goal, K.people), ports = portsOn(a, K, mine);
  if (!ports.length) return null;
  const shore = []; for (let i = 0; i < a.n; i++) if (there[i] && !a.f.ocean[i]) { const w = shoreWater(a, i); if (w.length) shore.push([i, w]); }
  let best = null;
  const bodies = new Map();
  for (const t of ports) {
    const qs = shoreWater(a, t.i), key = qs[0];
    let W = null; for (const [, w] of bodies) if (w[key]) W = w;
    if (!W) { W = waterOf(a, qs); bodies.set(key, W); }
    let land = -1, lw = -1, ld = Infinity;
    for (const [i, ws] of shore) { const w = ws.find(j => W[j]); if (w == null) continue; const d = cellDist(a, i, goal); if (d < ld) { ld = d; land = i; lw = w; } }
    if (land < 0) continue;
    // (by the way over the water itself: a port near in a straight line may have the whole land to sail round)
    const way = seaWay(a, qs.find(j => W[j]), lw); if (!way) continue;
    const cost = cellDist(a, K.i, t.i) + way.length * FERRY.sea + ld;
    if (!best || cost < best.cost) best = {t, land, way, cost};
  }
  if (!best) return null;
  return {port: best.t.id, portI: best.t.i, landing: best.land, way: best.way, days: daysOf(a, best.way), state: 'go', dir: 1, left: 0, waitTill: null};
}

// the way when there is none by land (campaign/march.js plan): to the port, aboard, to the landing and back.
// → the cell to walk to now (the port, the landing), −1 (nothing to walk: aboard, waiting), or null (no ferry either)
export function ferryPlan(a, K, say) {
  const goal = K.goal, mine = landOf(a, K.i, K.people), F = K.ferry;
  if (mine[goal]) { if (F?.state === 'go') K.ferry = null; return null; }   // (the goal is on this land: no boat is wanted)
  // back: the landing on this land, the port's land the goal's
  if (F?.state === 'landed' && mine[F.landing] && landOf(a, F.portI, K.people)[goal]) {
    if (K.i !== F.landing) return F.landing;
    if (F.waitTill == null) { const {r, done} = draw(K, 'ferry'); F.waitTill = K.day + Math.round(between(r, FERRY.wait)); done(); say('Отряд пришёл в бухту, где высадился: ждут лодку.', 'route'); }
    if (K.day < F.waitTill) return -1;
    board(a, K, -1, say); return -1;
  }
  // to the port of a deal struck: aboard there
  if (F?.state === 'go' && mine[F.portI]) {
    const t = a.towns.find(x => x.id === F.port);
    if (t && hasBoats(t) && standing(a, K, t)) return toPort(a, K, t, say);
    K.ferry = null;
  }
  const D = findDeal(a, K, goal, mine);
  if (!D) return null;
  K.ferry = D;
  const t = a.towns.find(x => x.id === D.port);
  say(`Совет: к цели посуху не дойти — за водой. Искать лодку в ${townLabel(t, 3)} ${t.name}.`, 'route');
  return toPort(a, K, t, say);
}
// at the port: aboard (the town's visit first: food and the rest bought — campaign/visit.js enterTown); else on the way to it
function toPort(a, K, t, say) {
  if (K.i === t.i) { pay(a, K, t, say); board(a, K, 1, say); return -1; }
  K.via = t.id; K.viaWhy = 'ferry';
  return t.i;
}

function pay(a, K, t, say) {
  const F = K.ferry, want = priceOf(K, F.days * 2), paid = Math.min(want, Math.max(0, K.gold));
  K.gold = tenth(K.gold - paid); F.paid = paid; K.stats.ferries = (K.stats.ferries || 0) + 1;
  const [who, agreed] = t.built.includes('harbor') ? ['Капитан из гавани', 'согласился'] : t.built.includes('pier') ? ['Лодочники с пристани', 'согласились'] : ['Рыбаки', 'согласились'];
  const side = sideOf(a, F.landing);
  say(`${who} ${townLabel(t, 2)} ${t.name} ${agreed} доставить отряд в бухту на ${side} берегу и забрать на обратном пути${paid < want ? ` — за всё, что было в казне (${paid} зол.)` : ` за ${paid} зол.`}. Путь — ${F.days} ${plural(F.days, 'день', 'дня', 'дней')}.`, 'route');
}
// which shore, in words: the side of the world the landing lies on
const SIDES = ['северном', 'восточном', 'южном', 'западном'];
function sideOf(a, i) {
  const [x, y] = centreOf(a, i), dx = (x - a.w / 2) / a.w, dy = (y - a.h / 2) / a.h;
  return Math.abs(dx) > Math.abs(dy) ? SIDES[dx > 0 ? 1 : 3] : SIDES[dy > 0 ? 2 : 0];
}
function board(a, K, dir, say) {
  const F = K.ferry; F.state = 'aboard'; F.dir = dir; F.left = F.days; F.waitTill = null;
  K.path = null; K.camp = 0; K.why = ''; K.via = null; K.viaWhy = null;
  if (dir < 0) say('Лодка пришла за отрядом, как договаривались: обратно за воду.', 'route');
}

// a day aboard (campaign/march.js caravanDay): the mark of the caravan sails; on the last day — ashore
export function sailDay(a, K, say) {
  const F = K.ferry; F.left--;
  K.food += mouths(K) * CAMPAIGN.ration * FERRY.fed;   // (the boat's fish: the company is fed aboard)
  const p = 1 - F.left / F.days, k = Math.min(F.way.length - 1, Math.round((F.dir > 0 ? p : 1 - p) * (F.way.length - 1))), c = F.way[k];
  [K.x, K.y] = centreOf(a, c);
  if (F.left > 0) return c;
  const at = F.dir > 0 ? F.landing : F.portI;
  K.i = at; [K.x, K.y] = centreOf(a, at); K.path = null;
  if (F.dir > 0) { F.state = 'landed'; say('Отряд высадился на берег. Лодка вернётся за ним, когда он придёт сюда снова.', 'route'); }
  else { K.ferry = null; say('Отряд вернулся на свой берег.', 'route'); }
  return at;
}
export const aboard = K => K.ferry?.state === 'aboard';
