// The making of a land with the hand on it («Создать землю», docs/WORLD.md) — the model behind the screen
// (app/landView.js), headless, so a tool can replay what a player did. It holds the land being made, the hand's edits
// (atlas/shape.js) and the copies of the land taken before the stages the edits enter at; an edit works the chain out
// again from the latest copy at or before its stage. The copies are in memory only: a land opened from the library is
// made whole again on its first edit (by the current generator).
//
//   const m = new LandMaker(cfg);           // or LandMaker.open(savedLand)
//   while (!m.done) m.stepOne();            // the screen runs a few stages a frame
//   m.lift(plateId, +1); m.setDirection(plateId, 1, 0); m.setClimate({equator: 3}); m.stroke(x, y, 7, true); m.endStroke();
import {SHAPE} from '../data/atlas.js';
import {ATLAS_STAGES} from './stages.js';
import {newAtlas, runNextStage, landDone} from './generate.js';
import {emptyShape, shapeEmpty, snapshot, resume, FROM, dab} from './shape.js';
import {scaleOf} from './tectonics.js';

const SNAP = new Set(Object.values(FROM));
const stageIndex = id => ATLAS_STAGES.all().findIndex(s => s.id === id);
const r3 = v => Math.round(v * 1000) / 1000;

export class LandMaker {
  constructor(cfg) {
    this.cfg = {...cfg}; delete this.cfg.shape;
    this.shape = emptyShape(); this.snaps = {}; this.pending = null;
    this.atlas = newAtlas(this.cfg);
  }

  // a land saved before: its settings and its edits; the copies come with its first edit
  static open(a) {
    const m = Object.create(LandMaker.prototype);
    m.cfg = {...a.cfg}; delete m.cfg.shape;
    const s = a.cfg.shape ? structuredClone(a.cfg.shape) : emptyShape();
    m.shape = {plates: s.plates || {}, strokes: s.strokes || [], climate: {...emptyShape().climate, ...s.climate}};
    m.snaps = {}; m.pending = null; m.atlas = a;
    return m;
  }

  get done() { return landDone(this.atlas); }

  // the next stage; the copy before it is kept when an edit may enter there
  stepOne() {
    const a = this.atlas; if (landDone(a)) return false;
    const st = ATLAS_STAGES.all()[a.stage];
    if (SNAP.has(st.id)) this.snaps[st.id] = snapshot(a);
    runNextStage(a);
    return true;
  }
  finish() { while (this.stepOne()); return this.atlas; }

  // an edit of the kind (atlas/shape.js FROM) was made: the land from the latest copy at or before the stage it enters
  // at; the copies after it hold the old edit and are dropped (the run takes them again)
  rebuild(kind) {
    const at = stageIndex(FROM[kind]);
    let best = null;
    for (const id of Object.keys(this.snaps)) { const k = stageIndex(id); if (k <= at && (!best || k > stageIndex(best))) best = id; }
    for (const id of Object.keys(this.snaps)) if (stageIndex(id) > (best ? stageIndex(best) : -1)) delete this.snaps[id];
    const shape = shapeEmpty(this.shape) ? null : this.shape;
    this.atlas = best ? resume(this.snaps[best], shape) : newAtlas({...this.cfg, ...(shape ? {shape: structuredClone(shape)} : {})});
    return this.atlas;
  }

  // ── plates
  plate(id) { return this.atlas.plates?.[id] || null; }
  // the plate's entry in the edits; the seed's own motion is kept the first time it is touched
  entry(id) {
    const e = (this.shape.plates[id] ||= {});
    if (e.ox == null) { const p0 = this.snaps.tectonics?.plates?.[id] || this.atlas.plates[id]; e.ox = p0.vx; e.oy = p0.vy; }
    return e;
  }
  tidy(id) { const e = this.shape.plates[id]; if (e && e.vx == null && !e.lift) delete this.shape.plates[id]; }
  // a new motion; the seed's own motion is no edit
  setMotion(id, vx, vy) {
    if (!this.plate(id)) return false;
    const e = this.entry(id);
    if (Math.abs(vx - e.ox) < 1e-6 && Math.abs(vy - e.oy) < 1e-6) { delete e.vx; delete e.vy; } else { e.vx = r3(vx); e.vy = r3(vy); }
    this.tidy(id); this.rebuild('motion');
    return true;
  }
  // a way (dx, dy on the map, y down; 0, 0 — stop) at the plate's own speed (or the middle one when it stands)
  setDirection(id, dx, dy) {
    const p = this.plate(id); if (!p) return false;
    const sp = Math.hypot(p.vx, p.vy) || SHAPE.speed.steps[2][0], len = Math.hypot(dx, dy) || 1;
    return this.setMotion(id, dx || dy ? (dx / len) * sp : 0, dx || dy ? (dy / len) * sp : 0);
  }
  // a speed along the plate's way (a plate that stands sets off the way the seed sent it)
  setSpeed(id, v) {
    const p = this.plate(id); if (!p) return false;
    const e = this.entry(id), sp = Math.hypot(p.vx, p.vy);
    const ux = sp > 1e-6 ? p.vx / sp : e.ox ?? 1, uy = sp > 1e-6 ? p.vy / sp : e.oy ?? 0, ul = Math.hypot(ux, uy) || 1;
    const V = Math.max(SHAPE.speed.min, Math.min(SHAPE.speed.max, v));
    return this.setMotion(id, ux / ul * V, uy / ul * V);
  }
  // raise (+1) or lower (−1) the plate by a step, within the limits
  lift(id, dir) {
    if (!this.plate(id)) return false;
    const e = this.entry(id), L = SHAPE.lift, v = Math.round(Math.max(L.min, Math.min(L.max, (e.lift || 0) + Math.sign(dir) * L.step)) * 100) / 100;
    if (v) e.lift = v; else delete e.lift;
    this.tidy(id); this.rebuild('lift');
    return true;
  }
  // the plate as the seed gave it
  resetPlate(id) {
    const e = this.shape.plates[id]; if (!e) return false;
    const kind = e.vx != null ? 'motion' : 'lift';
    delete this.shape.plates[id]; this.rebuild(kind);
    return true;
  }

  // ── the climate: degrees at the equator and the poles, the rain's multiplier, within the limits
  setClimate({equator = this.shape.climate.equator, pole = this.shape.climate.pole, wet = this.shape.climate.wet} = {}) {
    const C = SHAPE.climate, cl = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));
    this.shape.climate = {equator: Math.round(cl(equator, C.equator)), pole: Math.round(cl(pole, C.pole)), wet: Math.round(cl(wet, C.wet) * 100) / 100};
    this.rebuild('climate');
  }

  // ── the brush: dabs along a stroke (`radius` — a brush size of data/atlas.js SHAPE.brush.radii, in cells of a
  // 192-high world), shown at once on the land; the chain is worked out again when the stroke ends
  get strokesLeft() { return SHAPE.brush.max - this.shape.strokes.length - (this.pending?.length || 0); }
  stroke(x, y, radius, raise) {
    if (!this.done || this.strokesLeft <= 0) return null;
    const a = this.atlas, r = radius * scaleOf(a), last = this.pending?.at(-1);
    if (last && Math.hypot(x - last.x, y - last.y) < r * SHAPE.brush.spacing) return null;
    const st = {x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: Math.round(r * 10) / 10, dz: raise ? SHAPE.brush.dz : -SHAPE.brush.dz};
    (this.pending ||= []).push(st);
    dab(a, a.f.elev, st);   // a look ahead: the land itself is made again from the copy when the stroke ends
    return st;
  }
  endStroke() {
    const s = this.pending; this.pending = null;
    if (!s?.length) return false;
    this.shape.strokes.push(...s);
    this.rebuild('stroke');
    return true;
  }

  // every edit off
  reset() { this.shape = emptyShape(); this.pending = null; this.rebuild('motion'); }
}
