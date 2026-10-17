// The stages of world generation, in the order they run. Each stage reads the fields the earlier
// ones made, writes its own and returns a line for the world's chronicle. Each stage draws from its
// own random stream (atlas/generate.js), so a stage can be reworked without changing the others.
//
// Done: plates → boundaries and hot spots → relief → sea level → temperature → winds → rain → erosion →
// rivers and lakes → rocks → ores (with gold sand from the rivers) → biomes → soils → forests.
// Next (docs/WORLD.md): the eras of history.
import {Registry} from '../core/registry.js';
import {plural} from '../core/util.js';
import {ATLAS_LAND} from '../data/atlas.js';
import {BOUNDARIES, ROCK_KINDS, ORE_GENESIS} from '../data/geology.js';
import {makePlates, tectonics, relief} from './tectonics.js';
import {rocks, ores} from './geology.js';
import {temperature, winds, rain} from './climate.js';
import {seaLevel, erode, rivers, placer} from './hydrology.js';
import {EROSION} from '../data/hydrology.js';
import {biomes, soils, vegetation} from './biomes.js';
import {BIOMES} from '../data/biomes.js';

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
  {id: 'sea', label: 'Уровень моря', era: 'geology', note: 'океан — вода ниже уровня моря, связанная с краем мира; котловины внутри материков станут озёрами',
    run(a) {
      seaLevel(a, ATLAS_LAND[a.cfg.land].share);
      let cnt = 0; for (let i = 0; i < a.n; i++) cnt += a.f.land[i];
      return `Воды отступили: суша заняла ${pct(cnt, a.n)} мира.`;
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
  {id: 'erosion', label: 'Эрозия', era: 'water', note: `${EROSION.epochs} эпохи: вода стекает по склонам, реки врезаются в долины, склоны оплывают, хребты понемногу растут; климат пересчитывается на новом рельефе`,
    run(a) {
      erode(a);
      return 'Шли века. Дожди точили горы, реки прорезали долины и вынесли камень к морю.';
    }},
  {id: 'rivers', label: 'Реки и озёра', era: 'water', note: 'вода заполняет котловины до порога и стекает к морю; бессточные озёра в сухом климате солёные; поймы по равнинным долинам, дельты в устьях',
    run(a) {
      const r = rivers(a), parts = [];
      if (r.lakes) parts.push(`${r.lakes} ${plural(r.lakes, 'озеро', 'озера', 'озёр')}` + (r.salt ? `, из них ${r.salt} ${plural(r.salt, 'солёное', 'солёных', 'солёных')}` : ''));
      return `Потекли реки${parts.length ? ', разлились ' + parts.join('') : ''}. По равнинам легли поймы, в устьях — дельты.`;
    }},
  {id: 'rocks', label: 'Породы', era: 'geology', note: 'магматические у вулканов и в корнях гор, метаморфические в швах и щитах, осадочные в низинах и мелких морях',
    run(a, rnd) {
      const c = rocks(a, rnd), land = Object.values(c).reduce((s, v) => s + v, 0) || 1;
      return 'Застыли породы. На суше ' + Object.entries(ROCK_KINDS).map(([k, l]) => `${l} — ${pct(c[k] || 0, land)}`).join(', ') + '.';
    }},
  {id: 'ores', label: 'Руды', era: 'geology', note: 'руды следуют породам и тектонике и собираются в рудные районы',
    run(a, rnd) {
      const r = ores(a, rnd);
      const pl = placer(a), lv = ORE_GENESIS.get('placer').levels;
      r.placer = 0; for (let i = 0; i < a.n; i++) if (a.f.land[i] && pl[i] >= lv[2]) r.placer++;
      const top = ORE_GENESIS.all().filter(o => r[o.id] > 0).sort((x, y) => r[y.id] - r[x.id]).map(o => o.label);
      return top.length ? `В недрах налились жилы. Больше всего богатых мест: ${top.slice(0, 3).join(', ')}.` : 'В недрах налились жилы, но богатых мест нет.';
    }},
  {id: 'biomes', label: 'Биомы', era: 'life', note: 'по Кёппену: тепло лета и зимы, осадки против испарения, высота и крутизна склонов, вода в земле',
    run(a) {
      const c = biomes(a), land = Object.values(c).reduce((x, v) => x + v, 0) || 1;
      const top = BIOMES.filter(b => c[b.id]).sort((x, y) => c[y.id] - c[x.id]).slice(0, 4).map(b => `${b.label} — ${pct(c[b.id], land)}`);
      return `Земля оделась жизнью: ${top.join(', ')}.`;
    }},
  {id: 'soils', label: 'Почвы', era: 'life', note: 'зональные почвы по Докучаеву, аллювий в поймах и дельтах, порода делает почву богаче или беднее',
    run(a) {
      soils(a);
      let best = 0, land = 0;
      for (let i = 0; i < a.n; i++) if (!a.f.ocean[i]) { land++; if (a.f.fert[i] >= 0.8) best++; }
      return `Под травой и лесом легли почвы; тучных земель — ${pct(best, land)} суши.`;
    }},
  {id: 'vegetation', label: 'Леса', era: 'life', note: 'клеточный автомат: деревья расселяются от соседей до предела своего биома, молнии жгут сухие леса, гари зарастают',
    run(a, rnd) {
      const wood = vegetation(a, rnd);
      return `Поднялись леса и укрыли ${Math.round(wood * 100)}% суши; в сухих краях их проредили пожары.`;
    }},
]);
