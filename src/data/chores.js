// The deeds in town (tier 0 of the guild's board; plan claude/guild-plan.md Г1, the author's word 12.11): no road, no map —
// one to four of the guild are sent, and a day or three later a report comes back: gold, a little experience, now and then a
// sprained leg, very seldom a death. They are how the newcomers get their first levels (data/experience.js XP.need: the
// second level at 30, the third at 70). Settled by one draw each at its end (guild/chores.js); nothing of the world changes.
//   hands — [least, most] of the guild who may go; days — [least, most] it takes (drawn when taken)
//   pay   — [least, most] gold the town pays the guild (drawn when offered); lose — the share paid when it goes wrong
//   xp    — experience each one gets (× `lostXp` when it goes wrong; data/experience.js ACTS «chore»)
//   stat  — the letter that helps (each one's own, the mean of those sent): ±`per` of the chance a point off 5
//   win   — the chance it goes right with an average hand, + `more` for each beyond the least
//   hurt  — the chance one of them is hurt (× `worse` when it went wrong): health down by [lo, hi]
//   die   — the chance one of them dies (× `worse` when it went wrong); the deed may still have gone right
//   lines — the report: won, lost, hurt, died; {who} — the names, {one} — the one hurt or dead
import {Registry} from '../core/registry.js';

export const CHORE = {lostXp: 0.5, per: 0.05, more: 0.04, lose: 0.25, worse: 1.8, hurtBy: [0.25, 0.6], floor: 0.05, chance: [0.05, 0.97]};

export const CHORES = new Registry('chore');
CHORES.registerAll([
  {id: 'rats', label: 'Крысы в подвале таверны', text: 'Хозяин таверны жалуется: крысы съели полбочки сыра и смотрят на вторую.',
    hands: [1, 2], days: [1, 1], pay: [3, 6], xp: 12, stat: 'S', win: 0.8, hurt: 0.05, die: 0.002,
    lines: {win: ['{who} перебили крыс в подвале таверны; хозяин налил по кружке сверх платы.'], lose: ['{who} гоняли крыс до утра, но самая большая ушла в стену — хозяин платит треть.'],
      hurt: ['{one} покусан крысой размером с кошку — рука распухла.'], die: ['{one} провалился в старый колодец под подвалом.']}},
  {id: 'pumpkins', label: 'Собрать десять тыкв', text: 'Огородник слёг с больной спиной, а тыквы ждать не станут.',
    hands: [1, 3], days: [1, 2], pay: [2, 5], xp: 8, stat: 'E', win: 0.9, hurt: 0.02, die: 0,
    lines: {win: ['{who} собрали десять тыкв, одиннадцатую — себе на кашу.'], lose: ['{who} собрали девять тыкв: десятую кто-то увёл ночью.'],
      hurt: ['{one} уронил тыкву на ногу — хромает.']}},
  {id: 'thief', label: 'Поймать воришку на рынке', text: 'На рынке шарит по кошелькам ловкий малый; стража смеётся.',
    hands: [1, 3], days: [1, 1], pay: [4, 9], xp: 15, stat: 'A', win: 0.55, hurt: 0.08, die: 0.003,
    lines: {win: ['{who} поймали воришку у рыбных рядов и сдали страже.'], lose: ['{who} гнались за воришкой, но он ушёл крышами.'],
      hurt: ['{one} погнался за воришкой, не догнал и растянул ногу.'], die: ['{one} сорвался с крыши, гонясь за воришкой.']}},
  {id: 'clerk', label: 'Охранять чиновника', text: 'Сборщик податей едет по слободам и боится, что его встретят не хлебом.',
    hands: [2, 4], days: [1, 3], pay: [8, 15], xp: 20, stat: 'C', win: 0.75, hurt: 0.08, die: 0.01,
    lines: {win: ['{who} провели сборщика податей по слободам — ни одного камня в спину.'], lose: ['{who} не уберегли сборщика от гнилых яблок; платят меньше.'],
      hurt: ['{one} получил камнем в голову, закрывая чиновника.'], die: ['{one} заслонил сборщика от ножа — чиновник цел, {one} нет.']}},
  {id: 'merchant', label: 'Охранять купца до околицы', text: 'Купец везёт сукно и не доверяет здешним дорогам.',
    hands: [2, 4], days: [2, 3], pay: [10, 18], xp: 22, stat: 'S', win: 0.7, hurt: 0.1, die: 0.015,
    lines: {win: ['{who} довели обоз купца до околицы — разбойники посмотрели и ушли.'], lose: ['{who} отбили обоз, но пару тюков сукна унесли; купец скупится.'],
      hurt: ['{one} ранен в стычке у брода.'], die: ['{one} при нападении на купца получил смертельную рану; купец цел.']}},
  {id: 'brawl', label: 'Утихомирить драку в таверне', text: 'Плотники и кожевники снова выясняют, чей цех главнее.',
    hands: [1, 3], days: [1, 1], pay: [4, 8], xp: 14, stat: 'S', win: 0.7, hurt: 0.12, die: 0.004,
    lines: {win: ['{who} растащили драку в таверне и выставили зачинщиков за дверь.'], lose: ['{who} сами оказались в драке; трактирщик платит за порядок, а не за мебель.'],
      hurt: ['{one} получил табуретом по спине.'], die: ['{one} упал в драке и ударился виском о стойку.']}},
  {id: 'goat', label: 'Найти пропавшую козу', text: 'Пропала коза вдовы — единственная, с колокольчиком.',
    hands: [1, 2], days: [1, 2], pay: [2, 5], xp: 8, stat: 'P', win: 0.7, hurt: 0.02, die: 0,
    lines: {win: ['{who} нашли козу на чужом огороде; колокольчик был у неё во рту.'], lose: ['{who} искали козу два дня; вдова нашла её сама.'],
      hurt: ['{one} получил от козы рогом пониже спины.']}},
  {id: 'wall', label: 'Ночной дозор на стене', text: 'Стража не досчитывается людей и просит подменить их на стене.',
    hands: [2, 4], days: [2, 3], pay: [6, 12], xp: 16, stat: 'P', win: 0.85, hurt: 0.04, die: 0.005,
    lines: {win: ['{who} отстояли ночи на стене; видели огни на холмах, но никто не пришёл.'], lose: ['{who} проспали смену; капитан стражи платит неохотно.'],
      hurt: ['{one} оступился на мокрой стене и разбил колено.'], die: ['{one} упал со стены в тёмную ночь.']}},
  {id: 'ghost', label: '«Привидение» в погребе', text: 'В погребе мельника по ночам стонет и гремит. Мельник просит разобраться — и не говорить жене.',
    hands: [1, 2], days: [1, 1], pay: [3, 7], xp: 12, stat: 'I', win: 0.75, hurt: 0.04, die: 0.002,
    lines: {win: ['{who} нашли «привидение»: подмастерье мельника гнал брагу в погребе.'], lose: ['{who} просидели ночь в погребе: стонало, гремело, но кто — не поняли.'],
      hurt: ['{one} в темноте налетел на бочку с брагой.'], die: ['{one} задохнулся в погребе от бражного духа.']}},
  {id: 'debt', label: 'Выбить долг', text: 'Ростовщик просит напомнить должнику, что сроки вышли.',
    hands: [1, 2], days: [1, 1], pay: [5, 10], xp: 12, stat: 'C', win: 0.6, hurt: 0.06, die: 0.002,
    lines: {win: ['{who} поговорили с должником — он вспомнил, где спрятал деньги.'], lose: ['{who} пришли к должнику, а у того брат-кузнец; вернулись с половиной.'],
      hurt: ['{one} получил кочергой от брата должника.'], die: ['{one} не вернулся от должника: нашли в канаве.']}},
]);
