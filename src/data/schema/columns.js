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

// Every value checked against its column. → [error text]
export function checkTables(tables) {
  const errs = [], byId = new Map(tables.map(t => [t.id, t]));
  const keysOf = new Map();
  const keys = id => {
    if (!keysOf.has(id)) { const t = byId.get(id); keysOf.set(id, t ? new Set(t.rows().map(r => get(r, t.key))) : null); }
    return keysOf.get(id);
  };
  const resolve = ref => (typeof ref === 'string' ? keys(ref) : ref);
  for (const t of tables) {
    const rows = t.rows(), seen = new Set();
    for (const r of rows) {
      const id = get(r, t.key), at = `${t.label} · ${id}`;
      if (id == null || id === '') errs.push(`${t.label}: строка без ключа «${t.key}»`);
      else if (seen.has(id)) errs.push(`${at}: ключ повторяется`);
      seen.add(id);
      for (const c of t.columns) {
        const v = get(r, c.key), where = `${at} · ${c.label}`;
        if (v == null) { if (c.required) errs.push(`${where}: пусто`); continue; }
        const range = x => (c.min != null && x < c.min) || (c.max != null && x > c.max);
        const set = c.ref != null ? resolve(c.ref) : null;
        if (c.ref != null && !set) { errs.push(`${where}: ссылка на неизвестную таблицу «${c.ref}»`); continue; }
        const known = x => !set || set.has(x);
        switch (c.type) {
          case 'num': case 'int':
            if (!isNum(v) || (c.type === 'int' && Number.isFinite(v) && !Number.isInteger(v))) errs.push(`${where}: не число (${v})`);
            else if (!Number.isFinite(v) && !c.infinite) errs.push(`${where}: бесконечность`);
            else if (range(v)) errs.push(`${where}: ${v} вне ${c.min ?? '…'}…${c.max ?? '…'}`);
            break;
          case 'bool': if (typeof v !== 'boolean') errs.push(`${where}: не да/нет (${v})`); break;
          case 'enum': if (!enumHas(c.values, v)) errs.push(`${where}: «${v}» — нет такого значения`); break;
          case 'ref': if (!known(v)) errs.push(`${where}: «${v}» — нет такой строки`); break;
          case 'ids':
            if (!Array.isArray(v)) { errs.push(`${where}: не список`); break; }
            for (const x of v) if (!known(x)) errs.push(`${where}: «${x}» — нет такой строки`);
            break;
          case 'map':
            if (typeof v !== 'object') { errs.push(`${where}: не набор`); break; }
            for (const [k, x] of Object.entries(v)) {
              if (!known(k)) errs.push(`${where}: «${k}» — нет такой строки`);
              if (c.values) { if (!enumHas(c.values, x)) errs.push(`${where} · ${k}: «${x}» — нет такого значения`); }
              else if (!isNum(x)) errs.push(`${where} · ${k}: не число (${x})`);
              else if (range(x)) errs.push(`${where} · ${k}: ${x} вне ${c.min ?? '…'}…${c.max ?? '…'}`);
            }
            break;
          case 'special':
            for (const [k, lim] of Object.entries(v)) {
              if (!LETTERS.has(k)) errs.push(`${where}: нет характеристики «${k}»`);
              else if (!Array.isArray(lim) || lim.length !== 2 || !isNum(lim[0]) || !isNum(lim[1])) errs.push(`${where} · ${k}: предел не [мин, макс]`);
              else if (lim[0] > lim[1]) errs.push(`${where} · ${k}: минимум ${lim[0]} больше максимума ${lim[1]}`);
              else if (range(lim[0]) || range(lim[1])) errs.push(`${where} · ${k}: [${lim}] вне ${c.min ?? '…'}…${c.max ?? '…'}`);
            }
            for (const k of LETTERS) if (c.full && !(k in v)) errs.push(`${where}: нет предела для «${k}»`);
            break;
          case 'shift':
            for (const [k, x] of Object.entries(v)) if (!LETTERS.has(k)) errs.push(`${where}: нет характеристики «${k}»`); else if (!isNum(x)) errs.push(`${where} · ${k}: не число`);
            break;
          case 'formula': if (typeof v !== 'function') errs.push(`${where}: не формула`); break;
          default: break;
        }
      }
    }
  }
  return errs;
}

// A table of settings ({a: 1, b: {c: 2}}) as rows {key: 'b.c', value: 2}: every number, true/false and list of words
export function paramRows(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isNum(v) || typeof v === 'boolean' || typeof v === 'string') out.push({key, value: v});
    else if (Array.isArray(v)) { if (v.every(x => isNum(x) || typeof x === 'string')) out.push({key, value: v}); }
    else if (v && typeof v === 'object') out.push(...paramRows(v, key));
  }
  return out;
}
export const paramColumns = [col('key', 'Параметр', 'text'), col('value', 'Значение', 'json')];
