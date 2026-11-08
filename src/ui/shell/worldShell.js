// The world screen («Заселение мира», app/settleView.js) in the shell (ui/shell/shell.js; docs/GAME.md): the top bar
// with the year and the towns, the rail — the hand, the layers, the realms, the lands and worlds — the column with the
// world in small, «Под рукой», the world's tally (its realms and calamities) and the time («прожить», «В поход →»), and
// the world's chronicle along the bottom.
import {$} from '../dom.js';
import {Shell} from './shell.js';

const RES = [['Города', '⌂', 'города'], ['Логова', '☠', 'логова'], ['Пепелища', '▲', 'пепелища']];

export class WorldShell extends Shell {
  constructor(view) {
    const S = () => $('settle');
    super(view, {
      section: 'settle', title: ['settleTitle', 'setName2'], top: ['setYear'], topEnd: ['setPace', 'setPause'],
      rail: [['hand', '✋', 'Рука'], ['layers', '❖', 'Слои'], ['realms', '⚑', 'Державы'], ['lib', '⌂', 'Земли']],
      menus: {
        hand: [() => $('setHand'), 'Рука'], layers: [() => S().querySelector('[data-skey="layer"]')?.closest('.card'), 'Слои карты'],
        realms: [() => S().querySelector('[data-pane="realms"]'), 'Державы'], lib: [() => $('setLib'), 'Земли и миры'],
      },
      mini: true, marks: () => [],
      side: [{id: 'hand', title: 'Под рукой', node: () => $('setInspect'), rows: 'minmax(0,1.2fr)'}, {id: 'sum', title: 'Сводка мира', node: () => S().querySelector('[data-pane="world"]')},
        {id: 'time', title: 'Время', node: () => $('setRun')?.closest('.card'), rows: 'auto'}],
      strip: {title: 'Летопись мира', node: () => S().querySelector(':scope > .obs-chron')},
      watch: [[() => $('setStats'), () => this.resources($('setStats'), RES)]],
    });
    const back = S().querySelector('.obs-head [data-go="home"]');
    if (back) this.spec.topEnd.push(back.id ||= 'setBack');
  }
}
