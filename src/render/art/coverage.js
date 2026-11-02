// How much of the game has a picture (tools/art-check.mjs, the gallery): each kind of thing the maps draw against the
// pictures of src/art/ that would draw it. What has none is drawn as the scheme.
export const LAIR_BASE = {
  griffin: 'nest', wyvern: 'nest', drake: 'cave', dragon: 'cave', spider: 'web', stoneworm: 'cave', bat: 'cave', varg: 'den',
  goblins: 'camp', gnolls: 'camp', ogres: 'camp', trolls: 'camp', swamptrolls: 'camp', icetrolls: 'camp', giants: 'camp',
  wights: 'barrow', ghouls: 'barrow', necromancer: 'tower', vampire: 'manor', rift: 'rift',
};

export function coverage(SPRITES, {SPECIES, BUILDINGS, WORLD_PEOPLES, TIERS, LAIRS}) {
  const has = k => Object.prototype.hasOwnProperty.call(SPRITES, k);
  const count = (label, list, key) => { const n = list.filter(x => has(key(x))).length; return `${label} ${n}/${list.length}`; };
  const persons = SPECIES.all().filter(s => s.look?.shape === 'person');
  const shapes = [...new Set(SPECIES.all().map(s => s.look?.shape).filter(s => s && s !== 'person'))];
  const towns = WORLD_PEOPLES.all().flatMap(p => [0, 1, 2].map(t => `${p.id}-${t}`));
  return [
    count('головы', persons, s => `heads/${s.look.head || s.id}`),
    count('звери', shapes, s => `beasts/${s}`),
    count('постройки', BUILDINGS.all(), d => `buildings/${d.id}`),
    count('города', towns, t => `towns/${t}`),
    count('логова', LAIRS.all(), l => `lairs/${LAIR_BASE[l.id] || l.id}`),
  ];
}
