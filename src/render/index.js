// What the world map's frame looks up by id — a town, a realm, a lair — as maps, made again only when a list changed
// (another array or a new length: the lists of a world only grow, ids are never reused). The objects are the live ones,
// so what they say (alive, capital, role) is read as it is now. Read only by the screen (ui/atlasView.js,
// render/art/world.js), never by the simulation.
const INDEX = new WeakMap();

export function byId(a) {
  let I = INDEX.get(a);
  const t = a.towns || [], r = a.realms || [], l = a.lairs || [];
  if (!I || I.t !== t || I.tn !== t.length || I.r !== r || I.rn !== r.length || I.l !== l || I.ln !== l.length) {
    I = {t, tn: t.length, r, rn: r.length, l, ln: l.length,
      town: new Map(t.map(x => [x.id, x])), realm: new Map(r.map(x => [x.id, x])), lair: new Map(l.map(x => [x.id, x]))};
    INDEX.set(a, I);
  }
  return I;
}
