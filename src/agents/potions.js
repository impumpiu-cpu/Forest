// Potions on a creature (data/potions.js, what they do — «Состояния» kind potion). The belt: the healing potion has a slot
// of its own (a.potions — a count, at most POTION.slot), any other takes one of POTION.belt places (a.belt — its
// resources). A potion is drunk by itself when its moment comes (its `use`):
//   wounded  — health below POTION.below while still on one's feet: right after the blow (agents/combat.js damage) or at a
//              tick of poison or bleeding (agents/body.js stepEffects); the slot first, then a strong one from the belt
//   poisoned — a venom in the blood (agents/body.js stepEffects)
//   fight, blade — at the first blow of a fight (agents/combat.js attack): a brew drunk, a poison rubbed on the weapon
// What it does: heal at once, cure states, last a while (a.effects: [{id, until}] — their mods are a source of the body,
// agents/special.js refreshBody; a resistance; holding the ground), or sit on the blade (a.coat: {id, hits}). A potion
// that leaves a mark for life is not drunk by one who bears it. The fallen, the dead and the bound drink nothing.
// A brew (data/potions.js `home`) is drunk out of a stock instead — the settlement's or the camp's (settlement/potions.js
// brewFor): it fills a need at once, mends a grave wound sooner; the sleeping one is given to a captive (sleepDose).
import {maxHp} from './agent.js';
import {log} from '../core/log.js';
import {POTION, POTION_RES, HOME_BY_USE, BELT_ORDER, potionOf} from '../data/potions.js';
import {NIGHT, hasSense} from '../data/tongues.js';
import {CONDITIONS, hasMark, effectsOf} from '../data/conditions.js';
import {SPECIES, fearsSilver} from '../data/species.js';
import {nightness} from '../core/time.js';
import {darkness} from './combat.js';
import {refreshBody} from './special.js';
import {def} from './equipment.js';
import {FRENZY} from '../data/roles.js';
import {onEdit} from '../data/schema/layer.js';

const able = a => !a.dead && !a.downed && !a.captive && a.hp > 0;
// a blade in hand to rub a poison on: a weapon of blows, not a bow struck with
export const holdsBlade = a => { const it = a.gear?.melee?.item; return !!it && !def(it).ranged; };
const he = (a, m, f) => (a.gender === 'f' ? f : m);

// what a drink of a potion does to this creature (the effect's row of «Состояния»)
function apply(w, a, row) {
  if (row.heal) a.hp = Math.min(maxHp(a), a.hp + row.heal);
  for (const [k, v] of Object.entries(row.needs || {})) if (a.needs?.[k] != null) a.needs[k] = Math.min(1, a.needs[k] + v);
  // a grave wound heals sooner: the time it has left × mend (a trauma never heals)
  if (row.mend != null) for (const x of a.wounds || []) if (x.until != null && x.until > w.tick) x.until = w.tick + Math.round((x.until - w.tick) * row.mend);
  for (const id of row.cures || []) {
    if (id === 'poisoned') a.poison = null;
    else if (id === 'bleeding') a.bleeding = null;
    else if (id === 'ill') a.ill = null;
    else if (id === 'webbed') a.webbed = null;
    else if (id === 'stunned') a.stunned = null;
  }
  let body = !!row.cures?.includes('ill');
  if (row.ticks) {
    a.effects = [...(a.effects || []).filter(e => e.id !== row.id), {id: row.id, until: w.tick + row.ticks}];
    if (Object.keys(row.mods || {}).length || row.hp != null) body = true;
  }
  if (row.blade) a.coat = {id: row.id, hits: row.blade.hits};
  if (row.mark) { a.marks = [...(a.marks || []), row.mark]; body = true; }
  if (body) refreshBody(a);
  a.flash = 4;
}

// may it drink this one now (a mark it bears already is not taken twice; a coat on a weapon it does not hold is nothing)
function fits(a, res) {
  const P = potionOf(res); if (!P) return false;
  const row = CONDITIONS.get(P.grade.effect);
  if (row.mark && hasMark(a, row.mark)) return false;
  if (row.blade && !holdsBlade(a)) return false;
  return true;
}

// drink a potion out of the slot or the belt (`res`: its resource), or out of a `stock` ({res: n}: a brew) → true when
// it was drunk
export function drink(w, a, res, stock = null) {
  if (!able(a)) return false;
  const P = potionOf(res); if (!P || !fits(a, res)) return false;
  if (stock) { if (!(stock[res] >= 1)) return false; stock[res]--; }
  else if (res === 'potion' && a.potions > 0) a.potions--;
  else { const k = (a.belt || []).indexOf(res); if (k < 0) return false; a.belt.splice(k, 1); }
  apply(w, a, CONDITIONS.get(P.grade.effect));
  const st = w.chronicle.potions ||= {drunk: 0, ours: 0}; st.drunk++; if (a.faction === 'colony') st.ours++;
  (st.by ||= {})[P.potion.id] = (st.by[P.potion.id] || 0) + 1;
  if (a.faction === 'colony' && a.name && !P.potion.home) {   // (a brew of the stock is everyday: no line)
    const what = P.potion.use === 'blade' ? `${he(a, 'натёр', 'натёрла')} клинок: ${P.potion.label}` : `${he(a, 'выпил', 'выпила')} ${P.k ? `${P.potion.label} (усиленное)` : P.potion.label}`;
    log(w, `${a.name} ${what}${res === 'potion' && a.potions ? ` (осталось ${a.potions})` : ''}.`, 'people');
  }
  return true;
}

// the first potion in the belt for this moment (a `use` of data/potions.js), or null; none whose own effect is at work
const atWork = (w, a, res) => (a.effects || []).some(e => e.id === potionOf(res).grade.effect && w.tick < e.until);
const forUse = (w, a, use) => (a.belt || []).find(res => potionOf(res)?.potion.use === use && fits(a, res) && !atWork(w, a, res)) || null;
// what goes on the blade against this foe: a silver oil against what fears silver, a poison against the living rest
function forBlade(a, t) {
  const sp = t ? SPECIES.get(t.species) : null, fears = fearsSilver(sp);
  return (a.belt || []).find(res => {
    const P = potionOf(res); if (P?.potion.use !== 'blade' || !fits(a, res)) return false;
    const row = CONDITIONS.get(P.grade.effect);
    return row.blade.silver ? fears : !sp?.undead && !fears;
  }) || null;
}

// at the edge of death: the slot's healing potion, else a strong one from the belt → true when it drank
export function quaff(w, a) {
  if (!able(a) || a.hp >= POTION.below * maxHp(a)) return false;
  if (a.potions > 0) return drink(w, a, 'potion');
  const res = forUse(w, a, 'wounded');
  return res ? drink(w, a, res) : false;
}

// the moment for a potion of this use has come (poisoned, fire, dark; fight — at the first blow against `t`, which
// brings the blade's, the dark's at night and the fire's against a fire-breather too). One whose effect is at work is
// not drunk again
export function drinkFor(w, a, use, t = null) {
  if (!able(a) || !a.belt?.length) return false;
  if (use === 'fight') {
    let any = false;
    for (let res; (res = forUse(w, a, 'fight')) && drink(w, a, res);) any = true;
    if (!a.coat) { const res = forBlade(a, t); if (res && drink(w, a, res)) any = true; }
    if (nightness(w) > POTION.dark && darkness(w, a) < 1 && drinkFor(w, a, 'dark')) any = true;   // (no use where the night hides nothing)
    if (t && SPECIES.get(t.species).breath && drinkFor(w, a, 'fire')) any = true;
    return any;
  }
  const res = forUse(w, a, use);
  return res ? drink(w, a, res) : false;
}
// a brew of the stock for this moment (a home `use`: cold, tired, mending): the strong grade first, none while one of
// its kind is at work → true when it drank
export function brewFor(w, a, use, stock) {
  const grades = HOME_BY_USE[use];
  if (!grades || !able(a) || (a.effects || []).some(e => useOfEffect(e.id) === use && w.tick < e.until)) return false;
  const res = grades.find(r => stock[r] >= 1);
  return res ? drink(w, a, res, stock) : false;
}

// the sleeping brew for a captive set on running (settlement/escape.js, campaign/captives.js): one taken out of the
// stock, the strong first → its row of «Состояний» (sleeps; calm — how much the will falls), or null when there is none
// (`drop`: a cargo, which forgets what it has none of)
export function sleepDose(stock, drop = false) {
  const res = (HOME_BY_USE.captive || []).find(r => stock[r] >= 1);
  if (!res) return null;
  if (--stock[res] <= 0 && drop) delete stock[res];
  return CONDITIONS.get(potionOf(res).grade.effect);
}

// ── the belt by need. The foes expected (counts by species) as shares: venomous, fearing silver, fire-breathing,
// undead, and the living rest
export function threatOf(counts) {
  let n = 0; const T = {venom: 0, silver: 0, breath: 0, undead: 0, living: 0};
  for (const [id, k] of Object.entries(counts || {})) {
    if (!SPECIES.has(id) || !(k > 0)) continue;
    const sp = SPECIES.get(id), silver = fearsSilver(sp); n += k;
    if (sp.venom) T.venom += k; if (silver) T.silver += k; if (sp.breath) T.breath += k; if (sp.undead) T.undead += k;
    if (!sp.undead && !silver) T.living += k;
  }
  if (!n) return {...T, living: 1};   // nobody known: the living, as most are
  for (const k of Object.keys(T)) T[k] /= n;
  return T;
}
// how much `holder` (its species: `race` of a caravan's member) wants this potion in its belt against this threat
export function beltNeed(res, threat, species) {
  const P = potionOf(res), N = P?.potion.need; if (!N) return 0;
  let v = N.base || 0;
  for (const k of ['venom', 'silver', 'breath', 'undead', 'living']) v += (N[k] || 0) * threat[k];
  if (N.dark && NIGHT.loss > 0 && !hasSense(species, 'darkvision')) v += N.dark;
  return v > 0 ? v + (P.k ? POTION.beltStrong : 0) : 0;
}
// what a belt should hold of what there is (`have(res)` — how many; `fitsIt(res)` — this holder may carry it): the
// POTION.belt most wanted, one of a kind, each wanted at all → [res…], the most wanted first
export function pickBelt(have, fitsIt, threat, species) {
  const best = new Map();
  for (const res of BELT_ORDER) {
    if (!(have(res) >= 1) || !fitsIt(res)) continue;
    const v = beltNeed(res, threat, species), kind = potionOf(res).potion.id;
    if (v > 0 && (!best.has(kind) || v > best.get(kind).v)) best.set(kind, {res, v});
  }
  return [...best.values()].sort((p, q) => q.v - p.v).slice(0, POTION.belt).map(e => e.res);
}
// fill and trade a belt by need: a carried potion takes the strong grade of its kind when the stock has it (one for
// one); empty places take the most wanted of the stock; a carried potion goes back (`give`) for one of the stock better
// by POTION.beltSwap (`take`). → true when it changed
export function rebelt(a, species, have, take, give, fitsIt, threat) {
  const belt = a.belt || [];
  let changed = false;
  // a better grade of a kind it carries: one for one, no place needed (the plain one back to the stock)
  for (let k = 0; k < belt.length; k++) {
    const P = potionOf(belt[k]); if (!P || P.k) continue;
    const up = P.potion.grades.slice(P.k + 1).map(g => g.res).find(r => have(r) >= 1 && fitsIt(r));
    if (up) { give(belt[k]); belt[k] = up; take(up); changed = true; }
  }
  for (let guard = 0; guard < POTION.belt + 1; guard++) {
    const kinds = new Set(belt.map(r => potionOf(r).potion.id));
    // what the stock offers that the belt has not of its kind
    const offer = pickBelt(r => (kinds.has(potionOf(r).potion.id) ? 0 : have(r)), fitsIt, threat, species)[0];
    if (!offer) break;
    const v = beltNeed(offer, threat, species);
    if (belt.length < POTION.belt) { belt.push(offer); take(offer); changed = true; continue; }
    const worst = belt.reduce((m, r) => (beltNeed(r, threat, species) < beltNeed(m, threat, species) ? r : m), belt[0]);
    if (v < beltNeed(worst, threat, species) + POTION.beltSwap) break;
    belt.splice(belt.indexOf(worst), 1); give(worst); belt.push(offer); take(offer); changed = true;
  }
  if (belt.length) a.belt = belt;
  return changed;
}

// the use of the potion whose drink gave this effect (for the effects at work)
let effectUse = null;
onEdit(() => { effectUse = null; });   // an edit of the potions (data/schema/layer.js) makes the map again
export const useOfEffect = id => (effectUse ||= new Map(POTION_RES.map(res => [potionOf(res).grade.effect, potionOf(res).potion.use]))).get(id) || null;

// the potions at work run out (agents/body.js stepEffects, once a tick): the body is rebuilt when one with mods ends
export function stepPotionEffects(w, a) {
  if (!a.effects?.length) return;
  const left = a.effects.filter(e => w.tick < e.until);
  if (left.length === a.effects.length) return;
  const ended = a.effects.filter(e => w.tick >= e.until);
  // a state that leaves another behind it (data/conditions.js `then`: the berserker's frenzy, then weariness)
  for (const e of ended) { const nx = CONDITIONS.has(e.id) ? CONDITIONS.get(e.id).then : null; if (nx && CONDITIONS.has(nx)) left.push({id: nx, until: w.tick + (CONDITIONS.get(nx).ticks || 0), from: e.id}); }
  a.effects = left.length ? left : null;
  if (ended.some(e => CONDITIONS.has(e.id) && (Object.keys(CONDITIONS.get(e.id).mods || {}).length || CONDITIONS.get(e.id).hp != null || CONDITIONS.get(e.id).then))) refreshBody(a);
}

// a wound throws a berserker into a frenzy (data/roles.js FRENZY): not while raging or spent — the next needs a fresh
// wound once the weariness is over, so it never rages twice in a row
export function rage(w, a) {
  const F = FRENZY;
  if (a.dead || a.downed || (a.effects || []).some(e => (e.id === F.rage || e.id === F.spent) && w.tick < e.until)) return false;
  a.effects = [...(a.effects || []), {id: F.rage, until: w.tick + CONDITIONS.get(F.rage).ticks}];
  refreshBody(a); a.flash = 4;
  return true;
}

// a blow of a coated weapon struck home (agents/combat.js damage): a poison passes to `t` (not into the dead), the coat
// wears thinner; a silver oil only wears (its bite is the blow's own: agents/combat.js silverFactor)
export function bladeHit(w, a, t, poisonResist, undead) {
  const row = a.coat && CONDITIONS.has(a.coat.id) ? CONDITIONS.get(a.coat.id) : null;
  if (!row?.blade) { a.coat = null; return; }
  const B = row.blade;
  if (!B.silver) { if (undead) return; t.poison = {dmg: B.dmg * poisonResist, until: w.tick + B.ticks}; }
  if (--a.coat.hits <= 0) a.coat = null;
}
// the blade bears silver now (a silver oil on it)
export const silverCoat = a => !!(a?.coat && CONDITIONS.has(a.coat.id) && CONDITIONS.get(a.coat.id).blade?.silver);
