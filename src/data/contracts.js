// The contracts of the world for the guild (plan claude/guild-plan.md Г2б; docs/GUILD.md «Договоры»; the author's word 13.11):
// a town or a realm posts a need, puts the gold for it aside from its own treasury (the reserve), and the guild takes it or
// leaves it. A contract's goal is one the local map already knows — a lair stormed, its master killed, a place found by its
// traces — of a living lair of the world, or of a camp put up for this contract alone (a temporary lair: «разбойники зимуют в
// дальнем ущелье», near, weaker than a lair of the world, gone when the contract is closed). Settled by campaign/contracts.js.
//
// CONTRACT — the rules:
//   board  — at most `open[tier]` one-off contracts of a tier stand on the guild's board at once; each season a missing one is
//            posted with the chance `post` (the first season: all of them)
//   offer  — the days an offer stands before it is taken: [least, most] (drawn)
//   pay    — [least, most] gold by tier (drawn); the issuer puts aside at most `share` of its treasury for one contract; one
//            that cannot put aside `least` × the least of the tier posts no one-off (a chain's step is posted all the same:
//            for what the treasury can, or for nothing — «казна пуста»)
//   issuer — up to tier `town` the guild's town pays (its treasury, town.gold), above it the realm (realm.gold); a town
//            or a realm with nothing — the other
//   time   — the deadline, from the day it is taken: `base[tier]` + `road` × the days there and back
//   camp   — a temporary lair: `days[tier]` [least, most] of the walk from the guild's town (the author's word: tier I — about a
//            month there and a month back), its guard `s[tier]` (× data/camp.js CAMP.foe.unit, a fresh eight)
//   summon — below
//   fame   — the guild's fame (its level: data/guild.js GUILD.level): + `won[tier]` when paid; when not: − `won[tier]` × `lost`
//            (failed, the party lost or beaten back, or let go in the last `late` of its time), × `abort` (let go before it)
//   partial — not handed in, but the goal's guard was broken in part (the author's word 13.11: a failure, but not so dire): the
//            share of the guard destroyed (its strength now against its full, campaign/quest.js bleedGuard), at least `least` —
//            paid that share of the reserve less `cut` of it (the rest back to the issuer), the fame lost × (1 − the share)
//   retreat — storms of the goal beaten back before a guild's party gives up and comes home with nothing (the author's word 13.11)
export const CONTRACT = {
  board: {open: [0, 3, 2, 2, 1, 1], post: 1},
  offer: [60, 150],
  pay: [null, [20, 40], [45, 80], [90, 160], [160, 280], [260, 450]], share: 0.6, least: 0.5,
  issuer: {town: 2},
  time: {base: [0, 30, 60, 120, 240, 360], road: 1.5},
  camp: {days: [null, [12, 30], [18, 40], [25, 55], [35, 70], [45, 90]], s: [0, 0.55, 0.9, 1.3, 1.8, 2.5]},
  fame: {won: [0, 4, 8, 14, 22, 34], lost: 1.5, abort: 0.25, late: 0.2},
  retreat: 2,
  partial: {least: 0.15, cut: 0.3},
  summon: 0.3,
  clueAt: [0.5],   // a camp found by its traces: its one clue at this share of the way (data/quest.js clueAt)   // a camp of a rite (`summon`): the share of its guard that are the dead it raised (data/camp.js `with`)
};

// CONTRACTS — the one-off contracts. A row:
//   tier, label, about — what it is (the card's first line and the line under it)
//   errand — a living lair of the world, chosen as data/errands.js picks it for this errand (its lairs, its distance, its clues,
//            its guard × tier, its trophy, its pursuit): the target is fixed when posted, shown on the card
//   camp   — a temporary lair put up for it: `band` (a band of people: bandits, cultists, undead) or `lair` (a kind of lair of
//            data/lairs.js: its folk, its danger); `name` — what it is called, `boss` — who leads it (name, species, letters
//            grown); `clue` — its place is found by the traces (else known); `trophy` — [nominative, accusative, gender]
//   story  — the line of the need, {town} — the issuer's town, {where} — where the camp is
import {Registry} from '../core/registry.js';

export const CONTRACTS = new Registry('contract');
CONTRACTS.registerAll([
  {id: 'winterCamp', tier: 1, label: 'Зимний лагерь разбойников', about: 'Разбойники встали лагерем на зиму неподалёку. Разогнать, пока не начали грабить обозы.',
    camp: {band: 'bandits', name: 'лагерь разбойников', trophy: ['Котёл атамана', 'Котёл атамана', 'm']},
    story: 'Разбойники зимуют {where}; обозы {town} боятся выходить за околицу.'},
  {id: 'den', tier: 1, label: 'Разорить логово', about: 'Логово поближе к городу не даёт покоя его землям.', errand: 'den'},
  {id: 'captives', tier: 1, label: 'Вызволить пленных', about: 'В логове держат пленных из земель державы.', errand: 'captives'},
  {id: 'gnollRaid', tier: 1, label: 'Стан гноллов-налётчиков', about: 'Шайка гноллов поставила стан у дороги и выходит на неё по ночам.',
    camp: {lair: 'gnolls', name: 'стан налётчиков', trophy: ['Тотем стана', 'Тотем стана', 'm']},
    story: 'Гноллы-налётчики встали станом {where}.'},
  {id: 'barrow', tier: 2, label: 'Очистить курганник', about: 'Нежить тянет живых из окрестных сёл. Сперва найти её логово.', errand: 'barrow'},
  {id: 'chief', tier: 2, label: 'Голова главаря', about: 'Главарь старого логова водит набеги на земли державы.', errand: 'chief'},
  {id: 'trollFord', tier: 2, label: 'Тролли у переправы', about: 'Тролли засели у переправы и берут плату — людьми.',
    camp: {lair: 'trolls', name: 'логово у переправы', trophy: ['Дубина тролля', 'Дубину тролля', 'f']},
    story: 'Тролли засели у переправы {where}: ни один обоз {town} не прошёл без потерь.'},
  {id: 'ogreHold', tier: 3, label: 'Огры в старом остроге', about: 'Огры заняли брошенный острог и спускаются оттуда к сёлам.',
    camp: {lair: 'ogres', name: 'острог огров', clue: true, trophy: ['Кольцо вожака огров', 'Кольцо вожака огров', 'n']},
    story: 'Огры заняли брошенный острог где-то {where}; где именно — скажут следы.'},
  {id: 'giants', tier: 3, label: 'Свергнуть вождя', about: 'Великаны, тролли или огры собрались в силу далеко от столицы.', errand: 'giants'},
  {id: 'wyvernNest', tier: 4, label: 'Гнездо виверн', about: 'Пара виверн свила гнездо на скалах и таскает скот, а теперь и пастухов.',
    camp: {lair: 'wyvern', name: 'гнездо виверн', clue: true, trophy: ['Жало виверны', 'Жало виверны', 'n']},
    story: 'Виверны гнездятся {where}; пастухи {town} не выгоняют стада.'},
  {id: 'dragon', tier: 5, label: 'Убить дракона', about: 'Дракон в своём логове. Сперва узнать, где оно, потом выстоять против него.', errand: 'dragon'},
]);

// CHAINS — the stories (the author's word 13.11: four or five missions in a row, their ends by the side missions and the
// failures). A chain is offered once to a guild whose level has reached `level`; its steps are contracts of the same shape as
// above (camp or errand), each posted when the one before it is closed, by `next` (`level` — the guild's level it opens at:
// data/guild.js GUILD.level):
//   next   — {won, lost}: the step that follows when it was handed in, when it failed (or the party was lost); none — the end
//   flag   — set on the chain when the step is handed in (`won`) or failed (`lost`): the later steps read them
//   side   — a contract posted beside this step (its own card, its own pay): handed in, it sets its flag
//   unless — handed in without the flag: the step named instead of `next.won` ({flag: step})
//   strong — × the guard of the step by the flags: {flag: ×}
//   ends   — the chain's last line by how it ended: {won, lost} (or by a flag: `won.flag`)
export const CHAINS = new Registry('chain');
CHAINS.registerAll([
  {id: 'blackbeard', label: 'Рубака Чернобород', level: 1, about: 'Разбойничий атаман собирает людей по лесам. Найти его — и снять голову.', start: 'scouts',
    steps: {
      scouts: {tier: 1, label: 'Разведчики Чернобороды', camp: {band: 'bandits', name: 'стоянка разведчиков', trophy: ['Нож разведчика', 'Нож разведчика', 'm']},
        story: 'Люди Рубаки Чернобороды высматривают обозы {town}; их стоянку видели {where}.', next: {won: 'winter', lost: 'winter'}, flag: {lost: 'warned'}},
      winter: {tier: 1, label: 'Зимовье Чернобороды', camp: {band: 'bandits', name: 'зимовье разбойников', boss: {name: 'Сивый Клык', species: 'human', add: {S: 2, E: 1}}, trophy: ['Плащ Сивого Клыка', 'Плащ Сивого Клыка', 'm']},
        story: 'Разбойники Рубаки Чернобороды зимуют {where}. Ведёт их Сивый Клык, правая рука атамана.', strong: {warned: 1.25}, next: {won: 'stash', lost: 'stash'}, flag: {lost: 'warned'}},
      stash: {tier: 2, label: 'Тайник Чернобороды', camp: {band: 'bandits', name: 'тайник атамана', clue: true, trophy: ['Казна Чернобороды', 'Казну Чернобороды', 'f']},
        story: 'В лагере нашли карту: у Чернобороды есть тайник где-то {where}. Без казны ему не на что держать людей.', next: {won: 'hold', lost: 'hold'}, flag: {won: 'poor', lost: 'rich'}},
      hold: {tier: 2, label: 'Голова Рубаки Чернобороды', camp: {band: 'bandits', name: 'логово атамана', boss: {name: 'Рубака Чернобород', species: 'human', add: {S: 4, E: 3, A: 2}}, trophy: ['Голова Рубаки Чернобороды', 'Голову Рубаки Чернобороды', 'f']},
        story: 'Рубака Чернобород засел {where}.', strong: {warned: 1.2, rich: 1.3, poor: 0.85}},
    },
    ends: {won: 'Рубака Чернобород убит; его люди разбрелись по лесам.', lost: 'Рубака Чернобород ушёл — о нём ещё услышат.'}},
  {id: 'cult', label: 'Культ в слободах', level: 3, about: 'В слободах пропадают люди. Куда — и кому это нужно?', start: 'traces',
    steps: {
      traces: {tier: 2, label: 'Пропавшие в слободах', camp: {band: 'cultists', name: 'сборище в старой риге', clue: true, trophy: ['Чёрный амулет', 'Чёрный амулет', 'm']},
        story: 'Из слобод {town} пропадают люди; следы ведут куда-то {where}.', next: {won: 'preacher', lost: 'preacher'}, flag: {lost: 'bold'}},
      preacher: {tier: 2, label: 'Проповедник с мельницы', camp: {band: 'cultists', name: 'старая мельница', boss: {name: 'Проповедник Ивор', species: 'human', add: {C: 3, I: 2}}, trophy: ['Книга проповедника', 'Книгу проповедника', 'f']},
        story: 'Амулет привёл к проповеднику: он собирает людей на старой мельнице {where}.', strong: {bold: 1.2},
        side: 'cellars', next: {won: 'shrine', lost: 'shrine'}, flag: {lost: 'bold'}},
      shrine: {tier: 3, label: 'Тайное святилище', camp: {band: 'cultists', name: 'тайное святилище', clue: true, trophy: ['Идол святилища', 'Идол святилища', 'm']},
        story: 'В книге проповедника — путь к святилищу где-то {where}. Там готовят обряд.', strong: {bold: 1.2}, next: {won: 'rite', lost: 'rite'}, flag: {lost: 'ready'}},
      rite: {tier: 3, label: 'Обряд', camp: {band: 'cultists', name: 'круг обряда', summon: true, boss: {name: 'Верховный жрец', species: 'human', add: {I: 4, C: 3, E: 2}}, trophy: ['Кинжал жреца', 'Кинжал жреца', 'm']},
        story: 'Обряд начнётся в новолуние {where}.', strong: {freed: 0.8, ready: 1.25}, next: {won: null, lost: 'breach'}, unless: {freed: 'breach'}},
      breach: {tier: 4, label: 'Тварь из-за грани', camp: {lair: 'rift', name: 'разрыв', trophy: ['Сердце твари', 'Сердце твари', 'n']},
        story: 'Обряд прорвал грань: что-то пришло {where} и не уходит.', strong: {ready: 1.2}},
    },
    sides: {
      cellars: {tier: 2, label: 'Пленники культа', camp: {band: 'cultists', name: 'погреба культа', trophy: ['Связка ключей', 'Связку ключей', 'f']},
        story: 'Пропавших держат в погребах {where}. Если их освободить, обряду не хватит крови.', flag: {won: 'freed'}},
    },
    ends: {won: 'Культ разгромлен до обряда: пленники вернулись домой.', 'won.freed': 'Культ разгромлен, пленники дома, обряд не состоялся.', lost: 'Культ ушёл в тень — и ждёт своего часа.'}},
  {id: 'necro', label: 'Башня некроманта', level: 5, about: 'На кладбищах поднимаются мертвецы. Кто-то зовёт их — из башни на холмах.', start: 'risen',
    steps: {
      risen: {tier: 3, label: 'Восставшие на кладбищах', camp: {band: 'undead', name: 'разорённое кладбище', trophy: ['Обломок надгробия', 'Обломок надгробия', 'm']},
        story: 'На кладбищах у {town} поднимаются мертвецы; их больше всего {where}.', next: {won: 'barrow', lost: 'barrow'}, flag: {lost: 'grown'}},
      barrow: {tier: 3, label: 'Курган-сторож', camp: {lair: 'wights', name: 'курган-сторож', clue: true, trophy: ['Печать кургана', 'Печать кургана', 'f']},
        story: 'Мертвецов ведёт сила старого кургана где-то {where}: он сторожит путь к башне.', strong: {grown: 1.2}, next: {won: 'siege', lost: 'siege'}, flag: {lost: 'grown'}},
      siege: {tier: 4, label: 'Осада башни', camp: {band: 'undead', name: 'подступы к башне', trophy: ['Ключ от башни', 'Ключ от башни', 'm']},
        story: 'Башня некроманта стоит {where}; её подступы держит мёртвое войско.', strong: {grown: 1.25}, next: {won: 'master', lost: 'master'}, flag: {lost: 'grown'}},
      master: {tier: 4, label: 'Некромант', camp: {lair: 'necromancer', name: 'башня некроманта', boss: {name: 'Некромант Морвен', species: 'necromancer', add: {I: 4, E: 2}}, trophy: ['Посох некроманта', 'Посох некроманта', 'm']},
        story: 'Ворота открыты. Некромант ждёт наверху башни {where}.', strong: {grown: 1.25}},
    },
    ends: {won: 'Некромант повержен; мертвецы снова спят.', lost: 'Башня стоит; мёртвых на кладбищах всё больше.'}},
]);
