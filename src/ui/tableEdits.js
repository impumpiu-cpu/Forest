// The table edits of this browser (docs/TABLES.md): the layer of src/data/schema/edits.js kept in
// localStorage and in files. Imported first by the page's menu (src/app/main.js), so the edits are in
// the tables before any game or world is made — and before the modules that read a table at load.
import {applyEdits, LAYER, editCount, stampWarning} from '../data/schema/edits.js';
import {VERSION} from '../version.js';

const STORE = 'forest.tables';
const EDITS_KIND = 'forest-tables';

// Infinity does not survive JSON: written as a word, read back as the number
const out = (k, v) => (v === Infinity ? 'Infinity' : v === -Infinity ? '-Infinity' : v);
const back = (k, v) => (v === 'Infinity' ? Infinity : v === '-Infinity' ? -Infinity : v);

const editsFile = () => ({kind: EDITS_KIND, version: VERSION, savedAt: Date.now(), n: editCount(), edits: LAYER});
export const editsJSON = () => JSON.stringify(editsFile(), out, 2);

// keep the layer as it is now (none: the store is cleared)
export function storeEdits() {
  try { if (editCount()) localStorage.setItem(STORE, JSON.stringify(editsFile(), out)); else localStorage.removeItem(STORE); } catch (e) { /* storage unavailable */ }
}

// a file of edits → the layer applied in place of the current one; → [what could not be applied]
export function loadEditsText(text) {
  const f = JSON.parse(text, back);
  if (!f || f.kind !== EDITS_KIND || typeof f.edits !== 'object') throw new Error('это не файл правок таблиц «Тёплого Брода»');
  const bad = applyEdits(f.edits);
  storeEdits();
  return bad;
}

// what could not be applied from the store at start (a table or a row the game no longer has)
export let BOOT_PROBLEMS = [];
try {
  const raw = localStorage.getItem(STORE);
  if (raw) { const f = JSON.parse(raw, back); if (f?.kind === EDITS_KIND) BOOT_PROBLEMS = applyEdits(f.edits); }
} catch (e) { BOOT_PROBLEMS = [`правки таблиц не прочитаны: ${e.message}`]; }

// a world or a game made under other edits: a note at the top of the screen for a while (and on the status line)
let bannerTimer = 0;
export function warnEdits(stamp, what) {
  const w = stampWarning(stamp, what);
  if (!w || typeof document === 'undefined') return w;
  let b = document.getElementById('editsBanner');
  if (!b) { b = document.createElement('div'); b.id = 'editsBanner'; b.className = 'edits-banner'; b.setAttribute('role', 'status'); b.addEventListener('click', () => { b.hidden = true; }); document.body.append(b); }
  b.textContent = `⚠ ${w}`; b.hidden = false; b.title = 'Щелчок — скрыть. Правки таблиц: «Настройки → Таблицы» в новом меню.';
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { b.hidden = true; }, 12000);
  return w;
}
