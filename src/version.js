// Shown in the menu and in the game header, so a screenshot tells which build it came from.
// tools/build.mjs stamps the commit into the bundled dist/forest.html.
export const VERSION = '0.25 · 13.10.2026';
export const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'исходники';
