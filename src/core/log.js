// The colony journal. Messages are HTML snippets; callers escape user text.
// log(w, html, topic, level?) — topic from data/logTopics.js, level defaults to the topic's own.
import {clockStr} from './time.js';
import {LOG_TOPICS} from '../data/logTopics.js';

const MAX_LINES = 150;

export function log(w, html, topic = 'people', level) {
  const lv = level || (LOG_TOPICS.has(topic) ? LOG_TOPICS.get(topic).level : 'info');
  w.logLines.unshift({t: w.tick, html, when: clockStr(w.tick, w), topic, level: lv});
  if (w.logLines.length > MAX_LINES) w.logLines.pop();
  w.logVersion++;
}
