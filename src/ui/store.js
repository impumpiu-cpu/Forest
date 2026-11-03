// What this browser keeps: one IndexedDB database for saved games and saved worlds, gzip packing,
// and handing a file to the viewer. The store `saves` is of the saved games of old (kept, not read). A saved world is
// large (megabytes), so it is split: `worlds` holds the packed world, `worldIndex` what the list
// shows, and listing never reads the worlds themselves (ui/worlds.js).
const DB = 'forest', VERSION = 2;
const STORES = ['saves', 'worlds', 'worldIndex'];

function db() {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(DB, VERSION);
    // version 1 had only `saves`; any missing store is made, nothing old is touched
    r.onupgradeneeded = () => { for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, {keyPath: 'id'}); };
    r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error);
    r.onblocked = () => fail(new Error('база занята другой вкладкой с игрой — закройте её и повторите'));
  });
}

// one transaction over one or more stores; fn gets the stores in the same order and returns a request
export async function tx(stores, mode, fn) {
  const names = [].concat(stores), d = await db();
  return new Promise((ok, fail) => {
    const t = d.transaction(names, mode), r = fn(...names.map(n => t.objectStore(n)));
    t.oncomplete = () => { d.close(); ok(r?.result); }; t.onerror = () => { d.close(); fail(t.error); };
    t.onabort = () => { d.close(); fail(t.error || new Error('запись прервана')); };
  });
}

export async function pack(text) {
  if (typeof CompressionStream === 'undefined') return {gz: false, data: text};
  const buf = await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  return {gz: true, data: new Uint8Array(buf)};
}
export async function unpack(bytes) {
  if (typeof bytes === 'string') return bytes;
  const gz = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!gz) return new TextDecoder().decode(bytes);
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

// a file name from a title: letters and digits, the rest becomes dashes
// a file name in Latin letters (some browsers drop a name in Cyrillic and save «download»)
const LAT = {а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'};
export const latinTitle = s => fileTitle([...String(s).toLowerCase()].map(c => LAT[c] ?? c).join(''));
export const fileTitle = s => String(s).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'forest';

// the viewer's `downloads` capability on claude.ai, or null elsewhere
const downloads = async () => (typeof window !== 'undefined' && window.claude?.use ? window.claude.use('downloads').catch(() => null) : null);

// On claude.ai the page cannot download by itself: the viewer's `downloads` capability offers the
// file (only plain .json is allowed there). Elsewhere a gzip file is downloaded directly.
export async function offerFile(base, text) {
  const host = await downloads();
  if (host) {
    try { await host.save({filename: base + '.json', data: text}); return 'saved'; }
    catch (e) { if (e?.code === 'declined') return 'declined'; throw new Error(e?.message || 'сохранение файла недоступно'); }
  }
  const {gz, data} = await pack(text);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], {type: gz ? 'application/gzip' : 'application/json'}));
  a.download = base + (gz ? '.gz' : '.json');
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'saved';
}

// a text file (a chronicle): plain .txt, or on claude.ai the viewer's `downloads` (.json with the text in it)
export async function offerText(base, text) {
  const host = await downloads();
  if (host) {
    try { await host.save({filename: base + '.json', data: JSON.stringify({title: base, text})}); return 'saved'; }
    catch (e) { if (e?.code === 'declined') return 'declined'; throw new Error(e?.message || 'сохранение файла недоступно'); }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type: 'text/plain;charset=utf-8'}));
  a.download = base + '.txt';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'saved';
}

// a file as it is (a table's .csv or .json, the table edits): on claude.ai through the viewer's `downloads` (only .json
// goes there: another kind is saved inside a .json as {title, text}), elsewhere downloaded under its own name
export async function offerPlain(name, text, type = 'application/json') {
  const host = await downloads();
  if (host) {
    const json = name.endsWith('.json');
    try { await host.save({filename: json ? name : name + '.json', data: json ? text : JSON.stringify({title: name, text})}); return 'saved'; }
    catch (e) { if (e?.code === 'declined') return 'declined'; throw new Error(e?.message || 'сохранение файла недоступно'); }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type}));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'saved';
}

export const readFile = async file => JSON.parse(await unpack(new Uint8Array(await file.arrayBuffer())));
