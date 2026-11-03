// The pictures of things (src/art/**/*.svg, docs/ART.md): which picture a row of a table is drawn with, keyed by its id,
// as data/balance/prices.js keys the prices. The painters (src/render/art/) read these and fall back to the row's own id
// (`lairs/<id>`, `map/site-<id>`); a new row needs a line here only when it shares another's picture. The town's walls
// and ports are read from data/townBuildings.js itself (`line: 'wall'`, a wall of stone takes stone; PORT_LINES below).
//
//   LAIRS      lair id (data/lairs.js) → the base picture lairs/<base>.svg
//   SITES      town building id (data/townBuildings.js) → the mark of its works on the world map, map/site-<mark>.svg
//   HIDDEN_WALLS the town buildings of the line «wall» that are not seen as walls (tunnels, hidden paths)
//   PORT_LINES the lines of town buildings (data/townBuildings.js `line`) that make a town a port in its picture; the
//              line of the fishing piers only from their tier (the pier), not the fishers' huts: PORT_IDS
//   BODIES     species id (data/races.js, data/monsters.js) → its body, bodies/<body>.svg, when the row has no look.body
//   HAIRS      species id → the hair colours of its folk (one by the creature's id, so a crowd is not one head of hair);
//              one colour — all alike; none — '#4a3a2a'
//   ARMOR      the form of a body piece (data/balance/forms.js) → the flags of the body picture it is drawn with
//              (the plates: `heavy` too from the material's tier 2); garment — no armour drawn; others — a jerkin
export const LAIRS = {
  griffin: 'nest', wyvern: 'nest', drake: 'cave', dragon: 'cave', spider: 'web', stoneworm: 'cave', bat: 'cave', varg: 'den',
  goblins: 'camp', gnolls: 'camp', ogres: 'camp', trolls: 'camp', swamptrolls: 'camp', icetrolls: 'camp', giants: 'camp',
  wights: 'barrow', ghouls: 'barrow', necromancer: 'tower', vampire: 'manor', rift: 'rift',
};

export const SITES = {
  field: 'field', ploughland: 'field', garden: 'field', gatherer: 'grove', grove: 'grove', forestry: 'grove', woodcut: 'wood', sawmill: 'wood',
  charpit: 'wood', lodge: 'lodge', fishhut: 'fish', pier: 'fish', mineshaft: 'mine', deepmine: 'mine', placer: 'mine', props: 'mine', quarry: 'quarry',
  saltworks: 'salt', mushrooms: 'mushrooms', pen: 'pasture', pasture: 'pasture',
};

export const HIDDEN_WALLS = new Set(['tunnels', 'hiddenpaths']);

export const PORT_LINES = new Set(['harbor']);
export const PORT_IDS = new Set(['pier', 'riverpier']);

export const BODIES = {
  human: 'common', darkelf: 'common', zombie: 'common', upyr: 'common', halfling: 'small', goblin: 'small', elf: 'slim',
  dwarf: 'stout', orc: 'broad', gnoll: 'broad', giant: 'huge', ogre: 'huge', troll: 'huge', necromancer: 'robe', vampire: 'robe', skeleton: 'bones',
};

export const HAIRS = {
  human: ['#6b4528', '#2a2220', '#c8a050', '#9a4a26', '#8a8a86', '#4a3020'], halfling: ['#8a5a2b', '#c8a050', '#6b4528', '#9a4a26'],
  dwarf: ['#b5652a', '#6b4528', '#2a2220', '#d0b080', '#8a8a86', '#9a4a26'], giant: ['#4a3a2a', '#2a2220', '#8a5a2b'],
  elf: ['#e9d27a'], darkelf: ['#eceaf2'], orc: ['#2f3a20'], goblin: ['#3a3020'], ogre: ['#3e2e1e'], troll: ['#4f6a3a'], gnoll: ['#5e4630'],
};

export const ARMOR = {coat: ['coat'], jerkin: ['jerkin'], lamellar: ['plate', 'lamellar'], scale: ['plate', 'scale'], mail: ['plate', 'mail'], wicker: ['plate', 'wicker']};
