// The caravan's camp (docs/CAMPAIGN.md «Лагерь каравана»): a soldiers' camp — shelters for the night, the healer's hut from
// the start, the cauldron with the people's dish, the hunt and the gathering (no fishing), a herd for milk and meat; the
// peoples' own ways: the humans' hitching post and trade, the elves' forest and herb brews, the dwarves' digging and field
// forge, the greenskins' herd and bearers. `npm run caravan`.
import {generateAtlas} from '../src/atlas/generate.js';
import {capitals, newCampaign} from '../src/campaign/index.js';
import {campFx, fieldBuildings, capacity, campOf} from '../src/campaign/baggage.js';
import {herdMax} from '../src/campaign/town.js';
import {termsOf} from '../src/campaign/road.js';
import {BUILDINGS} from '../src/data/buildings.js';
import {CAMP_KIT, PEOPLE_KIT, BEASTS} from '../src/data/transport.js';
import {JOBS} from '../src/data/jobs.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };

const portable = BUILDINGS.filter(b => b.portable).map(b => b.id);
check('лагерь каравана — только шалаши и хижина лекаря: ни кузни, ни мастерской, ни навеса, ни хижины рыбака', portable.length === 2 && portable.includes('hut') && portable.includes('healerhut'), portable.join(', '));

const a = generateAtlas({seed: '777', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
const caps = capitals(a), K = {};
for (const p of ['humans', 'elves', 'dwarves', 'orcs']) { const c = caps.find(x => x.people === p); if (c) { K[p] = newCampaign(a, c.town, {mode: 'auto'}); a.campaign = null; } }
const H = K.humans || Object.values(K)[0];
check('караван выходит с хижиной лекаря и без удочки', Object.values(K).every(k => campOf(k).includes('healerhut') && !k.members.some(m => m.gear.hand.includes('rod'))));

// the shelters: none — the ground, one — as ever, two — better; no third
{
  const heal = n => { H.buildings = ['healerhut', ...Array(n).fill('hut')]; return campFx(H, 'heal'); };
  const h0 = heal(0), h1 = heal(1), h2 = heal(2);
  H.buildings = ['healerhut', 'hut', 'hut']; const third = fieldBuildings(H).some(b => b.id === 'hut');
  H.buildings = ['healerhut']; const first = fieldBuildings(H).some(b => b.id === 'hut');
  check('шалаши: без них лечение хуже, с одним как обычно, с двумя лучше; третий не ставят', h0 < h1 && h1 < h2 && first && !third, `лечение ${h0.toFixed(2)} · ${h1.toFixed(2)} · ${h2.toFixed(2)}`);
}
// the cauldron: every people's dish
check('котёл: у каждого народа своё блюдо, еда стоянки больше', ['humans', 'elves', 'dwarves', 'orcs'].every(p => (CAMP_KIT.dish[p]?.food || 0) > 1), Object.values(CAMP_KIT.dish).map(d => d.label).join(', '));
// the herd and the peoples
{
  const m = p => herdMax({people: p});
  check('стадо: у людей и дварфов 2, у зеленокожих вдвое больше, эльфы скота не держат', m('humans') === 2 && m('dwarves') === 2 && m('orcs') === 4 && m('elves') === 0 && BEASTS.goat.use === 'food');
  if (K.humans) { const t = termsOf(a, K.humans, null), o = termsOf(a, {...K.humans, people: 'dwarves'}, null); check('люди торгуют выгоднее', t.buy < o.buy && t.sell > o.sell, `покупка ×${(t.buy / o.buy).toFixed(2)}, продажа ×${(t.sell / o.sell).toFixed(2)}`); }
  if (K.orcs) { const k = K.orcs, cap0 = capacity(k); k.members.push({...k.members[0], id: 999, captive: {bonds: 'rope'}, alive: true, back: 1}); const cap1 = capacity(k); k.members.pop();
    check('пленные зеленокожих несут ещё короб', cap1 - cap0 > 6, `+${cap1 - cap0}`); }
  check('дварфы копают больше и чинят големов у походного горна; эльфы варят зелья без горшков', PEOPLE_KIT.dwarves.mine > 1 && PEOPLE_KIT.dwarves.forge && PEOPLE_KIT.elves.noPots && PEOPLE_KIT.elves.forage.wood > 1);
}
check('в караване не рыбачат (в поселении — да)', !JOBS.get('fish').canDo({campaign: {}}, {gear: {tool: {fish: 1.6}}}) && JOBS.get('fish').canDo({}, {gear: {tool: {fish: 1.6}}}));

if (fail.length) process.exit(1);
