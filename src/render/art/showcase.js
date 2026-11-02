import {HAIR} from '../../art/palette.js';

// What the gallery (gallery.html, src/app/gallery.js) shows: the races of the pawns, the kits they wear, the sheets of
// pictures by folder of src/art/ and the colours they are shown in. Not used by the game.
const SKIN = {human: '#e2b48c', elf: '#f1dcc0', dwarf: '#d59a78', orc: '#6f9a4a', goblin: '#8fb04c', ogre: '#9b8a6a', troll: '#4f8f86', gnoll: '#a8925e'};

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
    {prefix: 'heads/', title: 'Головы', colors: k => ({skin: SKIN[k.split('/')[1]] || '#e2b48c', hair: HAIR[k.split('/')[1]], beard: HAIR[k.split('/')[1]], cloth: '#3f6fb5'})},
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
