// Experience across walks (plan claude/xp-plan.md; campaign/experience.js): where it comes from, how fast it comes, what
// level each one reaches by the end, the letters the levels grew — by role, race and mode. And the three cases the expert
// named: a shield-bearer with no kills, a master at the top of his skill, a companion who joined halfway. A diagnostic, not
// a quota: the numbers are for the author and the expert to judge (Р1).
//   node tools/xp-probe.mjs [worlds=2] [auto|local|both] [--json] [--no-maim]
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign, runCampaign} from '../src/campaign/index.js';
import {CAMPAIGN} from '../src/data/campaign.js';
import {COMBAT_ROLES} from '../src/data/roles.js';
import {ACTS} from '../src/data/experience.js';
import {PERKS} from '../src/data/perks.js';
import {DEATHBLOW} from '../src/data/wounds.js';
import {need} from '../src/campaign/experience.js';

const worlds = +(process.argv[2] || 2), arg = process.argv[3] || 'auto', asJson = process.argv.includes('--json');
if (process.argv.includes('--no-maim')) DEATHBLOW.maim.on = false;   // the paired runs: without maims, as before Э4
const modes = arg === 'both' ? ['auto', 'local'] : [arg === 'local' ? 'local' : 'auto'];
const r1 = v => Math.round(v * 10) / 10;
const avg = xs => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const median = xs => { if (!xs.length) return 0; const s = [...xs].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
const add = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

const out = {};
for (const mode of modes) {
  const R = {walks: 0, days: [], members: [], src: {ground: 0, act: 0}, srcBy: {}, letters: {}, byRole: {}, byRace: {}, cases: {shieldNoKill: [], master: [], late: []}, levelDays: {}, ms: 0, perks: {}, firstPerk: [], perksAt130: [], maims: 0, maimedMembers: 0, overMax: 0, dead: 0, deadMaimed: 0, scars: {}, core: 0, coreDead130: 0, coreLv130: [], terrorChecks: 0, frostDays: 0, frostChecks: 0, frostTired: {}, walksOver: 0, casePerks: {}};
  for (let s = 0; s < worlds; s++) {
    const base = generateAtlas({seed: String(777 + s * 13), size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
    const fz = JSON.stringify(saveAtlas(base));
    for (const p of CAMPAIGN.peoples) {
      const c = capitals(base).find(x => x.people === p); if (!c) continue;
      const a = loadAtlas(JSON.parse(fz)), t0 = Date.now();
      newCampaign(a, c.town, {mode});
      const K = runCampaign(a);
      R.ms += Date.now() - t0; R.walks++; R.days.push(K.day); if (K.phase !== 'timeout') R.walksOver++;
      R.terrorChecks += K.stats.terrorChecks || 0; R.frostDays += K.stats.frostDays || 0; R.frostChecks += K.stats.frostChecks || 0; for (const [t, n] of Object.entries(K.stats.frostTired || {})) add(R.frostTired, t, n);
      for (const m of K.members) {
        if (m.captive) continue;
        const end = m.died?.day ?? m.left?.day ?? K.day, days = Math.max(1, end - (m.joined ?? 0));
        const role = m.fight ? COMBAT_ROLES.get(m.fight).label : m.role;
        const row = {name: m.name, race: m.race, role, days, xp: m.xp || 0, perDay: (m.xp || 0) / days, level: m.level || 1, alive: m.alive, joined: m.joined ?? 0, grew: m.grew || []};
        R.members.push(row);
        for (const [id, xp] of Object.entries(m.xpOf || {})) { add(R.srcBy, id, xp); R.src[ACTS.get(id).ground ? 'ground' : 'act'] += xp; }
        for (const g of m.grew || []) { add(R.letters, g.stat ?? '—'); (R.levelDays[g.level] ||= []).push(g.day - (m.joined ?? 0)); }
        for (const p of m.perks || []) add(R.perks, p.id);
        R.maims += m.maims || 0; if (m.maims) R.maimedMembers++; R.overMax += Math.max(0, (m.maims || 0) - DEATHBLOW.maim.max);
        // the core at a fixed horizon, day 130 (Р2): who of the eight that set out was dead by then, the level of those alive
        if ((m.joined ?? 0) === 0 && (K.day >= 130 || (m.died && m.died.day < 130))) { R.core++; if (m.died && m.died.day < 130) R.coreDead130++; else R.coreLv130.push(1 + (m.grew || []).filter(g => g.day < 130).length); } if (m.died) { R.dead++; if (m.maims) R.deadMaimed++; }
        for (const x of m.wounds || []) if (x.day == null) add(R.scars, x.id);
        if (m.perks?.length) R.firstPerk.push(Math.min(...m.perks.map(p => p.day)) - (m.joined ?? 0));
        if (days >= 130) R.perksAt130.push((m.perks || []).reduce((n, p) => n + (p.at || Array(p.rank).fill(p.day)).filter(d => d - (m.joined ?? 0) <= 130).length, 0));   // (ranks counted by their own days)
        (R.byRole[role] ||= []).push(row); (R.byRace[m.race] ||= []).push(row);
        // the named cases and the perks they came to (Э6: each has a path to a perk of its own — data/perks.js)
        const caseOf = k => { R.cases[k].push(row); for (const p of m.perks || []) add(R.casePerks[k] ||= {}, p.id); if (!m.perks?.length) add(R.casePerks[k] ||= {}, '— без перков'); };
        if (m.fight && COMBAT_ROLES.get(m.fight).holdsLine && !(m.acts?.killBlow || m.acts?.killShot)) caseOf('shieldNoKill');
        if (m.master || Object.values(m.local?.skill || {}).some(v => v >= 0.45)) caseOf('master');
        if ((m.joined ?? 0) >= K.day / 3 && (m.joined ?? 0) > 5) caseOf('late');
      }
      process.stderr.write(`${mode} ${s}/${p}: ${K.phase} ${K.day} дн.; уровни ${K.members.filter(m => !m.captive).map(m => m.level || 1).join(' ')}\n`);
    }
  }
  const all = R.members, surv = all.filter(m => m.alive && m.days >= 20), sum = R.src.ground + R.src.act;
  const sumUp = rows => ({n: rows.length, xpPerDay: r1(avg(rows.map(x => x.perDay))), level: r1(avg(rows.map(x => x.level))), maxLevel: Math.max(0, ...rows.map(x => x.level))});
  out[mode] = {walks: R.walks, daysPerWalk: r1(avg(R.days)), msPerWalk: Math.round(R.ms / Math.max(1, R.walks)),
    xpPerDay: r1(avg(all.map(x => x.perDay))), xpPerDaySurvivors: r1(avg(surv.map(x => x.perDay))),
    levelMedianSurvivors: median(surv.map(x => x.level)), levelMaxAll: Math.max(0, ...all.map(x => x.level)),
    projected120: surv.length ? `по ${r1(avg(surv.map(x => x.perDay)))} в день к 120-му дню — ${Object.keys([...Array(40)]).map(Number).filter(L => need(L) <= avg(surv.map(x => x.perDay)) * 120).at(-1)}-й уровень` : '—',
    groundShare: sum ? Math.round(R.src.ground / sum * 100) : 0,
    sources: Object.fromEntries(Object.entries(R.srcBy).sort((p, q) => q[1] - p[1]).map(([k, v]) => [k, Math.round(v / sum * 1000) / 10])),
    lettersGrown: R.letters, dayOfLevel: Object.fromEntries(Object.entries(R.levelDays).map(([L, xs]) => [L, Math.round(median(xs))])),
    byRole: Object.fromEntries(Object.entries(R.byRole).map(([k, v]) => [k, sumUp(v)])),
    byRace: Object.fromEntries(Object.entries(R.byRace).map(([k, v]) => [k, sumUp(v)])),
    cases: Object.fromEntries(Object.entries(R.cases).map(([k, v]) => [k, sumUp(v)])),
    perks: Object.fromEntries(Object.entries(R.perks).sort((p, q) => q[1] - p[1])), neverTaken: PERKS.all().map(P => P.id).filter(id => !R.perks[id]),
    firstPerkDay: median(R.firstPerk), perksBy130: median(R.perksAt130),
    maims: R.maims, maimedMembers: R.maimedMembers, maimsOverMax: R.overMax, dead: R.dead,
    at130: {core: R.core, deadShare: R.core ? Math.round(R.coreDead130 / R.core * 100) : 0, levelMedian: median(R.coreLv130)}, walksFinished: R.walksOver,
    roadTraumaChecks: {terrors: R.terrorChecks, frostyDaysWalked: R.frostDays, frostChecks: R.frostChecks, frostTiredTenths: R.frostTired},
    casePerks: R.casePerks, deadAfterMaims: R.deadMaimed, scars: R.scars,
    mean: sumUp(all)};
}
console.log(asJson ? JSON.stringify(out) : JSON.stringify(out, null, 1));
