// The stages of world generation, in the order they run. Each stage reads the fields the earlier
// ones made, writes its own and returns a line for the world's chronicle. Each stage draws from its
// own random stream (atlas/generate.js), so a stage can be reworked without changing the others.
//
// For now the stages are placeholders that give the polygon a map to look at: noise relief, a sea
// level and temperature. The plan (docs/WORLD.md) replaces relief with plates, adds rocks, winds and
// rain, erosion with rivers and lakes, soils, biomes and forests, and then the eras of history.
import {Registry} from '../core/registry.js';
import {fbm} from './noise.js';
import {ATLAS_LAND} from '../data/atlas.js';

export const ATLAS_STAGES = new Registry('atlasStage');

const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

ATLAS_STAGES.registerAll([
  {id: 'relief', label: 'Рельеф', era: 'geology', note: 'заглушка до тектоники плит: шум, прижатый к океану по краям',
    run(a, rnd) {
      const {w, h} = a, base = Math.max(w, h) / 4;
      const n = fbm(rnd, w, h, base, 7, 0.5), elev = new Float32Array(a.n);
      const edge = Math.min(w, h) * 0.14;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, d = Math.min(x, y, w - 1 - x, h - 1 - y);
        elev[i] = n[i] * (0.25 + 0.75 * smooth(d / edge));
      }
      a.f.elev = elev;
      return 'Из пучины поднялась твердь.';
    }},
  {id: 'sea', label: 'Уровень моря', era: 'geology', note: 'море ровно настолько, чтобы суши осталась выбранная доля',
    run(a) {
      const share = ATLAS_LAND[a.cfg.land].share;
      const sorted = Float32Array.from(a.f.elev).sort();
      a.sea = sorted[Math.min(a.n - 1, Math.floor(a.n * (1 - share)))];
      const land = new Uint8Array(a.n); let cnt = 0;
      for (let i = 0; i < a.n; i++) if (a.f.elev[i] > a.sea) { land[i] = 1; cnt++; }
      a.f.land = land;
      return `Воды отступили: суша заняла ${Math.round(cnt / a.n * 100)}% мира.`;
    }},
  {id: 'temperature', label: 'Температура', era: 'geology', note: 'север холодный, юг жаркий; в горах холоднее на 6,5° на километр',
    run(a) {
      // one hemisphere: from polar cold at the top edge to the tropics at the bottom (provisional)
      const {w, h} = a, temp = new Float32Array(a.n), top = a.cfg.peakKm ?? 4;
      for (let y = 0; y < h; y++) {
        const lat = y / (h - 1), sea = -18 + 46 * lat;
        for (let x = 0; x < w; x++) {
          const i = y * w + x, e = a.f.elev[i];
          const km = e > a.sea ? (e - a.sea) / (1 - a.sea) * top : 0;
          temp[i] = sea - 6.5 * km;
        }
      }
      a.f.temp = temp;
      return 'Пролегли пояса холода и зноя.';
    }},
]);
