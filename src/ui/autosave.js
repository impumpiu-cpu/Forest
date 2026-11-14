// The campaign saved by itself (docs/GAME.md «Сохранения и миры», claude/roadmap.md Ф0): the world with the walk goes to
// the library of worlds without a button — at a season's boundary every AUTOSAVE.every of real time, when the screen is
// left and when the page is hidden — and the main menu's «Продолжить» opens the last walk from the day it was saved at.
//
// What is saved is what was seen: the core walks a season ahead and the screen plays it back (ui/campaignView.js), so
// the save at a boundary is taken before the next season is computed — the state the viewer has just watched to its end.
// A save on leaving takes the world as it stands: its last season is computed, perhaps not all of it shown. The same seed
// and the same state give the same walk (tools/campaign-check.mjs «сохранённый посреди похода мир идёт так же»), so a
// walk continued from either is the walk that would have been.
//
// The pointer to the last walk is a convenience of this browser (localStorage), not a part of the world: the world
// is in the library whatever becomes of it, and a pointer to a world no longer there is dropped.

export const AUTOSAVE = {
  every: 60000,   // ms of real time between saves at a season's boundary (a medium world takes ~0,2 s to write: not every season)
  key: 'forest.continue'};

// the pointer: {id, name, world, from, day, year, phase, done, savedAt}
export function lastRun() {
  try { const p = JSON.parse(localStorage.getItem(AUTOSAVE.key)); return p && p.id ? p : null; } catch (e) { return null; }
}
export function rememberRun(p) {
  try { localStorage.setItem(AUTOSAVE.key, JSON.stringify(p)); } catch (e) { /* storage unavailable */ }
}
export function forgetRun(id = null) {
  try { if (id == null || lastRun()?.id === id) localStorage.removeItem(AUTOSAVE.key); } catch (e) { /* storage unavailable */ }
}

// what «Продолжить» opens: the pointer, if its world is still in the library and its walk is not over
// (`index` — the library's index records, ui/worlds.js listWorlds)
export function continueOf(pointer, index) {
  if (!pointer || pointer.done) return null;
  const rec = index.find(r => r.id === pointer.id);
  return rec?.campaign || (pointer.guild && rec?.guild && rec.guild.phase !== 'over') ? {...pointer, name: rec.name} : null;   // (a walk, or a guild: ui/guildView.js)
}

// is a save at this season's boundary due: the walk changed since the last save, and the time has come
export const saveDue = (last, now, day) => !last || (last.day !== day && now - last.at >= AUTOSAVE.every);
