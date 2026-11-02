// The pictures (src/art/**/*.svg, docs/ART.md): src/art/sprites.js is made from the files as they are now; every file
// keeps to the contract (what it draws is read, its colours are tokens of src/art/palette.js or CSS colours, its points
// are where the painters look for them); and how much of the game has a picture yet — the rest is drawn as the scheme.
// `npm run art:check`; in `npm test`.
import {buildSprites, OUT} from './art-build.mjs';
import {readFileSync, existsSync} from 'node:fs';
import {PALETTE} from '../src/art/palette.js';

const bad = [];
const {text, count, problems} = buildSprites({write: false});
if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== text) bad.push('src/art/sprites.js отстал от SVG-файлов: npm run art');
bad.push(...problems);

const {SPRITES} = await import('../src/art/sprites.js');
const CSS = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|black|white|none|transparent|currentColor)$/i;
for (const [k, s] of Object.entries(SPRITES)) {
  for (const q of s.parts) for (const c of [q.f, q.s]) if (c && !(c in PALETTE) && !CSS.test(c) && !['skin', 'hair', 'beard', 'cloth', 'faction', 'armor', 'metal', 'fur', 'hide', 'eye', 'trim'].includes(c)) bad.push(`${k}: неизвестный цвет «${c}» (palette.js или #hex)`);
  const need = k.startsWith('bodies/') && k !== 'bodies/hand' ? ['head', 'hand', 'off', 'back'] : k.startsWith('held/') ? ['grip'] : k.startsWith('back/') ? ['strap'] : [];
  for (const n of need) if (!s.anchors?.[n]) bad.push(`${k}: нет точки data-anchor="${n}"`);
}

// how much is drawn: the game's things against the pictures there are
const {SPECIES} = await import('../src/data/species.js');
const {BUILDINGS} = await import('../src/data/buildings.js');
const {WORLD_PEOPLES, TIERS} = await import('../src/data/peoples.js');
const {LAIRS} = await import('../src/data/lairs.js');
const {coverage} = await import('../src/render/art/coverage.js');
const lines = coverage(SPRITES, {SPECIES, BUILDINGS, WORLD_PEOPLES, TIERS, LAIRS});

if (bad.length) { console.log('Картинки:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`ok   картинки: ${count} файлов, sprites.js свеж; ${lines.join('; ')}`);
