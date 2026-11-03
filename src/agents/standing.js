// The standing of a person on the local map (docs/BEHAVIOUR.md «Словарь»): colonist · captive · former · fugitive, and
// the caravan's own trader and guard. One word, kept in one place: the brain that thinks for it (agents/brains/index.js),
// the faction it stands with, and its record — a.captive (how it was taken and how it bears its bonds), a.former (the
// time since the bonds came off), a.fugitive (its flight). A fugitive is a captive on the run: its a.captive stays.
//   setStanding(a, standing, record) — the only way to change it: the brain and the records cannot disagree
// (Other brains — a raider, a led one, a leaver, the livestock — are no standing of the colony's: their code sets them.)
export const STANDINGS = {
  colonist: {brain: 'colonist', faction: 'colony',    label: 'поселенец'},
  captive:  {brain: 'captive',  faction: 'colony',    label: 'пленный'},
  former:   {brain: 'former',   faction: 'colony',    label: 'бывший раб'},
  fugitive: {brain: 'fugitive', faction: 'fugitives', label: 'беглец'},
  trader:   {brain: 'trader',   faction: 'traders',   label: 'купец'},
  guard:    {brain: 'guard',    faction: 'traders',   label: 'охранник каравана'},
};

export function setStanding(a, standing, record = null) {
  const S = STANDINGS[standing];
  if (!S) throw new Error(`standing: unknown «${standing}»`);
  if (standing === 'captive') {
    a.captive = record || a.captive;
    if (!a.captive) throw new Error('standing: a captive without its record');
    a.former = null; a.fugitive = null;
  } else if (standing === 'former') {
    if (!record) throw new Error('standing: a former slave without its record');
    a.former = record; a.captive = null; a.fugitive = null;
  } else if (standing === 'fugitive') {
    if (!a.captive) throw new Error('standing: a fugitive who was no captive');
    a.fugitive = record || {since: 0};
  } else { a.captive = null; a.former = null; a.fugitive = null; }
  a.brain = S.brain; a.faction = S.faction;
}
