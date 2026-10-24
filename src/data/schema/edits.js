// Edits of the tables for experiments (docs/TABLE.md, этап 3): a layer over the numbers of the code. An edit
// writes its value straight into the definition the game reads (a species, a material, a row of the relations),
// so every system sees it without knowing about edits; the value it replaced is kept, and a reset puts it back.
// The source files are never touched: without the layer the game is as the code says.
//
// The layer itself (what is edited) is plain data in ./layer.js; the shell keeps it in the browser and in files
// (src/ui/tableEdits.js) and applies it at start, before a game or a world is made.
import {TABLES, tableById, get, editable, targetOf, valueErrors, resolver} from './index.js';
import {setPath} from './columns.js';
import {LAYER, sameValue, editMade} from './layer.js';

export {LAYER, editCount, editsSig, editsStamp, stampWarning} from './layer.js';

const originals = new Map();   // `${table}\u0001${row}\u0001${column}` → {obj, path, v} — the value of the code
const keyOf = (t, r, c) => `${t}\u0001${r}\u0001${c}`;
const copy = v => (v === undefined ? undefined : structuredClone(v));
let resolve = null;
const refs = ref => (resolve || (resolve = resolver(TABLES)))(ref);

const findRow = (t, key) => t.rows().find(r => String(get(r, t.key)) === String(key));

// the table, row and column of a cell, and where it is written → {t, row, c, obj, path} or {error}
function locate(tableId, rowKey, colKey) {
  const t = tableById(tableId);
  if (!t) return {error: `нет таблицы «${tableId}»`};
  const c = t.columns.find(x => x.key === colKey);
  if (!c) return {error: `${t.label}: нет столбца «${colKey}»`};
  if (!editable(t, c)) return {error: `${t.label} · ${c.label}: не правится`};
  const row = findRow(t, rowKey);
  if (!row) return {error: `${t.label}: нет строки «${rowKey}»`};
  const target = targetOf(t, row, c);
  if (!target || !target[0]) return {error: `${t.label} · ${rowKey} · ${c.label}: постоянное число кода, не правится`};
  return {t, row, c, obj: target[0], path: target[1]};
}

// Write one cell. → {ok: true} or {error}; an edit back to the value of the code is no edit
export function setCell(tableId, rowKey, colKey, value) {
  const L = locate(tableId, rowKey, colKey);
  if (L.error) return {error: L.error};
  const {t, c, obj, path} = L, id = keyOf(tableId, rowKey, colKey);
  const errs = valueErrors(c, value, refs, `${t.label} · ${rowKey} · ${c.label}`);
  const before = originals.has(id) ? originals.get(id).v : get(obj, path);
  if (c.type === 'json' && before != null && (typeof before !== typeof value || Array.isArray(before) !== Array.isArray(value))) errs.push(`${t.label} · ${rowKey} · ${c.label}: нужен тот же вид значения, что был (${Array.isArray(before) ? 'список' : typeof before === 'number' ? 'число' : typeof before === 'boolean' ? 'да/нет' : 'текст'})`);
  if (errs.length) return {error: errs[0]};
  if (!originals.has(id)) originals.set(id, {obj, path, v: copy(get(obj, path))});
  setPath(obj, path, copy(value));
  if (sameValue(value, originals.get(id).v)) { forget(tableId, rowKey, colKey); originals.delete(id); }
  else ((LAYER[tableId] ||= {})[rowKey] ||= {})[colKey] = copy(value);
  t.after?.(); editMade();
  return {ok: true};
}

function forget(tableId, rowKey, colKey) {
  const rows = LAYER[tableId]; if (!rows?.[rowKey]) return;
  delete rows[rowKey][colKey];
  if (!Object.keys(rows[rowKey]).length) delete rows[rowKey];
  if (!Object.keys(rows).length) delete LAYER[tableId];
}

// the value of the code under an edited cell (undefined: the cell is not edited)
export const originalOf = (tableId, rowKey, colKey) => originals.get(keyOf(tableId, rowKey, colKey))?.v;
export const isEdited = (tableId, rowKey, colKey) => !!LAYER[tableId]?.[rowKey] && Object.prototype.hasOwnProperty.call(LAYER[tableId][rowKey], colKey);

export function resetCell(tableId, rowKey, colKey) {
  const id = keyOf(tableId, rowKey, colKey), o = originals.get(id);
  if (o) { setPath(o.obj, o.path, copy(o.v)); originals.delete(id); }
  forget(tableId, rowKey, colKey);
  tableById(tableId)?.after?.(); editMade();
}
export function resetTable(tableId) {
  for (const [r, cols] of Object.entries(LAYER[tableId] || {})) for (const c of Object.keys(cols)) resetCell(tableId, r, c);
}
export function resetAll() { for (const t of Object.keys(LAYER)) resetTable(t); }

// every edit as a list, for the screen: [{table, row, column, value, was}]
export const editList = () => Object.entries(LAYER).flatMap(([t, rows]) => Object.entries(rows).flatMap(([r, cols]) => Object.entries(cols).map(([c, v]) => ({table: t, row: r, column: c, value: v, was: originalOf(t, r, c)}))));

// Put a whole layer in place of the one there is (a file, the browser's store). → [error] for what could not be applied
export function applyEdits(edits) {
  resetAll();
  const bad = [];
  for (const [t, rows] of Object.entries(edits || {})) for (const [r, cols] of Object.entries(rows || {})) for (const [c, v] of Object.entries(cols || {})) {
    const res = setCell(t, r, c, v);
    if (res.error) bad.push(res.error);
  }
  return bad;
}
