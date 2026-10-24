// Tables made from the data as it is, for the many lists whose every row has the same simple shape (a registry of
// jobs, recipes, thoughts…): the columns are the row's numbers, yes/no, words and lists of them, one level into an
// object (`time`, `cost.wood`). A column whose values are of more than one kind is shown and edited as JSON. Functions
// and deeper objects are the code's and are not shown. docs/TABLE.md, «Ревизия: таблицы — единый источник».
import {col} from './columns.js';

const prim = v => typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string';
const primList = v => Array.isArray(v) && v.every(prim);
// is this an own data value (not a getter: a getter reads another table, which is where it is edited)
const plain = (o, k) => { const d = Object.getOwnPropertyDescriptor(o, k); return !!d && !d.get && typeof d.value !== 'function'; };

// the columns of rows: [{key, type}] in the order first met; `skip` — keys left out (the key itself, the code's)
// `whole` — keys whose object is one column of its own ({mods: {type: 'map', ref: 'creatureMods'}}), not split
export function autoColumns(rows, {key = 'id', skip = [], labels = {}, whole = {}} = {}) {
  const kinds = new Map(), order = [], drop = new Set([key, ...skip, ...Object.keys(whole)]);
  const see = (path, v) => {
    const k = typeof v === 'number' ? 'num' : typeof v === 'boolean' ? 'bool' : typeof v === 'string' ? 'text' : 'json';
    if (!kinds.has(path)) { kinds.set(path, new Set()); order.push(path); }
    kinds.get(path).add(k);
  };
  // a path that holds a formula (a function) in any row is the code's in all of them
  const code = new Set();
  for (const r of rows) for (const k of Object.keys(r)) {
    if (drop.has(k)) continue;
    if (!plain(r, k)) { code.add(k); continue; }
    const v = r[k];
    if (prim(v) || primList(v)) see(k, v);
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const k2 of Object.keys(v)) { if (plain(v, k2) && (prim(v[k2]) || primList(v[k2]))) see(`${k}.${k2}`, v[k2]); else if (v[k2] != null && (typeof v[k2] === 'function' || !plain(v, k2))) code.add(`${k}.${k2}`); }
    } else if (typeof v === 'function') code.add(k);
  }
  const wholeCols = Object.entries(whole).filter(([k]) => rows.some(r => r[k] !== undefined)).map(([k, spec]) => col(k, labels[k] || k, spec.type || 'json', spec));
  return [col(key, key), ...order.filter(p => !code.has(p)).map(p => { const ks = kinds.get(p); return col(p, labels[p] || p, ks.size === 1 ? [...ks][0] : 'json'); }), ...wholeCols];
}

// a table of a registry or a list of rows: its columns found from the rows
// (a cell under a getter — a value read through from another table — is not written here: that table is where)
export function autoTable({id, label, group, note, rows, key = 'id', skip, labels, whole, after}) {
  const target = (r, c) => (plain(r, c.key.split('.')[0]) ? [r, c.key] : null);
  return {id, label, group, key, rows, note, target, columns: autoColumns(rows(), {key, skip, labels, whole}), ...(after ? {after} : {})};
}

// a table of an object of rows ({wolf: {...}, deer: {...}}): the key is the object's key, edits go to the row itself
export function objectTable({id, label, group, note, obj, skip, labels}) {
  const rows = () => Object.entries(obj()).map(([k, v]) => ({_id: k, ...v}));
  return {id, label, group, key: '_id', rows, note, target: (r, c) => [obj()[r._id], c.key], columns: autoColumns(rows(), {key: '_id', skip, labels})};
}
