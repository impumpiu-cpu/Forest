// Checks the content in src/data: every id a definition refers to must exist, so a typo in a new
// resource, recipe, job, building, item, food or ore is caught by `npm test`, not in the middle of a game.
// Errors stop the test; warnings (something that will never appear in a game) are only printed.
import {FURNITURE} from '../src/data/furniture.js';
import {REGIONS, LEVELS} from '../src/data/regions.js';
import {RESOURCES} from '../src/data/resources.js';
import {FOODS} from '../src/data/foods.js';
import {ORES} from '../src/data/ores.js';
import {LUXURY} from '../src/data/luxury.js';
import {ITEMS} from '../src/data/items.js';
import {TABLES} from '../src/data/balance/index.js';
import {STRENGTH, CREATURES} from '../src/data/balance/creatures.js';
import {RECIPES} from '../src/data/recipes.js';
import {JOBS} from '../src/data/jobs.js';
import {BUILDINGS} from '../src/data/buildings.js';
import {SPECIES, KINDS} from '../src/data/species.js';
import {NAVMAPS} from '../src/data/navmaps.js';
import {THOUGHTS} from '../src/data/thoughts.js';
import {STOCKS} from '../src/data/presets.js';
import {RUNNERS} from '../src/agents/jobRunners.js';
import {GLYPHS, LOOKS} from '../src/render/looks.js';
import {TRADE} from '../src/data/trade.js';
import {PLANTS} from '../src/data/plants.js';
import {CROPS} from '../src/data/crops.js';
import {MIGRATIONS} from '../src/data/migrations.js';
import {STATS} from '../src/data/special.js';
import {WOUNDS} from '../src/data/wounds.js';
import {BASE_MODS} from '../src/data/traits.js';
import {SKILLS, FROM_JOB, STATION_SKILL, recipeSkill, TIERS} from '../src/data/skills.js';
import {BIOMES, RARITY, FAUNA_FLOOR} from '../src/data/biomes.js';
import {faunaFrom} from '../src/world/region.js';
import {VALUES} from '../src/data/values.js';
import {RELATIONS, KINS} from '../src/data/relations.js';
import {RAID_BANDS, memberStrength, kitFor} from '../src/data/raids.js';

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
// the creatures library (data/balance/creatures.js): a row for every species and a species for every row,
// sane bodies, and a yardstick for the strength rating that names real things
for (const id of Object.keys(CREATURES)) if (!SPECIES.has(id)) err(`data/balance/creatures.js: ${id} — нет такого вида`);
for (const [id, r] of Object.entries(CREATURES)) {
  const where = `data/balance/creatures.js: ${id}`;
  for (const k of STATS.ids()) { const v = r.special?.[k]; if (!Array.isArray(v) || !(v[0] <= v[1]) || v[0] < 0) err(`${where}: special.${k} должен быть [min, max], 0 ≤ min ≤ max`); }
  if (!(r.hp > 0) || !(r.speed > 0)) err(`${where}: hp и speed должны быть больше нуля`);
  if (r.attack && !(r.attack.power > 0 && r.attack.cooldown > 0)) err(`${where}: attack без power или cooldown`);
  if (r.ks != null && !(r.ks > 0)) err(`${where}: ks должен быть больше нуля`);
  for (const p of Object.keys(r.peoples || {})) if (!SPECIES.get(id)?.peoples?.some(x => x.id === p)) err(`${where}: peoples.${p} — у вида нет такого народа`);
}
if (!SPECIES.has(STRENGTH.ref.species)) err(`data/balance/creatures.js: STRENGTH.ref — нет вида «${STRENGTH.ref.species}»`);
STRENGTH.ref.kit.forEach(i => item('data/balance/creatures.js: STRENGTH.ref.kit', i));
if (!(STRENGTH.alpha > 0 && STRENGTH.alpha <= 1.5)) err('data/balance/creatures.js: STRENGTH.alpha вне (0, 1.5]');
// the balance tables (data/balance/): every row belongs to an item, no item sits in two tables, and the
// numbers a fight divides by or compares are sane
const seenRow = new Map();
for (const [name, t] of Object.entries(TABLES)) for (const [id, r] of Object.entries(t)) {
  const where = `data/balance/${name}.js: ${id}`;
  if (!ITEMS.has(id)) err(`${where}: нет такого предмета в data/items.js`);
  if (seenRow.has(id)) err(`${where}: строка есть и в ${seenRow.get(id)}.js`); else seenRow.set(id, name);
  if (!Number.isInteger(r.tier) || r.tier < 0) err(`${where}: tier должен быть целым от 0`);
  if (r.melee && !(r.melee.cd > 0 && r.melee.dmg > 0)) err(`${where}: melee без dmg или cd`);
  if (r.ranged && !(r.ranged.cd > 0 && r.ranged.dmg > 0 && r.ranged.range > 0)) err(`${where}: ranged без dmg, range или cd`);
  for (const k of ['armor', 'block', 'warmth']) if (r[k] != null && !(r[k] >= 0 && r[k] < 1)) err(`${where}: ${k} должен быть от 0 до 1`);
  if (!(r.dur > 0)) err(`${where}: dur должен быть больше нуля`);
}

for (const s of SPECIES.all()) { costs(`вид ${s.id}`, s.yields); if (!LOOKS[s.look?.shape]) err(`вид ${s.id}: нет рисовальщика «${s.look?.shape}»`); }
for (const [k, s] of Object.entries(STOCKS)) { costs(`запасы ${k}`, s.stock); (s.kit || []).forEach(i => item(`запасы ${k}`, i)); }

for (const c of CROPS.all()) { res(`культура ${c.id}`, c.seed); costs(`культура ${c.id}`, c.yields); }
for (const p of PLANTS.all()) { res(`растение ${p.id}`, p.resource); costs(`растение ${p.id}`, p.also); }

// trade: wares and the guards' kit must exist; every resource the colony might sell has a price
for (const x of TRADE.WARES) {
  (x.resource || []).forEach(r => res('товары торговца', r));
  if (Array.isArray(x.items)) x.items.forEach(i => item('товары торговца', i));
}
TRADE.guardKit.forEach(k => item('снаряжение охраны', k.type));
for (const r of RESOURCES.all()) if (r.sell !== false && !(r.value > 0)) warn(`ресурс ${r.id}: нет цены value, торговцу его не продать`);
for (const m of MIGRATIONS.all()) if (m.species && !SPECIES.has(m.species)) err(`миграция ${m.id}: нет вида «${m.species}»`);

// races and monsters: SPECIAL limits, peoples, values, relations, names
for (const sp of SPECIES.all()) {
  const where = `вид ${sp.id}`;
  if (!['beast', 'semi', 'sentient'].includes(sp.mind)) err(`${where}: mind должен быть beast, semi или sentient`);
  if (sp.special) for (const st of STATS.ids()) {
    const r = sp.special[st];
    if (!Array.isArray(r) || r.length !== 2 || r[0] > r[1] || r[0] < 0) err(`${where}: предел ${st} должен быть [мин, макс]`);
  }
  for (const p of sp.peoples || []) for (const st of Object.keys(p.shift || {})) if (!STATS.has(st)) err(`${where}, народ ${p.id}: нет характеристики «${st}»`);
  for (const v of Object.keys(sp.values || {})) if (!VALUES.has(v)) err(`${where}: нет ценности «${v}»`);
  if (sp.rel && !RELATIONS[sp.rel]) err(`${where}: нет строки «${sp.rel}» в data/relations.js`);
  if (sp.settle > 0 && !sp.names?.length) err(`${where}: приходит переселенцем, но без имён`);
  if (sp.look?.shape && !LOOKS[sp.look.shape]) err(`${where}: нет рисовальщика «${sp.look.shape}»`);
}
for (const k of KINS.ids()) if (!RELATIONS[k] || Object.keys(RELATIONS[k]).length !== KINS.ids().length) err(`отношения: строка «${k}» неполная`);
for (const v of VALUES.all()) for (const c of v.clash) if (!VALUES.has(c)) err(`ценность ${v.id}: нет ценности «${c}» в clash`);
{
  const rng = (() => { let x = 7; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
  for (const b of RAID_BANDS.all()) for (const t of [2, 12, 25]) for (const m of b.members({}, rng, 600, t)) {
    if (!SPECIES.has(m.species)) { err(`банда ${b.id}: нет вида «${m.species}»`); continue; }
    if (!(memberStrength(m.species, t) > 0)) err(`банда ${b.id}: у «${m.species}» нет коэффициента силы`);
    for (const it of kitFor(m.species, rng, t)) item(`банда ${b.id}`, typeof it === 'string' ? it : it.type);
  }
}

// every resource should come from somewhere
const sources = new Set(['gold',   // gold comes from trade
  ...TRADE.WARES.flatMap(x => x.resource || []),   // bought from traders
  ...PLANTS.all().flatMap(p => [p.resource, ...Object.keys(p.also || {})]), ...CROPS.all().flatMap(c => Object.keys(c.yields)),
...JOBS.all().map(j => j.resource), ...RECIPES.all().map(r => r.makes?.resource), ...ORES.all().map(o => o.resource), ...ORES.all().flatMap(o => Object.keys(o.also || {})),
  ...SPECIES.all().flatMap(s => Object.keys(s.yields || {})),
  ...RESOURCES.filter(r => r.tags.includes('key')).map(r => r.id),   // town-made tools: always with traders
  ...SPECIES.all().flatMap(s => (s.tame ? [s.tame.milk && 'milk', s.tame.wool && 'wool'].filter(Boolean) : []))]);   // from the pen

// furnaces, tools, regions
for (const r of RECIPES.all()) {
  if (r.fuel && ![1, 2, 3, undefined].includes(r.heat)) err(`рецепт ${r.id}: heat должен быть 1, 2 или 3`);
  if (r.tool && !RESOURCES.get(r.tool)?.tags.includes('key')) err(`рецепт ${r.id}: tool «${r.tool}» — не инструмент`);
}
if (!RESOURCES.filter(r => r.furnace).some(r => r.furnace.tier >= 2)) err('нет топлива для железа (furnace.tier ≥ 2)');
for (const R of REGIONS.all()) {
  for (const id of Object.keys(R.ores)) if (!ORES.has(id)) err(`регион ${R.id}: нет руды «${id}»`);
  for (const id of Object.keys(R.biomes || {})) if (!BIOMES.has(id)) err(`регион ${R.id}: нет биома «${id}»`);
  const share = Object.values(R.biomes || {}).reduce((t, v) => t + v, 0);
  if (Math.abs(share - 1) > 0.02) err(`регион ${R.id}: доли биомов в сумме ${share.toFixed(2)}, а не 1`);
  for (const id of Object.keys(R.flora)) if (!PLANTS.has(id)) err(`регион ${R.id}: нет грядки «${id}»`);
  for (const v of [...Object.values(R.ores), ...Object.values(R.flora), R.placer]) if (!LEVELS.includes(v)) err(`регион ${R.id}: уровень ${v} не из LEVELS`);
}
// beasts: where they live, whom they hunt, how they come
for (const sp of SPECIES.all()) {
  const where = `вид ${sp.id}`;
  if (!KINDS[sp.kind]) err(`${where}: kind «${sp.kind}» не из KINDS`);
  if (sp.kind === 'race' && !sp.rel) err(`${where}: разумный без rel`);
  if (sp.kind === 'race' && !sp.home) err(`${where}: разумный без home`);
  if (sp.kind !== 'race' && sp.home) err(`${where}: home только у разумных`);
  if (sp.kind === 'spirit' && !sp.resident) err(`${where}: нечисть без resident`);
  if (sp.resident && sp.kind !== 'spirit') err(`${where}: resident, а не нечисть`);
  if ((sp.kind === 'beast' || sp.kind === 'monster') && !sp.habitat && sp.brain !== 'vermin') err(`${where}: зверь без habitat`);   // vermin lives everywhere
  if (sp.kind === 'race' && sp.habitat) err(`${where}: habitat у разумного — на локальной карте он пришёл бы как зверь`);
  for (const [b, r] of Object.entries(sp.home || {})) {
    if (!BIOMES.has(b)) err(`${where}: нет биома «${b}» в home`);
    if (!(r > 0 && r <= 1)) err(`${where}: home «${b}» ${r} вне 0..1`);
  }
  for (const [b, r] of Object.entries(sp.habitat || {})) {
    if (!BIOMES.has(b)) err(`${where}: нет биома «${b}»`);
    if (!RARITY[r]) err(`${where}: редкость «${r}» не из RARITY`);
  }
  if (sp.habitat && !REGIONS.all().some(R => faunaFrom(R.biomes, sp.id) >= FAUNA_FLOOR)) warn(`${where}: не живёт ни в одном регионе`);
  if (sp.arrive && !sp.habitat) err(`${where}: arrive без habitat`);
  if (sp.arrive && !sp.resident && !(sp.arrive.group && sp.arrive.every && sp.arrive.cap)) err(`${where}: arrive без group, every или cap`);
  if (sp.resident && !(sp.respawn > 0)) err(`${where}: нечисть без respawn`);
  for (const k of [...(sp.predator?.prey || []), ...(sp.predator?.weakPrey || []), ...(sp.flee?.from || [])]) if (k !== 'people' && !SPECIES.has(k)) err(`${where}: нет вида «${k}»`);
  for (const k of sp.tameWith || []) if (!SPECIES.get(k)?.rel) warn(`${where}: tameWith — «${k}» не раса`);
  for (const r of Object.keys(sp.yields || {})) res(where, r);
  if (sp.brain === 'mule' && !sp.mule) err(`${where}: мозг mule без блока mule`);
  if (sp.brain === 'predator' && !sp.predator) err(`${where}: мозг predator без блока predator`);
  if (sp.brain === 'spirit' && !sp.spirit) err(`${where}: мозг spirit без блока spirit`);
}
for (const r of RESOURCES.filter(x => x.useWith)) if (!BUILDINGS.has(r.useWith)) err(`инструмент ${r.id}: useWith — нет постройки «${r.useWith}»`);

// herding, keys, furniture
for (const s of SPECIES.all()) if (s.tame) {
  costs(`вид ${s.id} (приманка)`, s.tame.bait);
  if (!(s.tame.space > 0) || !s.tame.names?.length) err(`вид ${s.id}: tame без space или names`);
  for (const j of Object.keys(s.tame.effects?.jobSpeed || {})) if (!JOBS.has(j)) err(`вид ${s.id}: tame.effects для неизвестной работы «${j}»`);
}
for (const d of BUILDINGS.all()) if (d.key) {
  if (!RESOURCES.has(d.key) || !RESOURCES.get(d.key).tags.includes('key')) err(`постройка ${d.id}: key «${d.key}» — не инструмент (tag 'key')`);
  if (!(d.cost[d.key] >= 1)) err(`постройка ${d.id}: key «${d.key}» должен входить в cost`);
}
for (const r of RESOURCES.filter(x => x.tags.includes('key'))) {
  if (!r.opens) warn(`инструмент ${r.id}: нет описания opens`);
  if (r.with && !SPECIES.has(r.with)) err(`инструмент ${r.id}: with — нет вида «${r.with}»`);
}
for (const f of FURNITURE.all()) {
  if (f.recipe && !BUILDINGS.get(f.recipe.at)?.station) err(`мебель ${f.id}: мастерская «${f.recipe.at}» — не станция`);
  if (!f.recipe && !f.tradeOnly) warn(`мебель ${f.id}: нет рецепта и не продаётся`);
  if (f.tradeOnly && !TRADE.WARES.some(x => (x.resource || []).includes(f.id))) warn(`мебель ${f.id}: tradeOnly, но торговцы её не возят`);
}
for (const r of RESOURCES.all()) if (!sources.has(r.id)) warn(`ресурс ${r.id}: ниоткуда не добывается`);

// skills (data/skills.js): every job and every recipe leads to an active skill on a real SPECIAL letter;
// old job ids all have a way into the catalogue; a reserved skill is reached by nothing
const activeSkill = (where, id) => { if (!SKILLS.has(id)) err(`${where}: нет навыка «${id}»`); else if (SKILLS.get(id).status !== 'active') err(`${where}: навык «${id}» зарезервирован, его ещё нельзя тренировать`); };
for (const s of SKILLS.all()) {
  if (!STATS.has(s.stat)) err(`навык ${s.id}: нет характеристики «${s.stat}»`);
  if (s.stat === 'L') err(`навык ${s.id}: у удачи нет тренируемых навыков`);
  if (!['active', 'reserved'].includes(s.status)) err(`навык ${s.id}: статус «${s.status}»`);
}
for (const j of JOBS.all()) {
  activeSkill(`работа ${j.id}`, j.skill);
  if (j.gatherSkill) activeSkill(`работа ${j.id} (сбор)`, j.gatherSkill);
  if (!FROM_JOB[j.id]) err(`работа ${j.id}: старые сохранения не знают, в какой навык перенести её опыт (FROM_JOB)`);
}
for (const [job, list] of Object.entries(FROM_JOB)) list.forEach(id => activeSkill(`перенос ${job}`, id));
for (const st of Object.keys(STATION_SKILL)) bld(`STATION_SKILL ${st}`, st);
for (const r of RECIPES.all()) { if (!recipeSkill(r)) err(`рецепт ${r.id}: не указан навык, и у станции ${r.at} его нет`); else activeSkill(`рецепт ${r.id}`, recipeSkill(r)); }
if (TIERS.some((t, k) => k && t.min <= TIERS[k - 1].min)) err('тиры должны идти по возрастанию порога');
for (const r of RECIPES.all()) if (r.tier != null && !(Number.isInteger(r.tier) && r.tier >= 1 && r.tier <= TIERS.length)) err(`рецепт ${r.id}: тир ${r.tier} вне 1–${TIERS.length}`);
// T1 is open to anyone: every skill a station trains must have a T1 recipe there, or a weak worker could never start
{
  const open = new Set(RECIPES.filter(r => (r.tier || 1) === 1).map(r => r.at + ':' + recipeSkill(r)));
  for (const r of RECIPES.all()) if (!open.has(r.at + ':' + recipeSkill(r))) err(`станция ${r.at}: для навыка ${recipeSkill(r)} нет рецепта T1, новичку не на чем учиться`);
}

// wounds and traumas (data/wounds.js): every multiplier is one the body knows; the thoughts a fall leaves exist
for (const W of WOUNDS.all()) {
  for (const k of Object.keys(W.mods || {})) if (!(k in BASE_MODS)) err(`рана ${W.id}: неизвестный множитель «${k}»`);
  if (!W.trauma && !(W.days > 0)) err(`рана ${W.id}: излечимой ране нужен срок days`);
  if (W.trauma && !(W.weight > 0)) err(`травма ${W.id}: нужен вес weight`);
}
if (!WOUNDS.has('grave')) err('раны: нет тяжёлой раны grave, которую оставляет спасённая жизнь');
if (!WOUNDS.filter(x => x.trauma).length) err('раны: нет ни одной травмы для провала второй проверки');
for (const t of ['fell', 'survived', 'trauma', 'woundHealed']) if (!THOUGHTS.has(t)) err(`нет мысли «${t}» для смертельной раны`);

// haggling (settlement/trade.js): even at the best terms buying must cost more than selling brings
if (!(TRADE.ask - TRADE.bid - 2 * TRADE.haggle > 0)) err(`торг: при поправке ±${TRADE.haggle} продажа и обратная покупка дают прибыль`);

// trophies (agents/trophies.js): real resources, chances in (0, 1], tiers 1–4, only on what has yields
for (const sp of SPECIES.all()) for (const e of sp.trophies || []) {
  res(`трофей ${sp.id}`, e.res);
  if (!(e.chance > 0 && e.chance <= 1)) err(`трофей ${sp.id}/${e.res}: шанс ${e.chance} вне (0, 1]`);
  if (!(e.n > 0)) err(`трофей ${sp.id}/${e.res}: количество ${e.n}`);
  if (e.tier != null && !(Number.isInteger(e.tier) && e.tier >= 1 && e.tier <= TIERS.length)) err(`трофей ${sp.id}/${e.res}: тир ${e.tier}`);
  if (!sp.yields) err(`трофей ${sp.id}: у вида нет обычной добычи yields, трофей некуда положить`);
}

for (const w of warnings) console.log('warn ' + w);
if (errors.length) { console.log('Ошибки в справочниках:\n  ' + errors.join('\n  ')); process.exit(1); }
console.log(`ok   справочники: ${RESOURCES.all().length} ресурсов, ${RECIPES.all().length} рецептов, ${JOBS.all().length} работ, ${BUILDINGS.all().length} построек, ${ITEMS.all().length} предметов, ${SPECIES.all().length} видов, ${BIOMES.all().length} биомов, ${RAID_BANDS.all().length} банд, ${SKILLS.all().length} навыков, ${WOUNDS.all().length} ран — ссылки сходятся`);
