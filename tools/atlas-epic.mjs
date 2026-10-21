// The epic world of the campaign (cfg.epic, docs/CAMPAIGN.md «Доработка, этап 6»): three eras of 75–150 years.
// Generates it whole and prints how long each era took, what the world is like at the end of each (living towns
// and lairs, realms, wars, burnt towns), how long its chronicle is and how big the save. Not part of `npm test`:
// a medium world takes about a minute. Usage: node tools/atlas-epic.mjs [size=medium] [seed=7] [years]
// (`years` — every era that long, e.g. 150 for the longest history)
import {gzipSync} from 'node:zlib';
import {newAtlas, runNextStage, atlasDone} from '../src/atlas/generate.js';
import {eraPlan} from '../src/atlas/history.js';
import {saveAtlas} from '../src/atlas/save.js';
import {ERAS} from '../src/data/history.js';

const size = process.argv[2] || 'medium', seed = process.argv[3] || '7', years = +process.argv[4] || 0;
const cfg = {seed, size, land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1, epic: true, ...(years ? {epicYears: {wild: years, elder: years, young: years}} : {})};
const a = newAtlas(cfg);
const t0 = Date.now();
let era = null, eraT = t0, landMs = 0;
const wars = () => Object.values(a.rel || {}).filter(r => r.war).length;
const tell = id => console.log(`${(ERAS.get(id)?.label || id).padEnd(24)} ${((Date.now() - eraT) / 1000).toFixed(1).padStart(6)} с · городов ${(a.towns || []).filter(t => t.alive).length}, логов ${(a.lairs || []).filter(l => l.alive).length}, держав ${(a.realms || []).length}, войн сейчас ${wars()}, пепелищ ${(a.ruins || []).length}`);
while (!atlasDone(a)) {
  runNextStage(a);
  if (!a.hist) continue;
  if (!era) { landMs = Date.now() - t0; console.log(`${'Земля'.padEnd(24)} ${(landMs / 1000).toFixed(1).padStart(6)} с`); era = a.hist.era; eraT = Date.now(); }
  if (a.hist.era !== era) { tell(era); era = a.hist.era; eraT = Date.now(); }
}
tell(era);
const save = JSON.stringify(saveAtlas(a, 'epic'));
console.log(`Всего ${((Date.now() - t0) / 1000).toFixed(1)} с: мир ${size}, сид ${seed}, эпохи ${eraPlan(a).map(e => e.seasons / 4).join(' + ')} лет; летопись ${a.chronicle.length} строк; сохранение ${(save.length / 1e6).toFixed(1)} МБ, в gzip ${(gzipSync(save).length / 1e6).toFixed(2)} МБ`);
