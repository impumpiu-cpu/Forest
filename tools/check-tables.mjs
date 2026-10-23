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
