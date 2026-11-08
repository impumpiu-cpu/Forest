// Where a member of the caravan is now (claude/caravan-ver_d.md §3.1): one reading of the fields the campaign already
// keeps, so that the social layer never takes «not alive» for «dead». A gone member stays in the memories, the bonds
// and the chronicle; only who may act, be asked or be helped follows from the fate.
// (Pure: no campaign, settlement or screen imports — docs/CAMPAIGN.md «Живая команда: договор».)

// the fates: in the company; dead; led off by a foe; ran from captivity; sold; left of their own accord or by contract;
// let go when the campaign ended; gone with no reason kept (an old save)
export const FATES = ['in', 'dead', 'taken', 'escaped', 'sold', 'left', 'disbanded', 'gone'];

// → one of FATES
export function fateOf(m) {
  if (m.alive) return 'in';
  if (m.died) return 'dead';
  const L = m.left;
  if (!L) return 'gone';
  if (L.taken) return 'taken';
  if (L.escaped) return 'escaped';
  if (L.sold) return 'sold';
  if (L.disbanded) return 'disbanded';
  if (L.why) return 'left';
  return 'gone';
}
// alive somewhere — a captive of a foe, a runaway, sold, gone their way: may be heard of, met again, is not mourned
export const livesOn = m => ['taken', 'escaped', 'sold', 'left', 'disbanded'].includes(fateOf(m));
// may act, be asked, be helped by the company today
export const present = m => !!m.alive;
