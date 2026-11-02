// The look of the maps: «Картинки» (render/art/, the pictures of src/art/) or «Схема» (the plain marks the maps have
// always drawn — circles, letters, squares: the test look). One switch for every map, kept in this browser.
// Switching tells the screens with a document event; each map draws itself again (ui/atlasView.js wireCamera,
// ui/campaignView.js). The look only reads the world: neither changes what happens in it.
const KEY = 'forest.skin';
export const SKIN_EVENT = 'forest-skin';
export const SKINS = [{id: 'art', label: 'Картинки'}, {id: 'scheme', label: 'Схема'}];

function load() { try { const v = localStorage.getItem(KEY); return v === 'scheme' ? 'scheme' : 'art'; } catch (e) { return 'art'; } }
let mode = typeof localStorage === 'undefined' ? 'art' : load();

export const skin = {
  get mode() { return mode; },
  get art() { return mode === 'art'; },
  set(m) {
    if (m !== 'art' && m !== 'scheme') return;
    mode = m;
    try { localStorage.setItem(KEY, m); } catch (e) { /* storage unavailable */ }
    if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent(SKIN_EVENT, {detail: m}));
  },
  toggle() { this.set(mode === 'art' ? 'scheme' : 'art'); },
  label() { return SKINS.find(s => s.id === mode).label; },
};

// a button that shows and flips the look (forest.html: next to the zoom buttons of each map)
export function wireSkinButton(btn) {
  if (!btn) return;
  const show = () => {
    btn.setAttribute('aria-pressed', String(skin.art));
    btn.title = `Оформление: ${skin.label()} — нажмите или клавиша G, чтобы переключить (${skin.art ? 'на схему' : 'на картинки'})`;
  };
  btn.addEventListener('click', () => skin.toggle());
  document.addEventListener(SKIN_EVENT, show);
  show();
}
