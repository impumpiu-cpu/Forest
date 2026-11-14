// A net and a nose (Ver_H, the author's word 14.11: no perks of their own where the body already says it): how long a net
// holds a body (agents/combat.js netGrip, data/balance/combat.js COMBAT.net) — scales or spikes shed it, a great body tears it,
// a swarm is not caught; and the sense «чутьё» (data/tongues.js SENSES scent) — a beast with a nose finds one who creeps closer
// than its reach, by day and by night, where a beast without one does not.
//   node tools/net-check.mjs
import {netGrip, canSee, sneakSeen} from '../src/agents/combat.js';
import {SPECIES} from '../src/data/species.js';
import {COMBAT} from '../src/data/balance/combat.js';
import {SENSES, scentReach} from '../src/data/tongues.js';

let fails = 0;
const ok = (c, what, more = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}${more ? ` — ${more}` : ''}`); if (!c) fails++; };
const N = COMBAT.net, grip = id => netGrip({species: id}, SPECIES.get(id));

// ── the net
ok(grip('wolf') === 1 && grip('human') === 1, 'волка и человека сеть держит целиком', `${grip('wolf')}, ${grip('human')}`);
ok(grip('scorpion') === N.shed && grip('manticore') < 1, 'чешую и шипы сеть не держит: соскальзывает', `скорпион ${grip('scorpion')}, мантикора ${grip('manticore')}`);
ok(grip('ogre') === N.tear.k && grip('troll') === N.tear.k && grip('giant') === N.tear.k, 'огр, тролль, великан рвут сеть', `${grip('ogre')}, ${grip('troll')}, ${grip('giant')}`);
ok(grip('stoneworm') === N.shed * N.tear.k, 'крупный в панцире — и рвёт, и сбрасывает', `${grip('stoneworm')}`);
ok(grip('goblin') === 1, 'мелкого сеть держит', `${grip('goblin')}`);
ok(netGrip({species: 'wolf'}, {...SPECIES.get('wolf'), swarm: true}) === 0, 'рой сетью не поймать');

// ── the nose
const S = SENSES.get('scent');
ok(S.live && S.reach > 0, 'чутьё работает', `${S.reach} клеток`);
ok(scentReach('wolf') === S.reach && scentReach('human') === 0 && scentReach('gnoll') === S.reach, 'чутьё у волка и гнолла, не у человека');
const w = {tick: 100}, creeper = {x: 0, y: 0, sneaking: true, gear: {armor: 0}, species: 'human'};
const at = d => ({x: d, y: 0});
const d = (sneakSeen(creeper) + S.reach) / 2;   // (between what eyes see and what a nose smells)
ok(sneakSeen(creeper) < S.reach, 'нос достаёт дальше глаз', `${sneakSeen(creeper)} < ${S.reach}`);
ok(canSee(w, {...at(d), species: 'wolf', faction: 'predators'}, creeper), 'волк чует крадущегося', `${d} клеток`);
ok(!canSee(w, {...at(d), species: 'lynx', faction: 'predators'}, creeper), 'рысь его не видит');
ok(!canSee(w, {...at(S.reach + 1), species: 'wolf', faction: 'predators'}, creeper), 'дальше чутья — не чует');

console.log(fails ? `\nnet-check: ${fails} FAIL` : '\nnet-check: ok');
process.exit(fails ? 1 : 0);
