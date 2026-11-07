// The living company's contract (docs/CAMPAIGN.md «Живая команда: договор»; plan claude/caravan-ver_d.md), scene by scene.
// Step 1 (D0): the fate of a member is read from what the campaign keeps, never «not alive = dead»; every way out of
// the caravan leaves its reason; the settlement's council remembers the proposal that won the second round.
// Step 2 (D1): the working character comes with the member, on every way in; the camp's map shows that character, not a
// new roll; a captive taken on the map keeps its own; filling an old save in is the same however often it is done.
// Step 3 (D1): the bonds live with the campaign by member id — laid onto the map's ids, taken back once per camp, kept for
// those not on the map and for the fallen, faded once a day; the mood and the world view go and come back with the member.
// Step 4 (D2): a fact — a wound dressed, one pulled back from death — is noted on the map with its doer, the one it was done
// to and those who saw it; the campaign keeps it once, as memories of those who know it and as the reason of the bond.
// Step 5 (D2): quarrels, work, a fight side by side, a defence, an escort, a bed given up — facts too, a long deed once a
// camp; the fates — death, captivity, escape, sale, leaving — facts of the campaign, known by sight or by word, and the
// loss weighs by the bond: a friend's death grieves, a hated one's eases; the last help before a death stays before it.
// Step 6 (D3): the night's watch by turns; one too tired asks one it chooses, that one answers by its own rules; a yes is a
// promise — kept, failed through no fault, broken, or gone with the one who gave it; what came of it moves the bond once,
// and the next request remembers it; a save between the promise and its night goes on the same.
// Step 7 (D4): under the camp's alarm the line is not the only answer — one may run to a fallen friend, one badly hurt and
// faint-hearted may falter; the fallen are bound after a fight only by someone still on their feet.
// Step 8 (D5): the council with voices — each who has a say scores the options by its people's mission bent by its own
// leanings, its needs and its losses; a danger is weighed, not a wall; the meeting is kept: who wanted what and why.
// Step 9 (D6): the fire's scene and the member's card read what was decided and change nothing; the speakers say only what
// they have; the archive keeps the people by their ids and the company's story.
// Step 10 (D7): a newcomer is taken in by the most sociable; a captive sold is taken ill by those who hold mercy or freedom.
//   node tools/social-check.mjs [worlds=2]
import {fateOf, livesOn, FATES} from '../src/social/fate.js';
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign, runCampaign, stepCampaign, socialHash, socialModel} from '../src/campaign/index.js';
import {memberLocal, upgradeMembers} from '../src/campaign/start.js';
import {campSetup, openCamp, runCamp, campOutcome} from '../src/campaign/camp.js';
import {takeFromCamp} from '../src/campaign/captives.js';
import {applyCamp} from '../src/campaign/fight.js';
import {ensureSocial, takeBonds, fadeDay, moodOut, moodIn, takeOnce} from '../src/campaign/social.js';
import {REL} from '../src/data/colony.js';
import {giveAid} from '../src/settlement/together.js';
import {reasonsOf, noteFate, bondOf, welcome, judge, tell} from '../src/campaign/social.js';
import {workTogether} from '../src/settlement/together.js';
import {die} from '../src/campaign/march.js';
import {nightWatch, tiredOf, escortAsk} from '../src/campaign/duty.js';
import {escortOption, enterEscort} from '../src/settlement/together.js';
import {DUTY} from '../src/data/social.js';
import {warband} from '../src/agents/behaviours/warband.js';
import {councilChoose} from '../src/campaign/council.js';
import {meetingsOf, meetingHtml, memberCardHtml} from '../src/ui/campSocial.js';
import {archive} from '../src/campaign/ending.js';
import {COUNCIL} from '../src/data/campaign.js';
import {mulberry} from '../src/core/rng.js';
import {SPECIES, isSentient} from '../src/data/species.js';
import {CAMPAIGN} from '../src/data/campaign.js';
import {newGame, step} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {traceMode} from '../src/core/decide.js';
import {colonists} from '../src/settlement/query.js';
import {DAY} from '../src/core/time.js';

let ok = true;
const check = (what, pass, info = '') => { ok &&= pass; console.log(`${pass ? 'ok  ' : 'FAIL'} ${what}${info ? ': ' + info : ''}`); return pass; };

// ── the fates, by hand
const M = o => ({alive: false, ...o});
const cases = [[{alive: true}, 'in'], [M({died: {day: 3, why: 'пал в бою'}}), 'dead'], [M({left: {day: 3, taken: true}}), 'taken'], [M({left: {day: 3, escaped: true}}), 'escaped'],
  [M({left: {day: 3, sold: true}}), 'sold'], [M({left: {day: 3, why: 'deserted'}}), 'left'], [M({left: {day: 3, disbanded: true}}), 'disbanded'], [M({left: {day: 3}}), 'gone'], [M({}), 'gone']];
check('судьба участника — по полям похода, не «не жив = умер»', cases.every(([m, f]) => fateOf(m) === f), cases.map(([m, f]) => `${f}=${fateOf(m)}`).join(' '));
check('живые отсутствующие не оплакиваются как павшие', livesOn(M({left: {sold: true}})) && !livesOn(M({died: {}})) && !livesOn({alive: true}));

// ── every way out of real walks leaves its reason (an old save may have «gone»; a new walk must not)
const worlds = +(process.argv[2] || 2), seen = Object.fromEntries(FATES.map(f => [f, 0]));
let lostEnds = 0, disbandedOk = true, members = 0, noChar = 0;
const roles = {};
for (let s = 0; s < worlds; s++) {
  const base = generateAtlas({seed: String(777 + s * 13), size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const frozen = JSON.stringify(saveAtlas(base)), caps = capitals(base);
  for (const p of CAMPAIGN.peoples) {
    const c = caps.find(x => x.people === p); if (!c) continue;
    const a = loadAtlas(JSON.parse(frozen));
    newCampaign(a, c.town, {mode: 'auto'});
    const K = runCampaign(a);
    for (const m of K.members) { seen[fateOf(m)]++; members++; roles[m.role] = (roles[m.role] || 0) + 1; if (isSentient(SPECIES.get(m.race)) && !m.local?.traits) noChar++; }
    if (K.phase === 'lost') { lostEnds++; for (const id of K.lostWith || []) if (fateOf(K.members.find(m => m.id === id)) !== 'disbanded') disbandedOk = false; }
  }
}
check('у каждого ушедшего из похода есть причина (ни одного «gone» в новых походах)', seen.gone === 0, Object.entries(seen).filter(([, n]) => n).map(([f, n]) => `${f} ${n}`).join(', '));
check('характер с рождения на всех путях в караван (ядро, наём, спутники, освобождённые, пленные, купленные) — и в быстром режиме', members > 0 && noChar === 0,
  `участников ${members}, без характера ${noChar}; ${Object.entries(roles).map(([k, n]) => `${k} ${n}`).join(', ')}`);
check('когда ядра не осталось, остальные отпущены живыми, а не записаны в павшие', disbandedOk, `походов с потерей ядра ${lostEnds}`);

// ── the character on the camp's map: the member's own, shown — not rolled — and the same after the camp but for what it lived
{
  const base = generateAtlas({seed: '777', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const a = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(base)))), c = capitals(a)[0];
  const K = newCampaign(a, c.town, {mode: 'local'});
  const before = K.members.map(m => JSON.stringify({likes: m.local.likes, dislikes: m.local.dislikes, traits: m.local.traits, food: m.local.food, leans: m.local.leans}));
  const S = campSetup(a, K, {kind: 'stop', dayIn: 0}), w = openCamp(S);
  const shown = K.members.map(m => { const ag = w.campaign.people.get(m.id); return JSON.stringify({likes: ag.likes, dislikes: ag.dislikes, traits: ag.traits, food: ag.food, leans: ag.leans}); });
  check('на локальной карте — тот же характер, что у участника похода', shown.every((x, k) => x === before[k]));
  const w2 = runCamp(S), o = campOutcome(w2), again = openCamp(S);
  check('повтор стоянки показывает тот же характер (снимок не перебрасывается)', K.members.every(m => again.campaign.people.get(m.id).likes === m.local.likes));
  check('стоянка возвращает характер того же участника', o.members.filter(x => x.alive).every(x => x.local.likes === K.members.find(m => m.id === x.id).local.likes));
  // a captive taken on the map: its own character, as the map left it
  const loc = {likes: 'chop', dislikes: 'cook', prefs: {}, traits: ['brave'], food: {}, own: {mul: {bravery: 1}}, skill: {melee: 0.4}, leans: {}};
  const n0 = K.members.length;
  takeFromCamp(a, K, {taken: [{name: 'Пленник', gender: 'm', race: K.members[0].race, hp: 0.5, special: {...K.members[0].special}, local: loc, bonds: 'rope', gear: {hand: [], body: null}}]}, () => {});
  const cap = K.members[n0];
  check('пленный с карты приходит со своим характером, не с новым', !!cap && cap.local.likes === 'chop' && cap.local.traits[0] === 'brave');
  // an old save: the character filled in is the same whenever and however often
  const m = K.members[1], keep = JSON.stringify(m.local);
  delete m.local; upgradeMembers(K); const once = JSON.stringify(m.local); upgradeMembers(K); memberLocal(K, m);
  check('старое сохранение: характер дополняется одинаково и один раз', once === keep && JSON.stringify(m.local) === once);
  // a character with a part missing (no leanings, no skills): the missing parts of the same roll, what is there kept
  const p = K.members[2], full = JSON.parse(JSON.stringify(p.local));
  p.local.likes = 'cook'; delete p.local.leans; delete p.local.skill; upgradeMembers(K);
  check('часть характера пропала: недостающее — из того же броска, имеющееся не трогается', JSON.stringify(p.local.leans) === JSON.stringify(full.leans) && JSON.stringify(p.local.skill) === JSON.stringify(full.skill) && p.local.likes === 'cook');
  const S1 = campSetup(a, K, {kind: 'stop', dayIn: 0}), S2 = campSetup(a, K, {kind: 'stop', dayIn: 1});
  const l1 = openCamp(S1).campaign.people.get(p.id).leans, l2 = openCamp(S2).campaign.people.get(p.id).leans;
  check('склонности на двух стоянках одни и те же, не новый бросок', JSON.stringify(l1) === JSON.stringify(l2) && JSON.stringify(l1) === JSON.stringify(full.leans), `${JSON.stringify(l1)} / ${JSON.stringify(l2)}`);
  // the setup is a snapshot: a nested change after it does not reach it
  const S3 = campSetup(a, K, {kind: 'stop', dayIn: 0}), m3 = K.members.find(x => x.id === S3.members[0].id), sk = Object.keys(m3.local.skill)[0] || 'melee', v0 = S3.members[0].local.skill[sk] ?? 0;
  m3.local.skill[sk] = (m3.local.skill[sk] || 0) + 1; if (m3.values) m3.values.push('gold'); if (m3.align) m3.align.mercy = (m3.align.mercy || 0) + 5;
  check('снимок стоянки — копия: изменение навыка, ценностей, мировоззрения после него его не меняет', (S3.members[0].local.skill[sk] ?? 0) === v0 && S3.members[0].local !== m3.local && (!m3.align || S3.members[0].align.mercy !== m3.align.mercy));
}

// ── the bonds between the maps
{
  const base = generateAtlas({seed: '790', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const a = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(base)))), c = capitals(a)[1] || capitals(a)[0];
  const K = newCampaign(a, c.town, {mode: 'local'}), [A, B, C] = K.members, R = ensureSocial(K).relations;
  R[A.id] = {[B.id]: 2, [C.id]: -1.5}; R[B.id] = {[A.id]: -3};
  const S1 = campSetup(a, K, {kind: 'stop', dayIn: 0}), w1 = openCamp(S1), g1 = w1.campaign.people;
  const okIn = g1.get(A.id).grudge?.[g1.get(B.id).id] === 2 && g1.get(B.id).grudge?.[g1.get(A.id).id] === -3;
  // the next camp with the members in another order: other map ids, the same people
  K.members.reverse(); K.camps = [{day: K.day, kind: 'stop'}];
  const S2 = campSetup(a, K, {kind: 'stop', dayIn: 0}), w2 = openCamp(S2), g2 = w2.campaign.people; K.members.reverse();
  const moved = g1.get(A.id).id !== g2.get(A.id).id, okAgain = g2.get(A.id).grudge?.[g2.get(B.id).id] === 2 && g2.get(A.id).grudge?.[g2.get(C.id).id] === -1.5;
  check('связи по id участника: на картах с другими локальными id благодарность и обида у тех же людей', okIn && moved && okAgain, `локальные id ${moved ? 'другие' : 'те же'}`);
  // C is not on the map: the bond to C stays; what the map made of A → B is taken back
  takeBonds(K, [A.id, B.id], {[A.id]: {[B.id]: 2.5}, [B.id]: {}});
  check('отсутствующий на карте не стёрт из связей; итог карты заменяет связь присутствующих, а не прибавляется', R[A.id][C.id] === -1.5 && R[A.id][B.id] === 2.5 && !R[B.id]?.[A.id]);
  // a camp taken back twice
  const S3 = campSetup(a, K, {kind: 'night', dayIn: 0}), o3 = campOutcome(runCamp(S3));
  const food0 = K.food, first = applyCamp(a, K, S3, o3, {kind: 'raiders', label: 'налётчики'}, 'night') !== false, food1 = K.food, rel1 = JSON.stringify(R);
  const second = applyCamp(a, K, S3, o3, {kind: 'raiders', label: 'налётчики'}, 'night');
  check('исход стоянки берётся один раз: повтор не меняет ни запасов, ни связей', first && second === false && K.food === food1 && JSON.stringify(R) === rel1, `еда ${food0} → ${food1}`);
  // the old snapshot does not follow the bonds that changed after it
  R[A.id][B.id] = -4;
  check('снимок старой стоянки не меняется от новых связей (повтор на экране — тот же)', S1.bonds[A.id][B.id] === 2);
  // a bond to one who fell on the map is kept (the map's day does not drop it)
  const S4 = campSetup(a, K, {kind: 'stop', dayIn: 0}), w4 = openCamp(S4), p4 = w4.campaign.people, aa = p4.get(A.id), bb = p4.get(B.id);
  aa.grudge = {[bb.id]: 3}; bb.dead = true; w4.agents = w4.agents.filter(x => x !== bb);
  const o4 = campOutcome(w4);
  check('связь с павшим на стоянке сохраняется для похода', o4.bonds[A.id]?.[B.id] === 3);
  // the day's fading: once, by the campaign's day — two maps of the day fade nothing of the members' bonds, the bond to
  // one away fades the same
  {
    const away = K.members.find(m => m.alive && ![A.id, B.id].includes(m.id) && !S1.members.some(x => x.id === m.id)) || C;
    R[A.id] = {[B.id]: 2, [away.id]: 2}; K.camps = [];
    for (let k = 0; k < 2; k++) {
      const Sx = campSetup(a, K, {kind: 'stop', dayIn: 0}), wx = runCamp(Sx);
      applyCamp(a, K, Sx, campOutcome(wx), null, 'stop');
      (K.camps ||= []).push({day: K.day, kind: 'stop'});
    }
    const afterMaps = R[A.id][B.id];
    fadeDay(K);
    check('связи затухают ровно раз в день похода: две карты дня их не затухают, отсутствующему — так же', afterMaps === 2 && Math.abs(R[A.id][B.id] - 2 * REL.fadeGood) < 1e-9 && Math.abs(R[A.id][away.id] - 2 * REL.fadeGood) < 1e-9, `после карт ${afterMaps}, к вечеру ${R[A.id][B.id]?.toFixed(4)} / ${R[A.id][away.id]?.toFixed(4)}`);
  }
  // an old outcome is refused, however long the ledger was cleaned since
  {
    const So = campSetup(a, K, {kind: 'stop', dayIn: 0}), oo = campOutcome(openCamp(So)), d0 = K.day;
    K.day += 3; takeOnce(K, 'other', K.day);
    check('старый исход стоянки не принимается и через несколько дней', applyCamp(a, K, So, oo, null, 'stop') === false && takeOnce(K, oo.session, d0) === false);
    K.day = d0;
  }
  // the mood and the world view: out of one camp, into the next, with what is left of them
  const mood = moodOut(10, 1000, [{t: 900, id: 'stoodUp', text: 'x', mood: 0.2, until: 1000 + DAY / 2}, {t: 0, id: 'old', text: 'y', mood: -0.1, until: 999}]);
  const back = moodIn(10.25, 50, mood);
  check('настроение переходит со стоянки на стоянку с остатком времени, истёкшее не переносится', mood.length === 1 && back.length === 1 && back[0].until === 50 + DAY / 4, JSON.stringify(back[0]));
  const m0 = K.members.find(m => m.alive), S5 = campSetup(a, K, {kind: 'stop', dayIn: 0}), w5 = openCamp(S5), ag5 = w5.campaign.people.get(m0.id);
  check('мировоззрение и его корень приходят на карту от участника', JSON.stringify(ag5.alignRoot) === JSON.stringify(m0.alignRoot) && JSON.stringify(ag5.align) === JSON.stringify(m0.align));
  ag5.align = {...ag5.align, mercy: (ag5.align.mercy || 0) + 0.1};
  const o5 = campOutcome(w5); K.camps = []; applyCamp(a, K, S5, o5, null, 'stop');
  check('дрейф мировоззрения на стоянке возвращается в поход', Math.abs((m0.align.mercy || 0) - (ag5.align.mercy || 0)) < 1e-9 || !m0.alive);
}

// ── facts: who did what for whom, who saw it, kept once
{
  const base = generateAtlas({seed: '803', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const a = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(base)))), c = capitals(a)[0];
  const K = newCampaign(a, c.town, {mode: 'local'}), [A, B, C, D] = K.members;
  const S = campSetup(a, K, {kind: 'stop', dayIn: 0}), w = openCamp(S), P = w.campaign.people;
  const ag = id => P.get(id), a1 = ag(A.id), b1 = ag(B.id), c1 = ag(C.id), d1 = ag(D.id);
  for (const o of [b1, c1]) { o.x = a1.x + 1; o.y = a1.y; }
  d1.x = a1.x; d1.y = a1.y + 2; d1.sleeping = true;   // asleep beside them: saw nothing
  b1.hp = b1.hp * 0.3; giveAid(w, a1, b1);
  const facts = w.campaign.facts || [], f = facts[0];
  check('помощь — факт с исполнителем, получателем и очевидцами по id участника', facts.length === 1 && f.kind === 'aid' && f.by === A.id && f.to === B.id && f.saw.includes(C.id), JSON.stringify(f && {by: f.by, to: f.to, saw: f.saw}));
  check('спящий рядом не очевидец', f && !f.saw.includes(D.id));
  const o = campOutcome(w); K.camps = [];
  applyCamp(a, K, S, o, null, 'stop'); applyCamp(a, K, S, o, null, 'stop');
  const mB = K.members.find(m => m.id === B.id), mC = K.members.find(m => m.id === C.id), mD = K.members.find(m => m.id === D.id);
  check('поход хранит факт один раз; получатель помнит, что пережил, очевидец — что видел, спящий — ничего',
    K.social.facts.filter(x => x.id === f?.id).length === 1 && mB.social?.memory?.[0]?.how === 'lived' && mC.social?.memory?.[0]?.how === 'saw' && !(mD.social?.memory || []).some(x => x.fact === f?.id));
  check('причина связи: почему B думает об A — эта помощь', reasonsOf(K, B.id, A.id)[0]?.id === f?.id && (K.social.relations[B.id]?.[A.id] || 0) > 0,
    `связь ${Math.round((K.social.relations[B.id]?.[A.id] || 0) * 100) / 100}`);
  // the evening's talk: the one asleep did not see it — now it has heard, from the one helped; told again, nothing new
  const relBefore = JSON.stringify(K.social.relations); K.social.told = null; tell(K); K.social.told = null; tell(K);
  const heard = (mD.social?.memory || []).filter(x => x.fact === f?.id);
  check('не видел → узнал на вечернем разговоре от участника; повтор рассказа ничего не прибавляет', heard.length === 1 && heard[0].how === 'heard' && heard[0].from === B.id && JSON.stringify(K.social.relations) === relBefore, JSON.stringify(heard[0]));
  // without the fact the bond would be the same: the fact is its reason, not a second sum
  const w2 = openCamp(S), a2 = w2.campaign.people.get(A.id), b2 = w2.campaign.people.get(B.id);
  b2.hp = b2.hp * 0.3; const before = b2.grudge?.[a2.id] || 0; giveAid(w2, a2, b2);
  check('факт не добавляет к связи второй раз: прибавка — одна, где сделано дело', Math.abs((b2.grudge[a2.id] - before) - (w2.campaign.facts[0].params.bond.to)) < 1e-9);
}

// ── more facts; the fates and the losses
{
  const base = generateAtlas({seed: '816', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const a = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(base)))), c = capitals(a)[0];
  const K = newCampaign(a, c.town, {mode: 'local'}), [A, B, C, D, E] = K.members;
  const S = campSetup(a, K, {kind: 'stop', dayIn: 0}), w = openCamp(S), P = w.campaign.people, a1 = P.get(A.id), b1 = P.get(B.id);
  a1.task = {id: 'job', job: b1.task?.job || 'chop'}; b1.task = {id: 'job', job: a1.task.job}; b1.x = a1.x + 1; b1.y = a1.y;
  for (const ag of w.agents) if (ag !== a1 && ag !== b1 && ag.task?.id === 'job') ag.task = null;
  workTogether(w); workTogether(w); workTogether(w);
  const worked = (w.campaign.facts || []).filter(f => f.kind === 'workedWith');
  check('работа рядом — один факт за стоянку на пару, хоть шла часами', worked.length === 1, `фактов ${worked.length}`);
  // the last help before a death: the aid comes first, the death after it
  b1.hp *= 0.2; giveAid(w, a1, b1);
  const o = campOutcome(w); o.members.find(x => x.id === B.id).alive = false; o.members.find(x => x.id === B.id).cause = 'погиб'; K.camps = [];
  applyCamp(a, K, S, o, null, 'stop');
  const F = K.social.facts, iAid = F.findIndex(f => f.kind === 'aid' && f.to === B.id), iDied = F.findIndex(f => f.kind === 'died' && f.to === B.id);
  check('последняя помощь погибшему остаётся в истории — раньше гибели', iAid >= 0 && iDied > iAid);
  check('гибель на тихой стоянке — по рассказу, не на глазах', F[iDied]?.heard?.includes(A.id) && !F[iDied].saw.includes(A.id));
  // the fates are different facts
  const kinds = {};
  noteFate(K, C, 'sold'); noteFate(K, D, 'left', {params: {why: 'deserted'}});
  for (const f of K.social.facts) kinds[f.kind] = (kinds[f.kind] || 0) + 1;
  check('смерть, продажа и уход — разные факты', kinds.died === 1 && kinds.sold === 1 && kinds.left === 1, JSON.stringify(kinds));
  // the loss by the bond: E loved F, hated G
  const [Fm, G] = K.members.filter(m => m.alive && m !== E).slice(-2), R = K.social.relations;
  R[E.id] = {[Fm.id]: 3, [G.id]: -3};
  die(a, K, Fm, 'пал'); const sad = E.social.mood.at(-1).mood;
  die(a, K, G, 'пал'); const eased = E.social.mood.at(-1).mood;
  check('утрата — по связи: смерть друга тяжела, ненавистного — облегчение', sad < 0 && eased > 0, `друг ${sad}, недруг ${eased}`);
}

// ── the watch: a request, an answer, a promise and what came of it
{
  const base = generateAtlas({seed: '829', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const fresh = () => { const a = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(base)))), K = newCampaign(a, capitals(a)[0].town, {mode: 'auto'}); K.inTown = null; return {a, K}; };
  // three who may stand watch (one a night), the others too hurt; A first in the turn and worn out
  const setup = ({tA = 0.9, tB = 0, tC = 0, traitsB = null} = {}) => {
    const {a, K} = fresh(), [A, B, C, ...rest] = K.members;
    for (const m of rest) m.hp = DUTY.badly / 2;
    const T = {[A.id]: tA, [B.id]: tB, [C.id]: tC};
    for (const m of [A, B, C]) { m.hp = 1; (m.social ||= {}).load = {tired: T[m.id], watched: 0, lastWatch: null}; m.local.traits = m.id === B.id && traitsB ? traitsB : []; }
    K.duty = {queue: K.members.map(m => m.id), night: null, on: []};
    return {a, K, A, B, C};
  };
  const night = (a, K, lines) => { const on = nightWatch(a, K, {say: t => lines.push(t)}); K.day++; return on; };
  // 1. A asks the more rested, it says yes, stands tonight; A's bond to it grows with the fact as its reason
  {
    const {a, K, A, B, C} = setup({tB: 0, tC: 0.3}), lines = [], on = night(a, K, lines);
    const asked = K.social.facts.find(f => f.kind === 'asked'), took = K.social.facts.find(f => f.kind === 'tookWatch');
    check('уставший просит отдохнувшего; тот соглашается и стоит дозор вместо него', asked?.to === B.id && on[0] === B.id && took?.by === B.id && took?.to === A.id, lines.join(' | '));
    check('исполненное обещание — связь у того, кому помогли, с фактом-причиной', bondOf(K, A.id, B.id) === DUTY.bond.kept && reasonsOf(K, A.id, B.id).some(f => f.kind === 'tookWatch'));
    check('отстоявший устал, сменённый отдохнул', tiredOf(B) > 0 && tiredOf(A) < 0.9);
  }
  // 2. the same tiredness, other bonds: another is asked
  {
    const one = setup({tB: 0.2, tC: 0.2}), two = setup({tB: 0.2, tC: 0.2});
    ensureSocial(two.K).relations[two.A.id] = {[two.C.id]: 2};
    night(one.a, one.K, []); night(two.a, two.K, []);
    const to = X => X.K.social.facts.find(f => f.kind === 'asked')?.to;
    check('при одной усталости, но других связях — просят другого', to(one) === one.B.id && to(two) === two.C.id, `без дружбы → ${to(one)}, с другом → ${to(two)}`);
  }
  // 3. a promise for later: due on A's next turn; kept, failed through no fault, broken, gone
  const later = (traitsB = null) => {
    const X = setup({tB: 0.55, tC: 0.95, traitsB}), {K, A, B} = X;
    ensureSocial(K).commitments.push({id: 'p1', kind: 'watch', debtor: B.id, creditor: A.id, made: K.day - 1, due: K.day, until: K.day + DUTY.promiseDays, status: 'accepted', fact: null});
    return X;
  };
  {
    const X = later(); X.B.hp = DUTY.badly / 2; const lines = []; night(X.a, X.K, lines);
    const c = X.K.social.commitments.find(c => c.id === 'p1');
    check('раненый не исполнил обещание не по своей вине: «failed», связь не падает', c.status === 'failed' && c.why === 'hurt' && bondOf(X.K, X.A.id, X.B.id) === 0 && X.K.social.facts.some(f => f.kind === 'wordFailed'), lines.join(' | '));
  }
  {
    const X = later(['lazy']); X.B.social.load.tired = 0.9; const lines = []; night(X.a, X.K, lines);
    const c = X.K.social.commitments.find(c => c.id === 'p1');
    check('ленивый уставший не встал: обещание нарушено, связь падает, факт — «не сдержал слово»', c.status === 'broken' && bondOf(X.K, X.A.id, X.B.id) === DUTY.bond.broke && X.K.social.facts.some(f => f.kind === 'brokeWord'), lines.join(' | '));
    // the next request: the one who broke its word is not asked first, though it is as rested
    X.B.social.load.tired = 0; X.C.social.load.tired = 0; X.A.social.load.tired = 0.95;
    X.K.duty.queue = [X.A.id, X.B.id, X.C.id, ...X.K.duty.queue.filter(id => ![X.A.id, X.B.id, X.C.id].includes(id))];
    night(X.a, X.K, []);
    const next = X.K.social.facts.filter(f => f.kind === 'asked').at(-1);
    check('нарушившего слово в следующий раз не просят первым', next?.to === X.C.id, `попросили ${next?.to}`);
  }
  {
    const X = later(); die(X.a, X.K, X.B, 'пал'); night(X.a, X.K, []);
    const c = X.K.social.commitments.find(c => c.id === 'p1');
    check('погибший не нарушитель: обещание стало невозможным', c.status === 'impossible' && c.why === 'dead' && bondOf(X.K, X.A.id, X.B.id) >= 0);
  }
  // 4. a save between the promise and its night goes on the same; the same day twice is one night
  {
    const X = later(), saved = JSON.parse(JSON.stringify(X.K)), lines1 = [], lines2 = [];
    nightWatch(X.a, X.K, {say: t => lines1.push(t)}); nightWatch(X.a, X.K, {say: t => lines1.push(t)});
    const a2 = X.a; a2.campaign = saved; nightWatch(a2, saved, {say: t => lines2.push(t)});
    const st = K => K.social.commitments.find(c => c.id === 'p1').status;
    check('сохранение между обещанием и ночью продолжается так же; второй вызов в тот же день — та же ночь', st(X.K) === st(saved) && lines1.join() === lines2.join() && X.K.duty.on.join() === saved.duty.on.join(), `${st(X.K)} / ${st(saved)}`);
  }
}

// ── the promise «your next turn» on the real turn of the watch: kept on that turn within its days; past them — lapsed, never
// kept after; a side gone — closed at once
{
  const base = generateAtlas({seed: '829', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const fresh = () => {
    const a = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(base)))), K = newCampaign(a, capitals(a)[0].town, {mode: 'auto'}); K.inTown = null;
    for (const m of K.members) { m.hp = 1; (m.social ||= {}).load = {tired: 0, watched: 0, lastWatch: null}; m.local.traits = []; }
    K.duty = {queue: K.members.filter(m => m.alive && !m.captive).map(m => m.id), night: null, on: []};
    return {a, K};
  };
  const nights = (a, K, n) => { const log = []; for (let d = 0; d < n; d++) { log.push(nightWatch(a, K, {}).join(',')); K.day++; } return log; };
  // the promise as the request makes it: from tomorrow, a round of the watch and DUTY.promiseDays over
  {
    const {a, K} = fresh(), q = K.duty.queue, cr = q[0], db = q[2], per = Math.max(1, Math.min(DUTY.watch, Math.floor(q.length / DUTY.per))), turn = Math.ceil(q.length / per);
    ensureSocial(K).commitments.push({id: 'n1', kind: 'watch', debtor: db, creditor: cr, made: K.day, due: K.day + 1, until: K.day + turn + DUTY.promiseDays, status: 'accepted'});
    K.duty.queue = [...q.slice(1), cr];   // (tonight the creditor stood: to the end of the turn)
    const log = nights(a, K, turn + DUTY.promiseDays + 1), c = K.social.commitments.find(x => x.id === 'n1'), fact = K.social.facts.find(f => f.kind === 'tookWatch' && f.params?.promise === 'n1');
    check('«в твою следующую смену»: исполнено в настоящую очередь того, кому обещано, в срок', c.status === 'fulfilled' && c.end <= c.until && !!fact, `${c.status} на ${c.end}, срок ${c.until}; ночи ${log.join(' | ')}`);
  }
  // a promise whose days run out before the turn comes: lapsed, and not kept on the turn after
  {
    const {a, K} = fresh(), q = K.duty.queue, cr = q[0], db = q[q.length - 1];
    ensureSocial(K).commitments.push({id: 'n2', kind: 'watch', debtor: db, creditor: cr, made: K.day, due: K.day + 1, until: K.day + 1, status: 'accepted'});
    K.duty.queue = [...q.slice(1), cr];
    nights(a, K, q.length + 2);
    const c = K.social.commitments.find(x => x.id === 'n2');
    check('срок обещания вышел до очереди — истекло, и в следующую очередь не исполняется', c.status === 'lapsed' && !K.social.facts.some(f => f.kind === 'tookWatch' && f.params?.promise === 'n2'), `${c.status} на ${c.end}`);
  }
  // the one it was promised to is gone: closed at once, not on a turn that will not come
  {
    const {a, K} = fresh(), q = K.duty.queue, cr = K.members.find(m => m.id === q[0]), db = q[q.length - 1];
    ensureSocial(K).commitments.push({id: 'n3', kind: 'watch', debtor: db, creditor: cr.id, made: K.day, due: K.day + 1, until: K.day + 10, status: 'accepted'});
    die(a, K, cr, 'пал'); nights(a, K, 1);
    const c = K.social.commitments.find(x => x.id === 'n3');
    check('тот, кому обещано, погиб — обещание закрыто сразу', c.status === 'impossible', `${c.status} ${c.why}`);
  }
}

// ── the escort: a promise kept by a deed on the map — or not, and why
{
  const base = generateAtlas({seed: '790', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0}), fz = JSON.stringify(saveAtlas(base));
  const fresh = () => {
    const a = loadAtlas(JSON.parse(fz)), K = newCampaign(a, capitals(a)[0].town, {mode: 'local'}), [A, B] = K.members;
    for (const m of K.members) { m.hp = 1; m.local.traits = ['brave']; (m.social ||= {}).load = {tired: 0}; }
    A.local.traits = ['timid']; ensureSocial(K).relations[B.id] = {[A.id]: 3};
    return {a, K, A, B};
  };
  // asked on the evening: the faint-hearted asks one bolder, a friend says yes
  {
    const {a, K, A, B} = fresh(), lines = [], got = escortAsk(a, K, t => lines.push(t));
    check('робкий просит смелого пойти рядом за едой; друг обещает', got?.answer === 'yes' && got.c.creditor === A.id && got.c.debtor === B.id && got.c.kind === 'escort', JSON.stringify(got) + ' ' + lines.join(' | '));
  }
  const scene = (fix = () => {}) => {
    const X = fresh(), {a, K, A, B} = X;
    ensureSocial(K).commitments.push({id: 'e1', kind: 'escort', debtor: B.id, creditor: A.id, made: K.day - 1, due: K.day, until: K.day + 2, status: 'accepted'});
    const S = campSetup(a, K, {kind: 'stop', dayIn: 0}), w = openCamp(S), P = w.campaign.people, ga = P.get(A.id), gb = P.get(B.id);
    fix(w, ga, gb);
    return {...X, S, w, ga, gb};
  };
  const gatherJob = 'gather';
  {
    const X = scene((w, ga) => { ga.task = {id: 'job', job: gatherJob}; });
    const opt = escortOption(X.w, X.gb);
    check('на карте обещавший получает задачу «пойти рядом», пока тот работает снаружи', opt?.[0]?.id === 'company' && opt[0].who === X.ga.id && !!opt[0].promised, JSON.stringify(opt?.[0]));
    if (opt) { X.gb.task = opt[0]; enterEscort(X.w, X.gb, opt[0]); }
    const o = campOutcome(X.w), before = bondOf(X.K, X.A.id, X.B.id);
    check('исход стоянки: обещание исполнено делом', o.promises?.[0]?.state === 'kept', JSON.stringify(o.promises));
    applyCamp(X.a, X.K, X.S, o, null, 'stop');
    const c = X.K.social.commitments.find(x => x.id === 'e1');
    check('исполненное на карте — исполнено в походе: факт и связь у того, кого проводили', c.status === 'fulfilled' && X.K.social.facts.some(f => f.kind === 'keptEscort') && bondOf(X.K, X.A.id, X.B.id) > before, `${c.status}, связь ${before} → ${bondOf(X.K, X.A.id, X.B.id)}`);
  }
  {
    const X = scene((w, ga, gb) => { ga.task = {id: 'job', job: gatherJob}; gb.downed = true; });
    escortOption(X.w, X.gb);
    const b0 = bondOf(X.K, X.A.id, X.B.id), o = campOutcome(X.w); applyCamp(X.a, X.K, X.S, o, null, 'stop');
    const c = X.K.social.commitments.find(x => x.id === 'e1');
    check('обещавший упал — не вышло не по вине, связь не падает', c.status === 'failed' && c.why === 'hurt' && bondOf(X.K, X.A.id, X.B.id) >= b0, `${c.status} ${c.why}`);
  }
  {
    const X = scene((w, ga, gb) => { ga.task = {id: 'job', job: gatherJob}; gb.local = gb.local || {}; gb.traits = ['lazy']; });
    escortOption(X.w, X.gb);   // (seen out, but it did not go)
    const b0 = bondOf(X.K, X.A.id, X.B.id), o = campOutcome(X.w); applyCamp(X.a, X.K, X.S, o, null, 'stop');
    const c = X.K.social.commitments.find(x => x.id === 'e1');
    check('ленивый видел, что тот ушёл, и не пошёл — нарушено, связь падает', c.status === 'broken' && bondOf(X.K, X.A.id, X.B.id) < b0, `${c.status} ${c.why}`);
  }
  {
    const X = scene();
    const o = campOutcome(X.w); applyCamp(X.a, X.K, X.S, o, null, 'stop');
    const c = X.K.social.commitments.find(x => x.id === 'e1');
    check('тот не ходил наружу — обещание ждёт следующего дня стоянки, в срок', c.status === 'accepted', c.status);
  }
}

// ── a camp taken back in any order of the company: one taken — the friend grieves, whatever the order
{
  const base = generateAtlas({seed: '790', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0}), fz = JSON.stringify(saveAtlas(base));
  const run = rev => {
    const a = loadAtlas(JSON.parse(fz)), K = newCampaign(a, capitals(a)[0].town, {mode: 'local'}), [A, B] = K.members;
    ensureSocial(K).relations[B.id] = {[A.id]: 3};
    const S = campSetup(a, K, {kind: 'night', dayIn: 0}), o = campOutcome(runCamp(S));
    o.members = o.members.map(mo => (mo.id === A.id ? {id: A.id, alive: false, taken: true} : mo));
    if (rev) o.members.reverse();
    applyCamp(a, K, S, o, {kind: 'raiders', label: 'налётчики'}, 'night');
    return (B.social?.mood || []).map(e => e.id).sort().join();
  };
  const one = run(false), two = run(true);
  check('порядок участников не меняет исход стоянки: уведённого друга оплакивают при любом порядке', one === two && /loss|taken/.test(one), `${one} / ${two}`);
}

// ── the camp's outcome taken twice at the same tick: the same, the fallen bound once
{
  const base = generateAtlas({seed: '790', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const a = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(base)))), K = newCampaign(a, capitals(a)[0].town, {mode: 'local'});
  const S = campSetup(a, K, {kind: 'stop', dayIn: 0}), w = openCamp(S), ag = w.campaign.people.get(K.members[0].id);
  ag.downed = true; ag.hp = 0.01 * (ag.maxHp || 100);
  const o1 = campOutcome(w), o2 = campOutcome(w), h = o => o.members.find(m => m.id === K.members[0].id)?.hp;
  check('исход стоянки, взятый дважды на одном тике, тот же: перевязка одна', h(o1) === h(o2) && JSON.stringify(o1.facts) === JSON.stringify(o2.facts), `${h(o1)} / ${h(o2)}`);
}

// ── the alarm: a friend fallen, one's own nerve; the fallen bound only by the living
{
  const base = generateAtlas({seed: '842', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const a = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(base)))), K = newCampaign(a, capitals(a)[0].town, {mode: 'local'}), [A, B, C] = K.members;
  const R = ensureSocial(K).relations; R[A.id] = {[B.id]: 4};
  const S = campSetup(a, K, {kind: 'stop', dayIn: 0}), w = openCamp(S), P = w.campaign.people, a1 = P.get(A.id), b1 = P.get(B.id), c1 = P.get(C.id);
  b1.downed = true; b1.x = a1.x + 3; b1.y = a1.y; c1.x = a1.x - 3; c1.y = a1.y;
  const foe = {...c1, id: 99999, faction: 'raiders', x: b1.x + 1, y: b1.y, dead: false, downed: false, captive: null, member: null, task: null};
  w.agents.push(foe); w.campaign.alarm = true; w.campaign.foeObjs = [foe];
  const offers = warband.want(w, a1) || [], rescue = offers.find(o => o[0].id === 'aid' && o[0].who === b1.id);
  check('под тревогой друг бросается к упавшему другу — вариант сильнее строя', !!rescue && rescue[1] > offers[0][1], offers.map(o => `${o[0].id} ${o[1].toFixed(2)}`).join(', '));
  const cOffers = warband.want(w, c1) || [];
  check('чужой упавшему — без этого варианта', !cOffers.some(o => o[0].id === 'aid' && o[0].who === b1.id));
  c1.hp = c1.maxHp ? c1.maxHp * 0.4 : c1.hp * 0.4; c1.mods = {...c1.mods, bravery: 0.6};   // (hurt, but not past BOARD.hurt: those keep out anyway)
  check('тяжело раненый робкий может дрогнуть и отойти к огню', (warband.want(w, c1) || []).some(o => o[0].id === 'runHome'));
  // nobody on their feet: the fallen are not bound by anyone
  for (const ag of P.values()) if (ag !== b1) ag.dead = true;
  w.agents = w.agents.filter(x => !x.dead || x === b1);
  const o = campOutcome(w), ob = o.members.find(x => x.id === B.id);
  check('упавшего перевязывают только живые: некому — рана берёт своё', ob && !ob.alive && /некому/.test(ob.cause || ''), ob?.cause);
}

// ── the caravan's council with voices
{
  const base = generateAtlas({seed: '855', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const team = () => { const a = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(base)))), K = newCampaign(a, capitals(a)[0].town, {mode: 'auto'}); return {a, K}; };
  const cmds = [{id: 'caravan.camp.build', band: 'routine'}, {id: 'caravan.camp.goOn', band: 'routine'}];
  const ask = (c, opts) => (c.id.endsWith('goOn') && !opts.length ? null : {id: c.id, score: 1});
  const meetOf = (X, quiet, n = 200) => { let food = 0; for (let k = 0; k < n; k++) { const got = councilChoose(X.a, X.K, 'caravan.camp', cmds, ask, mulberry(k + 1), {x: {quiet, need: 8}}); if (got.option?.id === 'caravan.camp.build') food++; } return food / n; };
  // the same place and stores; one company fresh and bold, the other worn out, timid, and grieving one of its own
  const bold = team(), worn = team();
  for (const m of bold.K.members) { m.local.traits = ['brave']; (m.social ||= {}).load = {tired: 0}; }
  for (const m of worn.K.members) { m.local.traits = ['timid']; (m.social ||= {}).load = {tired: 0.9}; }
  bold.K.food = worn.K.food = 400;
  const fallen = worn.K.members.at(-1); die(worn.a, worn.K, fallen, 'пал');
  const qb = meetOf(bold, true), qw = meetOf(worn, true), db = meetOf(bold, false), dw = meetOf(worn, false);
  check('одна и та же клетка и запасы — разные команды решают по-разному (усталые чаще встают)', qw > qb, `встать на постройку: бодрые ${qb.toFixed(2)}, измотанные ${qw.toFixed(2)}`);
  check('опасная ночь взвешивается, а не запрещает: робкие и скорбящие встают реже, чем в тихом месте; смелые — встают и там', dw < qw && db > 0, `в опасном месте: смелые ${db.toFixed(2)}, робкие ${dw.toFixed(2)}`);
  const M = worn.K.social.meetings.at(-1);
  check('совет записан: голос каждого с правом, его желание и причины; пленные — без голоса', M && M.voices.length === worn.K.members.filter(m => m.alive && !m.captive).length && M.voices.every(v => v.want && Array.isArray(v.why)), JSON.stringify(M?.voices?.[0]));
  const was = COUNCIL.policy; COUNCIL.policy = 'lanes';
  const old = councilChoose(bold.a, bold.K, 'caravan.camp', cmds, ask, mulberry(1), {x: {quiet: true, need: 8}}).band;
  COUNCIL.policy = was;
  check('прежний совет по полосам — по-старому (политика переключается данными)', old === 'routine', old);
}

// ── one round of talk at the council: a proposal, an objection for a reason, the others moved by who spoke, an answer
{
  const base = generateAtlas({seed: '855', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const team = () => { const a = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(base)))), K = newCampaign(a, capitals(a)[0].town, {mode: 'auto'}); for (const m of K.members) { m.hp = 1; (m.social ||= {}).load = {tired: 0}; m.local.traits = []; } K.food = 400; return {a, K}; };
  const cmds = [{id: 'caravan.camp.food', band: 'routine'}, {id: 'caravan.camp.heal', band: 'routine'}];
  const ask = c => ({id: c.id, score: 1});
  const meet = (X, k = 1) => { councilChoose(X.a, X.K, 'caravan.camp', cmds, ask, mulberry(k), {x: {quiet: true, need: 8}}); return X.K.social.meetings.at(-1); };
  // all whole: nobody objects for a reason
  const calm = team(), M0 = meet(calm);
  check('нет причины — нет возражения: совет не переоценивает', M0.debate?.objector == null, JSON.stringify(M0.debate));
  // one badly wounded, the others whole: it objects with its wounds; friends of it are moved more than strangers
  const cold = team(), warm = team();
  for (const X of [cold, warm]) X.K.members[1].hp = 0.15;
  const B = warm.K.members[1], R = ensureSocial(warm.K).relations;
  for (const m of warm.K.members) if (m !== B) R[m.id] = {[B.id]: 4};
  const Mc = meet(cold), Mw = meet(warm), heal = 'caravan.camp.heal';
  check('раненый возражает своей причиной — ранами', Mc.debate?.objector === cold.K.members[1].id && Mc.debate.why === 'wounds' && Mc.debate.want === heal, JSON.stringify(Mc.debate));
  check('возражение друга двигает сильнее, чем чужого: вес «отлежаться» после разговора выше', (Mw.w[heal] ?? 0) > (Mc.w[heal] ?? 0), `чужие ${Mc.w[heal]}, друзья ${Mw.w[heal]}`);
  check('ответ предложившего записан: уступил, сошлись или настоял', ['yielded', 'met', 'held'].includes(Mc.debate.answer));
  const html = meetingHtml(cold.K, Mc);
  check('у костра слышен разговор: предложение, возражение, ответ', /Предлагаю/.test(html) && /Лучше/.test(html), html.replace(/<[^>]+>/g, ' ').slice(0, 200));
}

// ── the fire's scene: read, never decided again; the archive keeps the story
{
  const base = generateAtlas({seed: '868', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const a = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(base)))), K = newCampaign(a, capitals(a)[0].town, {mode: 'auto'});
  for (let k = 0; k < 6 && !K.social.meetings?.length; k++) stepCampaign(a);
  const before = JSON.stringify(K), meets = meetingsOf(K, K.day), html = meets.map(m => meetingHtml(K, m)).join('') + K.members.map(m => memberCardHtml(K, m)).join('');
  check('сцена у костра и карточки читают протокол и ничего не меняют в походе', meets.length > 0 && html.includes('Решили') && JSON.stringify(K) === before, `встреч ${K.social.meetings?.length || 0}`);
  const M = meets[0], spoke = M.voices.every(v => !(v.why || []).some(w => !['hunger', 'wounds', 'friend', 'tired', 'danger'].includes(w)));
  check('говорящий ссылается только на свои причины (голод, раны, раненый друг, усталость, опасность ночи)', spoke);
  K.members.push({...K.members[0], id: 999, name: K.members[0].name});   // a namesake
  archive(a, K); const rec = a.campaignsDone.at(-1);
  check('архив похода хранит людей по id и историю команды', rec.members.every(m => m.id != null) && new Set(rec.members.map(m => m.id)).size === rec.members.length && !!rec.social?.facts);
}

// ── the peaceful life: a newcomer, a sale
{
  const base = generateAtlas({seed: '881', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const a = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(base)))), K = newCampaign(a, capitals(a)[0].town, {mode: 'auto'}), [A, B, C] = K.members;
  for (const m of K.members) m.local.leans.social = 0.3;
  A.local.leans.social = 0.9;
  const nm = {...B, id: 500, name: 'Новичок', local: {...B.local}, social: null}; K.members.push(nm);
  const f = welcome(K, nm);
  check('новичка принимает самый общительный: факт и связь в обе стороны', f?.by === A.id && bondOf(K, nm.id, A.id) > 0 && bondOf(K, A.id, nm.id) > 0);
  B.align = {...B.align, mercy: 4}; C.align = {...C.align, mercy: -4}; C.values = ['gold'];
  judge(K, nm);
  check('продажу пленного не одобряет милосердный, а не всякий', B.social?.mood?.some(e => e.id === 'frowned') && !C.social?.mood?.some(e => e.id === 'frowned'));
}

// ── the same seed, the same story
{
  const base = generateAtlas({seed: '777', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0}), fz = JSON.stringify(saveAtlas(base));
  const run = () => { const a = loadAtlas(JSON.parse(fz)), K = newCampaign(a, capitals(a)[0].town, {mode: 'auto'}); for (let k = 0; k < 8; k++) stepCampaign(a); return socialHash(K); };
  const h1 = run(), h2 = run();
  // a save on the way: the rest of the walk goes on the same
  const a = loadAtlas(JSON.parse(fz)), K = newCampaign(a, capitals(a)[0].town, {mode: 'auto'}); for (let k = 0; k < 4; k++) stepCampaign(a);
  const b = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(a)))); for (let k = 0; k < 4; k++) { stepCampaign(a); stepCampaign(b); }
  check('один сид — одна история команды; сохранение в пути продолжается так же', h1 === h2 && socialHash(a.campaign) === socialHash(b.campaign), `${h1} / ${h2}; после загрузки ${socialHash(a.campaign)} / ${socialHash(b.campaign)}`);
  check('после загрузки совпадает вся модель команды, не только отпечаток', JSON.stringify(socialModel(a.campaign)) === JSON.stringify(socialModel(b.campaign)));
  // the fingerprint sees what decides what comes next: memory, a promise's terms, the leanings, a stream of chance
  const h0 = socialHash(a.campaign), m = a.campaign.members.find(x => x.alive), changes = [
    () => { (m.social ||= {}).memory = [...(m.social.memory || []), {fact: 'x', how: 'heard', from: 1}]; },
    () => { ensureSocial(a.campaign).commitments.push({id: 'z', kind: 'watch', debtor: 1, creditor: 2, made: 0, due: 1, until: 3, status: 'accepted'}); },
    () => { a.campaign.social.commitments.at(-1).due = 100; },
    () => { m.local.leans = {...m.local.leans, persist: (m.local.leans?.persist ?? 0.5) + 0.1}; },
    () => { a.campaign.rng.social = (a.campaign.rng.social ?? 1) + 1; },
  ];
  const seen = [h0];
  for (const f of changes) { f(); seen.push(socialHash(a.campaign)); }
  check('отпечаток различает память, сроки обещания, склонности, поток случайности', new Set(seen).size === seen.length, seen.join(' '));
}

// ── the settlement's council: the proposal that won is the one remembered (a second round may change it)
let councils = 0, round2 = 0, changed = 0, mismatched = 0;
for (const seed of ['fpl', 'x7', 'soc3']) {
  const notes = [];
  traceMode('collect', {sink: r => { if (r.point === 'settlement.council') notes.push(r); }});
  const w = newGame({...DEFAULT_CFG, seed});
  for (let d = 0; d < 12; d++) {
    for (let t = 0; t < DAY; t++) {
      const before = notes.length;
      step(w);
      if (notes.length === before) continue;
      const r = notes[notes.length - 1], won = r.pick.slice(r.pick.indexOf('(') + 1, -1);
      councils++; if (r.round2) round2++; if (r.round2 && r.opts[0]?.key !== r.pick) changed++;
      if (w.council.winner !== won) mismatched++;
      // the thoughts of those who spoke: «won» or «saving» only for the winner's backers
      for (const x of w.council.args || []) {
        const ag = colonists(w).find(o => o.id === x.id), th = ag?.diary?.find(e => e.t === w.tick || e.t === w.tick - 1);
        if (!th) continue;
        if ((x.key === won) !== (th.id !== 'councilLost')) mismatched++;
      }
    }
  }
  traceMode('off');
}
check('совет поселения: реакции и память — по итогу, в том числе когда второй тур меняет победителя', councils > 0 && mismatched === 0,
  `советов ${councils}, со вторым туром ${round2}, из них победитель сменился ${changed}, расхождений ${mismatched}`);

console.log(ok ? '\nok   договор живой команды держится' : '\nFAIL договор живой команды нарушен');
process.exit(ok ? 0 : 1);
