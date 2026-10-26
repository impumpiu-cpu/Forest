// The way from the world settled to the walk (forest.html; docs/CAMPAIGN.md): «В поход →» of «Заселение мира» opens
// that world of the library on the campaign screen (ui/campaignView.js, mounted by app/main.js). The screens do not
// import each other: the shell listens for the event and shows the screen.
import {plural} from '../core/util.js';

export const MARCH_EVENT = 'forest:march';
export const march = (id, name) => document.dispatchEvent(new CustomEvent(MARCH_EVENT, {detail: {id, name}}));

// the quest a world gives, in words (atlas/calamity.js questHint, kept in the library's index)
export function questText(r) {
  const Q = r.quest;
  if (Q?.kind === 'hand') return `квест — бедствие «${Q.label}»${Q.boss ? `: ${Q.boss}` : ''}${Q.phase === 'rise' ? ', уже идёт' : `, поднимется в ${Q.riseAt}-м году`}`;
  if (Q?.kind === 'epic') return `квест — артефакт: могилы ${Q.graves} ${plural(Q.graves, 'босса', 'боссов', 'боссов')} и четвёртое бедствие`;
  return 'квест — корона, потерянная историей мира';
}
