// The inner life of a colonist: a diary of thoughts (data/thoughts.js; ctx.mood overrides the
// entry's mood when it depends on circumstances), a mood made of them,
// and wishes read from needs, gear and what they would argue for at the council.
import {THOUGHTS, MOOD_LABELS} from '../data/thoughts.js';
import {NEEDS} from '../data/needs.js';
import {clamp} from '../core/util.js';
import {handItems, def as itemDef} from './equipment.js';
import {MIND} from '../data/behaviour.js';

export function think(w, a, id, ctx = {}) {
  if (!a?.diary || a.dead) return;
  const d = THOUGHTS.get(id);
  if (d.once && a.diary.some(e => e.id === id && w.tick - e.t < d.once)) return;
  a.diary.unshift({t: w.tick, id, text: d.text(a, ctx), mood: ctx.mood ?? d.mood, until: w.tick + d.lasts});
  if (a.diary.length > MIND.diary) a.diary.pop();
}

// mood: fresh thoughts count fully and fade out; unmet needs weigh on top
export function moodOf(w, a) {
  if (!a.diary) return 0;
  let m = 0;
  for (const e of a.diary) {
    if (e.until <= w.tick) continue;
    m += e.mood * (e.until - w.tick) / Math.max(1, e.until - e.t);
  }
  for (const [id, v] of Object.entries(a.needs)) if (v < MIND.needLow) m -= (MIND.needLow - v) * MIND.needWeight;
  return clamp(m, -1, 1);
}

export function moodLabel(a, m) {
  for (const [min, [male, female]] of MOOD_LABELS) if (m >= min) return a.gender === 'f' ? female : male;
  return '';
}

// what the colonist wants right now, most pressing first
export function wishes(w, a, councilWish) {
  const out = [];
  for (const [id, v] of Object.entries(a.needs).sort((x, y) => x[1] - y[1])) if (v < MIND.wishBelow) out.push(NEEDS.get(id).wish || NEEDS.get(id).label);
  const hands = handItems(a).map(itemDef);
  if (a.equip) {
    if (!hands.some(d => d.melee || d.ranged)) out.push('оружие в руки');
    if (!a.equip.body) out.push('одежду потеплее');
    if (a.likes === 'hunt' && !hands.some(d => d.ranged)) out.push('лук или пращу для охоты');
    if (a.gear?.ranged?.ammo && !a.gear.rangedReady) out.push('стрел в колчан');
  }
  if (councilWish) out.push(`чтобы построили ${councilWish.name.toLowerCase()}: ${councilWish.why}`);
  return out;
}
