// The camp set up for the night (docs/CAMPAIGN.md «Обустройство стоянки»; the numbers: data/camp.js CAMP_WORKS): the
// evening's chores of a company in the field, each a thing on the local map — the cart drawn up by the fire, a rope between
// posts for the beasts, poles with the hunt's hides on them, a spit over the fire, a smoking rack at a stop with fresh
// meat, and the stakes round the camp: those a cart or wagon brought, or, on a stop with an axe among the tools, cut on the
// spot. Planned as the camp opens (planWorks, from what the caravan brought: campaign/camp.js S), made by whoever takes
// one up (agents/behaviours/campwork.js), and stowed again in the morning — the map is the night's; what lasts goes back
// to the campaign in the camp's outcome (worksOutcome: the hides cured, the stakes cut).
// The chores themselves live on the local map (settlement/works.js: the things, the hands at them, what a finished one
// does); here — what is planned from what the caravan brought, and what comes back to the campaign in the morning.
import {CAMP_WORKS} from '../data/camp.js';
import {VEHICLES} from '../data/transport.js';
import {T} from '../data/terrain.js';
import {worksOf, workDone, spotNear, addWork, freeCell, gearDef, FAR} from '../local/index.js';
import {PIECES, PIECE_FINDS} from '../data/pieces.js';
import {RESOURCES} from '../data/resources.js';
import {mulberry, seedNumber} from '../core/rng.js';
import {plural} from '../core/util.js';

const W = () => CAMP_WORKS;

// the chores of this camp, from what the caravan brought: `S` of campaign/camp.js (vehicles, beasts, cargo, kind, stayed,
// stakes — how many poles the wheels carry, cut — how many stand here from the day before, axe — a woodcutter's tool among them)
export function planWorks(w, S) {
  w.works = [];
  const D = W(), r = w.campaign.rnd, taken = new Set(), stood = (S.stayed || 0) > 0;   // a stop's second day: everything stands from the first
  const made = (key, n, cells, ticks, extra) => { if (!cells) return null; for (const i of cells) taken.add(i); return addWork(w, key, cells, stood ? 0 : ticks, extra); };
  const a0 = r() * Math.PI * 2, P = D.place;
  // the cart or wagon, drawn up by the fire; the beasts beside it
  let wagon = null;
  if (S.vehicles?.length) wagon = made('wagon', 1, spotNear(w, D.wagon.at, a0, taken, 2), 0, {kind: S.vehicles[0].kind});
  const beasts = (S.beasts || []).filter(b => !b.golem);
  if (beasts.length) made('tether', 1, spotNear(w, D.tether.at, wagon ? a0 + P.tether : a0, taken, D.tether.posts), D.tether.ticks);
  if ((S.cargo?.hide || 0) >= 1) made('racks', 1, spotNear(w, D.racks.at, a0 + P.racks, taken, 2), D.racks.ticks);
  made('spit', 1, spotNear(w, D.spit.at, a0 + P.spit, taken, 1), D.spit.ticks);
  w.works.plan = {a0, stop: S.kind === 'stop', stood};   // (the smoking rack is planned when the hunt brings meat: stepWorks)
  // the stakes: the wheels' poles, or those cut here (standing from the day before, or to cut today on a stop with an axe)
  const brought = S.stakes || 0, cutBefore = S.cut || 0, cutToday = !brought && !cutBefore && S.kind === 'stop' && S.axe ? D.stakes.cutPerDay : 0;
  const n = brought || cutBefore || cutToday;
  if (n > 0) {
    const cells = ringCells(w, D.stakes.radius, taken).slice(0, n);
    for (const i of cells) { taken.add(i); addWork(w, 'stakes', [i], stood || cutBefore ? 0 : cutToday ? D.stakes.cutTicks : D.stakes.ticks, {cut: cutToday > 0}); }
  }
}
// the cells of the ring round the fire, open ground, no road beside (the way in and out stays open), nearest the side away
// from the road first (the foe comes from the edges, the road is where the caravan itself walks)
function ringCells(w, radius, taken) {
  const cx = w.camp.x + 1 / 2, cy = w.camp.y + 1 / 2, out = [], seen = new Set();
  let rx = 0, ry = 0, rn = 0;
  for (let i = 0; i < w.n; i++) if (w.grid.terr[i] === T.ROAD) { rx += i % w.w; ry += (i / w.w) | 0; rn++; }
  const away = rn ? Math.atan2(cy - ry / rn, cx - rx / rn) : 0;
  for (let k = 0; k < 96; k++) {
    const a = away + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI * 2 / 96);
    const x = Math.floor(cx + Math.cos(a) * radius), y = Math.floor(cy + Math.sin(a) * radius), i = y * w.w + x;
    if (seen.has(i) || !freeCell(w, x, y, taken)) continue;
    let road = false;
    for (let dy = -1; dy <= 1 && !road; dy++) for (let dx = -1; dx <= 1; dx++) if (w.grid.terr[(y + dy) * w.w + x + dx] === T.ROAD) { road = true; break; }
    if (road) continue;
    seen.add(i); out.push(i);
  }
  return out;
}

// the morning (campaign/camp.js campOutcome): the hides cured on the racks (hide → leather in the stores, before the stores
// are counted), the stakes cut here for the day after → {cured, cut}
export function worksOutcome(w) {
  const out = {cured: 0, cut: 0};
  const R = W().racks.cure;
  if (workDone(w, 'racks') && (w.stock.hide || 0) >= R.hides) { out.cured = R.hides; w.stock.hide -= R.hides; w.stock.leather = (w.stock.leather || 0) + R.leather; }
  out.cut = worksOf(w).filter(x => x.key === 'stakes' && x.done && x.cut).length;
  return out;
}
// ── the caches of the pieces of terrain (world/pieces.js): each a chore on the map, what it holds rolled as the camp opens
// from a stream of its own (data/pieces.js PIECE_FINDS) — the same camp played again holds the same
export function planCaches(w, S) {
  const D = W().cache;
  for (const p of w.pieces || []) for (const i of p.caches || []) {
    const F = PIECE_FINDS[pieceFinds(p)]; if (!F) continue;
    const loot = rollLoot(mulberry(seedNumber(`${S.seed}:cache:${i}`)), F);
    w.works ||= [];
    addWork(w, 'cache', [i], D.ticks, {piece: p.label, loot, text: loot.text});
  }
}
const pieceFinds = p => PIECE_TABLE[p.id] ?? null;
const PIECE_TABLE = Object.fromEntries(PIECES.map(p => [p.id, p.finds || null]));
const between = (r, [lo, hi]) => lo + r() * (hi - lo);
// what a cache holds: {gold, goods: {resource: n}, items: [item ids], text}
export function rollLoot(r, F) {
  const gold = Math.round(between(r, F.gold || [0, 0])), goods = {}, items = [], things = [];
  if (gold > 0) things.push(`${gold} ${plural(gold, 'золотой', 'золотых', 'золотых')}`);
  for (const [id, [p, lo, hi]] of Object.entries(F.goods || {})) {
    if (r() >= p || !RESOURCES.has(id)) continue;
    const n = Math.round(between(r, [lo, hi])); if (n > 0) { goods[id] = n; things.push(`${RESOURCES.get(id).label.toLowerCase()} (${n})`); }
  }
  for (const [id, p] of Object.entries(F.items || {})) if (r() < p && gearDef(id)) { items.push(id); things.push(gearDef(id).label.toLowerCase()); }
  if (!things.length) things.push('пусто — кто-то побывал здесь раньше');
  const text = F.text[(r() * F.text.length) | 0].replace('{things}', things.join(', '));
  return {gold, goods, items, text};
}
// the morning (campaign/camp.js campOutcome): the caches searched on the map, and — when the field is the caravan's — the rest
// it can walk to, searched before it goes on → [{piece, gold, goods, items, text, late}]
export function cachesOutcome(w, won) {
  const out = [], camp = w.nav?.get('camp');
  for (const x of worksOf(w)) {
    if (x.key !== 'cache') continue;
    const late = !x.done;
    if (late && (!won || !camp || !(camp[x.cells[0]] < FAR))) continue;
    out.push({piece: x.piece, gold: x.loot.gold, goods: {...x.loot.goods}, items: [...x.loot.items], text: x.loot.text, late});
  }
  return out;
}

// the label of a thing, for the map's card (ui/campLocal.js)
export function workText(w, x) {
  const D = W()[x.key], label = D.label[0].toUpperCase() + D.label.slice(1);
  if (x.key === 'cache') return x.done ? `Тайник (${x.piece}) обыскан` : `Тайник: ${x.piece}${x.by != null ? ' — обыскивают' : ''}`;
  if (x.key === 'wagon') return `${VEHICLES[x.kind]?.label === 'тележка' ? 'Тележка' : 'Повозка'} с припасами — у неё склад каравана`;
  if (!x.done) return `${label}: ${x.by != null ? 'делают' : 'ещё не взялись'}, ${Math.round(x.progress / x.ticks * 100)}%`;
  if (x.key === 'tether') return `${label}: звери привязаны — увести можно, лишь перерезав верёвку`;
  if (x.key === 'racks') return `${label}: за ночь ${W().racks.cure.hides} шкуры станут кожей`;
  if (x.key === 'smoke') return `${label}: свежее мясо коптится в вяленое${(w.stock.meat || 0) > 0 ? ` (мяса ${Math.round(w.stock.meat)})` : ''}`;
  if (x.key === 'stakes') return `Судесы: пройти можно, но медленно${x.cut ? '; нарублены на месте' : ''}`;
  return label;
}
