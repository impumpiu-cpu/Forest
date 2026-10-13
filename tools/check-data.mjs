// Checks the content in src/data: every id a definition refers to must exist, so a typo in a new
// resource, recipe, job, building, item, food or ore is caught by `npm test`, not in the middle of a game.
// Errors stop the test; warnings (something that will never appear in a game) are only printed.
import {RESOURCES} from '../src/data/resources.js';
import {FOODS} from '../src/data/foods.js';
import {ORES} from '../src/data/ores.js';
import {LUXURY} from '../src/data/luxury.js';
import {ITEMS} from '../src/data/items.js';
import {RECIPES} from '../src/data/recipes.js';
import {JOBS} from '../src/data/jobs.js';
import {BUILDINGS} from '../src/data/buildings.js';
import {SPECIES} from '../src/data/species.js';
import {NAVMAPS} from '../src/data/navmaps.js';
import {THOUGHTS} from '../src/data/thoughts.js';
import {STOCKS} from '../src/data/presets.js';
import {RUNNERS} from '../src/agents/jobRunners.js';
import {GLYPHS, LOOKS} from '../src/render/looks.js';
import {TRADE} from '../src/data/trade.js';
import {MIGRATIONS} from '../src/data/migrations.js';

const errors = [], warnings = [];
const err = m => errors.push(m), warn = m => warnings.push(m);
const res = (where, id) => { if (!RESOURCES.has(id)) err(`${where}: нет ресурса «${id}»`); };
const bld = (where, id) => { if (!BUILDINGS.has(id)) err(`${where}: нет постройки «${id}»`); };
const item = (where, id) => { if (!ITEMS.has(id)) err(`${where}: нет предмета «${id}»`); };
const costs = (where, c = {}) => Object.keys(c).forEach(r => res(where, r));

for (const r of RESOURCES.all()) {
  if (!r.label || !r.color || !Array.isArray(r.tags)) err(`ресурс ${r.id}: нужны label, color и tags`);
  if (r.tags.includes('food') && !(r.nutrition > 0)) err(`ресурс ${r.id}: еда без nutrition`);
  if (r.map && !r.mapColor) err(`ресурс ${r.id}: есть map, но нет mapColor`);
}
for (const f of FOODS.all()) { if (!RESOURCES.has(f.id)) err(`еда ${f.id}: не попала в ресурсы`); if (f.eat && !THOUGHTS.has(f.eat)) err(`еда ${f.id}: нет мысли «${f.eat}»`); }
for (const o of ORES.all()) { res(`руда ${o.id}`, o.resource); if (!(RESOURCES.get(o.resource)?.target > 0)) warn(`руда ${o.id}: у ресурса нет target, её не станут копать`); }
for (const l of LUXURY.all()) costs(`украшение ${l.id}`, l.setting);

for (const r of RECIPES.all()) {
  const where = `рецепт ${r.id}`;
  bld(where, r.at);
  if (BUILDINGS.has(r.at) && !BUILDINGS.get(r.at).station) err(`${where}: «${r.at}» не мастерская (station: true)`);
  costs(where, r.cost);
  (r.needs || []).forEach(b => bld(where, b));
  if (r.makes?.item) item(where, r.makes.item); else if (r.makes?.resource) res(where, r.makes.resource); else err(`${where}: makes без item/resource`);
  if (typeof r.want !== 'function') err(`${where}: нет want(ctx)`);
}

for (const j of JOBS.all()) {
  const where = `работа ${j.id}`;
  if (!RUNNERS[j.runner]) err(`${where}: нет исполнителя «${j.runner}»`);
  if (j.nav && !NAVMAPS.has(j.nav)) err(`${where}: нет поля течения «${j.nav}»`);
  if (j.resource) res(where, j.resource);
  if (j.food && !FOODS.has(j.food)) err(`${where}: нет еды «${j.food}»`);
  [].concat(j.requires || []).forEach(b => bld(where, b));
  for (const s of j.stations || []) { bld(where, s); if (BUILDINGS.has(s) && !BUILDINGS.get(s).station) err(`${where}: «${s}» не мастерская`); }
  if (j.runner === 'harvest' && (typeof j.valid !== 'function' || typeof j.take !== 'function')) err(`${where}: harvest без valid/take`);
  if (j.preferable && !(j.label && j.short && j.verb)) err(`${where}: нужны label, short и verb`);
}

for (const b of BUILDINGS.all()) {
  const where = `постройка ${b.id}`;
  costs(where, b.cost);
  [].concat(b.needs || []).forEach(n => bld(where, n));
  if (b.station) {
    if (!RECIPES.all().some(r => r.at === b.id)) warn(`${where}: мастерская без рецептов`);
    if (!JOBS.all().some(j => (j.stations || []).includes(b.id))) err(`${where}: мастерская, но ни одна работа не ходит туда (stations)`);
  }
  if (typeof b.motive !== 'function') warn(`${where}: нет motive, совет за неё не проголосует`);
}

for (const d of ITEMS.all()) {
  if (d.slot === 'hand' && d.glyph && !GLYPHS[d.glyph]) err(`предмет ${d.id}: нет значка «${d.glyph}» в render/looks.js`);
  if (d.slot === 'body' && !d.color) warn(`предмет ${d.id}: броня без color, обводка не покажет её`);
  if (d.ranged?.ammo) res(`предмет ${d.id}`, d.ranged.ammo);
  for (const job of Object.keys(d.tool || {})) if (!JOBS.has(job)) err(`предмет ${d.id}: tool для неизвестной работы «${job}»`);
  if (!d.tradeOnly && !RECIPES.all().some(r => r.makes?.item === d.id) && !Object.values(STOCKS).some(s => s.kit?.includes(d.id))) warn(`предмет ${d.id}: его нельзя сделать и нет в стартовых наборах`);
  if (d.tradeOnly && RECIPES.all().some(r => r.makes?.item === d.id)) err(`предмет ${d.id}: tradeOnly, но есть рецепт`);
  if (!(d.value > 0)) warn(`предмет ${d.id}: нет цены value, торговец отдаст его даром`);
}

for (const s of SPECIES.all()) { costs(`вид ${s.id}`, s.yields); if (!LOOKS[s.look?.shape]) err(`вид ${s.id}: нет рисовальщика «${s.look?.shape}»`); }
for (const [k, s] of Object.entries(STOCKS)) { costs(`запасы ${k}`, s.stock); (s.kit || []).forEach(i => item(`запасы ${k}`, i)); }

// trade: wares and the guards' kit must exist; every resource the colony might sell has a price
for (const x of TRADE.WARES) {
  (x.resource || []).forEach(r => res('товары торговца', r));
  if (Array.isArray(x.items)) x.items.forEach(i => item('товары торговца', i));
}
TRADE.guardKit.forEach(k => item('снаряжение охраны', k.type));
for (const r of RESOURCES.all()) if (r.sell !== false && !(r.value > 0)) warn(`ресурс ${r.id}: нет цены value, торговцу его не продать`);
for (const m of MIGRATIONS.all()) if (m.species && !SPECIES.has(m.species)) err(`миграция ${m.id}: нет вида «${m.species}»`);

// every resource should come from somewhere
const sources = new Set(['gold',   // gold comes from trade
...JOBS.all().map(j => j.resource), ...RECIPES.all().map(r => r.makes?.resource), ...ORES.all().map(o => o.resource),
  ...SPECIES.all().flatMap(s => Object.keys(s.yields || {}))]);
for (const r of RESOURCES.all()) if (!sources.has(r.id)) warn(`ресурс ${r.id}: ниоткуда не добывается`);

for (const w of warnings) console.log('warn ' + w);
if (errors.length) { console.log('Ошибки в справочниках:\n  ' + errors.join('\n  ')); process.exit(1); }
console.log(`ok   справочники: ${RESOURCES.all().length} ресурсов, ${RECIPES.all().length} рецептов, ${JOBS.all().length} работ, ${BUILDINGS.all().length} построек, ${ITEMS.all().length} предметов — ссылки сходятся`);
