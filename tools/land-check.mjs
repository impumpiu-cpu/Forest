// «Создать землю» (atlas/shape.js; docs/WORLD.md): the hand's edits of the base — a plate's motion, a raised
// plate, the brush, the climate — change what they should, the chain worked out again from a stage's copy is the
// same land as one made whole with the same edits, and a land is saved as a land.
import {newAtlas, runNextStage, landDone, atlasHash} from '../src/atlas/generate.js';
import {ATLAS_STAGES} from '../src/atlas/stages.js';
import {DEFAULT_ATLAS_CFG} from '../src/data/atlas.js';
import {emptyShape, snapshot, resume, FROM, shapeCount} from '../src/atlas/shape.js';
import {saveAtlas, loadAtlas, LAND_KIND, isLandSave} from '../src/atlas/save.js';
import {encode} from '../src/core/serialize.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };

const cfg = {...DEFAULT_ATLAS_CFG, seed: '8', size: 'small'};
const SNAP = new Set(Object.values(FROM));
// the land made stage by stage; the copies before the stages the edits enter at
function make(shape, snaps = null) {
  const a = newAtlas({...cfg, ...(shape ? {shape} : {})});
  return finish(a, snaps);
}
function finish(a, snaps) {
  while (!landDone(a)) { const id = ATLAS_STAGES.all()[a.stage].id; if (snaps && SNAP.has(id)) snaps[id] = snapshot(a); runNextStage(a); }
  return a;
}
const mean = (a, f, pick = () => true) => { let s = 0, c = 0; for (let i = 0; i < a.n; i++) if (pick(i)) { s += a.f[f][i]; c++; } return s / (c || 1); };
const landShare = a => mean(a, 'land');

const snaps = {}, base = make(null, snaps), h0 = atlasHash(base);
check('без правок — та же земля, что и прежде (правка не задела обычный путь)', atlasHash(make(emptyShape())) === h0 && !base.f.elev0);

// a raised plate: the biggest oceanic plate, lifted — more land on it, the sea where the untouched relief has it
const ocean = base.plates.filter(p => !p.cont).sort((p, q) => q.area - p.area)[0];
const onPlate = a => i => a.f.plate[i] === ocean.id;
const lift = emptyShape(); lift.plates[ocean.id] = {lift: 0.3};
const L = make(lift);
check('поднятая плита выходит сушей, уровень моря не идёт за ней', mean(L, 'land', onPlate(L)) > mean(base, 'land', onPlate(base)) + 0.15 && Math.abs(L.sea - base.sea) < 1e-6,
  `суша на плите ${Math.round(mean(base, 'land', onPlate(base)) * 100)}% → ${Math.round(mean(L, 'land', onPlate(L)) * 100)}%, всей суши ${Math.round(landShare(base) * 100)}% → ${Math.round(landShare(L) * 100)}%`);

// a plate's new motion: the seams change
const cont = base.plates.filter(p => p.cont).sort((p, q) => q.area - p.area)[0];
const mot = emptyShape(); mot.plates[cont.id] = {vx: -cont.vx * 1.1, vy: -cont.vy * 1.1};
const M = make(mot);
let diff = 0; for (let i = 0; i < M.n; i++) if (M.f.bnd[i] !== base.f.bnd[i]) diff++;
check('плита пошла иначе — иначе легли швы и хребты', diff > 50 && atlasHash(M) !== h0, `клеток шва изменилось ${diff}`);

// the brush: a raised spot in the open sea comes out as an island
const sx = Math.round(ocean.cx), sy = Math.round(ocean.cy), at = sy * base.w + sx;
const br = emptyShape(); for (let k = 0; k < 12; k++) br.strokes.push({x: sx, y: sy, r: 5, dz: 0.06});
const B = make(br);
check('кисть: поднятое место в море стало островом', !base.f.land[at] && B.f.land[at] === 1, `высота ${base.f.elev[at].toFixed(2)} → ${B.f.elev[at].toFixed(2)}`);

// the climate: warmer at the equator, colder at the poles; wetter
const cl = emptyShape(); cl.climate = {equator: 6, pole: -10, wet: 1.5};
const C = make(cl), row = (a, y) => mean(a, 'temp', i => ((i / a.w) | 0) === y);
const dEq = row(C, C.h - 2) - row(base, base.h - 2), dPole = row(C, 1) - row(base, 1);
const rainK = mean(C, 'rain', i => C.f.land[i]) / mean(base, 'rain', i => base.f.land[i]);
check('климат: экватор теплее, полюс холоднее, дождей больше', dEq > 4 && dPole < -7 && rainK > 1.25, `экватор ${dEq.toFixed(1)}°, полюс ${dPole.toFixed(1)}°, осадки ×${rainK.toFixed(2)}`);
const forest = a => mean(a, 'trees', i => a.f.land[i]);
check('цепочка пересчитана: биомы и леса другие', atlasHash(C) !== h0 && Math.abs(forest(C) - forest(base)) > 0.005, `лес ${Math.round(forest(base) * 100)}% → ${Math.round(forest(C) * 100)}%`);

// the chain worked out again from a copy is the same land as one made whole
const all = emptyShape(); all.plates[ocean.id] = {lift: 0.3}; all.plates[cont.id] = {vx: -cont.vx, vy: -cont.vy}; all.strokes = br.strokes; all.climate = cl.climate;
// (a copy before a stage holds while the edits that enter earlier stay as they were: here the copies are of the land
// without edits, so from a stage on only the edits entering there or later are made)
const order = id => ATLAS_STAGES.all().findIndex(s => s.id === id);
const only = from => { const s = emptyShape(), k = order(from);
  if (order(FROM.motion) >= k) s.plates[cont.id] = {...all.plates[cont.id]};
  if (order(FROM.lift) >= k) { s.plates[ocean.id] = {...all.plates[ocean.id]}; s.strokes = all.strokes; }
  s.climate = all.climate; return s; };
const same = [...new Set(Object.values(FROM))].map(from => [from, atlasHash(finish(resume(snaps[from], only(from)), null)) === atlasHash(make(only(from)))]);
check('пересчёт с этапа = земля, сделанная целиком с теми же правками', same.every(([, ok]) => ok), same.map(([k, ok]) => `с «${k}» ${ok ? 'да' : 'нет'}`).join(', '));
const again = only('relief');
check('снимок не меняется от пересчёта (его можно брать снова)', atlasHash(finish(resume(snaps.relief, again), null)) === atlasHash(finish(resume(snaps.relief, again), null)) && atlasHash(finish(resume(snaps.relief, again), null)) === atlasHash(make(again)));

// saved as a land: its own kind, the edits with it, the same land on opening
const A = make(all), save = saveAtlas(A, 'Проба', LAND_KIND), back = loadAtlas(JSON.parse(JSON.stringify(save)));
check('земля сохраняется своим видом, с правками, и открывается той же', isLandSave(save) && save.meta.type === 'land' && save.meta.shape === shapeCount(all) && atlasHash(back) === atlasHash(A) && back.cfg.shape.strokes.length === 12,
  `правок ${save.meta.shape}, ${(JSON.stringify(save).length / 1e6).toFixed(1)} МБ`);
let threw = false; try { const H = make(null); runNextStage(H); saveAtlas(H, 'x', LAND_KIND); } catch (e) { threw = true; }
check('мир с историей землёй не сохранить', threw);
check('снимок и правки кодируются (ничего живого в мире земли)', !!encode(snapshot(A)));

if (fail.length) { console.log(`\n${fail.length} проверок не прошло`); process.exit(1); }
console.log('\nВсе проверки земли прошли.');
