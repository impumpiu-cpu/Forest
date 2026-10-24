// World view. The classic compass of two axes, ±5 each, and a handful of values: the compass says who keeps
// the law and who is kind, values say what two people will quarrel about (docs/RULES.md, «Мировоззрение»).
//   AXES   — order (−5 хаос … +5 закон) and mercy (−5 зло … +5 добро).
//            Three layers: a race has its point (data/races.js `align`); a realm of the world map gets its own
//            within ALIGN.realm of its race's on each axis (atlas/realms.js); a creature — within ALIGN.pawn of
//            its capital's, or of its race's where there is no world (agents/special.js). Every draw is a bell
//            (three draws summed): the far ends are rare, but a good people may give an evil one.
//            The point moves with what happens (ALIGN_DRIFT): wars and peace move a realm, being saved, seeing
//            captives sold, running away, sitting in council move a creature.
//   VALUES — what someone holds dear; every thinking creature draws 2–3 of them, weighted by its race.
//            Shared values bring people closer; `clash` pairs drive them apart (data/relations.js).
import {Registry} from '../core/registry.js';

export const AXES = {
  order: {label: 'Закон ↔ хаос', neg: 'хаос', pos: 'закон'},
  mercy: {label: 'Добро ↔ зло', neg: 'зло', pos: 'добро'},
};
export const AXIS_MAX = 5;

// The compass in numbers:
//   realm, pawn — how far (per axis) a capital may stand from its race, a creature from its capital
//   cell        — from here on an axis the label says it (законопослушный, добрый…); nearer zero — нейтральный
//   near, far, span — realms: their distance on the compass adds to the attitude they start from and drift back
//                 to (atlas/diplomacy.js memory): +near at one point, falling to `far` at `span` apart and beyond
//   help, guard — a creature this merciful or more helps one it cannot stand (aid in the woods), shares its bed with
//                 one it dislikes (settlement/together.js)
// how far one of a race strays from its centre (a realm from the race, a creature from its realm): ALIGN.realm or
// ALIGN.pawn × the race's own factor per axis (data/races.js `align.spread`: humans stray more, dwarves keep the law)
export const spreadOf = (sp, layer) => ({order: ALIGN[layer] * (sp?.align?.spread?.order ?? 1), mercy: ALIGN[layer] * (sp?.align?.spread?.mercy ?? 1)});
export const ALIGN = {realm: 3, pawn: 3, cell: 2, near: 0.5, far: -1, span: 10, help: 1.7, guard: 3.3};

// How the point moves (per event, or per year for a realm); every shift is kept within ±AXIS_MAX.
// A realm is pulled back to the point it was founded at (`root`) by `back` of the gap a year, so what it lives
// through bends it but does not run away with it: a long war settles ~war/back below its root, a trading peace
// ~peace/back above it, a burnt seat's shock fades in a generation.
//   realm.war — mercy a year for every war it fights;  realm.peace — mercy a year with no war and a trade route;
//   realm.seatLost — order when its capital is burnt;  realm.rule — order a year under one capital `ruleFrom` years on
//   pawn.saved — mercy of one whose wounds were dressed (× 2 when it was dying);  pawn.sold — mercy of the
//   not-merciful who see a captive sold (they grow used to it);  pawn.fled — order of a captive who runs;
//   pawn.council — order of each who sits in the evening council, up to `councilCap` above the point it was born with
export const ALIGN_DRIFT = {
  realm: {war: -0.12, peace: 0.04, seatLost: -1, rule: 0.02, ruleFrom: 30, back: 0.05},
  pawn: {saved: 0.2, sold: -0.15, fled: -0.5, council: 0.01, councilCap: 1.5},
};

const clampAxis = v => Math.max(-AXIS_MAX, Math.min(AXIS_MAX, Math.round(v * 100) / 100));
// move a point on one axis (a creature or a realm: anything with `align`); `upTo` — not past this (a pull, not a push)
export function shiftAlign(x, axis, d, upTo = null) {
  if (!x?.align || !d) return;
  const v = x.align[axis] + d;
  x.align[axis] = clampAxis(upTo == null ? v : d > 0 ? Math.min(v, Math.max(upTo, x.align[axis])) : Math.max(v, Math.min(upTo, x.align[axis])));
}

// a point near a centre: the centre + a bell within ±dev on each axis (a number, or {order, mercy}), kept on the
// compass; `rng` is drawn 6 times
export function alignNear(center, dev, rng) {
  const d = axis => (typeof dev === 'number' ? dev : dev?.[axis] ?? 0);
  const n = k => (rng() + rng() + rng() - 1.5) / 1.5 * k;
  const o = n(d('order')), m = n(d('mercy'));
  return {order: clampAxis(Math.round(((center?.order ?? 0) + o) * 2) / 2), mercy: clampAxis(Math.round(((center?.mercy ?? 0) + m) * 2) / 2)};
}

// The cell of the classic compass: «законопослушный добрый», «истинно нейтральный», «хаотичный злой»…
// g — the gender of the word: m (default) · f · n · pl («хаотичные злые» for a realm's people)
const ORDER_W = {pos: {m: 'законопослушный', f: 'законопослушная', n: 'законопослушное', pl: 'законопослушные'}, mid: {m: 'нейтральный', f: 'нейтральная', n: 'нейтральное', pl: 'нейтральные'}, neg: {m: 'хаотичный', f: 'хаотичная', n: 'хаотичное', pl: 'хаотичные'}};
const MERCY_W = {pos: {m: 'добрый', f: 'добрая', n: 'доброе', pl: 'добрые'}, mid: {m: 'нейтральный', f: 'нейтральная', n: 'нейтральное', pl: 'нейтральные'}, neg: {m: 'злой', f: 'злая', n: 'злое', pl: 'злые'}};
const TRUE_N = {m: 'истинно нейтральный', f: 'истинно нейтральная', n: 'истинно нейтральное', pl: 'истинно нейтральные'};
const side = v => (v >= ALIGN.cell ? 'pos' : v <= -ALIGN.cell ? 'neg' : 'mid');
export const alignCell = al => (al ? {order: side(al.order), mercy: side(al.mercy)} : null);
export function alignLabel(al, g = 'm') {
  if (!al) return '';
  const c = alignCell(al);
  if (c.order === 'mid' && c.mercy === 'mid') return TRUE_N[g];
  return `${ORDER_W[c.order][g]} ${MERCY_W[c.mercy][g]}`;
}

export const VALUES = new Registry('value');

VALUES.registerAll([
  {id: 'work',      label: 'труд',    clash: ['nature', 'freedom']},
  {id: 'gold',      label: 'золото',  clash: ['faith', 'family']},
  {id: 'ancestors', label: 'предки',  clash: ['freedom', 'knowledge']},
  {id: 'nature',    label: 'природа', clash: ['work', 'gold']},
  {id: 'strength',  label: 'сила',    clash: ['family', 'knowledge']},
  {id: 'knowledge', label: 'знание',  clash: ['faith', 'ancestors']},
  {id: 'faith',     label: 'вера',    clash: ['knowledge', 'gold']},
  {id: 'family',    label: 'семья',   clash: ['strength']},
  {id: 'freedom',   label: 'свобода', clash: ['ancestors', 'work']},
]);

// how a point on an axis reads: «закон +2», «середина», «зло −1,5»
export function axisWord(axis, v) {
  const a = AXES[axis], r = Math.round(v * 2) / 2;
  if (!r) return 'середина';
  return `${r > 0 ? a.pos : a.neg} ${r > 0 ? '+' : '−'}${String(Math.abs(r)).replace('.', ',')}`;
}
