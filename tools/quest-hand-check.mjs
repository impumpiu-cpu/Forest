// «Заселение мира» → «Кампания» (docs/TABLE.md этап 10): in a world settled by hand the calamity the hand set is the
// caravan's quest. One still waiting gathers at once where the hand put it, with the artifact and its boss in the lair;
// one already risen is left to the caravan (no heroes, no alliance take it now); with none left the graves and a fourth,
// as in an epic world; with no calamity at all, the crown of any world. The walk runs to its end; the same is the same.
import {newAtlas, runNextStage, landDone, atlasDone} from '../src/atlas/generate.js';
import {DEFAULT_ATLAS_CFG} from '../src/data/atlas.js';
import {startFree, landPeople, wildByLand, setCalamity, runYears, endRun} from '../src/atlas/settle.js';
import {questHint} from '../src/atlas/calamity.js';
import {biomeAt} from '../src/atlas/biomes.js';
import {saveAtlas, loadAtlas, worldMeta} from '../src/atlas/save.js';
import {capitals, newCampaign, runCampaign, stepCampaign, campaignHash, finished} from '../src/campaign/index.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };

const L0 = (() => { const a = newAtlas({...DEFAULT_ATLAS_CFG, seed: '11', size: 'small'}); while (!landDone(a)) runNextStage(a); return a; })();
const run = (a, years) => { runYears(a, years); while (!atlasDone(a)) runNextStage(a); endRun(a); };
const cellOf = (a, test) => { for (let i = 0; i < a.n; i++) if (!a.f.ocean[i] && a.f.lake[i] < 0 && test(i)) return i; return -1; };
// a settled world: two peoples, the wild's lairs, and the calamity the test asks for
function world(cal) {
  const a = structuredClone(L0); startFree(a);
  landPeople(a, 'elves', cellOf(a, i => ['forest', 'taiga'].includes(biomeAt(a, i)?.id) && i % a.w > a.w * 0.3));
  landPeople(a, 'humans', cellOf(a, i => ['meadow', 'steppe', 'forest'].includes(biomeAt(a, i)?.id) && i % a.w > a.w * 0.55));
  wildByLand(a);
  const at = cellOf(a, i => i % a.w < a.w * 0.45 && ((i / a.w) | 0) > a.h * 0.55);
  const c = cal ? setCalamity(a, {...cal, at}) : null;
  run(a, cal?.run ?? 15);
  return {a, c: c && a.calamities.find(x => x.id === c.id), at};
}
const freeze = a => JSON.stringify(saveAtlas(a));
const thaw = s => loadAtlas(JSON.parse(s));

// 1. a calamity still waiting: it gathers at the hand's place with the artifact
{
  const {a, c, at} = world({kind: 'necromancer', years: 40});
  const meta = worldMeta(a), hint = questHint(a);
  check('заселённый мир в библиотеке — «заселённый», с подсказкой квеста по бедствию руки', meta.free && hint?.kind === 'hand' && hint.calamity === c.id && c.phase === 'waiting', `${hint?.label}, ${c.phase}`);
  const frozen = freeze(a), b = thaw(frozen), K = newCampaign(b, capitals(b)[0].town, {mode: 'auto'}), Q = K.quest, cb = b.calamities.find(x => x.id === c.id);
  const lair = b.lairs.find(l => l.id === cb.lair);
  check('ждущее бедствие руки собирается сразу там, где его поставили: логово с боссом и артефактом — цель похода',
    Q?.epic && Q.calamity === cb.id && cb.phase === 'gathering' && cb.quest && cb.i === at && lair?.boss === cb.id && b.artifact.holder.kind === 'boss' && Q.crown.at === cb.i && cb.riseAt === c.riseAt,
    Q?.epic ? `${Q.crown.label}, поднимется в ${cb.riseAt}-м` : 'не тот квест');
  check('рассказ квеста — о бедствии руки', /начнётся бедствие|уже идёт/.test(Q.story), Q.story.slice(0, 90) + '…');
  runCampaign(b);
  check('поход доходит до конца; победа — босс бедствия руки пал от каравана, артефакт в столице', finished(K) && (K.phase !== 'won' || (cb.phase === 'fallen' && cb.fell.by === 'caravan' && b.artifact.holder.kind === 'capital')),
    `${K.phase}, день ${K.day}, бедствие ${cb.phase}${cb.fell ? ' — ' + cb.fell.by : ''}`);
  const b2 = thaw(frozen), K2 = newCampaign(b2, capitals(b2)[0].town, {mode: 'auto'}); runCampaign(b2);
  check('тот же мир и та же столица — тот же поход', campaignHash(K2) === campaignHash(K));
}

// 2. a calamity that has risen: the caravan's — heroes and alliances leave it
{
  const {a, c} = world({kind: 'brood', years: 3, run: 8});
  const K = newCampaign(a, capitals(a)[0].town, {mode: 'auto'}), Q = K.quest;
  for (let k = 0; k < 12 && stepCampaign(a); k++);
  check('поднявшееся бедствие руки — цель похода; герои его не запечатывают, союз на него не идёт', c.phase === 'rise' || (c.fell?.by === 'caravan') ? Q?.epic && Q.calamity === c.id && c.quest && c.heroesAt > 1e6 && !(a.alliances || []).some(x => x.calamity === c.id && x.year > K.started?.year) : false,
    `${c.phase}${c.fell ? ' — ' + c.fell.by : ''}, ${Q?.crown?.label}`);
}

// 3. no calamity at all: the crown of any world
{
  const {a} = world(null);
  const K = newCampaign(a, capitals(a)[0].town, {mode: 'auto'});
  check('без бедствий — квест короны, как в любом мире', !questHint(a) && K.quest && !K.quest.epic, K.quest?.crown?.label);
}

// 4. every calamity passed: the graves and a fourth, as in an epic world
{
  const {a, c} = world({kind: 'necromancer', years: 3, run: 40});
  const K = newCampaign(a, capitals(a)[0].town, {mode: 'auto'}), Q = K.quest, c4 = a.calamities.at(-1);
  check('все бедствия прошли — могилы и четвёртый, как в эпическом мире', c.phase === 'fallen' && Q?.epic && c4.era === 'after' && Q.clues.some(x => x.kind === 'grave'),
    `${c.fell?.by}, следов ${Q?.clues?.length}, четвёртое ${c4.label}`);
}

if (fail.length) { console.log(`\n${fail.length} проверок не прошло`); process.exit(1); }
console.log('\nВсе проверки квеста заселённого мира прошли.');
