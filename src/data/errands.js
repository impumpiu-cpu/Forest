// The errands a capital gives its caravan (docs/CAMPAIGN.md «Поручения»; plan claude/ver_f-status.md Ф2). An errand is a quest
// of the one machine of campaign/quest.js — a goal with its guard, 0–3 clues that narrow it down, a storm, a trophy carried home,
// the world's pursuit — with its own goal in the world:
//   how   — 'crown': the crown of the world's history (campaign/quest.js makeQuest); 'epic': the calamity of the age (campaign/
//           epic.js makeEpicQuest — a world with a calamity to stop: atlas/calamity.js questHint); 'lair': a living lair of the
//           world, stormed and laid waste (campaign/errands.js)
//   tier  — I … V: how hard; the order of the list and the gold of the capital for it
//   lairs — the kinds of lair it may be (data/lairs.js); captives — only a lair that holds captives; leader — only one with a
//           living leader (atlas/leaders.js), who must die in the storm
//   at    — how far from home, as a share of the world's diagonal: [nearest, farthest]; the nearest of those that fit is taken
//           (`pick: 'far'` — the farthest)
//   clueAt — the clues on the way, at these shares of it (none: the place is known from the start)
//   guard — × the lair's garrison (campaign/land.js garrison: its strength, its kind's danger — data/quest.js QUEST.guard.lair):
//           the errand's tier, not the distance
//   trophy — [as named, accusative, gender] — what is carried home to the capital as the proof
//   pursuit — the world sends its bands after the trophy on the way home (data/quest.js QUEST.pursuit)
//   years — how long it may take, from the day it is taken (none: the campaign's own: data/campaign.js maxYears, EPIC.years)
//   gold  — what the capital pays the caravan when it is handed in (to its treasury, K.gold)
//   about — one line of what it is, for the screen
import {Registry} from '../core/registry.js';

export const ERRANDS = new Registry('errand');
ERRANDS.registerAll([
  {id: 'den', tier: 1, label: 'Разорить логово', how: 'lair', about: 'Логово поближе к столице не даёт покоя её землям. Место известно — дойти, взять штурмом, вернуться.',
    lairs: ['goblins', 'gnolls', 'spider', 'varg'], at: [0.04, 0.3], clueAt: [], guard: 1, trophy: ['Знамя логова', 'Знамя логова', 'n'], pursuit: false, years: 5, gold: 40},
  {id: 'captives', tier: 1, label: 'Вызволить пленных', how: 'lair', about: 'В логове держат пленных из земель державы. Разбить логово — и пленные вернутся домой.',
    captives: true, at: [0.04, 0.35], clueAt: [], guard: 1, trophy: ['Грамота об освобождении', 'Грамоту об освобождении', 'f'], pursuit: false, years: 5, gold: 50},
  {id: 'barrow', tier: 2, label: 'Очистить курганник', how: 'lair', about: 'Нежить тянет живых из окрестных сёл. Где её логово, знают лишь примерно: сперва найти след.',
    lairs: ['wights', 'ghouls'], at: [0.06, 0.4], clueAt: [0.5], guard: 1.1, trophy: ['Печать кургана', 'Печать кургана', 'f'], pursuit: false, years: 8, gold: 90},
  {id: 'chief', tier: 2, label: 'Голова главаря', how: 'lair', about: 'Главарь старого логова водит набеги на земли державы. Нужна его голова — штурмовать, когда он дома.',
    leader: true, at: [0.04, 0.45], clueAt: [0.5], guard: 1.1, trophy: ['Голова главаря', 'Голову главаря', 'f'], pursuit: true, years: 8, gold: 120},
  {id: 'crown', tier: 3, label: 'Вернуть корону', how: 'crown', about: 'Корона, потерянная историей мира: три следа, слухи в городах, штурм — и погоня по дороге домой.', gold: 200},
  {id: 'giants', tier: 3, label: 'Свергнуть вождя', how: 'lair', about: 'Великаны, тролли или огры собрались в силу далеко от столицы. Свергнуть их вождя.',
    lairs: ['giants', 'trolls', 'swamptrolls', 'icetrolls', 'ogres'], at: [0.1, 0.6], clueAt: [0.4, 0.75], guard: 1.2, trophy: ['Топор вождя', 'Топор вождя', 'm'], pursuit: true, years: 12, gold: 200},
  {id: 'calamity', tier: 4, label: 'Бедствие эпохи', how: 'epic', about: 'Бедствие, что готовит этот мир: могилы былых боссов, логово четвёртого — и артефакт, который его остановит.', gold: 300},
  {id: 'dragon', tier: 5, label: 'Убить дракона', how: 'lair', about: 'Дракон в своём логове. Сперва узнать, где оно, потом выстоять против него и его выводка.',
    lairs: ['dragon'], at: [0, 1], pick: 'near', clueAt: [0.4, 0.75], guard: 1.3, trophy: ['Сердце дракона', 'Сердце дракона', 'n'], pursuit: true, years: 20, gold: 400},
]);

export const TIER_LABEL = ['', 'I', 'II', 'III', 'IV', 'V'];

// the rules of the errands of a lair (campaign/errands.js):
//   wait   — days the council waits near a lair whose leader is away before it looks again
//   lesser — × the pay when the leader's head is not to be had (it got away, or fell to another hand): the lair's banner instead
//   dragon — the dragon itself on the local map (data/bestiary.js `dragon`, one, never more): its letters grown past its kind;
//            `brood` — the share of the guard's strength its drakes take (the rest is the dragon's)
// the board (campaign/errands.js boardFor): `per` targets of an errand whose place is known (no clues), the nearest first;
// the guard against the company in words — its strength over the company's (a fresh caravan of eight is a point of it,
// data/camp.js CAMP.foe.unit): up to each bound of `risk` the word beside it, past the last — the last; the towns the lair
// reaches, at most `towns`, and a raid on them told when not older than `raidYears`
// an errand failed in a campaign of chapters (campaign/ending.js failErrand): the attitude of every realm that knows the capital's
// realm to it falls by `att` (atlas/diplomacy.js: −5 … 5, drifting back by itself), never below `floor` by this alone
export const ERRAND = {wait: 10, lesser: 0.5, dragon: {S: 4, E: 6, A: 2}, brood: 0.12, fail: {att: 0.3, floor: -2},
  board: {per: 3, towns: 3, raidYears: 5, risk: [[0.7, 'по силам'], [1.1, 'тяжело'], [1.6, 'опасно'], [Infinity, 'не по силам']]}};

// the errand a campaign takes when none is chosen (a campaign of tests, of a save from before): the epic one where the world has
// a calamity to stop, else the crown — as before errands were
export const DEFAULT_ERRAND = epic => (epic ? 'calamity' : 'crown');
