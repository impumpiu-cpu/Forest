// The make-up of a band from the hostile lands (data/raids.js: the bands, and the numbers RAIDER, YARDSTICK, BAND): what
// one member of level t is worth, the yardstick of a raid's size, filling a budget with heads — one by one or link by link
// (data/roles.js LINKS) —, the war beasts a beast-driver brings, the golems of a dwarven band, what each member carries.
// The bands' rows call these (`members`); the colony's raids (settlement/raiders.js), the campaign's camps
// (campaign/camp.js) and the threat (settlement/threat.js) read the strengths.
import {pick, weighted} from '../core/util.js';
import {SPECIES, isMindless} from '../data/species.js';
import {ITEMS} from '../data/items.js';
import {hasSense} from '../data/tongues.js';
import {expectedStrength} from '../agents/strength.js';
import {roleKit, drawRole, mixOf, LINKS, ROLE_TIERS, COMBAT_ROLES} from '../data/roles.js';
import {mountUp} from '../agents/mount.js';
import {golemOf, GOLEM_METALS} from '../data/constructs.js';
import {refreshBody} from '../agents/special.js';
import {RAIDER, YARDSTICK, BAND} from '../data/raids.js';

// Raiders of level t: the more the enemy has learned, the tougher and the better shots its people are
// (settlement/raiders.js puts this on every member as the band arrives; the numbers: data/raids.js RAIDER)
export const raiderBody = t => ({hp: Math.min(RAIDER.hp.max, RAIDER.hp.base + t * RAIDER.hp.per), ranged: Math.min(RAIDER.ranged.max, RAIDER.ranged.base + t * RAIDER.ranged.per)});

// what one member of a band of level t is worth (КС), on average: in its fighting role (data/roles.js), or over the roles
// its species takes (`role` null), with the gear a band of that level brings, as it will be given out on arrival
export function memberStrength(species, t, role = null) {
  const L = Math.max(0, Math.floor(t)), body = raiderBody(L);
  return expectedStrength(species, {key: `role:${role || '*'}|${L}`, kit: rng => kitFor(species, rng, L, role),
    prepare: a => {
      if (SPECIES.get(species).behaviours) { a.marks = ['trained']; refreshBody(a); }   // a band's beast is trained (data/migrations.js)
      if (role && COMBAT_ROLES.get(role)?.mount) mountUp(a, COMBAT_ROLES.get(role).mount);   // a rider and its beast (agents/mount.js)
      a.hp = (a.maxHp || 1) * body.hp; a.skill = {ranged: body.ranged};
    }});
}
// The yardstick of a raid's size (settlement/threat.js): what «a band of five» means is five raiders of the old days,
// whatever the bands bring now — clubs and slings in rags early, spears, shields, bows and leather later. A band of
// roles buys its fighters with this budget: fewer heads, each better armed, the same strength (КС) in all
export function yardstickKit(rng, t) {
  const Y = YARDSTICK, P = Y.plates;
  const set = pick(rng, rng() < Math.min(Y.lateAt.max, t * Y.lateAt.per) ? Y.late : Y.early);
  const r = rng(), leather = Math.min(Y.leather.max, t * Y.leather.per), plates = t > P.from ? Math.min(P.max, (t - P.from) * P.per) : 0;
  return [...set, ...(r < plates ? ['hardleather'] : r < plates + leather ? ['jerkin'] : r < plates + leather + Y.clothes ? ['clothes'] : [])];
}
// one raider of level t by that yardstick
export function raiderStrength(t) {
  const L = Math.max(0, Math.floor(t)), body = raiderBody(L);
  return expectedStrength('human', {key: `yardstick|${L}`, kit: rng => yardstickKit(rng, L), prepare: a => { a.hp = (a.maxHp || 1) * body.hp; a.skill = {ranged: body.ranged}; }});
}
// A band of links (data/roles.js LINKS): a link drawn by the band's weights, its places filled in order — each with one of
// the band's species that may take the role (its weight in the band × in «Роли видов», `max` as for fill) — then the
// next link, while the budget lasts by the same rule as fill. The rest of the mix comes in among them by its share of
// its weight: the beasts (no hands, no roles) and those whose roles none of the band's links has a place for (an ogre
// with the orcs: a brute, drawn its role of its own). Every member of a link knows it (`linkNo`, `linkKind`).
function fillLinks(rng, budget, mix, t, links, {extra, max, up, cost}) {
  const places = new Set(links.flatMap(([id]) => (LINKS.has(id) ? LINKS.get(id).roles : [])));
  const linked = sp => SPECIES.get(sp).inventory && Object.keys(mixOf(sp)).some(r => places.has(r) && mixOf(sp)[r] > 0);
  const out = [...extra], people = mix.filter(([sp, wt]) => wt > 0 && linked(sp)), beasts = mix.filter(([sp, wt]) => wt > 0 && !linked(sp));
  const P = people.reduce((s, m) => s + m[1], 0), B = beasts.reduce((s, m) => s + m[1], 0);
  let left = budget - extra.reduce((s, m) => s + memberStrength(m.species, t), 0), no = 0, kind = null, slot = 0;
  const fits = c => (up ? left > 0 : c / 2 <= left);
  const under = sp => out.filter(m => m.species === sp).length < (max[sp] ?? Infinity);
  for (let guard = 0; guard < BAND.linkGuard && out.length < BAND.max; guard++) {
    // a war beast now and then, as thick as the band's mix has them
    if (B > 0 && rng() < B / (P + B)) {
      const sp = weighted(rng, beasts.filter(([s]) => under(s) && fits(cost(s))));
      if (!sp) { if (!P) break; continue; }
      const role = SPECIES.get(sp).inventory ? drawRole(rng, sp) : null;   // an ogre: a brute of its own, in no link
      out.push({species: sp, ...(role ? {role} : {})}); left -= cost(sp, role); continue;
    }
    if (!P) continue;
    if (!kind || slot >= LINKS.get(kind).roles.length) { kind = weighted(rng, links.filter(([id]) => LINKS.has(id))); no++; slot = 0; }
    const role = LINKS.get(kind).roles[slot++];
    const sp = weighted(rng, people.map(([s, wt]) => [s, wt * (mixOf(s)[role] || 0)]).filter(([s, wt]) => wt > 0 && under(s)));
    if (!sp) continue;   // nobody of this band takes the role: the place stays empty
    if (!fits(cost(sp, role))) { if (fits(cost(sp))) continue; break; }   // too dear: the cheaper places may still fit
    out.push({species: sp, role, linkNo: no, linkKind: kind}); left -= cost(sp, role);
  }
  if (!out.length) { const sp = (people[0] || mix[0])[0], role = SPECIES.get(sp).inventory ? drawRole(rng, sp) : null; out.push({species: sp, ...(role ? {role} : {})}); }
  return out.slice(0, BAND.max);
}

// the war beasts a beast-driver brings (role `lead`, data/roles.js): of the land's beasts and monsters, as thick as they
// live there (o.here, a world cell) or the band's own `led` kinds on the polygon
export function withLed(rng, list, o, led = BAND.led) {
  const here = o?.here ? Object.entries(o.here).filter(([id, v]) => v > 0 && ['beast', 'monster'].includes(SPECIES.get(id).kind) && SPECIES.get(id).mind !== 'sentient') : led.map(id => [id, 1]);
  if (!here.length) return list;
  const out = [...list];
  for (const m of list) {
    const L = m.role && COMBAT_ROLES.get(m.role)?.lead; if (!L) continue;
    const n = L[0] + Math.floor(rng() * (L[1] - L[0] + 1));
    for (let k = 0; k < n && out.length < BAND.max; k++) out.push({species: weighted(rng, here)});
  }
  return out;
}

// a budget counted in such bandits, for the bands that change their make-up with size
export const heads = (budget, t) => budget / raiderStrength(t);

// Fill the budget with species drawn from `mix` ([[species, weight], …]): a member is taken while it brings
// the band's expected rating closer to the budget (at least half of it fits into what is left, so a band of
// big creatures comes out over as often as under; with `up` — while anything of the budget is left, so the heads are
// rounded up: a campaign's foe, data/camp.js CAMP.foe); `max` caps a
// species by head count ({ogre: 2}); `extra` — members who come anyway (a necromancer), paid from the budget
// too. At least one member; no more than BAND.max.
export function fill(rng, budget, mix, t, {extra = [], max = {}, up = false, here = null, roles = null, least = null, links = null} = {}) {
  const cost = (sp, role = null) => memberStrength(sp, t, role);
  if (here) mix = mix.map(([sp, wt]) => [sp, wt * (here[sp] ?? 1)]);   // the war beasts only as many as live about (data/raids.js BAND_BEASTS)
  if (links?.length) return fillLinks(rng, budget, mix, t, links, {extra, max, up, cost});
  const out = [...extra];
  let left = budget - extra.reduce((s, m) => s + memberStrength(m.species, t), 0);
  for (let guard = 0; guard < BAND.guard; guard++) {
    const fits = mix.filter(([sp, wt]) => wt > 0 && (up ? left > 0 : cost(sp) / 2 <= left) && out.filter(m => m.species === sp).length < (max[sp] ?? Infinity));
    if (!fits.length) break;
    let r = rng() * fits.reduce((s, m) => s + m[1], 0), sp = fits[0][0];
    for (const [s, wt] of fits) { r -= wt; if (r <= 0) { sp = s; break; } }
    // its fighting role (data/roles.js): what the band still lacks first, then by the species' weights
    const role = SPECIES.get(sp).inventory ? drawRole(rng, sp, {bias: roles, least, have: out.filter(m => m.species === sp).map(m => m.role)}) : null;
    out.push({species: sp, ...(role ? {role} : {})}); left -= cost(sp, role);
  }
  if (!out.length) { const sp = (mix.find(m => m[1] > 0) || mix[0])[0], role = SPECIES.get(sp).inventory ? drawRole(rng, sp, {bias: roles, least}) : null; out.push({species: sp, ...(role ? {role} : {})}); }
  return out.slice(0, BAND.max);
}

// what a member of a band carries: the kit of its fighting role (data/roles.js); species without hands carry nothing
// (with no role given, one is drawn from the species' row: a creature that comes outside a band, the arena)
export const kitFor = (species, rng, t, role = null) => (SPECIES.get(species).inventory ? withTorch(species, roleKit(species, role ?? drawRole(rng, species), rng, t)) : []);
// one who does not see in the dark carries a torch (data/balance/forms.js torch): in a free hand, else behind the back
export const TORCH_ITEM = 'torch';
function withTorch(species, kit) {
  if (hasSense(species, 'darkvision') || isMindless(SPECIES.get(species))) return kit;
  const defs = kit.map(tok => { const id = String(tok).split(/[~+@$!]/)[0]; return ITEMS.has(id) ? ITEMS.get(id) : null; });
  const hands = defs.reduce((s, d) => s + (d?.slot === 'hand' ? d.hands || 1 : 0), 0), back = defs.some(d => d?.slot === 'back');
  return hands < 2 || !back ? [...kit, TORCH_ITEM] : kit;   // (both hands taken: behind the back — agents/equipment.js dress)
}

// the golem a dwarven band of level t brings: of the best metal its level opens (data/roles.js ROLE_TIERS), none below bronze
export const golemFor = t => { const k = ROLE_TIERS.from.reduce((b, f, i) => (t >= f ? i : b), 0); return k > 0 ? golemOf(GOLEM_METALS[Math.min(k, GOLEM_METALS.length) - 1]) : null; };
