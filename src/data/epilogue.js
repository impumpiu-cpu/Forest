// The end of a campaign (campaign/ending.js): what the world does with it and what becomes of those who walked.
// The fates are templates: (m, w) → a line, where m is the member and w the words of the ending —
//   g(male, female) — the word by the member's gender; town — a town of the realm (in its cases: town[0…4]);
//   capital — the capital in its cases; crown — the crown's name; knights — the people's knights (many);
//   where — a side of the world; race — the member's race.

export const EPILOGUE = {
  // the world goes on for this many seasons after the end, telling the fates (at most `perSeason` a season)
  seasons: 4, perSeason: 3,
  // a crown brought home: the capital grows (pilgrims, the court, the fame), the realms that know the realm
  // think better of it (attitude, data/diplomacy.js), the realm keeps the crown as its relic
  crown: {pop: 1.12, att: 1, attMax: 5},
};

const pick = (r, list) => list[(r() * list.length) | 0];
export const FATES = {
  // the crown brought home
  won: {
    knight: [
      (m, w) => `${m.name} ${w.g('получил', 'получила')} от правителя землю под ${w.town[4]} и титул.`,
      (m, w) => `${m.name} ${w.g('стал хранителем', 'стала хранительницей')} короны: ${w.crown} не покидает ${w.capital[2]} без ${w.g('него', 'неё')}.`,
      (m, w) => `${m.name} ещё не раз ${w.g('водил', 'водила')} караваны, а о походе за короной ${w.g('рассказывал', 'рассказывала')} до самой старости.`,
      (m, w) => `${m.name} ${w.g('возглавил', 'возглавила')} стражу ${w.capital[2]}.`,
    ],
    squire: [
      (m, w) => `${m.name} ${w.g('посвящён', 'посвящена')} в ${w.knights} — за верность в походе.`,
      (m, w) => `${m.name} ${w.g('вернулся', 'вернулась')} в родные места и ${w.g('завёл', 'завела')} своё хозяйство; ${w.g('его', 'её')} инструмент висит над очагом как память о походе.`,
      (m, w) => `${m.name} ${w.g('остался', 'осталась')} при дворе: ${w.g('его', 'её')} умения пригодились столице.`,
      (m, w) => `${m.name} ${w.g('открыл', 'открыла')} мастерскую в ${w.town[3]}.`,
    ],
    other: [
      (m, w) => `${m.name} (${w.race}) ${w.g('осел', 'осела')} в ${w.capital[3]}.`,
      (m, w) => `${m.name} (${w.race}) ${w.g('вернулся', 'вернулась')} к своему народу с рассказами о короне.`,
      (m, w) => `${m.name} (${w.race}) ${w.g('ушёл', 'ушла')} ${w.where} искать своей судьбы.`,
    ],
  },
  // none of the eight left: those who had joined go their own ways
  lost: [
    (m, w) => `${m.name} (${w.race}) ${w.g('добрался', 'добралась')} до ${w.town[2]} и ${w.g('осел', 'осела')} там.`,
    (m, w) => `${m.name} (${w.race}) ${w.g('пристал', 'пристала')} к разбойникам с большой дороги.`,
    (m, w) => `${m.name} (${w.race}) ${w.g('вернулся', 'вернулась')} к своему народу.`,
    (m, w) => `${m.name} (${w.race}) ${w.g('ушёл', 'ушла')} ${w.where} — больше ${w.g('его', 'её')} никто не видел.`,
  ],
  // captives (docs/CAPTIVES.md): at the end of the road
  captive: {
    won: [
      (m, w) => `${m.name} (${w.race}), ${w.g('пленный', 'пленная')} каравана, ${w.g('получил', 'получила')} в ${w.capital[3]} волю и ${w.g('остался', 'осталась')} там работать.`,
      (m, w) => `${m.name} (${w.race}), ${w.g('пленный', 'пленная')} каравана, ${w.g('был отпущен', 'была отпущена')} домой с рассказом о короне.`,
    ],
    lost: [
      (m, w) => `${m.name} (${w.race}) ${w.g('перетёр', 'перетёрла')} путы и ${w.g('ушёл', 'ушла')} к своим.`,
      (m, w) => `${m.name} (${w.race}), ${w.g('пленный', 'пленная')}, в ту же ночь ${w.g('бежал', 'бежала')} — больше ${w.g('его', 'её')} никто не видел.`,
    ],
  },
  // twenty-five years on the road: those still walking settle where they are
  timeout: [
    (m, w) => `${m.name} ${w.g('осел', 'осела')} в ${w.town[3]} и больше не ${w.g('искал', 'искала')} короны.`,
    (m, w) => `${m.name} ${w.g('вернулся', 'вернулась')} в ${w.capital[1]} стариком — без короны, но живым.`.replace('стариком — без короны, но живым', w.g('стариком — без короны, но живым', 'старухой — без короны, но живой')),
    (m, w) => `${m.name} так и ${w.g('остался', 'осталась')} в пути: говорят, ${w.g('он', 'она')} до сих пор ищет ${w.crownAcc}.`,
  ],
};
// a fate from a list, not one already told in this ending (the keeper of the crown is one); when all are told,
// any of them
export function fate(r, list, used) {
  const fresh = list.filter(f => !used.has(f)), f = pick(r, fresh.length ? fresh : list);
  used.add(f);
  return f;
}
