// Journal topics and levels. Every log line names a topic; the topic gives its default level
// (a call may raise or lower it). The journal panel can hide topics and levels — display only.
//   alert  (red)    — raids, attacks, deaths, fires that destroy buildings
//   notice (yellow) — construction, newcomers, council decisions
//   info   (green)  — everything else: crafting, weather, animals
import {Registry} from '../core/registry.js';

export const LEVELS = [
  {id: 'alert',  label: 'тревога',  color: 'var(--raider)'},
  {id: 'notice', label: 'важное',   color: '#e2b84a'},
  {id: 'info',   label: 'прочее',   color: 'var(--good)'},
];

export const LOG_TOPICS = new Registry('log topic');

LOG_TOPICS.registerAll([
  {id: 'danger',   label: 'налёты и нападения', level: 'alert'},
  {id: 'death',    label: 'смерти',             level: 'alert'},
  {id: 'build',    label: 'стройка',            level: 'notice'},
  {id: 'people',   label: 'поселенцы',          level: 'notice'},
  {id: 'council',  label: 'совет',              level: 'notice'},
  {id: 'craft',    label: 'ремесло',            level: 'info'},
  {id: 'wildlife', label: 'звери',              level: 'info'},
  {id: 'weather',  label: 'погода и огонь',     level: 'info'},
]);
