// The living company across walks (plan claude/caravan-ver_d.md §7 «Социальная сводка»): what happened between the members,
// how the requests and the promises went, how the council's voices fell, whether the quarrels sit on one pair, and what it
// costs. A diagnostic, not a quota: no number here is a target. Wins and those who came home are shown beside, as before.
//   node tools/social-probe.mjs [worlds=2] [auto|local] [--json]
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign, runCampaign} from '../src/campaign/index.js';
import {CAMPAIGN} from '../src/data/campaign.js';
import {core} from '../src/campaign/march.js';

const worlds = +(process.argv[2] || 2), mode = process.argv[3] === 'local' ? 'local' : 'auto', asJson = process.argv.includes('--json');
const T = {debate: {}, swayed: 0, escorts: {}, camps: 0, walks: 0, won: 0, days: 0, home: 0, ms: 0, facts: {}, answers: {}, vows: {}, meetings: 0, split: 0, voices: 0, pairTop: 0, quarrels: 0, memory: 0, members: 0, bytes: 0};
const add = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
for (let s = 0; s < worlds; s++) {
  const base = generateAtlas({seed: String(777 + s * 13), size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const fz = JSON.stringify(saveAtlas(base));
  for (const p of CAMPAIGN.peoples) {
    const c = capitals(base).find(x => x.people === p); if (!c) continue;
    const a = loadAtlas(JSON.parse(fz)), t0 = Date.now();
    newCampaign(a, c.town, {mode});
    const K = runCampaign(a), S = K.social || {};
    T.ms += Date.now() - t0; T.walks++; T.days += K.day; if (K.phase === 'won') { T.won++; T.home += core(K).length; }
    const pairs = {};
    for (const f of S.facts || []) {
      add(T.facts, f.kind);
      if (f.kind === 'asked') add(T.answers, f.params.answer);
      if (f.kind === 'quarrel') { T.quarrels++; add(pairs, [f.by, f.to].sort().join(':')); }
    }
    T.pairTop += Math.max(0, ...Object.values(pairs));
    for (const v of S.commitments || []) { add(T.vows, v.status); if (v.kind === 'escort') add(T.escorts, `${v.status}${v.why ? ':' + v.why : ''}`); }
    T.camps += K.stats.camps || 0;
    for (const M of S.meetings || []) { T.meetings++; T.voices += M.voices.length; if (M.voices.some(v => v.want !== M.pick)) T.split++; if (M.debate?.objector != null) { add(T.debate, M.debate.answer); if (M.debate.swayed?.length) T.swayed++; } }
    for (const m of K.members) { T.members++; T.memory += m.social?.memory?.length || 0; }
    T.bytes += JSON.stringify(S).length;
    process.stderr.write(`${s}/${p}: ${K.phase} ${K.day} дн.; фактов ${(S.facts || []).length}, обещаний ${(S.commitments || []).length}\n`);
  }
}
const per = v => Math.round(v / Math.max(1, T.walks) * 10) / 10;
const out = {mode, walks: T.walks, won: T.won, days: per(T.days), homeOfWon: T.won ? Math.round(T.home / T.won * 10) / 10 : 0, msPerWalk: per(T.ms),
  factsPerWalk: Object.fromEntries(Object.entries(T.facts).map(([k, v]) => [k, per(v)])), answers: T.answers, promises: T.vows,
  debates: T.debate, debatesSwayedSomeone: T.swayed, escortPromises: T.escorts, campsPerWalk: per(T.camps), meetingsKeptPerWalk: per(T.meetings), splitShare: T.meetings ? Math.round(T.split / T.meetings * 100) / 100 : 0, voicesPerMeeting: T.meetings ? Math.round(T.voices / T.meetings * 10) / 10 : 0,
  quarrelsOnTopPair: T.quarrels ? Math.round(T.pairTop / T.quarrels * 100) / 100 : 0, memoriesPerMember: Math.round(T.memory / Math.max(1, T.members) * 10) / 10, socialKbPerWalk: per(T.bytes / 1024)};
console.log(asJson ? JSON.stringify(out) : out);
