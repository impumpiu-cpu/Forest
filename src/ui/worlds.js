// The library of worlds: worlds saved whole with their chronicle, in this browser and as files.
// A world is the core's saveAtlas() output (atlas/save.js) as gzip JSON; the list reads only the
// index (name, seed, years, towns), never the worlds themselves. Every mode that needs a world —
// the map on a world cell, the campaign — takes it from here (docs/CAMPAIGN.md).
import {saveAtlas, loadAtlas, isWorldSave, LAND_KIND, WORLD_KIND} from '../view/world.js';
import {tx, pack, unpack, offerFile, readFile, fileTitle} from './store.js';

const DATA = 'worlds', INDEX = 'worldIndex';

// saves the world under a new id, or over an existing one (`id`); returns its index record
// (`kind` — LAND_KIND for a land of «Создать землю»: the same library, the record's `type` tells them apart)
export async function saveWorldToLibrary(a, name, id = null, kind = WORLD_KIND) {
  const save = saveAtlas(a, name, kind), {gz, data} = await pack(JSON.stringify(save));
  const rec = {id: id || 'w' + Date.now(), ...save.meta, savedAt: save.savedAt, bytes: data.length ?? data.byteLength};
  await tx([DATA, INDEX], 'readwrite', (d, i) => { d.put({id: rec.id, gz, data}); return i.put(rec); });
  return rec;
}

export async function listWorlds() {
  const all = await tx(INDEX, 'readonly', s => s.getAll());
  return all.sort((a, b) => b.savedAt - a.savedAt);
}

export const deleteWorld = id => tx([DATA, INDEX], 'readwrite', (d, i) => { d.delete(id); return i.delete(id); });

export async function renameWorld(id, name) {
  const rec = await tx(INDEX, 'readonly', s => s.get(id));
  if (!rec) throw new Error('Мир не найден.');
  rec.name = name;
  await tx(INDEX, 'readwrite', s => s.put(rec));
  return rec;
}

// the saved world itself, ready to draw and to go on
export async function openWorld(id) {
  const rec = await tx(DATA, 'readonly', s => s.get(id));
  if (!rec) throw new Error('Мир не найден.');
  return loadAtlas(JSON.parse(await unpack(rec.data)));
}

// the world as a file to keep or to carry to another browser
export const downloadWorld = (a, name) => offerFile(`${fileTitle(name || 'мир')}-сид${fileTitle(a.cfg.seed)}.world`, JSON.stringify(saveAtlas(a, name)));
export const downloadLand = (a, name) => offerFile(`${fileTitle(name || 'земля')}-сид${fileTitle(a.cfg.seed)}.land`, JSON.stringify(saveAtlas(a, name, LAND_KIND)));

// a world from a file: returned to be shown, and put into the library under its own name
export async function importWorld(file) {
  const save = await readFile(file);
  if (!isWorldSave(save)) throw new Error('это не файл мира' + (save?.tree ? ' — похоже на сохранение игры, его открывают на экране «Карта»' : ''));
  const a = loadAtlas(save), rec = await saveWorldToLibrary(a, save.meta?.name, null, save.kind);
  return {a, rec};
}
