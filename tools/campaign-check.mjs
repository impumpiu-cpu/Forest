// The campaign's core: from every major people's capital of a small world a caravan sets out — eight
// of the realm's race (four knights, four squires) in their own gear, food on their backs, a goal that
// can be walked to — and walks the world day by day while history goes on. Checked: the caravan reaches
// its goal and comes home (or dies trying) with no broken numbers; the same seed gives the same walk;
// a world saved in the middle of a campaign goes on exactly as the unbroken one; the world lives on
// (history past its end, told once); the caravan is a party of the world. Prints how each went.
// Usage: node tools/campaign-check.mjs [seeds=1] [size=small]
import {generateAtlas, atlasHash} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign, stepCampaign, runCampaign, campaignHash, alive} from '../src/campaign/index.js';
import {findPath} from '../src/atlas/roads.js';
import {scratch} from '../src/campaign/march.js';
import {CAMPAIGN} from '../src/data/campaign.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';
import {ITEMS} from '../src/data/items.js';

const seeds = +(process.argv[2] || 1), size = process.argv[3] || 'small';
let ok = true;
const check = (what, pass, info = '') => { ok &&= pass; if (!pass || info) console.log(`${pass ? 'ok  ' : 'FAIL'} ${what}${info ? ': ' + info : ''}`); return pass; };
const finite = K => [K.food, K.x, K.y, K.gold, ...K.members.map(m => m.hp)].every(Number.isFinite);
const tally = {won: 0, lost: 0, timeout: 0};

for (let s = 0; s < seeds; s++) {
  const seed = String(777 + s * 13), base = generateAtlas({seed, size, land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const frozen = JSON.stringify(saveAtlas(base)), fresh = () => loadAtlas(JSON.parse(frozen));
  const caps = capitals(base);
  check(`сид ${seed}: столицы только мажорных народов`, caps.length > 0 && caps.every(c => CAMPAIGN.peoples.includes(c.people)), `${caps.length}: ${[...new Set(caps.map(c => c.peopleLabel))].join(', ')}`);
  // one capital of each people
  const pick = CAMPAIGN.peoples.map(p => caps.find(c => c.people === p)).filter(Boolean);
  const bad = [];
  for (const c of pick) {
    const a = fresh(), K = newCampaign(a, c.town), race = WORLD_PEOPLES.get(c.people).race;
    const knights = K.members.filter(m => m.role === 'knight').length, squires = K.members.filter(m => m.role === 'squire').length;
    if (knights !== CAMPAIGN.knights || squires !== CAMPAIGN.squires || K.members.some(m => m.race !== race || !m.special)) bad.push(`${c.label}: состав ${knights}+${squires}`);
    if (K.members.some(m => [...m.gear.hand, m.gear.body].some(id => !ITEMS.has(id)))) bad.push(`${c.label}: неизвестная вещь`);
    if (K.members.some(m => m.role === 'knight' && !['jerkin', 'hardleather'].includes(m.gear.body))) bad.push(`${c.label}: рыцарь не в коже`);
    if (K.goal == null || !findPath(a, K.home, K.goal, K.people, scratch(a))) bad.push(`${c.label}: к цели нет пути`);
    if (!(a.parties || []).some(p => p.kind === 'caravan' && p.id === K.party)) bad.push(`${c.label}: караван не отряд мира`);
    const y0 = a.hist.year;
    runCampaign(a);
    tally[K.phase]++;
    if (!finite(K)) bad.push(`${c.label}: числа сломались`);
    if (K.phase === 'won' && !(K.log.some(l => l.kind === 'goal') && K.log.some(l => l.kind === 'home'))) bad.push(`${c.label}: вернулся, не дойдя до цели`);
    if (K.phase === 'lost' && alive(K).length) bad.push(`${c.label}: проигрыш с живыми`);
    if (!(a.hist.year > y0) && K.day > 120) bad.push(`${c.label}: мир не жил`);
    if (a.chronicle.filter(l => /Эпоха молодых народов подошла к концу/.test(l.text)).length !== 1) bad.push(`${c.label}: конец эпохи сказан не один раз`);
    if (!a.chronicle.some(l => l.campaign)) bad.push(`${c.label}: в летописи мира нет похода`);
    const dead = K.members.filter(m => !m.alive).length;
    console.log(`     ${c.label.padEnd(24)} ${K.phase.padEnd(7)} ${(K.day / 120).toFixed(1).padStart(4)} лет, живы ${8 - dead}/8, боёв ${K.stats.fights}, голодных дней ${K.stats.hungryDays}, мир ${y0}→${a.hist.year}`);
  }
  check(`сид ${seed}: походы от столиц каждого народа`, !bad.length, bad.slice(0, 5).join('; '));

  // the same seed, the same walk; a save in the middle goes on as the unbroken one
  const c = pick[0], A = fresh(), B = fresh();
  newCampaign(A, c.town); newCampaign(B, c.town);
  for (let k = 0; k < 6; k++) { stepCampaign(A); stepCampaign(B); }
  check(`сид ${seed}: тот же поход по тому же сиду`, campaignHash(A.campaign) === campaignHash(B.campaign) && atlasHash(A) === atlasHash(B), campaignHash(A.campaign));
  const C = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(A))));
  for (let k = 0; k < 6; k++) { stepCampaign(A); stepCampaign(C); }
  check(`сид ${seed}: сохранённый посреди похода мир идёт так же`, campaignHash(A.campaign) === campaignHash(C.campaign) && atlasHash(A) === atlasHash(C), `день ${A.campaign.day}`);
}
check('хотя бы один караван дошёл и вернулся', tally.won > 0, JSON.stringify(tally));
if (!ok) process.exit(1);
