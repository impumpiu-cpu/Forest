// Ascension (Ver_E Э7; plan claude/xp-plan.md, decision 9; docs/CAMPAIGN.md «Вознесение»). A company that came home with
// the crown (phase 'won') may raise its living members: each goes as a snapshot into a registry kept outside every world
// (ui/heroes.js, the browser's store), with all it became — character, level, perks, maims and wounds for life — and with
// the gear on it. A new campaign from any capital that takes its race may summon up to ASCEND.max of them: each summoned
// takes a place in the core of eight, and is erased from the registry the moment it is chosen. It is mortal again; it goes
// up again only by finishing this road too. Not carried: bonds, memory, promises, the old id, a mount, gold.
//
// Everything here is pure: the registry is a plain object {v, heroes: []} handed in and handed back; the campaign keeps the
// snapshots it summoned whole in K.summoned, so a campaign replays from its seed and K with no registry at all.
import {SPECIES} from '../data/species.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {RETINUE} from '../data/campaign.js';
import {COMBAT_ROLES} from '../data/roles.js';
import {gearDef} from '../local/index.js';
import {townKin} from '../atlas/index.js';
import {ensureXp} from './experience.js';
import {say} from './march.js';

export const ASCEND = {version: 1, max: 4, keep: 50};   // max — summoned into one core; keep — the most the registry holds (oldest go)

export const emptyRegistry = () => ({v: ASCEND.version, heroes: []});

// who of the company may go up: the campaign came home with the crown, alive, free, of the company (not a captive, not one
// who left), not ascended already from it
export function mayAscend(K) {
  if (K.phase !== 'won' || K.ascended) return [];
  return K.members.filter(m => m.alive && !m.captive && !m.left);
}

const WORDS = {won: ['вернулся с короной', 'вернулась с короной'], lost: ['сгинул с караваном', 'сгинула с караваном'], timeout: ['не дождался конца пути', 'не дождалась конца пути']};
// one member as it goes up: what it is and what is on it (the gear: a word with marks, kept as it is — data/items.js)
export function snapshotOf(a, K, m) {
  const was = m.summoned || null;
  const lost = K.members.filter(x => x.died && !x.captive).map(x => x.name);
  return {
    v: ASCEND.version, uid: `${K.seed}:${m.id}:${a.hist?.year ?? 0}`,
    name: m.name, gender: m.gender, race: m.race, people: K.people, fight: m.fight || null, role: m.role,
    special: {...m.special}, align: m.align ? {...m.align} : null, values: m.values ? {...m.values} : null,
    local: m.local ? JSON.parse(JSON.stringify(m.local)) : null,
    xp: m.xp || 0, level: m.level || 1, xpBy: {...(m.xpBy || {})}, acts: {...(m.acts || {})}, workBy: {...(m.workBy || {})}, xpOf: {...(m.xpOf || {})},
    grew: (m.grew || []).map(g => ({...g, day: null})), perks: (m.perks || []).map(p => ({id: p.id, rank: p.rank, why: p.why})),
    maims: m.maims || 0, wounds: (m.wounds || []).filter(x => x.day == null).map(x => ({id: x.id, day: null})), scarAt: m.scarAt ? JSON.parse(JSON.stringify(m.scarAt)) : null,
    gear: {hand: [...(m.gear?.hand || [])], body: m.gear?.body ?? null}, belt: [...(m.belt || [])], potions: m.potions || 0,
    // the short story, for the summoning card and the fire (campaign/ascend.js summonLine, ui/campSocial.js)
    story: {walks: (was?.walks || 0) + 1, from: K.capitalName, people: K.people, year: a.hist?.year ?? null, ended: K.phase, endedWord: (WORDS[K.phase] || [K.phase, K.phase])[m.gender === 'f' ? 1 : 0],
      lost: lost.slice(0, 4), days: K.day, before: was ? {from: was.from, year: was.year} : null},
  };
}

// raise them: the registry with them added (the oldest dropped past ASCEND.keep), and the campaign marked
export function ascend(a, K, reg, members = mayAscend(K)) {
  const R = reg?.v === ASCEND.version ? {...reg, heroes: [...reg.heroes]} : emptyRegistry();
  const snaps = members.map(m => snapshotOf(a, K, m));
  R.heroes.push(...snaps.filter(s => !R.heroes.some(h => h.uid === s.uid)));
  while (R.heroes.length > ASCEND.keep) R.heroes.shift();
  K.ascended = {day: K.day, ids: members.map(m => m.id)};
  say(a, K, `Вознесены: ${members.map(m => m.name).join(', ')}. Их помнят — и однажды позовут снова.`, 'epilogue', false, members.map(m => m.id));
  return R;
}

// the races a capital takes into its core (the same kinds drawCore draws from: campaign/start.js)
export function racesOf(a, townId) {
  const t = a.towns.find(x => x.id === townId); if (!t) return new Set();
  const R = RETINUE[t.people], kinds = R?.kinds === 'kin' ? (townKin(a, t) || {[WORLD_PEOPLES.get(t.people).race]: 1}) : (R?.kinds || {});
  return new Set([...Object.entries(kinds).filter(([, w]) => w > 0).map(([sp]) => sp), WORLD_PEOPLES.get(t.people).race]);
}
// who of the registry this capital may summon
export const summonable = (a, townId, reg) => {
  const ok = racesOf(a, townId);
  return (reg?.heroes || []).filter(h => h.v === ASCEND.version && ok.has(h.race) && SPECIES.has(h.race));
};
// the chosen taken out of the registry at once (no undo): → {reg, snaps}
export function takeHeroes(reg, uids) {
  const pick = new Set((uids || []).slice(0, ASCEND.max));
  const snaps = (reg?.heroes || []).filter(h => pick.has(h.uid));
  // a piece this game no longer knows does not go with its owner: it stays in the registry, under the owner's name (reg.left)
  const left = snaps.map(h => ({uid: h.uid, name: h.name, items: [...h.gear.hand, h.gear.body].filter(id => id && !gearDef(id))})).filter(x => x.items.length);
  return {reg: {v: reg?.v ?? ASCEND.version, heroes: (reg?.heroes || []).filter(h => !pick.has(h.uid)), ...(reg?.left || left.length ? {left: [...(reg?.left || []), ...left]} : {})}, snaps};
}

// the summoned in the new core (campaign/start.js newCampaign, after the eight are drawn): each takes the place of one drawn —
// of its own fighting group if one is there, else the last not yet taken. Its gear: the pieces this game still knows (a word
// it does not know stays out — the registry keeps the snapshot it came from, K.summoned this one)
export function summonInto(a, K, snaps) {
  const take = (snaps || []).slice(0, ASCEND.max), used = new Set();
  K.summoned = take.map(s => JSON.parse(JSON.stringify(s)));
  for (const s of take) {
    const group = s.fight && COMBAT_ROLES.has(s.fight) ? COMBAT_ROLES.get(s.fight).group : null;
    const core = K.members.filter(m => m.core && !used.has(m.id));
    const at = core.find(m => group && m.fight && COMBAT_ROLES.get(m.fight)?.group === group) || core.at(-1); if (!at) break;
    used.add(at.id);
    const hand = s.gear.hand.filter(id => gearDef(id)), body = s.gear.body && gearDef(s.gear.body) ? s.gear.body : at.gear.body;
    Object.assign(at, {
      name: s.name, gender: s.gender, race: s.race, fight: s.fight && COMBAT_ROLES.has(s.fight) ? s.fight : at.fight, role: s.role || at.role,
      special: {...s.special}, align: s.align ? {...s.align} : at.align, values: s.values ? {...s.values} : at.values,
      local: s.local ? JSON.parse(JSON.stringify(s.local)) : at.local,
      xp: s.xp, level: s.level, xpBy: {...s.xpBy}, acts: {...s.acts}, workBy: {...s.workBy}, xpOf: {...s.xpOf},
      grew: [], perks: s.perks.map(p => ({id: p.id, rank: p.rank, day: 0, at: Array(p.rank).fill(0), why: p.why})),
      maims: s.maims, maimDays: Array(s.maims).fill(-1), wounds: s.wounds.length ? s.wounds.map(x => ({id: x.id, day: null, got: -1})) : null,
      scarAt: s.scarAt ? JSON.parse(JSON.stringify(s.scarAt)) : null,
      gear: {hand: hand.length ? hand : at.gear.hand, body}, belt: [...(s.belt || [])], potions: s.potions || at.potions || 0,
      summoned: {...s.story, uid: s.uid, level: s.level},
    });
    ensureXp(at);
  }
}
// the chronicle's line of the summoned, after the caravan's first line (campaign/start.js newCampaign)
export function sayStart(a, K) {
  if (K.summoned?.length) say(a, K, K.summoned.map(summonLine).join(' '), 'start', false, K.members.filter(m => m.summoned).map(m => m.id));
}
// «в прошлый раз…»: the line of one summoned (the chronicle at the start, the card)
export function summonLine(s) {
  const st = s.story || s, f = s.gender === 'f';
  return `${s.name} ${f ? 'призвана' : 'призван'} из вознесённых: в прошлый раз ${f ? 'шла' : 'шёл'} из ${st.from}${st.year != null ? ` (${st.year}-й год)` : ''} и ${st.endedWord}${st.walks > 1 ? `, это ${st.walks + 1}-й поход` : ''}${st.lost?.length ? `; там остались ${st.lost.join(', ')}` : ''}.`;
}
