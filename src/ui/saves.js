// Saved games in this browser (IndexedDB: saves of big maps do not fit into localStorage) and as
// files. A save is the core's saveWorld() output as JSON, gzip-compressed when the browser can.
// The database, packing and files are shared with saved worlds (ui/store.js).
import {saveWorld, loadWorld} from '../world/save.js';
import {dayOf, clockStr} from '../core/time.js';
import {tx, pack, unpack, offerFile, readFile, fileTitle} from './store.js';
import {isWorldSave} from '../atlas/save.js';

const STORE = 'saves', KEEP = 8;   // manual saves kept; the autosave has its own slot

const metaOf = (w, auto) => ({name: w.cfg.name, day: dayOf(w.tick) + 1, when: clockStr(w.tick), pop: w.agents.filter(a => a.faction === 'colony').length,
  seed: w.cfg.seed, savedAt: Date.now(), auto: !!auto});

export async function saveToBrowser(w, auto = false) {
  const save = saveWorld(w), {gz, data} = await pack(JSON.stringify(save));
  const rec = {id: auto ? 'auto' : 'm' + Date.now(), meta: {...metaOf(w, auto), version: save.version}, gz, data};
  await tx(STORE, 'readwrite', s => s.put(rec));
  if (!auto) {   // keep the newest few manual saves
    const old = (await listSaves()).filter(x => !x.auto).slice(KEEP);
    for (const x of old) await deleteSave(x.id);
  }
  return rec.meta;
}

export async function listSaves() {
  const all = await tx(STORE, 'readonly', s => s.getAll());
  return all.map(r => ({id: r.id, ...r.meta})).sort((a, b) => b.savedAt - a.savedAt);
}

export const deleteSave = id => tx(STORE, 'readwrite', s => s.delete(id));

export async function loadFromBrowser(id) {
  const rec = await tx(STORE, 'readonly', s => s.get(id));
  if (!rec) throw new Error('Сохранение не найдено.');
  return loadWorld(JSON.parse(await unpack(rec.data)));
}

const baseName = w => `${fileTitle(w.cfg.name)}-день${dayOf(w.tick) + 1}.forest`;

export const downloadSave = w => offerFile(baseName(w), JSON.stringify(saveWorld(w)));

export async function loadFromFile(file) {
  const save = await readFile(file);
  if (isWorldSave(save)) throw new Error('это файл мира, а не игры — откройте его на экране «Мир»');
  return loadWorld(save);
}
