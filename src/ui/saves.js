// Saved games in this browser (IndexedDB: saves of big maps do not fit into localStorage) and as
// files. A save is the core's saveWorld() output as JSON, gzip-compressed when the browser can.
import {saveWorld, loadWorld} from '../world/save.js';
import {dayOf, clockStr} from '../core/time.js';

const DB = 'forest', STORE = 'saves', KEEP = 8;   // manual saves kept; the autosave has its own slot

function db() {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, {keyPath: 'id'});
    r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((ok, fail) => {
    const t = d.transaction(STORE, mode), s = t.objectStore(STORE), r = fn(s);
    t.oncomplete = () => { d.close(); ok(r?.result); }; t.onerror = () => { d.close(); fail(t.error); };
  });
}

async function pack(text) {
  if (typeof CompressionStream === 'undefined') return {gz: false, data: text};
  const buf = await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  return {gz: true, data: new Uint8Array(buf)};
}
async function unpack(bytes) {
  const gz = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!gz) return new TextDecoder().decode(bytes);
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

const metaOf = (w, auto) => ({name: w.cfg.name, day: dayOf(w.tick) + 1, when: clockStr(w.tick), pop: w.agents.filter(a => a.faction === 'colony').length,
  seed: w.cfg.seed, savedAt: Date.now(), auto: !!auto});

export async function saveToBrowser(w, auto = false) {
  const save = saveWorld(w), {gz, data} = await pack(JSON.stringify(save));
  const rec = {id: auto ? 'auto' : 'm' + Date.now(), meta: {...metaOf(w, auto), version: save.version}, gz, data};
  await tx('readwrite', s => s.put(rec));
  if (!auto) {   // keep the newest few manual saves
    const old = (await listSaves()).filter(x => !x.auto).slice(KEEP);
    for (const x of old) await deleteSave(x.id);
  }
  return rec.meta;
}

export async function listSaves() {
  const all = await tx('readonly', s => s.getAll());
  return all.map(r => ({id: r.id, ...r.meta})).sort((a, b) => b.savedAt - a.savedAt);
}

export const deleteSave = id => tx('readwrite', s => s.delete(id));

export async function loadFromBrowser(id) {
  const rec = await tx('readonly', s => s.get(id));
  if (!rec) throw new Error('Сохранение не найдено.');
  const text = rec.gz ? await unpack(rec.data) : rec.data;
  return loadWorld(JSON.parse(text));
}

// On claude.ai the page cannot download by itself: the viewer's `downloads` capability offers the
// file (only plain .json is allowed there). Elsewhere a gzip file is downloaded directly.
const baseName = w => `${w.cfg.name.replace(/[^\p{L}\p{N}]+/gu, '-')}-день${dayOf(w.tick) + 1}.forest`;

export async function downloadSave(w) {
  const text = JSON.stringify(saveWorld(w));
  const host = typeof window !== 'undefined' && window.claude?.use ? await window.claude.use('downloads').catch(() => null) : null;
  if (host) {
    try { await host.save({filename: baseName(w) + '.json', data: text}); return 'saved'; }
    catch (e) { if (e?.code === 'declined') return 'declined'; throw new Error(e?.message || 'сохранение файла недоступно'); }
  }
  const {gz, data} = await pack(text);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], {type: gz ? 'application/gzip' : 'application/json'}));
  a.download = baseName(w) + (gz ? '.gz' : '.json');
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'saved';
}

export async function loadFromFile(file) {
  const text = await unpack(new Uint8Array(await file.arrayBuffer()));
  return loadWorld(JSON.parse(text));
}
