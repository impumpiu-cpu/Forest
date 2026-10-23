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
  E.setCell('curves', 'hp', 'per', 0.1); E.setCell('curves', 'crit', 'max', 0.05); E.setCell('curves', 'bleed', 'base', 3); E.setCell('curves', 'skillPace', 'shape', 'pow');
  if (!(EFFECTS.hp({E: 10}) > hp0) || curve('crit', 10) !== 0.05 || !(bleedTicks(5) > bleed0) || letterFactor(5) === pace0) bad.push('правка кривой не дошла до игры');
  if (!E.setCell('curves', 'hp', 'shape', 'square').error || !E.setCell('curves', 'hp', 'group', 'luck').error) bad.push('принята форма, которой нет, или смена группы');
  E.resetAll();
  if (EFFECTS.hp({E: 10}) !== hp0 || curve('crit', 10) !== crit0 || bleedTicks(5) !== bleed0 || letterFactor(5) !== pace0) bad.push('сброс не вернул кривые');
  if (bad.length) { console.log('Кривые:\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log(`ok   кривые: ${CURVES.all().length}, конечны при буквах 0–100, множители при норме — 1; правка доходит до игры и сбрасывается`);
}
