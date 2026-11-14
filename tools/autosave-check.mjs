// The campaign saved by itself (Ver_F Ф0; ui/autosave.js; docs/GAME.md «Сохранения и миры»).
//   the screen saves at a season's boundary, before the next season is computed: a walk loaded from that save and walked on
//   comes out as the unbroken one, at every boundary, to its end (the epilogue too); a save of a walk that is over loads
//   as over; «Продолжить» opens only a walk whose world is in the library and is not over; a save at a boundary is due
//   only when the walk changed and the time has come.
//   node tools/autosave-check.mjs [seasons=12]
import {generateAtlas, atlasHash} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign, stepCampaign, campaignHash, finished} from '../src/campaign/index.js';
import {AUTOSAVE, continueOf, saveDue} from '../src/ui/autosave.js';

let fails = 0;
const ok = (cond, what, detail = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`); if (!cond) fails++; };
const seasons = +(process.argv[2] || 12);

// ── the pointer and the rhythm (pure)
const index = [{id: 'w1', name: 'Мир: поход из Брода', campaign: {phase: 'out', day: 40}}, {id: 'w2', name: 'Мир', campaign: null}];
ok(continueOf({id: 'w1', from: 'Брода', day: 40}, index)?.name === 'Мир: поход из Брода', '«Продолжить» — поход, чей мир в библиотеке');
ok(continueOf({id: 'w9', day: 40}, index) === null, 'мира нет в библиотеке — продолжать нечего');
ok(continueOf({id: 'w2', day: 40}, index) === null, 'в записи мира нет похода — продолжать нечего');
ok(continueOf({id: 'w1', day: 40, done: true}, index) === null, 'поход окончен — продолжать нечего');
ok(continueOf(null, index) === null, 'указателя нет — продолжать нечего');
ok(saveDue(null, 0, 0), 'первая граница сезона после выхода — сохранить');
ok(!saveDue({day: 30, at: 0}, AUTOSAVE.every * 5, 30), 'поход не изменился — не сохранять');
ok(!saveDue({day: 30, at: 0}, AUTOSAVE.every - 1, 60), 'время не пришло — не сохранять');
ok(saveDue({day: 30, at: 0}, AUTOSAVE.every, 60), 'поход изменился и время пришло — сохранить');

// ── the save at a boundary: what the screen saves (before the next season) loads and walks on as the unbroken walk
const base = generateAtlas({seed: '415', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
const fz = JSON.stringify(saveAtlas(base)), fresh = () => loadAtlas(JSON.parse(fz));
const cap = capitals(base)[0];
const A = fresh(); newCampaign(A, cap.town, {mode: 'auto'});
const saves = [];   // the boundaries saved, as the screen would: [season, the save]
for (let s = 0; s < seasons && !finished(A.campaign); s++) {
  if (s % 3 === 0) saves.push([s, JSON.stringify(saveAtlas(A))]);
  stepCampaign(A);
}
let same = 0;
for (const [s, json] of saves) {
  const B = loadAtlas(JSON.parse(json));
  for (let k = s; k < seasons && !finished(B.campaign); k++) stepCampaign(B);
  if (campaignHash(A.campaign) === campaignHash(B.campaign) && atlasHash(A) === atlasHash(B)) same++;
  else ok(false, `сохранённый на границе ${s}-го сезона поход идёт иначе`, `день ${B.campaign.day} против ${A.campaign.day}`);
}
ok(same === saves.length, `поход, сохранённый на границе сезона, идёт как непрерывный`, `${same} из ${saves.length} границ, до дня ${A.campaign.day}`);

// ── to the end: a walk saved over and walked on ends as the unbroken one; the save of a walk over loads as over
const C = fresh(); newCampaign(C, cap.town, {mode: 'auto'});
let mid = null, n = 0;
while (!finished(C.campaign) && n < 400) { if (n === 20) mid = JSON.stringify(saveAtlas(C)); stepCampaign(C); n++; }
ok(finished(C.campaign), 'поход дошёл до конца', `${C.campaign.phase}, ${n} сезонов`);
if (mid) {
  const D = loadAtlas(JSON.parse(mid)); let m = 20;
  while (!finished(D.campaign) && m < 400) { stepCampaign(D); m++; }
  ok(campaignHash(C.campaign) === campaignHash(D.campaign) && m === n, 'сохранённый на 20-м сезоне поход кончается так же', `${D.campaign.phase}, ${m} сезонов`);
}
const E = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(C))));
ok(finished(E.campaign) && E.campaign.phase === C.campaign.phase, 'окончённый поход загружается окончённым', E.campaign.phase);

if (fails) { console.log(`\nautosave-check: FAIL ×${fails}`); process.exit(1); }
console.log('\nautosave-check: ok');
