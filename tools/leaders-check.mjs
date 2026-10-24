// The leaders of the old lairs (atlas/leaders.js, docs/TABLE.md «Главари логов»): who may lead, how strong, how many,
// how they leave, their vassals, a calamity taking one for its boss, a caravan meeting and killing one. Part of `npm test`.
import {generateAtlas} from '../src/atlas/generate.js';
import {LAIRS, LEADER} from '../src/data/lairs.js';
import {SPECIES} from '../src/data/species.js';
import {canLead, livingLeaders, leaderSlain} from '../src/atlas/leaders.js';
import {worldThings} from '../src/campaign/bubble.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };
const cfg = seed => ({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1, epic: true, epicYears: {wild: 40, elder: 40, young: 40}});

const worlds = ['3', '1', '12'].map(s => generateAtlas(cfg(s)));
const a = worlds[0], live = livingLeaders(a), fallen = a.fallenLeaders || [];
check('главари появляются в древних логовах, не больше потолка', live.length > 0 && live.length <= LEADER.max && live.every(l => canLead(l)),
  `живых ${live.length} (потолок ${LEADER.max}), сгинуло ${fallen.length}`);
const how = fallen.reduce((m, f) => ((m[f.how] = (m[f.how] || 0) + 1), m), {});
check('главари уходят: от старости (и приходит новый), в бою, с логовом', how.age > 0 && how.beaten > 0 && fallen.length > live.length,
  Object.entries(how).map(([k, n]) => `${k} ${n}`).join(', '));
const grown = live.every(l => {
  const sp = SPECIES.get(l.leader.species);
  return !sp.special || LEADER.stats.every(id => l.leader.special[id] > sp.special[id][0] && l.leader.special[id] <= LEADER.cap);
});
const beyond = live.filter(l => SPECIES.get(l.leader.species).special && LEADER.stats.some(id => l.leader.special[id] > SPECIES.get(l.leader.species).special[id][1])).length;
check('главарь сильнее своего вида', grown && beyond > live.length / 2, `вышли за пределы вида: ${beyond} из ${live.length}`);
const vassals = a.lairs.filter(l => l.alive && l.lord != null);
check('данники: у каждого есть живое логово-господин', vassals.length > 0 && vassals.every(v => a.lairs.find(o => o.id === v.lord)?.alive), `данников ${vassals.length}`);
const deeds = a.chronicle.filter(c => /Вёл их|подчинил|основал «|разорил «|разбил /.test(c.text)).length;
check('главари действуют: набеги, выводки, подчинение, войны логов', deeds > 20, `строк о делах главарей: ${deeds}`);
const noRaids = live.every(l => !(a.parties || []).some(p => p.owner === l.id && (p.kind === 'raid' || p.kind === 'brood')));
check('логово с главарём не шлёт набегов и выводков само', noRaids);
const took = worlds.flatMap(w => (w.calamities || []).filter(c => c.boss?.wasLeader).map(c => `${c.boss.wasLeader} → ${c.label}`));
check('бедствие берёт боссом живого главаря', took.length > 0, took.join('; '));

// a caravan meets a leader's party: on the local map the leader is the named one; beaten, it is dead
let met = null;
for (const w of worlds) for (const p of w.parties || []) if (p.kind === 'leader' && p.state !== 'gone' && !met && w.lairs.find(l => l.id === p.owner)?.leader) met = {w, p};
if (!met) {   // no leader out at the end of history: send one
  const l = livingLeaders(a)[0], t = a.towns.find(x => x.alive);
  const {sendParty} = await import('../src/atlas/parties.js');
  met = {w: a, p: sendParty(a, 'leader', l.i, t.i, {owner: l.id, plan: 'raid', target: t.id, might: 3, label: 'тест', color: [200, 200, 200], leader: true})};
}
const things = worldThings(met.w, {x: met.p.x, y: met.p.y, realm: null});
const th = things.find(t => t.party === met.p.id), lair = met.w.lairs.find(l => l.id === met.p.owner);
check('встреча каравана с отрядом главаря: главарь — именной противник', !!th?.boss?.name && th.leaderLair === lair.id && th.boss.add, th ? `${th.label} · ${th.boss?.name}` : 'нет встречи');
const was = (met.w.fallenLeaders || []).length;
leaderSlain(met.w, lair.id);
check('главарь, разбитый караваном, мёртв', !lair.leader && (met.w.fallenLeaders || []).length === was + 1 && met.w.fallenLeaders.at(-1).how === 'caravan');

void LAIRS;
if (fail.length) process.exit(1);
