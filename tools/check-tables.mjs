// Checks every table of «Настройки → Таблицы» against its schema (src/data/schema/): numbers within their
// bounds, ids that exist, words a column knows, unique keys. Part of `npm test`.
import {TABLES, GROUPS, checkAll} from '../src/data/schema/index.js';

const errs = checkAll();
// a table whose group is not on the screen's list is not shown at all (docs/NRI.md, этап 0)
for (const t of TABLES) if (!GROUPS.includes(t.group)) errs.push(`${t.label}: группы «${t.group}» нет в GROUPS — таблица не видна на экране`);
for (const id of new Set(TABLES.map(t => t.id))) if (TABLES.filter(t => t.id === id).length > 1) errs.push(`таблица «${id}» объявлена дважды`);
if (errs.length) { console.log(`Таблицы не сходятся со схемами (${errs.length}):\n  ` + errs.join('\n  ')); process.exit(1); }
const rows = TABLES.reduce((n, t) => n + t.rows().length, 0), cols = TABLES.reduce((n, t) => n + t.columns.length, 0);
console.log(`ok   таблицы: ${TABLES.length} таблиц, ${rows} строк, ${cols} столбцов — значения в пределах, ссылки сходятся`);

// ── edits (src/data/schema/edits.js): a value goes into the definition the game reads, is checked against its
// column, comes back on reset; a new world carries the edits it was made under and they change its hash
const E = await import('../src/data/schema/edits.js');
const {SPECIES} = await import('../src/data/species.js');
const {ITEMS} = await import('../src/data/items.js');
const {RELATIONS} = await import('../src/data/relations.js');
const {newAtlas, atlasHash} = await import('../src/atlas/generate.js');
const fail = [];
const expect = (ok, what) => { if (!ok) fail.push(what); };
const spear = () => ITEMS.get('ironspear').melee.dmg, spear0 = spear(), order0 = SPECIES.get('elf').align.order;
const plain = newAtlas({seed: 't', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
expect(!plain.tables, 'мир без правок несёт отметку о правках');
expect(E.setCell('races', 'elf', 'align.order', order0 + 1).ok && SPECIES.get('elf').align.order === order0 + 1, 'правка расы не дошла до вида');
expect(E.setCell('materials', 'iron', 'dmg', 2).ok && spear() > spear0, 'правка материала не пересобрала предметы');
expect(E.setCell('relations', 'elf', 'dwarf', 3).ok && RELATIONS.elf.dwarf === 3, 'правка отношений не дошла до матрицы');
expect(!!E.setCell('races', 'elf', 'align.order', 99).error, 'значение вне пределов принято');
expect(!!E.setCell('races', 'elf', 'home', {nowhere: 1}).error, 'ссылка в никуда принята');
expect(!!E.setCell('items', 'sword', 'value', 5).error, 'правка вычисляемой таблицы принята');
expect(!!E.setCell('lairRules', 'tribeHome', 'value', 0.3).error, 'правка постоянного числа принята');
expect(E.editCount() === 3, `правок ${E.editCount()}, а должно быть 3`);
const edited = newAtlas({seed: 't', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
expect(edited.tables?.n === 3 && atlasHash(edited) !== atlasHash(plain), 'мир с правками не несёт их или хеш не изменился');
expect(E.stampWarning(edited.tables) === '' && E.stampWarning(null) !== '', 'предупреждение о правках не сходится');
const layer = structuredClone(E.LAYER);
E.resetAll();
expect(E.editCount() === 0 && SPECIES.get('elf').align.order === order0 && spear() === spear0 && RELATIONS.elf.dwarf !== 3, 'сброс не вернул числа кода');
expect(E.applyEdits(layer).length === 0 && E.editCount() === 3 && spear() > spear0, 'слой правок не применился заново');
E.resetAll();
expect(E.setCell('races', 'elf', 'align.order', order0).ok && E.editCount() === 0, 'правка, равная числу кода, считается правкой');
if (fail.length) { console.log('Правка таблиц:\n  ' + fail.join('\n  ')); process.exit(1); }
console.log('ok   правка таблиц: значения доходят до игры, проверяются, сбрасываются; мир помнит свои правки');

// ── names (data/names.js): every race has male and female names, every tame beast its names; the constructor builds them
{
  const {PERSON, PET, makeName} = await import('../src/data/names.js');
  const {SPECIES} = await import('../src/data/species.js');
  const {mulberry} = await import('../src/core/rng.js');
  const bad = [];
  for (const sp of SPECIES.all()) {
    if (sp.kind === 'race' && !(PERSON[sp.id]?.m?.length && PERSON[sp.id]?.f?.length)) bad.push(`${sp.id}: нет мужских или женских имён`);
    if (sp.tame && !PET[sp.id]?.length) bad.push(`${sp.id}: приручается, но без кличек`);
  }
  const r = mulberry(5), leader = makeName('orc', r, {nick: 'always'}), beast = makeName('wolf', r, {nick: 'always'}), plain = makeName('elf', r, {gender: 'f'});
  if (!/ /.test(leader) || !beast || /\s{2}/.test(beast) || !PERSON.elf.f.includes(plain)) bad.push(`конструктор: «${leader}», «${beast}», «${plain}»`);
  if (bad.length) { console.log('Имена:\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log(`ok   имена: ${Object.keys(PERSON).length} видов с именами, ${Object.keys(PET).length} приручаемых; конструктор: «${leader}», «${beast}», «${plain}»`);
}

// ── curves (data/curves.js, docs/NRI.md этап 1): every curve gives a finite number at every letter the sheet shows,
// a multiplier is 1 at the human norm, an edit of a row reaches what the game reads and goes back on reset
{
  const {CURVES, curveAt, curve} = await import('../src/data/curves.js');
  const {EFFECTS, NORM} = await import('../src/data/special.js');
  const {bleedTicks} = await import('../src/data/wounds.js');
  const {letterFactor} = await import('../src/agents/skills.js');
  const E = await import('../src/data/schema/edits.js');
  const bad = [];
  for (const c of CURVES.all()) {
    for (let x = 0; x <= 100; x++) if (!Number.isFinite(curveAt(c, x))) { bad.push(`${c.id}: при ${x} — ${curveAt(c, x)}`); break; }
    if (c.unit === '×' && Math.abs(curveAt(c, NORM) - 1) > 1e-9) bad.push(`${c.id}: множитель при норме ${NORM} — ${curveAt(c, NORM)}, а не 1`);
    if (c.min != null && c.max != null && c.min > c.max) bad.push(`${c.id}: min больше max`);
  }
  for (const id of Object.keys(EFFECTS)) if (CURVES.get(id).group !== 'special') bad.push(`${id}: действие SPECIAL не из группы special`);
  const hp0 = EFFECTS.hp({E: 10}), crit0 = curve('crit', 10), bleed0 = bleedTicks(5), pace0 = letterFactor(5);
  E.setCell('curves', 'hp', 'per', 0.1); E.setCell('curves', 'crit', 'max', 0.05); E.setCell('curves', 'bleed', 'base', 3); E.setCell('curves', 'skillPace', 'per', 0.1);
  // concrete values: 0.6 + 0.1 × 10, the cap, (3 + 0.25 × 5) hours, 0.6 + 0.1 × 5
  if (Math.abs(EFFECTS.hp({E: 10}) - 1.6) > 1e-9 || curve('crit', 10) !== 0.05 || !(bleedTicks(5) > bleed0) || Math.abs(letterFactor(5) - 1.1) > 1e-9) bad.push('правка кривой не дошла до игры');
  // a shape without its numbers, a division by zero: refused, and the curve stays as it was
  if (!E.setCell('curves', 'str', 'shape', 'soft').error || !E.setCell('curves', 'skillCap', 'pivot', 0).error || !Number.isFinite(curve('str', 5))) bad.push('принята кривая, что даёт NaN или бесконечность');
  if (!E.setCell('curves', 'hp', 'base', undefined).error || !E.setCell('curves', 'str', 'min', undefined).ok) bad.push('пустая ячейка: base должен быть отказан, min — принят (без границы)');
  if (!E.setCell('curves', 'hp', 'shape', 'square').error || !E.setCell('curves', 'hp', 'group', 'luck').error) bad.push('принята форма, которой нет, или смена группы');
  E.resetAll();
  if (EFFECTS.hp({E: 10}) !== hp0 || curve('crit', 10) !== crit0 || bleedTicks(5) !== bleed0 || letterFactor(5) !== pace0) bad.push('сброс не вернул кривые');
  if (bad.length) { console.log('Кривые:\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log(`ok   кривые: ${CURVES.all().length}, конечны при буквах 0–100, множители при норме — 1; правка доходит до игры и сбрасывается`);
}

// ── dictionaries (data/mods.js, data/tags.js; docs/NRI.md этап 2): every key of a creature's `mods`, of the colony's
// `effects`, every yes/no field of a species and an item, every fear and resource tag is in its dictionary; the
// curves that set the body exist; an edit of a dictionary reaches the game, a wrong key is refused
{
  const {CREATURE_MODS, COLONY_MODS, effectErrors} = await import('../src/data/mods.js');
  const {TAGS, tagIds} = await import('../src/data/tags.js');
  const {CURVES} = await import('../src/data/curves.js');
  const {SPECIES} = await import('../src/data/species.js');
  const {WORLD_PEOPLES} = await import('../src/data/peoples.js');
  const {TRAITS, BASE_MODS} = await import('../src/data/traits.js');
  const {WOUNDS} = await import('../src/data/wounds.js');
  const {BUILDINGS} = await import('../src/data/buildings.js');
  const {RESOURCES} = await import('../src/data/resources.js');
  const {JOBS} = await import('../src/data/jobs.js');
  const {ITEMS} = await import('../src/data/items.js');
  const E = await import('../src/data/schema/edits.js');
  const bad = [];
  const mods = (where, m) => { for (const k of Object.keys(m || {})) if (!CREATURE_MODS.has(k)) bad.push(`${where}: модификатора «${k}» нет в словаре`); };
  for (const s of SPECIES.all()) {
    mods(`вид ${s.id}`, s.mods);
    for (const p of s.peoples || []) mods(`народ ${p.id}`, p.mods);
    for (const t of s.innate || []) mods(`врождённое ${s.id} «${t.label}»`, t.mods);
  }
  for (const p of WORLD_PEOPLES.all()) mods(`народ мира ${p.id}`, p.mods);
  for (const t of TRAITS.all()) mods(`черта ${t.id}`, t.mods);
  for (const w of WOUNDS.all()) mods(`рана ${w.id}`, w.mods);
  for (const m of CREATURE_MODS.all()) if (m.curve && !CURVES.has(m.curve)) bad.push(`модификатор ${m.id}: нет кривой «${m.curve}»`);
  const setBy = new Set(CREATURE_MODS.filter(m => m.curve).map(m => m.curve));
  // hp goes into health, charm into opinion (data/relations.js): every other curve of SPECIAL sets a key of the body
  for (const c of CURVES.filter(c => c.group === 'special')) if (!setBy.has(c.id) && !['hp', 'charm'].includes(c.id)) bad.push(`кривая ${c.id}: её не берёт ни один модификатор`);
  const fam = name => (name === 'resources' ? RESOURCES : name === 'jobs' ? JOBS : null);
  for (const b of BUILDINGS.all()) for (const e of effectErrors(b.effects, fam)) bad.push(`постройка ${b.id}: ${e}`);
  for (const s of SPECIES.all()) for (const e of effectErrors(s.tame?.effects, fam)) bad.push(`приручённый ${s.id}: ${e}`);
  for (const r of RESOURCES.all()) for (const e of effectErrors(r.effects, fam)) bad.push(`ресурс ${r.id}: ${e}`);
  for (const d of ITEMS.all()) if (d.ranged?.boost && !COLONY_MODS.has(`best.${d.ranged.boost}`)) bad.push(`вещь ${d.id}: усиления «${d.ranged.boost}» нет в «Модификаторах поселения»`);
  const spTags = tagIds('species'), fears = tagIds('fear'), resTags = tagIds('resource'), itemTags = tagIds('item');
  for (const s of SPECIES.all()) {
    for (const [k, v] of Object.entries(s)) if (typeof v === 'boolean' && !spTags.has(k)) bad.push(`вид ${s.id}: флаг «${k}» — не тег`);
    for (const f of s.weakTo || []) if (!fears.has(f)) bad.push(`вид ${s.id}: боится «${f}» — нет такого тега`);
  }
  for (const r of RESOURCES.all()) for (const t of r.tags || []) if (!resTags.has(t)) bad.push(`ресурс ${r.id}: тег «${t}» — нет в словаре`);
  for (const d of ITEMS.all()) for (const [k, v] of Object.entries(d)) if (typeof v === 'boolean' && !itemTags.has(k)) bad.push(`вещь ${d.id}: флаг «${k}» — не тег`);
  // edits: a neutral value reaches every new body; a wrong key in a trait, an effect, a resource tag is refused
  E.setCell('creatureMods', 'hunger', 'base', 1.5);
  if (BASE_MODS.hunger !== 1.5) bad.push('правка нейтрального модификатора не дошла до BASE_MODS');
  E.resetAll();
  if (BASE_MODS.hunger !== 1) bad.push('сброс не вернул BASE_MODS');
  if (!E.setCell('traits', 'brave', 'mods', {bravry: 0.45}).error) bad.push('опечатка в mods черты принята');
  if (!E.setCell('buildings', 'hut', 'effects', {add: {bedz: 4}}).error) bad.push('опечатка в effects постройки принята');
  if (!E.setCell('buildings', 'hut', 'effects', {yield: {nothing: 1.2}}).error) bad.push('ресурс, которого нет, в effects принят');
  if (!E.setCell('resources', 'wood', 'tags', ['fuel', 'wod']).error) bad.push('тег, которого нет, у ресурса принят');
  if (!E.setCell('buildings', 'hut', 'effects', {add: {beds: 5, popCap: 4, bedWarmth: 2}}).ok) bad.push('верная правка effects не принята');
  E.resetAll();
  if (bad.length) { console.log('Словари:\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log(`ok   словари: модификаторов существа ${CREATURE_MODS.all().length}, поселения ${COLONY_MODS.all().length}, тегов ${TAGS.all().length} — все mods, effects, флаги и теги из словарей; опечатку правка не принимает`);
}

// ── summaries (docs/NRI.md этап 6): every number of the sheets is finite, every species has a rating, and the sheets
// follow an edit of what they are made of
{
  const {tableById} = await import('../src/data/schema/index.js');
  const E = await import('../src/data/schema/edits.js');
  const bad = [];
  for (const id of ['creatureSheet', 'recipeSheet', 'buildingSheet']) {
    const t = tableById(id);
    for (const r of t.rows()) for (const c of t.columns) { const v = r[c.key]; if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`${t.label} · ${r.id} · ${c.label}: ${v}`); }
  }
  const sheet = id => tableById(id).rows();
  for (const r of sheet('creatureSheet')) if (!(r.rating > 0)) bad.push(`Существа (итог) · ${r.id}: КС ${r.rating}`);
  const furcoat = () => sheet('recipeSheet').find(r => r.id === 'furcoat'), hut = () => sheet('buildingSheet').find(r => r.id === 'hut'), wolf = () => sheet('creatureSheet').find(r => r.id === 'wolf');
  const m0 = furcoat().margin, g0 = hut().costGold, hp0 = wolf().hp, k0 = wolf().rating;
  E.setCell('resourcePrices', 'hide', 'price', 5); E.setCell('resourcePrices', 'wood', 'price', 1); E.setCell('creatures', 'wolf', 'hp', 3);
  if (furcoat().margin === m0 || !(hut().costGold > g0) || !(wolf().hp > hp0) || !(wolf().rating > k0)) bad.push('итоговые таблицы не следуют за правкой цен и существ');
  E.resetAll();
  if (furcoat().margin !== m0 || hut().costGold !== g0 || wolf().hp !== hp0 || wolf().rating !== k0) bad.push('итоговые таблицы не вернулись после сброса');
  if (bad.length) { console.log('Итоговые таблицы:\n  ' + bad.join('\n  ')); process.exit(1); }
  const loss = sheet('recipeSheet').filter(r => r.loss);
  console.log(`ok   итоговые таблицы: видов ${sheet('creatureSheet').length}, рецептов ${sheet('recipeSheet').length}, построек ${sheet('buildingSheet').length} — числа конечны, следуют за правками${loss.length ? `; в убыток: ${loss.map(r => `${r.id} ${r.margin}`).join(', ')}` : ''}`);
}

// ── what an edit may not do (the review of docs/NRI.md): empty a cell the game computes with, write a code stored in
// saves, name what is not there, break a list read by position; two tables never write one object
{
  const E = await import('../src/data/schema/edits.js');
  const {RESOURCES} = await import('../src/data/resources.js');
  const refused = [
    ['resourcePrices', 'wood', 'price', undefined], ['creatureMods', 'hunger', 'base', undefined], ['afflictions', 'fever', 'save', undefined],
    ['factions', 'colony', 'hostile', undefined], ['senses', 'darkvision', 'species', undefined], ['paceRules', 'rules', 'pursued', undefined],
    ['caravanBuildings', 'hut', 'cost', {wood: 7}], ['resources', 'ironore', 'ore', 3.7], ['buildings', 'hut', 'onFinish', 'plowFeld'],
    ['buildings', 'hut', 'cost', {wood: -5}], ['recipes', 'clothes', 'makes.item', 'zzz'], ['offices', 'ruler', 'years', [40]],
    ['ores', 'iron', 'vein.amount', ['a', 'b']], ['behaviourRules', 'GEAR.brave', 'value', [1]], ['afflictionRules', 'taint.stages', 'value', [1]],
    ['hitLocations', 'humanoid.head', 'traumas', ['downed']], ['colonyMods', 'yield', 'base', 2],
  ];
  const bad = [];
  for (const [t, r, c, v] of refused) { const res = E.setCell(t, r, c, v); if (!res.error) bad.push(`${t} · ${r} · ${c} = ${JSON.stringify(v)}: принято`); }
  E.resetAll();
  if (!E.setCell('resourcePrices', 'berries', 'money', 0.5).ok || RESOURCES.get('berries').money !== 0.5) bad.push('доля в оплате у ресурса без неё не доходит до игры');
  E.resetAll();
  if (RESOURCES.get('berries').money !== undefined) bad.push('сброс не убрал долю в оплате');
  if (bad.length) { console.log('Защита правки:\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log(`ok   защита правки: ${refused.length} недопустимых правок отклонены (пустое там, где нужно число, коды сохранений, ссылки в никуда, списки не той формы, вторая точка правки одного объекта)`);
}
