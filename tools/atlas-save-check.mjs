// Saved worlds: a world saved and loaded is the same world (fingerprint, chronicle), and a world
// saved in the middle of history goes on season for season exactly as the unbroken one.
// Usage: node tools/atlas-save-check.mjs [seeds=1] [size=small]
import {gzipSync} from 'node:zlib';
import {newAtlas, runNextStage, landDone, atlasHash} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {historyLength} from '../src/atlas/history.js';
import {DEFAULT_ATLAS_CFG} from '../src/data/atlas.js';

const seeds = +(process.argv[2] || 1), size = process.argv[3] || 'small';
let ok = true;
const check = (what, pass, info = '') => { ok &&= pass; console.log(`${pass ? 'ok  ' : 'FAIL'} ${what}${info ? ': ' + info : ''}`); return pass; };
// through JSON, as the browser and the file keep it
const roundTrip = a => loadAtlas(JSON.parse(JSON.stringify(saveAtlas(a, 'проверка'))));
const sameChron = (a, b) => a.chronicle.length === b.chronicle.length && a.chronicle.every((c, k) => c.text === b.chronicle[k].text && c.year === b.chronicle[k].year);

for (let s = 0; s < seeds; s++) {
  // the shortest eras: the check is about saving, not about history
  const cfg = {...DEFAULT_ATLAS_CFG, seed: String(4100 + s), size, wild: 0, elder: 0, young: 0};
  const a = newAtlas(cfg);
  while (!landDone(a)) runNextStage(a);
  const land = roundTrip(a);
  check(`сид ${cfg.seed}: суша сохранена и загружена`, atlasHash(land) === atlasHash(a));

  // into history, then save and run the saved one alongside the unbroken one
  const half = Math.floor(historyLength(a) / 2);
  for (let k = 0; k <= half; k++) { runNextStage(a); runNextStage(land); }
  check(`сид ${cfg.seed}: мир, загруженный до истории, прожил ${a.hist.year} лет так же`, atlasHash(land) === atlasHash(a));
  const mid = roundTrip(a);
  check(`сид ${cfg.seed}: середина истории (год ${a.hist.year}) сохранена и загружена`, atlasHash(mid) === atlasHash(a) && sameChron(mid, a));
  while (runNextStage(a)) runNextStage(mid);
  while (runNextStage(mid));
  check(`сид ${cfg.seed}: загруженный мир дожил историю так же`, atlasHash(mid) === atlasHash(a) && sameChron(mid, a), `${a.chronicle.length} строк летописи, ${a.hist.year} лет`);

  const done = roundTrip(a), text = JSON.stringify(saveAtlas(a, 'проверка'));
  check(`сид ${cfg.seed}: готовый мир сохранён и загружен`, atlasHash(done) === atlasHash(a) && sameChron(done, a),
    `${(text.length / 1e6).toFixed(2)} МБ JSON, ${(gzipSync(text).length / 1e6).toFixed(2)} МБ в gzip`);
}
if (!ok) process.exit(1);
