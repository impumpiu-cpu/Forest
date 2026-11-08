// What the colony's overmind has posted, on the local map (docs/ART.md «Надмозг»): the flags of the board
// (settlement/board.js) — a red one for a raid or a foe on one of ours, a yellow one for a beast about, the nechist,
// runaways or raiders going off with our goods — with who of ours answers each, the night watch, the gathering at the
// fire on a raid, what the council saves for (settlement/council.js) and the day's open places (settlement/plan.js).
// The icons keep their size on the screen whatever the zoom: they are marks over the map, not things on it.
//
// Only reads the world, and reads it without the core's per-tick caches (core/util.js perTick): a frame drawn in the
// middle of a tick must not fill them before the simulation does. A switch of its own (⚑, key F), kept in this browser;
// both looks of the map show it. Each icon drawn leaves its box (`hits`): a click on it opens its card (mindCard).
import {BUILDINGS} from '../data/buildings.js';
import {JOBS} from '../data/jobs.js';
import {SPECIES} from '../data/species.js';
import {dayOf, clockStr} from '../core/time.js';
import {esc} from '../core/util.js';
import {drawSprite, hasSprite, cached, FIGURE} from './art/sprite.js';

const KEY = 'forest.minds';
export const MINDS_EVENT = 'forest-minds';
function load() { try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; } }
let on = typeof localStorage === 'undefined' ? true : load();
export const minds = {
  get on() { return on; },
  set(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* storage unavailable */ }
    if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent(MINDS_EVENT, {detail: on}));
  },
  toggle() { this.set(!on); },
};
export function wireMindsButton(btn) {
  if (!btn) return;
  const show = () => { btn.setAttribute('aria-pressed', String(on)); btn.title = `Надмозг на карте: ${on ? 'показан' : 'скрыт'} — флаги угроз, дозор, сбор, цель совета, вакансии (клавиша F)`; };
  btn.addEventListener('click', () => minds.toggle());
  document.addEventListener(MINDS_EVENT, show);
  show();
}

// the sizes, CSS pixels
export const ICON = 22, BADGE = 14;
const RED = '#d8402e', YELLOW = '#e0b030', BLUE = '#4f86c6';

function icon(ctx, key, x, y, size, alpha = 1) {
  if (!hasSprite(key)) return;
  const s = Math.round(size), bmp = cached(`mind|${key}|${s}`, s, s, g => drawSprite(g, key, 0, 0, s / 100, {step: FIGURE, minLine: 1}));
  ctx.globalAlpha = alpha; ctx.drawImage(bmp, x, y, s, s); ctx.globalAlpha = 1;
}
function count(ctx, n, x, y, fill) {
  const t = String(n), r = 6.5;
  ctx.fillStyle = fill; ctx.strokeStyle = '#231f20'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 9px "PT Sans", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(t, x, y + 0.5); ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

// ── reading the board as the core keeps it (settlement/board.js), without its caches
const isFoe = o => !o.dead && !o.tame && !o.downed && o.faction !== 'colony';
const emblem = f => (f.kind === 'raid' ? (f.red ? 'minds/raid' : 'minds/loot') : f.kind === 'escape' ? 'minds/escape' : f.kind === 'nechist' ? 'minds/nechist' : 'minds/beast');
function answerersOf(w, flags) {
  const owner = new Map(), by = {};
  for (const f of flags) for (const id of f.members) owner.set(id, f.key);
  for (const c of w.agents) {
    if (c.faction !== 'colony' || c.dead || c.downed) continue;
    const t = c.task, key = t?.id === 'answer' ? t.flag : t?.id === 'fight' && t.target ? (t.flag || owner.get(t.target.id)) : null;
    if (key) (by[key] ||= []).push(c);
  }
  return by;
}

// the overlay; S — CSS pixels to a cell (the context is already shifted to the map's corner). Returns the boxes drawn.
export function drawMinds(ctx, w, S, view) {
  const hits = [];
  if (!on) return hits;
  const byId = new Map(w.agents.map(a => [a.id, a]));
  const flags = Object.values(w.board?.flags || {});
  const ans = answerersOf(w, flags);
  ctx.save();
  // 1. the flags: who answers it drawn to it, where its foes were seen, the flag itself, its weight, its defenders
  for (const f of flags) {
    const ms = f.members.map(id => byId.get(id)).filter(o => o && isFoe(o));
    if (!ms.length) continue;
    const x = f.x * S, y = f.y * S, col = f.red ? RED : YELLOW, who = ans[f.key] || [];
    ctx.setLineDash([3, 4]); ctx.lineWidth = 1.4; ctx.strokeStyle = col; ctx.globalAlpha = 0.8;
    ctx.beginPath(); for (const c of who) { ctx.moveTo(c.x * S, c.y * S); ctx.lineTo(x, y); } ctx.stroke();   // to the point, under the flag
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    // the places its members were last seen: a faint eye where one is not in sight now
    for (const [id, p] of Object.entries(f.seen || {})) {
      const o = byId.get(+id);
      if (!o || !isFoe(o) || Math.hypot(o.x - p.x, o.y - p.y) < 1.5) continue;
      icon(ctx, 'minds/seen', p.x * S - 6, p.y * S - 6, 12, 0.6);
    }
    const fx = x - ICON * 0.15, fy = y - ICON - Math.max(12, S * 0.9);   // over the heads of the foes, the pole's foot above the point
    icon(ctx, f.red ? 'minds/flag-red' : 'minds/flag-yellow', fx, fy, ICON);
    icon(ctx, emblem(f), fx + ICON * 0.3, fy + ICON * 0.12, ICON * 0.42);
    // the weight (urgency × the share nobody covers): a bar under the pole, 0…1 of the heaviest
    const k = Math.max(0, Math.min(1, (f.weight || 0) / 1.5));
    const by = fy + ICON + 1;
    ctx.fillStyle = 'rgba(20,20,16,0.8)'; ctx.fillRect(fx, by, ICON, 3.5);
    ctx.fillStyle = col; ctx.fillRect(fx, by, ICON * (f.red ? 1 : k), 3.5);
    if (who.length) { icon(ctx, 'minds/answer', fx + ICON - 2, fy + ICON * 0.48, BADGE); count(ctx, who.length, fx + ICON + BADGE - 3, fy + ICON * 0.48 + 2, BLUE); }
    hits.push({kind: 'flag', key: f.key, x: fx, y: fy, w: ICON + (who.length ? BADGE : 0), h: ICON + 6});
  }
  // 2. over the fire, in a row: the gathering on a raid, an empty watch post, the council's goal, the open places
  const cx = (w.camp.x + 0.5) * S, cy = (w.camp.y + 0.5) * S, row = [];
  if (flags.some(f => f.kind === 'raid' && f.red)) row.push({kind: 'muster', key: 'minds/muster'});
  const W = w.board?.watch;
  if (W && !W.done) {
    const a = W.by != null ? byId.get(W.by) : null;
    if (a && !a.dead && a.task?.id === 'watch') {   // the lantern over the watchman's head
      const ix = a.x * S - BADGE / 2, iy = a.y * S - Math.max(24, S * 1.5) - BADGE;
      icon(ctx, 'minds/watch', ix, iy, BADGE + 2);
      hits.push({kind: 'watch', x: ix, y: iy, w: BADGE + 2, h: BADGE + 2});
    } else row.push({kind: 'watch', key: 'minds/watch-empty', alpha: 0.9});
  }
  const goal = w.council?.goal && BUILDINGS.has(w.council.goal) ? w.council.goal : null;
  if (goal) row.push({kind: 'goal', key: 'minds/goal', extra: BADGE});
  const open = openPlaces(w);
  if (open.total > 0) row.push({kind: 'plan', key: 'minds/vacancy', extra: 6, n: open.total});
  const gap = 4, width = row.reduce((s, r) => s + ICON + (r.extra || 0) + gap, -gap);
  let ix = cx - width / 2;
  const iy = cy - Math.max(30, S * 2.2) - ICON;
  for (const r of row) {
    icon(ctx, r.key, ix, iy, ICON, r.alpha ?? 1);
    if (r.kind === 'goal') icon(ctx, `buildings/${goal}`, ix + ICON * 0.6, iy - ICON * 0.3, BADGE + 2);
    if (r.n) count(ctx, r.n, ix + ICON - 1, iy + 4, '#5a8a3a');
    hits.push({kind: r.kind, x: ix, y: iy - (r.kind === 'goal' ? ICON * 0.3 : 0), w: ICON + (r.extra || 0), h: ICON * (r.kind === 'goal' ? 1.3 : 1)});
    ix += ICON + (r.extra || 0) + gap;
  }
  ctx.restore();
  return hits;
}

// the day's places and who holds them (settlement/plan.js vacancyLines, read without its caches)
function openPlaces(w) {
  const vac = w.plan?.vac; if (!vac) return {total: 0, rows: []};
  const d = dayOf(w.tick, w), by = {};
  for (const a of w.agents) if (a.faction === 'colony' && !a.dead && !a.downed && a.shift?.day === d && a.shift.job) (by[a.shift.job] ||= []).push(a);
  let total = 0;
  const rows = Object.entries(vac).map(([j, v]) => { const hs = by[j] || [], free = Math.max(0, v.places - hs.length); total += free; return {job: j, places: v.places, hs, free, why: v.why}; });
  return {total, rows};
}

// the hit under a point of the canvas (CSS pixels from the map's corner, as the boxes are), the topmost
export const mindAt = (hits, px, py) => { for (let k = hits.length - 1; k >= 0; k--) { const h = hits[k]; if (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) return h; } return null; };

// the card of a mark (ui/campLocal.js, the gallery): what the overmind knows and asks
export function mindCard(w, h) {
  const byId = new Map(w.agents.map(a => [a.id, a])), names = l => l.map(a => esc(a.name)).join(', ');
  const row = (t, v) => `<dt>${t}</dt><dd>${v}</dd>`;
  if (h.kind === 'flag') {
    const f = w.board?.flags?.[h.key]; if (!f) return '<p class="muted">Тревога снята.</p>';
    const ms = f.members.map(id => byId.get(id)).filter(o => o && isFoe(o));
    const who = answerersOf(w, [f])[f.key] || [], known = Object.keys(f.known).map(id => byId.get(+id)).filter(a => a && !a.dead);
    const kinds = {};
    for (const o of ms) { const l = SPECIES.get(o.species).label; kinds[l] = (kinds[l] || 0) + 1; }
    return `<h3>${f.red ? 'Красный флаг' : 'Жёлтый флаг'}: ${esc(f.label)}</h3><dl class="sum">` +
      row('Где', esc(f.where)) + row('Кто', esc(Object.entries(kinds).map(([l, n]) => n > 1 ? `${l} ×${n}` : l).join(', '))) +
      row('Вес', f.red ? 'не пропустить, пока не кончится' : `${(f.weight || 0).toFixed(2)} — срочность × не закрытая доля`) +
      row('Поднял', `${esc(f.byName || '—')}, ${esc(clockStr(f.started, w))}`) +
      row('Знают', `${known.length}${known.length ? ': ' + names(known.slice(0, 8)) + (known.length > 8 ? '…' : '') : ''}`) +
      row('Отвечают', who.length ? names(who) : 'никто') + '</dl>' +
      '<small class="muted">Доска только знает и объявляет: каждый решает сам, идти ли (settlement/board.js).</small>';
  }
  if (h.kind === 'muster') return '<h3>Сбор по тревоге</h3><p>Идёт набег: кто не видит налётчиков, собирается у огня, а не бежит навстречу один.</p>';
  if (h.kind === 'watch') {
    const W = w.board?.watch, a = W?.by != null ? byId.get(W.by) : null;
    return `<h3>Ночной дозор</h3><p>${a ? `На посту у огня: <b>${esc(a.name)}</b>${W.slept ? ' — уснул на посту' : ''}.` : 'Место у огня свободно: никто не взялся.'}</p><small class="muted">Совет вешает одно место каждый вечер; берёт его кто захочет.</small>`;
  }
  if (h.kind === 'goal') {
    const c = w.council, d = BUILDINGS.get(c.goal);
    return `<h3>Совет копит на: ${esc(d.name.toLowerCase())}</h3><p>${esc(c.decision || '')}</p>${c.votes?.length ? `<small>Голоса: ${c.votes.map(([k, n]) => `${esc(BUILDINGS.get(k).name.toLowerCase())} ${n}`).join(', ')}</small>` : ''}`;
  }
  if (h.kind === 'plan') {
    const P = openPlaces(w);
    return `<h3>Вакансии дня: свободно ${P.total}</h3><dl class="sum">${P.rows.map(r => row(esc(JOBS.get(r.job).label), `${r.hs.length} из ${r.places}${r.hs.length ? ' — ' + names(r.hs) : ''}${r.why ? ` <small>(${esc(r.why)})</small>` : ''}`)).join('')}</dl>`;
  }
  return '';
}
