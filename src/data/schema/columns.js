// Table schemas: how a data table (src/data/*.js) is shown and checked as a table. A schema does not copy
// the data — it reads it from the source modules and says what each column is (docs/TABLE.md, «Репозиторий
// как база данных»). The screen «Настройки → Таблицы» (src/app/tablesView.js) is built from schemas, and
// `npm test` checks every value against its column (tools/check-tables.mjs).
//
// A schema: {id, label, group, note, key, rows() → [row], columns: [column]}
//   key      — the column that names a row (unique within the table)
//   rows()   — plain objects; a row may join several sources (a race and its row of data/balance/creatures.js)
//   computed — the whole table is a result (items, ratings): shown, never edited
// A column: {key, label, type, note?, min?, max?, ref?, values?, computed?}
//   key      — a path into the row: 'attack.power', 'align.order'
//   type     — text · num · int · bool · enum (values: {id: label} or [id]) · ref (one id of `ref`) ·
//              ids (a list of ids of `ref`) · map ({id: number}: keys of `ref`, values within min…max, or
//              words of `values`) · special (SPECIAL limits {S: [lo, hi], …}) · shift (SPECIAL shift {S: n}) ·
//              color · formula (a function: shown as its code, never edited) · list (objects: shown by `show`) · json
//   ref      — a table id (its keys), or anything with has(id) — a Registry, a Set
//   computed — a value the game works out (a rating fitted by the arena): shown, never edited
//   check    — check(v) → [error]: what the type cannot say (an `effects` object against its dictionary)
import {STATS} from '../special.js';

export const col = (key, label, type = 'text', more = {}) => ({key, label, type, ...more});

// the value at a path: get({a: {b: 2}}, 'a.b') → 2
export const get = (row, path) => {
  let v = row;
  for (const k of path.split('.')) { if (v == null) return undefined; v = v[k]; }
  return v;
};

const LETTERS = new Set(STATS.ids());
const isNum = v => typeof v === 'number' && !Number.isNaN(v);
const enumHas = (values, v) => (Array.isArray(values) ? values.includes(v) : Object.prototype.hasOwnProperty.call(values, v));

// the keys of every table, for the `ref` of a column: resolver(tables)(ref) → a set with has(id), or null
export function resolver(tables) {
  const byId = new Map(tables.map(t => [t.id, t])), cache = new Map();
  const keys = id => {
    if (!cache.has(id)) { const t = byId.get(id); cache.set(id, t ? new Set(t.rows().map(r => get(r, t.key))) : null); }
    return cache.get(id);
  };
  return ref => (typeof ref === 'string' ? keys(ref) : ref);
}

// what is wrong with one value of a column (`where` opens each message) → [error text]
export function valueErrors(c, v, resolve, where) {
  const errs = [];
  if (v == null) { if (c.required) errs.push(`${where}: пусто`); return errs; }
  const range = x => (c.min != null && x < c.min) || (c.max != null && x > c.max);
  const set = c.ref != null ? resolve(c.ref) : null;
  if (c.ref != null && !set) return [`${where}: ссылка на неизвестную таблицу «${c.ref}»`];
  const known = x => !set || set.has(x);
  switch (c.type) {
    case 'num': case 'int':
      if (!isNum(v) || (c.type === 'int' && Number.isFinite(v) && !Number.isInteger(v))) errs.push(`${where}: не ${c.type === 'int' ? 'целое ' : ''}число (${v})`);
      else if (!Number.isFinite(v) && !c.infinite) errs.push(`${where}: бесконечность`);
      else if (range(v)) errs.push(`${where}: ${v} вне ${c.min ?? '…'}…${c.max ?? '…'}`);
      break;
    case 'bool': if (typeof v !== 'boolean') errs.push(`${where}: не да/нет (${v})`); break;
    case 'text': if (typeof v !== 'string') errs.push(`${where}: не текст`); break;
    case 'enum': if (!enumHas(c.values, v)) errs.push(`${where}: «${v}» — нет такого значения`); break;
    case 'ref': if (!known(v)) errs.push(`${where}: «${v}» — нет такой строки`); break;
    case 'ids':
      if (!Array.isArray(v)) { errs.push(`${where}: не список`); break; }
      for (const x of v) if (!known(x)) errs.push(`${where}: «${x}» — нет такой строки`);
      break;
    case 'map':
      if (typeof v !== 'object' || Array.isArray(v)) { errs.push(`${where}: не набор`); break; }
      for (const [k, x] of Object.entries(v)) {
        if (!known(k)) errs.push(`${where}: «${k}» — нет такой строки`);
        if (c.values) { if (!enumHas(c.values, x)) errs.push(`${where} · ${k}: «${x}» — нет такого значения`); }
        else if (!isNum(x)) errs.push(`${where} · ${k}: не число (${x})`);
        else if (range(x)) errs.push(`${where} · ${k}: ${x} вне ${c.min ?? '…'}…${c.max ?? '…'}`);
      }
      break;
    case 'special':
      if (typeof v !== 'object' || Array.isArray(v)) { errs.push(`${where}: не набор пределов`); break; }
      for (const [k, lim] of Object.entries(v)) {
        if (!LETTERS.has(k)) errs.push(`${where}: нет характеристики «${k}»`);
        else if (!Array.isArray(lim) || lim.length !== 2 || !isNum(lim[0]) || !isNum(lim[1])) errs.push(`${where} · ${k}: предел не [мин, макс]`);
        else if (lim[0] > lim[1]) errs.push(`${where} · ${k}: минимум ${lim[0]} больше максимума ${lim[1]}`);
        else if (range(lim[0]) || range(lim[1])) errs.push(`${where} · ${k}: [${lim}] вне ${c.min ?? '…'}…${c.max ?? '…'}`);
      }
      if (c.full) for (const k of LETTERS) if (!(k in v)) errs.push(`${where}: нет предела для «${k}»`);
      break;
    case 'shift':
      if (typeof v !== 'object' || Array.isArray(v)) { errs.push(`${where}: не набор`); break; }
      for (const [k, x] of Object.entries(v)) if (!LETTERS.has(k)) errs.push(`${where}: нет характеристики «${k}»`); else if (!isNum(x)) errs.push(`${where} · ${k}: не число`);
      break;
    case 'formula': if (typeof v !== 'function') errs.push(`${where}: не формула`); break;
    default: break;
  }
  if (c.check && !errs.length) for (const e of c.check(v, resolve)) errs.push(`${where}: ${e}`);
  return errs;
}

// Every value checked against its column. → [error text]
export function checkTables(tables) {
  const errs = [], resolve = resolver(tables);
  for (const t of tables) {
    const seen = new Set();
    for (const r of t.rows()) {
      const id = get(r, t.key), at = `${t.label} · ${id}`;
      if (id == null || id === '') errs.push(`${t.label}: строка без ключа «${t.key}»`);
      else if (seen.has(id)) errs.push(`${at}: ключ повторяется`);
      seen.add(id);
      for (const c of t.columns) errs.push(...valueErrors(c, get(r, c.key), resolve, `${at} · ${c.label}`));
    }
  }
  return errs;
}

// ── editing (src/data/schema/edits.js)
// What can be edited: not a computed table or column, not the key, not a formula or a list shown by words,
// and not a column the schema closed (`edit: false`) — a joined value that belongs to another table, say.
const FIXED = new Set(['formula', 'list', 'color']);
export const editable = (t, c) => !t.computed && !c.computed && c.edit !== false && c.key !== t.key && !FIXED.has(c.type);

// where a cell is written: [object, path]. By default the row itself at the column's key; a table whose rows
// are copies (a race joined from two files, a matrix) says where the value really lives (`target`); null — this
// cell cannot be written (a setting that is a constant)
export const targetOf = (t, row, c) => (t.target ? t.target(row, c) : [row, c.key]);

export function setPath(obj, path, v) {
  const ks = path.split('.'), last = ks.pop();
  let o = obj;
  for (const k of ks) { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }
  if (v === undefined) delete o[last]; else o[last] = v;
}

// A table of settings ({a: 1, b: {c: 2}}) as rows {key: 'b.c', value: 2, obj, path}: every number, true/false, word
// and list of words. `obj` — the object the setting lives in (null: a constant, it cannot be edited), `path` — in it
export function paramRows(obj, prefix = '', root = obj, at = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    // (a getter reads another table's value, which is where it is edited)
    if (Object.getOwnPropertyDescriptor(obj, k)?.get) continue;
    const key = prefix ? `${prefix}.${k}` : k, path = at ? `${at}.${k}` : k;
    if (isNum(v) || typeof v === 'boolean' || typeof v === 'string' || (Array.isArray(v) && v.every(x => isNum(x) || typeof x === 'string'))) out.push({key, value: v, obj: root, path});
    else if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...paramRows(v, key, root, path));
  }
  return out;
}
// several settings objects as one table: {name: object}; a plain number (a constant export) is shown, never edited
export const paramGroups = groups => Object.entries(groups).flatMap(([name, o]) => (o && typeof o === 'object' ? paramRows(o, name, o, '') : [{key: name, value: o, obj: null, path: null}]));
export const paramColumns = [col('key', 'Параметр', 'text'), col('value', 'Значение', 'json')];
// the param tables: key → their columns and target in one go
export const params = rows => ({key: 'key', rows, columns: paramColumns, target: paramTarget});
export const paramTarget = (row, c) => (c.key === 'value' && row.obj ? [row.obj, row.path] : null);
