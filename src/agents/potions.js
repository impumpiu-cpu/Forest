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
import {maxHp} from './agent.js';
import {log} from '../core/log.js';
import {POTION, POTION_RES, potionOf} from '../data/potions.js';
import {CONDITIONS, hasMark} from '../data/conditions.js';
import {refreshBody} from './special.js';
import {def} from './equipment.js';

const able = a => !a.dead && !a.downed && !a.captive && a.hp > 0;
// a blade in hand to rub a poison on: a weapon of blows, not a bow struck with
export const holdsBlade = a => { const it = a.gear?.melee?.item; return !!it && !def(it).ranged; };
const he = (a, m, f) => (a.gender === 'f' ? f : m);

// what a drink of a potion does to this creature (the effect's row of «Состояния»)
function apply(w, a, row) {
  if (row.heal) a.hp = Math.min(maxHp(a), a.hp + row.heal);
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

// drink a potion out of the slot or the belt (`res`: its resource) → true when it was drunk
export function drink(w, a, res) {
  if (!able(a)) return false;
  const P = potionOf(res); if (!P || !fits(a, res)) return false;
  if (res === 'potion' && a.potions > 0) a.potions--;
  else { const k = (a.belt || []).indexOf(res); if (k < 0) return false; a.belt.splice(k, 1); }
  apply(w, a, CONDITIONS.get(P.grade.effect));
  const st = w.chronicle.potions ||= {drunk: 0, ours: 0}; st.drunk++; if (a.faction === 'colony') st.ours++;
  (st.by ||= {})[P.potion.id] = (st.by[P.potion.id] || 0) + 1;
  if (a.faction === 'colony' && a.name) {
    const what = P.potion.use === 'blade' ? `${he(a, 'натёр', 'натёрла')} клинок: ${P.potion.label}` : `${he(a, 'выпил', 'выпила')} ${P.k ? `${P.potion.label} (усиленное)` : P.potion.label}`;
    log(w, `${a.name} ${what}${res === 'potion' && a.potions ? ` (осталось ${a.potions})` : ''}.`, 'people');
  }
  return true;
}

// the first potion in the belt for this moment (a `use` of data/potions.js), or null
const forUse = (a, use) => (a.belt || []).find(res => potionOf(res)?.potion.use === use && fits(a, res)) || null;

// at the edge of death: the slot's healing potion, else a strong one from the belt → true when it drank
export function quaff(w, a) {
  if (!able(a) || a.hp >= POTION.below * maxHp(a)) return false;
  if (a.potions > 0) return drink(w, a, 'potion');
  const res = forUse(a, 'wounded');
  return res ? drink(w, a, res) : false;
}

// the moment for a potion of this use has come (poisoned; fight — at the first blow, which brings `blade` too)
export function drinkFor(w, a, use) {
  if (!able(a) || !a.belt?.length) return false;
  if (use === 'fight') {
    let any = false;
    for (const u of ['fight', 'blade']) {
      if (u === 'fight' && (a.effects || []).some(e => useOfEffect(e.id) === 'fight' && w.tick < e.until)) continue;   // one at work already
      if (u === 'blade' && a.coat) continue;
      const res = forUse(a, u); if (res && drink(w, a, res)) any = true;
    }
    return any;
  }
  const res = forUse(a, use);
  return res ? drink(w, a, res) : false;
}
// the use of the potion whose drink gave this effect (for the effects at work)
let effectUse = null;
const useOfEffect = id => (effectUse ||= new Map(POTION_RES.map(res => [potionOf(res).grade.effect, potionOf(res).potion.use]))).get(id) || null;

// the potions at work run out (agents/body.js stepEffects, once a tick): the body is rebuilt when one with mods ends
export function stepPotionEffects(w, a) {
  if (!a.effects?.length) return;
  const left = a.effects.filter(e => w.tick < e.until);
  if (left.length === a.effects.length) return;
  const ended = a.effects.filter(e => w.tick >= e.until);
  a.effects = left.length ? left : null;
  if (ended.some(e => CONDITIONS.has(e.id) && (Object.keys(CONDITIONS.get(e.id).mods || {}).length || CONDITIONS.get(e.id).hp != null))) refreshBody(a);
}

// a blow of a coated weapon struck home (agents/combat.js damage): the poison passes to `t`, the coat wears thinner
export function bladeHit(w, a, t, poisonResist) {
  const row = a.coat && CONDITIONS.has(a.coat.id) ? CONDITIONS.get(a.coat.id) : null;
  if (!row?.blade) { a.coat = null; return; }
  const B = row.blade;
  t.poison = {dmg: B.dmg * poisonResist, until: w.tick + B.ticks};
  if (--a.coat.hits <= 0) a.coat = null;
}
