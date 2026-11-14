// The screens before the world lives, in the shell (ui/shell/shell.js): «Создать землю» (app/landView.js) — the land's
// settings, the hand and the layers in the rail, the stages and the land's tally in the column, the land's chronicle
// along the bottom; «Быстрый старт» — its form in the middle; and the campaign's setup (ui/campaignView.js, before the
// caravan is on its way) — the world and the capital in the rail, the world's map in the middle, the world's chronicle
// along the bottom.
import {$} from '../dom.js';
import {Shell, el} from './shell.js';

export class LandShell extends Shell {
  constructor(view) {
    const S = () => $('land');
    super(view, {
      section: 'land', title: ['landTitle', 'landName2'], top: [], topEnd: [],
      rail: [['land', '◍', 'Земля'], ['climate', '☁', 'Климат'], ['hand', '✋', 'Рука'], ['layers', '❖', 'Слои'], ['saves', '⌂', 'Земли']],
      menus: {
        land: [() => S().querySelector('.atlas-form'), 'Земля'],
        climate: [() => this.climateBox, 'Климат и правки'],
        hand: [() => S().querySelector('.land-tools'), 'Рука'],
        layers: [() => S().querySelector('.atlas-tools [data-lkey="layer"]'), 'Слои карты'],
        saves: [() => this.savesBox, 'Сохранённые земли'],
      },
      map: () => S().querySelector('.atlas-map'),
      mini: false,
      side: [{id: 'plate', title: 'Плита', node: () => $('landPlate'), rows: 'auto'}, {id: 'stages', title: 'Этапы', node: () => $('landStages')}, {id: 'sum', title: 'Земля', node: () => $('landStats'), rows: 'auto'}],
      strip: {title: 'Летопись земли', node: () => $('landChron')},
      onEnter: sh => { const z = S().querySelector('.zoomseg'); if (z) sh.take(z, sh.map.querySelector('.atlas-map') || sh.map); const lg = $('landLegend'); if (lg) sh.take(lg, sh.slot('sum'));
        // the climate's sliders and the edits' row leave the land's form for a menu of their own
        const box = sh.climateBox ||= el('div'), F = S().querySelector('.atlas-form'); sh.take($('landEq').closest('.field'), box); sh.take($('landReset').closest('.row'), box); F.after(box);
        const sv = sh.savesBox ||= el('div'); sh.take(S().querySelector('.field.saves'), sv); F.after(sv); },
      opens: 'land',
    });
    const back = S().querySelector('.app-head [data-go="home"]'); if (back) this.spec.topEnd.push(back.id ||= 'landBack');
  }
}

export class QuickShell extends Shell {
  constructor(view) {
    const S = () => $('quick');
    super(view, {section: 'quick', title: ['quickTitle'], top: [], topEnd: [], rail: [], menus: {}, map: () => null, center: () => S().querySelector('.newrun'), mini: false, side: [], strip: null});
    const back = S().querySelector('.app-head [data-go="home"]'); if (back) this.spec.topEnd.push(back.id ||= 'quickBack');
  }
}

// the campaign before the caravan is on its way: the world (the library, a new epic world) and the capital to pick
export class CampSetupShell extends Shell {
  constructor(view) {
    super(view, {
      section: 'campaign', key: 'campaignSetup', title: ['campTitle', 'campName2'], top: [], topEnd: ['campSpeed', 'campPause', 'campBack'],   // (the pace and the pause while a world is made: hidden otherwise, campaignView.syncRun)
      rail: [['world', '◍', 'Мир'], ['capital', '⚑', 'Столица'], ['layers', '❖', 'Слои']],
      menus: {world: [() => $('campLibField'), 'Мир из библиотеки'], capital: [() => $('campCapsField')?.closest('.card'), 'Столица и поход'], layers: [() => $('campLayer')?.closest('.card'), 'Слои карты']},
      mini: false, side: [{id: 'hand', title: 'Под рукой', node: () => $('campInspect')}],
      strip: {title: 'Летопись мира', node: () => $('campWorldBox')},   // (the history as it is made, then all of it)
      opens: () => (!$('campEpicField').hidden || !$('campCapsField').hidden ? 'capital' : 'world'),
    });
  }
}
