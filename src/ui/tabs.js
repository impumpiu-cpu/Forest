// The dock's tabs under the map (the observer's layout, docs/GAME.md): buttons `[data-tab]` show the pane `[data-pane]`
// of the same name; the tab chosen is remembered per dock in this browser. `openTab(box, id)` switches from code
// (a click on the map opens «Объект»).
const KEY = id => `forest.tab.${id}`;

export function mountTabs(box) {
  if (!box || box.dataset.tabs) return;
  box.dataset.tabs = '1';
  let cur = null;
  try { cur = localStorage.getItem(KEY(box.id)); } catch (e) { /* storage unavailable */ }
  const tabs = [...box.querySelectorAll('[data-tab]')];
  if (!tabs.some(b => b.dataset.tab === cur)) cur = tabs[0]?.dataset.tab;
  box.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b && box.contains(b)) openTab(box, b.dataset.tab); });
  openTab(box, cur);
}

export function openTab(box, id) {
  if (!box) return;
  box.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === id)));
  box.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== id; });
  try { localStorage.setItem(KEY(box.id), id); } catch (e) { /* storage unavailable */ }
}
