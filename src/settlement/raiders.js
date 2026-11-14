// A band from the hostile lands on the local map (data/migrations.js `raiders`; the bands: data/raids.js, their make-up:
// outside/bands.js): who comes — each member with its kit, fighting role, link, mount, potions and the trained mark of a war
// beast — and what is done as the band arrives: its toughness and aim by the threat, its champion, its squad and its ranks.
import {bandLevel} from '../data/classes.js';
import {mountUp} from '../agents/mount.js';
import {POTION, FOE_BELTS} from '../data/potions.js';
import {raidThreat} from './threat.js';
import {RAID_BANDS, BAND_BEASTS} from '../data/raids.js';
import {kitFor, raiderBody} from '../outside/bands.js';
import {formLinks, formUndeadLinks, trimBand} from '../agents/ranks.js';
import {RANK_RULES} from '../data/ranks.js';
import {sideStrength, strengthOf} from '../agents/strength.js';
import {COMBAT_ROLES} from '../data/roles.js';
import {faunaLevel} from '../world/region.js';
import {createSquad} from '../agents/squad.js';
import {SPECIES} from '../data/species.js';
import {refreshBody} from '../agents/special.js';

// the members of a band the provider sends (n: a budget in strength rating, КС); a campaign's camp (campaign/camp.js) adds
// `fill` options: `up` — the heads rounded up, `max` — the caps lifted; `beasts`, `atLeast` — see below
export function raidMembers(w, rng, n, opts) {
  const band = RAID_BANDS.get(opts.band || 'bandits'), t = raidThreat(w);
  // on a world cell the war beasts come as thick as they live there (data/raids.js BAND_BEASTS)
  const here = w.site?.world ? Object.fromEntries(SPECIES.filter(sp => sp.behaviours && sp.habitat).map(sp => [sp.id, Math.min(1, faunaLevel(w, sp.id) / BAND_BEASTS.full)])) : null;
  const list = band.members(w, rng, n, t, {...(opts.fill || {}), ...(here ? {here} : {})});
  // beasts that joined the band on the way (campaign/camp.js: a camp's foe of two kinds) — its war beasts
  if (opts.beasts) for (let k = 0; k < opts.beasts.n; k++) list.push({species: opts.beasts.species});
  // a boss's retinue (campaign/camp.js): at least this many, made up with more of the band's most numerous kind
  if (opts.atLeast) { const most = list.map(m => m.species).sort((p, q) => list.filter(x => x.species === q).length - list.filter(x => x.species === p).length)[0]; while (list.length < opts.atLeast) list.push({...list.find(m => m.species === most)}); }
  return list.map(m => ({...m, kit: m.kit || kitFor(m.species, rng, t, m.role),
    init: (a, w) => {
      a.band = band.id;
      if (m.role && COMBAT_ROLES.get(m.role).mount) mountUp(a, COMBAT_ROLES.get(m.role).mount);   // a rider on its beast (agents/mount.js)
      if (m.role) { a.fightRole = m.role; a.level = Math.max(a.level || 1, bandLevel(t)); }   // its fighting role (data/roles.js): what it carries, where it stands in the band; its band's level — its class's way (data/classes.js)
      if (m.linkNo != null) { a.linkNo = m.linkNo; a.linkKind = m.linkKind; }   // the link of the band it came in (data/roles.js LINKS)
      if (SPECIES.get(m.species).inventory && w.rngs.outside() < POTION.foe) a.potions = 1;   // a healing potion, rarely (agents/potions.js)
      const belt = m.role ? COMBAT_ROLES.get(m.role).potions || 0 : 0; if (belt > (a.potions || 0)) a.potions = belt;   // a healer's belt
      if (SPECIES.get(m.species).inventory) for (const [res, p] of Object.entries(FOE_BELTS[m.species] || {})) if ((a.belt?.length || 0) < POTION.belt && w.rngs.outside() < p) (a.belt ||= []).push(res);   // its people's potions (data/potions.js FOE_BELTS)
      if (!m.init) a.name = SPECIES.get(m.species).label.replace(/^./, c => c.toUpperCase()); else m.init(a, w);
      // a war beast (a warg with orcs, a hyena with gnolls) follows the band, not its own brain
      // — trained (data/conditions.js «выученный»): stronger than a wild one, it does not run while it lives
      if (SPECIES.get(m.species).behaviours) { a.brain = 'raider'; a.warBeast = true; a.marks = [...(a.marks || []), 'trained']; refreshBody(a); }
    }}));
}

// the band as it arrives: its body by the threat, its champion, one squad, its ranks
export function raidArrives(group, w) {
  const t = raidThreat(w); w.stats.raids++;
  const big = w.chronicle.biggestRaid;
  if (!big || group.length > big.size) w.chronicle.biggestRaid = {size: group.length, tick: w.tick};
  const body = raiderBody(t);
  for (const a of group) { a.hp = (a.maxHp || 1) * body.hp; a.skill = {ranged: body.ranged}; a.skillVer = 1; }
  RAID_BANDS.get(group[0].band).groupInit?.(group, w);
  // a band of champions (data/raids.js `champion`: the greenskins): its strongest fighter grows into one — never two
  if (RAID_BANDS.get(group[0].band).champion) {
    const best = group.filter(a => !a.warBeast && SPECIES.get(a.species).inventory).sort((x, y) => strengthOf(y) - strengthOf(x))[0];
    if (best) { best.marks = [...(best.marks || []), 'champion']; refreshBody(best); best.hp = best.maxHp || best.hp; best.name = `Чемпион ${best.name}`; }
  }
  const sq = createSquad(w, group);   // one plan for the band: goal, roles, morale (agents/squad.js)
  // ranks on a settlement's raids (agents/ranks.js): only where data/ranks.js says so (a campaign's camp ranks its foe
  // itself); officers and wights are worth more than the band was bought for — its weakest pawns stay home
  if (!w.campaign) {
    const bought = sideStrength(group, {now: true});
    const made = formLinks(w, group, 'settlement', sq.leader).length + formUndeadLinks(w, group, 'settlement').length;
    if (made) trimBand(w, group, bought * RANK_RULES.pay.settlement);
  }
}
