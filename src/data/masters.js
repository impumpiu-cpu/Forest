// Masters and their learners (docs/CAPTIVES.md). A master is the colony's named best at a craft:
// the evening council names one when somebody's skill reaches `MASTER.min` and the craft has no master yet.
// A master has `MASTER.places` places for learners — «ученик мастера» (the word «подмастерье» is the
// dwarves' squires', data/campaign.js RETINUE). A learner keeps close to the master while the master works:
// the master works faster (`bonus`, one per place), the learner learns the craft (`learn` × the practice of
// a tick of work), a captive learner earns service (`service` a tick, for stage 4).
//   id    — the skill (data/skills.js) the master is named for
//   title — what the master is called: «мастер-кузнец»; ins — the same in the instrumental: «мастером-кузнецом»
//   jobs  — the jobs (data/jobs.js) in which a learner helps the master
// A new craft is one row here.
import {Registry} from '../core/registry.js';

export const MASTERS = new Registry('master');

MASTERS.registerAll([
  {id: 'smithing',     title: 'кузнец',     ins: 'кузнецом',     jobs: ['smith']},
  {id: 'carpentry',    title: 'ремесленник', ins: 'ремесленником', jobs: ['craft', 'saw']},
  {id: 'construction', title: 'зодчий',     ins: 'зодчим',       jobs: ['build']},
  {id: 'fishing',      title: 'рыбак',      ins: 'рыбаком',      jobs: ['fish']},
  {id: 'hunting',      title: 'охотник',    ins: 'охотником',    jobs: ['hunt']},
  {id: 'medicine',     title: 'лекарь',     ins: 'лекарем',      jobs: ['heal']},
  {id: 'cooking',      title: 'повар',      ins: 'поваром',      jobs: ['cook', 'preserve', 'mill']},
  {id: 'leatherwork',  title: 'кожевник',   ins: 'кожевником',   jobs: ['tan']},
  {id: 'tailoring',    title: 'ткач',       ins: 'ткачом',       jobs: ['weave']},
  {id: 'pottery',      title: 'гончар',     ins: 'гончаром',     jobs: ['pottery']},
  {id: 'farming',      title: 'земледелец', ins: 'земледельцем', jobs: ['farm']},
  {id: 'woodcutting',  title: 'лесоруб',    ins: 'лесорубом',    jobs: ['chop']},
  {id: 'mining',       title: 'рудокоп',    ins: 'рудокопом',    jobs: ['mine', 'dig']},
  {id: 'husbandry',    title: 'скотник',    ins: 'скотником',    jobs: ['herd']},
  {id: 'jewelry',      title: 'ювелир',     ins: 'ювелиром',     jobs: ['jewel']},
]);

export const MASTER = {
  min: 0.45,            // the skill (0–1) the council names a master at: a little under the human ceiling (0,5 at letter 5)
  places: 2,            // learners a master takes
  bonus: [0.25, 0.1],   // × the master's work: the first learner, the second
  near: 2.5,            // a learner this close to the master helps
  learn: 1.5,           // a tick of the master's work teaches a learner this many ticks of practice
  service: 1 / 400,     // service a captive learner earns a tick of help (about one and a half a day of work)
  beside: 0.5,          // × that for a captive working the master's own craft beside it (at the next bench)
  // the pull of a learner's place in the colonist's choice: below a free vacancy of one's own, above idling;
  // a free colonist before a captive («свои ученики, потом пленные»); more for a liked craft, more the less one knows
  weight: {free: 0.45, captive: 0.4, liked: 0.15, lack: 0.3},
};
