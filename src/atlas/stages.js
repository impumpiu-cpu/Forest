// The stages of world generation, in the order they run. Each stage reads the fields the earlier
// ones made, writes its own and returns a line for the world's chronicle. Each stage draws from its
// own random stream (atlas/generate.js), so a stage can be reworked without changing the others.
//
// Done: plates → boundaries and hot spots → relief → sea level → rocks → ores → temperature → winds → rain.
// Next (docs/WORLD.md): erosion with rivers and lakes, soils, biomes, forests, then
// the eras of history.
import {Registry} from '../core/registry.js';
import {plural} from '../core/util.js';
import {ATLAS_LAND} from '../data/atlas.js';
import {BOUNDARIES, ROCK_KINDS, ORE_GENESIS} from '../data/geology.js';
import {makePlates, tectonics, relief} from './tectonics.js';
import {rocks, ores} from './geology.js';
import {temperature, winds, rain} from './climate.js';

export const ATLAS_STAGES = new Registry('atlasStage');

const pct = (v, n) => `${Math.round(v / n * 100)}%`;

ATLAS_STAGES.registerAll([
  {id: 'plates', label: 'Плиты', era: 'geology', note: 'кора раскалывается на плиты; материковые ближе к середине мира',
    run(a, rnd) {
      const p = makePlates(a, rnd), c = p.filter(x => x.cont).length;
      return `Твердь раскололась на ${p.length} ${plural(p.length, 'плиту', 'плиты', 'плит')}: ${c} ${plural(c, 'материковую', 'материковые', 'материковых')} и ${p.length - c} ${plural(p.length - c, 'океаническую', 'океанические', 'океанических')}.`;
    }},
  {id: 'tectonics', label: 'Границы плит', era: 'geology', note: 'столкновения, дуги, желоба, рифты, срединные хребты, сдвиги и горячие точки',
    run(a, rnd) {
      // the longest seams first, at most four of them
      const t = tectonics(a, rnd), parts = BOUNDARIES.filter(b => t[b.id]).sort((x, y) => t[y.id] - t[x.id]).slice(0, 4).map(b => b.chron);
      const hs = a.hotspots.length;
      return `Плиты пришли в движение: ${parts.join('; ')}. Из недр ${plural(hs, 'пробилась', 'пробились', 'пробились')} ${hs} ${plural(hs, 'горячая точка', 'горячие точки', 'горячих точек')}, за ${plural(hs, 'ней', 'ними', 'ними')} тянутся цепи потухших вулканов.`;
    }},
  {id: 'relief', label: 'Рельеф', era: 'geology', note: 'дно плиты + поднятие от границ + пологие волны и мелкие неровности',
    run(a, rnd) { relief(a, rnd); return 'Поднялись хребты, легли равнины, разверзлись желоба.'; }},
  {id: 'sea', label: 'Уровень моря', era: 'geology', note: 'море ровно настолько, чтобы суши осталась выбранная доля',
    run(a) {
      const share = ATLAS_LAND[a.cfg.land].share;
      const sorted = Float32Array.from(a.f.elev).sort();
      a.sea = sorted[Math.min(a.n - 1, Math.floor(a.n * (1 - share)))];
      const land = new Uint8Array(a.n); let cnt = 0;
      for (let i = 0; i < a.n; i++) if (a.f.elev[i] > a.sea) { land[i] = 1; cnt++; }
      a.f.land = land;
      return `Воды отступили: суша заняла ${pct(cnt, a.n)} мира.`;
    }},
  {id: 'rocks', label: 'Породы', era: 'geology', note: 'магматические у вулканов и в корнях гор, метаморфические в швах и щитах, осадочные в низинах и мелких морях',
    run(a, rnd) {
      const c = rocks(a, rnd), land = Object.values(c).reduce((s, v) => s + v, 0) || 1;
      return 'Застыли породы. На суше ' + Object.entries(ROCK_KINDS).map(([k, l]) => `${l} — ${pct(c[k] || 0, land)}`).join(', ') + '.';
    }},
  {id: 'ores', label: 'Руды', era: 'geology', note: 'руды следуют породам и тектонике и собираются в рудные районы',
    run(a, rnd) {
      const r = ores(a, rnd), top = ORE_GENESIS.all().filter(o => r[o.id] > 0).sort((x, y) => r[y.id] - r[x.id]).map(o => o.label);
      return top.length ? `В недрах налились жилы. Больше всего богатых мест: ${top.slice(0, 3).join(', ')}.` : 'В недрах налились жилы, но богатых мест нет.';
    }},
  {id: 'temperature', label: 'Температура', era: 'climate', note: 'по широте и высоте (−6,5° на км); у моря мягче, в глубине материка размах года больше',
    run(a) {
      temperature(a);
      return a.cfg.hemisphere === 'equator' ? 'Легли пояса зноя посередине и холода по краям.' : 'Легли пояса: холод на севере, зной на юге.';
    }},
  {id: 'winds', label: 'Ветры', era: 'climate', note: 'пояса пассатов, западных и полярных ветров, изогнутые вихрями и ослабленные горами',
    run(a, rnd) {
      winds(a, rnd);
      return a.cfg.hemisphere === 'equator'
        ? 'Задули ветры: пассаты сходятся к экватору, западные дуют в умеренных широтах обоих полушарий.'
        : 'Задули ветры: на юге пассаты, в середине мира западные, у полюса восточные.';
    }},
  {id: 'rain', label: 'Осадки', era: 'climate', note: 'влага с моря идёт по ветру и выпадает там, где воздух поднимается: в поясах подъёма и на наветренных склонах; за горами — дождевая тень',
    run(a) {
      rain(a);
      let wet = 0, dry = 0, land = 0;
      for (let i = 0; i < a.n; i++) if (a.f.land[i]) { land++; if (a.f.rain[i] < 250) dry++; else if (a.f.rain[i] > 1300) wet++; }
      const parts = [];
      if (dry / land > 0.03) parts.push(`пустыни и сухие степи легли на ${pct(dry, land)} суши`);
      if (wet / land > 0.03) parts.push(`ливни поливают ${pct(wet, land)}`);
      return 'Пошли дожди' + (parts.length ? ': ' + parts.join(', ') : '') + '. За хребтами легла дождевая тень.';
    }},
]);
