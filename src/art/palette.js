// The colours of the pictures (src/art/**/*.svg, docs/ART.md). A picture names a colour by a token — fill="skin",
// stroke="ink" — and the painter (render/art/sprite.js) puts in the colour: first what the caller gives for this one
// thing (the skin of its race, the colour of its realm, the metal of its blade), then this table, then the word itself
// as a CSS colour (#hex in the file is drawn as it is).
export const PALETTE = {
  ink: '#231f20',          // the outline and the lines of a face
  light: '#ffffff',        // eyes, teeth, tusks
  shade: 'rgba(35,31,32,0.22)',   // a flat shadow laid over a fill
  shine: 'rgba(255,255,255,0.35)',

  // filled by the caller; these are only the fallbacks
  skin: '#e2b48c', hair: '#6b4528', beard: '#8f4a1c', eye: '#3b6b4a',
  faction: '#7a7f86', cloth: '#9c8f74', trim: '#e8dcb8', armor: '#9aa3ab', metal: '#c4ccd4', fur: '#8d8f96', hide: '#7a5232',

  // materials
  wood: '#8a6a3c', darkwood: '#5e4528', plank: '#b08a55', thatch: '#d2b462', straw: '#e3cf86',
  stone: '#a7a39a', darkstone: '#6f6c66', brick: '#b5644a', clay: '#c98a5a', roof: '#9a4a36', slate: '#5d6670',
  leaf: '#5f9a3e', darkleaf: '#3f7a34', grass: '#7da24f', water: '#5a9bd0', soil: '#7a5a3a', snow: '#eef3f6',
  fire: '#ff9a2a', flame: '#ffd36a', smoke: 'rgba(120,120,120,0.55)', gold: '#e3c14a', silver: '#d8dee3',
  bone: '#ece2c8', blood: '#9a2a22', canvas: '#e6d6b0', rope: '#c8a868', leather: '#8a5a2b', iron: '#8f989f',
  bronze: '#c89048', steel: '#c4ccd4', mithril: '#9fe0ff', copper: '#c87a48', crystal: '#a8e0f0', magic: '#b07ae8',
  rot: '#7b8a5a', ghost: '#cfe0e8', night: '#2d2a3a', ember: '#c8321e',

  // marks of state (render/art/marks)
  alarm: '#4198d6', anger: '#ff9500', sleep: '#c8d0e0', hurt: '#e05040',
};

// the metal a material is drawn in (data/items.js `material`)
export const METAL = {bronze: '#c89048', copper: '#c87a48', iron: '#9aa3ab', steel: '#d4dbe2', mithril: '#9fe0ff', silver: '#e4e8ec',
  gold: '#e3c14a', bone: '#ece2c8', wood: '#a5794a', stone: '#a7a39a', flint: '#6f6c66', obsidian: '#3a3440'};
