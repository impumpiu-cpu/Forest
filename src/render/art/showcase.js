import {SPECIES} from '../../data/species.js';
import {HAIRS} from '../../data/looks.js';

// What the gallery (gallery.html, src/app/gallery.js) shows: the races of the pawns, the kits they wear, the sheets of
// pictures by folder of src/art/ and the colours they are shown in. Not used by the game.
// a head's colours: its race's skin (look.skin) and first hair (data/looks.js HAIRS)
const race = k => k.split('/')[1];
const skinOf = id => (SPECIES.has(id) && SPECIES.get(id).look?.skin) || '#e2b48c';

export const SHOWCASE = {
  races: ['human', 'halfling', 'giant', 'elf', 'darkelf', 'dwarf', 'orc', 'goblin', 'ogre', 'troll', 'gnoll', 'zombie', 'skeleton', 'upyr', 'vampire', 'necromancer'],
  kits: [
    {},
    {body: 'jerkin', right: 'spear'},
    {body: 'chainmail', right: 'sword', left: 'ironshield'},
    {body: 'steellamellar', right: 'steelwarhammer', two: true},
    {body: 'furcoat', right: 'bow', two: true, back: 'quiver'},
    {body: 'scalemail', right: 'ironaxe', left: 'shield'},
    {body: 'bronzemail', right: 'torch'},
    {body: 'mithrilscale', right: 'mithrilsword', left: 'steelshield'},
  ],
  sheets: [
    {prefix: 'heads/', title: 'Головы', colors: k => ({skin: skinOf(race(k)), hair: HAIRS[race(k)]?.[0], beard: HAIRS[race(k)]?.[0], cloth: '#3f6fb5'})},
    {prefix: 'bodies/', title: 'Тела (без брони и с латами)', flags: k => (k.endsWith('stout') || k.endsWith('broad') ? new Set(['plate', 'mail', 'heavy']) : null), colors: () => ({cloth: '#3f6fb5', armor: '#b4bcc2'})},
    {prefix: 'held/', title: 'В руках', colors: () => ({faction: '#b5443a', metal: '#c4ccd4'})},
    {prefix: 'back/', title: 'За спиной'},
    {prefix: 'marks/', title: 'Знаки состояния', colors: () => ({faction: '#3f6fb5'})},
    {prefix: 'beasts/', title: 'Звери и чудовища', colors: () => ({fur: '#8d8f96', hide: '#7a5232'}), flags: () => new Set(['up'])},
    {prefix: 'buildings/', title: 'Постройки', sizes: [24, 48, 96], colors: () => ({faction: '#3f6fb5'}), flags: () => new Set(['done'])},
    {prefix: 'towns/', title: 'Города мира', sizes: [14, 24, 40, 80], colors: () => ({faction: '#3f6fb5'})},
    {prefix: 'parties/', title: 'Отряды', sizes: [14, 24, 40, 80], colors: () => ({faction: '#b5443a'})},
    {prefix: 'lairs/', title: 'Логова', sizes: [14, 24, 40, 80]},
    {prefix: 'map/', title: 'Знаки карты мира', sizes: [14, 24, 40, 80], colors: () => ({faction: '#3f6fb5'})},
  ],
};
