// The layer of table edits as data: {table: {row: {column: value}}}. Kept apart from src/data/schema/edits.js
// (which writes the edits into the tables) so that the world generator can stamp a new world with the edits it
// was made under without importing every table: atlas/generate.js and sim.js put editsStamp() on a new world
// (a.tables, w.tables), it is saved with it and goes into its hash, and the screen warns when a world made
// under other edits is opened (stampWarning). docs/TABLE.md, этап 3.
export const LAYER = {};

const canon = v => (v === Infinity ? '∞' : v === -Infinity ? '-∞' : Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v);
export const canonical = v => JSON.stringify(canon(v));
export const sameValue = (a, b) => canonical(a) === canonical(b);

export const editCount = () => Object.values(LAYER).reduce((n, rows) => n + Object.values(rows).reduce((m, cols) => m + Object.keys(cols).length, 0), 0);

// a short signature of the edits (null: none)
export function editsSig() {
  if (!editCount()) return null;
  const s = canonical(LAYER);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519); }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

const copy = v => (v === undefined ? undefined : structuredClone(v));
// what a new world carries: null when there are no edits, so a world made without them is as it always was
export const editsStamp = () => (editCount() ? {sig: editsSig(), n: editCount(), edits: copy(LAYER)} : null);

const word = n => (n % 10 === 1 && n % 100 !== 11 ? 'правка' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'правки' : 'правок');
// '' when the world was made under the edits there are now; else what differs, for the status line
export function stampWarning(stamp, what = 'Мир создан') {
  const now = editsSig(), was = stamp?.sig || null;
  if (now === was) return '';
  if (was && !now) return `${what} с правками таблиц (${stamp.n} ${word(stamp.n)}), а сейчас правок нет: дальше всё идёт по исходным числам.`;
  if (!was && now) return `${what} без правок таблиц, а сейчас их ${editCount()}: дальше всё идёт по правленым числам.`;
  return `${what} с другими правками таблиц (там ${stamp.n} ${word(stamp.n)}, сейчас ${editCount()}): дальше всё идёт по нынешним.`;
}
