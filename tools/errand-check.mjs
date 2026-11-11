// The errands (Ver_F Ф2; data/errands.js, campaign/errands.js, campaign/ending.js handIn; docs/CAMPAIGN.md «Поручения»).
//   the list: every errand of the table, each with whether the world has it and why not; the crown chosen by hand is the walk
//   of the world's own (the same walk, to the same end); each errand the world has is laid out, walked to its end, the same twice;
//   an errand of a lair won lays the lair waste in the world (by the capital's hand); a campaign of chapters waits at the capital
//   after the errand handed in (the world does not move), is saved and loaded there, goes on with the next errand as the
//   unbroken one, ends with the epilogue and the ascension, and keeps its errands in the world's archive.
//   node tools/errand-check.mjs [seed=415]
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign, stepCampaign, finished, campaignHash, errandsFor, nextErrand, endCampaign, mayAscend} from '../src/campaign/index.js';
import {ERRANDS} from '../src/data/errands.js';

let fails = 0;
const ok = (cond, what, detail = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`); if (!cond) fails++; };
const seed = process.argv[2] || '415';
const base = generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
const fz = JSON.stringify(saveAtlas(base)), fresh = () => loadAtlas(JSON.parse(fz));
const cap = capitals(base)[0];
const walk = (a, K, most = 400) => { let n = 0; while (!finished(K) && K.phase !== 'home' && n < most) { stepCampaign(a); n++; } return n; };
const start = (errand, more = {}) => { const a = fresh(); return [a, newCampaign(a, cap.town, {mode: 'auto', ...(errand ? {errand} : {}), ...more})]; };

// ── the list
const list = errandsFor(base, cap.town);
ok(list.length === ERRANDS.all().length && list.every(e => typeof e.ok === 'boolean'), 'список: каждое поручение таблицы — с тем, есть ли оно в мире', list.map(e => `${e.id}${e.ok ? '' : '−'}`).join(' '));
ok(list.every(e => e.ok || e.why), 'недоступное — с причиной');
ok(list.filter(e => e.ok && ERRANDS.get(e.id).how === 'lair').every(e => e.goal), 'поручение логова — с целью: логово и где оно');

// ── the crown by hand is the world's own walk
{
  const [a1, K1] = start(null), [a2, K2] = start('crown');
  walk(a1, K1); walk(a2, K2);
  ok(campaignHash(K1) === campaignHash(K2) && K1.phase === K2.phase, '«Вернуть корону», выбранное рукой, — тот же поход, что без выбора', `${K1.phase}, день ${K1.day}`);
}

// ── each errand the world has: laid out, walked to its end, the same twice; a lair won is laid waste by the capital
for (const e of list.filter(e => e.ok)) {
  const E = ERRANDS.get(e.id);
  const [a, K] = start(e.id), [b, L] = start(e.id);
  ok(K.quest?.errand === e.id && K.quest.tier === E.tier, `${e.id}: поручение разложено`, K.quest ? `${K.quest.crown.label}; следов ${K.quest.clues.length}` : 'нет');
  if (E.how === 'lair') ok(K.quest.until === E.years * 120 && K.quest.clues.length === E.clueAt.length && K.quest.crown.exact === !E.clueAt.length, `${e.id}: срок, следы и известное место — как в строке`);
  walk(a, K); walk(b, L);
  ok(finished(K), `${e.id}: дошло до конца`, `${K.phase}, день ${K.day}, штурмов ${K.stats.storms || 0}`);
  ok(campaignHash(K) === campaignHash(L), `${e.id}: тот же сид — тот же поход`);
  if (E.how === 'lair' && K.phase === 'won') {
    const l = a.lairs.find(x => x.id === K.quest.lair);
    ok(l && !l.alive && l.clearedBy === K.capital, `${e.id}: логово разорено в мире рукой столицы`, l ? `${l.kind} «${l.name}»` : '');
    ok(K.log.some(x => x.kind === 'home' && x.text.includes('в доказательство')), `${e.id}: трофей принесён в столицу`);
  }
}

// ── a campaign of chapters
{
  const first = list.find(e => e.ok && e.tier === 1)?.id || 'crown', second = list.find(e => e.ok && e.tier === 2)?.id || first;
  const [a, K] = start(first, {chapters: true});
  walk(a, K);
  ok(K.phase === 'home' && K.done?.length === 1 && K.done[0].errand === first, `главы: поручение «${first}» сдано, караван ждёт в столице`, `день ${K.day}, казна ${K.gold}`);
  const step0 = a.hist.step, day0 = K.day;
  stepCampaign(a); stepCampaign(a);
  ok(a.hist.step === step0 && K.day === day0, 'пока караван ждёт, мир стоит');
  ok(errandsFor(a, K.capital).find(e => e.id === first)?.goal !== list.find(e => e.id === first).goal, 'разорённое логово больше не предлагается', errandsFor(a, K.capital).find(e => e.id === first)?.goal || errandsFor(a, K.capital).find(e => e.id === first)?.why);
  const b = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(a))));
  ok(b.campaign.phase === 'home', 'сохранённый в столице поход загружается ждущим');
  nextErrand(a, second); nextErrand(b, second);
  ok(K.phase === 'out' && K.quest.errand === second && K.quest.from === day0 && K.members.filter(m => m.alive && !m.captive).every(m => m.hp === 1), `новое поручение «${second}»: та же команда, раны залечены, срок — с сегодняшнего дня`);
  walk(a, K); walk(b, b.campaign);
  ok(campaignHash(K) === campaignHash(b.campaign), 'загруженный в столице поход идёт с новым поручением так же');
  if (K.phase === 'home') {
    endCampaign(a);
    let n = 0; while (!finished(K) && n < 20) { stepCampaign(a); n++; }
    const P = a.campaignsDone?.at(-1);
    ok(finished(K) && K.phase === 'won', 'конец по слову игрока: эпилог рассказан');
    ok(P?.errands?.length === 2 && P.errands.map(d => d.errand).join() === `${first},${second}`, 'архив мира хранит сданные поручения', P?.errands?.map(d => `${d.errand}:${d.tier}`).join(' '));
    ok(mayAscend(K).length > 0, 'живые могут вознестись', `${mayAscend(K).length}`);
    ok(!K.log.some(l => l.kind === 'epilogue' && /корон/.test(l.text)), 'эпилог без короны, которой не было');
  } else ok(true, `второе поручение кончилось иначе: ${K.phase} — главы не проверить до конца на этом сиде`);
}

if (fails) { console.log(`\nerrand-check: FAIL ×${fails}`); process.exit(1); }
console.log('\nerrand-check: ok');
