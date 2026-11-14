// Classes (plan claude/bestiary-plan.md З-8; the author's word 13.11: «собирать классы из SPECIAL и перков»): a class is a
// fighting role (data/roles.js — what it carries, where it stands) with a body that suits it (SPECIAL) and a way through the
// book of perks (data/perks.js) — for a pawn of the caravan or the guild and for a monster of a band alike. Every row of the
// way written out, level by level (the author's word: no «× the rank», no formula of the level):
//   role   — the fighting role it is (one class a role; a creature of that role is of that class)
//   who    — {pawn, monster}: may a pawn, a monster be of it (yes · no)
//   needs  — the letters it asks at the least (a member below them is told it does not suit: the tables, the card)
//   keys   — the letters it leans on: a member's fit is the mean of these against the race's middle (campaign/perks.js classFit)
//   path   — [{level, perk, rank, how}]: `grant` — given at that level, nobody chooses; `learn` — from that level the class
//            draws its member to that perk at a level's pick (× PERK_PICK.path). A monster of a band chooses nothing: it
//            carries the whole way up to its band's level (bandLevel below)
// A class's own perks (data/perks.js, kind «классовые») ask `req.cls` — only one of the class may take them.
import {Registry} from '../core/registry.js';

export const CLASSES = new Registry('class');
CLASSES.registerAll([
  {id: 'warden', role: 'shield', label: 'страж', who: {pawn: 'yes', monster: 'yes'}, needs: {S: 5, E: 5}, keys: ['S', 'E'],
    note: 'держит строй щитом и закрывает соседей',
    path: [{level: 2, perk: 'shoulder', rank: 1, how: 'learn'}, {level: 3, perk: 'stalwart', rank: 1, how: 'learn'}, {level: 7, perk: 'stalwart', rank: 2, how: 'learn'}, {level: 9, perk: 'oldWolf', rank: 1, how: 'learn'}]},
  {id: 'pikeman', role: 'spearman', label: 'копейщик', who: {pawn: 'yes', monster: 'yes'}, needs: {S: 4, A: 4}, keys: ['S', 'A'],
    note: 'колет из-за щита',
    path: [{level: 3, perk: 'spearDrill', rank: 1, how: 'learn'}, {level: 7, perk: 'spearDrill', rank: 2, how: 'learn'}, {level: 9, perk: 'stalwart', rank: 1, how: 'learn'}]},
  {id: 'cleaver', role: 'cleaver', label: 'рубака', who: {pawn: 'yes', monster: 'yes'}, needs: {S: 6}, keys: ['S', 'E'],
    note: 'двуручным оружием проламывает строй',
    path: [{level: 3, perk: 'heavySwing', rank: 1, how: 'learn'}, {level: 5, perk: 'breaker', rank: 1, how: 'learn'}, {level: 7, perk: 'heavySwing', rank: 2, how: 'learn'}, {level: 9, perk: 'fury', rank: 1, how: 'learn'}]},
  {id: 'smith', role: 'smith', label: 'мастер-кузнец', who: {pawn: 'yes', monster: 'yes'}, needs: {S: 6, E: 5}, keys: ['S', 'E'],
    note: 'молот кузнеца в бою',
    path: [{level: 5, perk: 'breaker', rank: 1, how: 'learn'}, {level: 4, perk: 'stalwart', rank: 1, how: 'learn'}, {level: 7, perk: 'stalwart', rank: 2, how: 'learn'}, {level: 9, perk: 'oldWolf', rank: 1, how: 'learn'}]},
  {id: 'knight', role: 'knight', label: 'рыцарь', who: {pawn: 'yes', monster: 'yes'}, needs: {S: 5, E: 5, C: 5}, keys: ['S', 'E', 'C'],
    note: 'тяжёлый доспех и щит: держит строй и ведёт',
    path: [{level: 2, perk: 'shoulder', rank: 1, how: 'learn'}, {level: 4, perk: 'stalwart', rank: 1, how: 'learn'}, {level: 6, perk: 'fury', rank: 1, how: 'learn'}, {level: 8, perk: 'stalwart', rank: 2, how: 'learn'}, {level: 9, perk: 'fury', rank: 2, how: 'learn'}]},
  {id: 'berserker', role: 'berserker', label: 'берсерк', who: {pawn: 'yes', monster: 'yes'}, needs: {S: 6, E: 6}, keys: ['S', 'E'],
    note: 'два оружия, без доспеха, бешенство от ран',
    path: [{level: 3, perk: 'fury', rank: 1, how: 'learn'}, {level: 4, perk: 'tireless', rank: 1, how: 'learn'}, {level: 7, perk: 'fury', rank: 2, how: 'learn'}, {level: 9, perk: 'stalwart', rank: 1, how: 'learn'}]},
  {id: 'cutthroat', role: 'cutthroat', label: 'головорез', who: {pawn: 'yes', monster: 'yes'}, needs: {A: 6}, keys: ['A', 'P'],
    note: 'крадётся и режет слабых',
    path: [{level: 3, perk: 'shadowStep', rank: 1, how: 'learn'}, {level: 7, perk: 'shadowStep', rank: 2, how: 'learn'}, {level: 9, perk: 'fleet', rank: 1, how: 'learn'}]},
  {id: 'skirmisher', role: 'skirmisher', label: 'застрельщик', who: {pawn: 'yes', monster: 'yes'}, needs: {A: 5}, keys: ['A', 'P'],
    note: 'праща и дротики, на бегу',
    path: [{level: 3, perk: 'fleet', rank: 1, how: 'learn'}, {level: 6, perk: 'deadEye', rank: 1, how: 'learn'}, {level: 8, perk: 'fleet', rank: 2, how: 'learn'}, {level: 9, perk: 'deadEye', rank: 2, how: 'learn'}]},
  {id: 'catcher', role: 'catcher', label: 'ловчий', who: {pawn: 'yes', monster: 'yes'}, needs: {A: 5, P: 5}, keys: ['A', 'P'],
    note: 'ловчая сеть',
    path: [{level: 3, perk: 'shadowStep', rank: 1, how: 'learn'}, {level: 6, perk: 'fleet', rank: 1, how: 'learn'}, {level: 9, perk: 'shadowStep', rank: 2, how: 'learn'}]},
  {id: 'archer', role: 'archer', label: 'стрелок', who: {pawn: 'yes', monster: 'yes'}, needs: {P: 6}, keys: ['P', 'A'],
    note: 'лук или арбалет',
    path: [{level: 2, perk: 'steadyShot', rank: 1, how: 'learn'}, {level: 4, perk: 'deadEye', rank: 1, how: 'learn'}, {level: 8, perk: 'deadEye', rank: 2, how: 'learn'}, {level: 9, perk: 'fleet', rank: 1, how: 'learn'}]},
  {id: 'forgemaster', role: 'forgemaster', label: 'мастер горна', who: {pawn: 'yes', monster: 'yes'}, needs: {E: 6}, keys: ['E', 'S'],
    note: 'дышит огнём с углём в клещах: с восьмого уровня — вторым рангом (конус в пять клеток)',
    path: [{level: 4, perk: 'stalwart', rank: 1, how: 'learn'}, {level: 8, perk: 'fireBreath', rank: 2, how: 'grant', hold: 'spitfire'}, {level: 9, perk: 'stalwart', rank: 2, how: 'learn'}]},
  {id: 'healer', role: 'healer', label: 'знахарь', who: {pawn: 'yes', monster: 'yes'}, needs: {I: 5}, keys: ['I', 'P'],
    note: 'вытаскивает упавших',
    path: [{level: 2, perk: 'fieldDressing', rank: 1, how: 'learn'}, {level: 5, perk: 'boneSetter', rank: 1, how: 'learn'}, {level: 5, perk: 'fieldDressing', rank: 2, how: 'learn'}, {level: 9, perk: 'oldWolf', rank: 1, how: 'learn'}]},
  {id: 'beastmaster', role: 'beastmaster', label: 'загонщик', who: {pawn: 'no', monster: 'yes'}, needs: {C: 4}, keys: ['C', 'A'],
    note: 'ведёт боевых зверей',
    path: [{level: 3, perk: 'fleet', rank: 1, how: 'grant'}, {level: 6, perk: 'fury', rank: 1, how: 'grant'}, {level: 9, perk: 'fury', rank: 2, how: 'grant'}]},
  {id: 'brute', role: 'brute', label: 'громила', who: {pawn: 'no', monster: 'yes'}, needs: {S: 8}, keys: ['S', 'E'],
    note: 'дубина в рост человека',
    path: [{level: 3, perk: 'heavySwing', rank: 1, how: 'grant'}, {level: 6, perk: 'stalwart', rank: 1, how: 'grant'}, {level: 9, perk: 'stalwart', rank: 2, how: 'grant'}]},
]);
// the class of a role (one a role), or null
export const classOfRole = role => (role ? CLASSES.all().find(C => C.role === role) || null : null);

// a band's level (a monster's, for its class's way): by the threat its band was drawn at (settlement/threat.js raidThreat; the
// same steps as its metal, data/roles.js ROLE_TIERS.from) — written out step by step
export const BAND_LEVEL = {from: [0, 8, 16, 26, 40], level: [1, 3, 5, 7, 9]};
export function bandLevel(t) {
  let k = 0; while (k + 1 < BAND_LEVEL.from.length && t >= BAND_LEVEL.from[k + 1]) k++;
  return BAND_LEVEL.level[k];
}
