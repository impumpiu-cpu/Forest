// Shown in the menu and in the game header, so a screenshot tells which build it came from.
// tools/build.mjs stamps the commit into a local build, dist/forest.html (not kept in git).
export const VERSION = '0.63.0 Table · 23.10.2026';
export const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'исходники';
