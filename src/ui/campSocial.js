// The «Кампания» screen's company: the council at the fire as it was held (K.social.meetings, campaign/council.js) and a
// member's card — its character, tiredness, what it feels for the others and why, what it remembers, its promises
// (campaign/social.js, duty.js). It reads what the campaign decided; it never decides or draws again (plan D6).
import {esc} from '../core/util.js';
import {SAY_OPTION, SAY_WHY, SAY_ACT, SAY_TALK, SPEECH} from '../data/speech.js';
import {FACT_KINDS} from '../data/social.js';
import {JOBS} from '../data/jobs.js';
import {TRAITS} from '../data/traits.js';
import {LEAN_AXES} from '../data/leans.js';
import {commandOf} from '../data/commands.js';
import {reasonsOf} from '../campaign/social.js';
import {fateOf} from '../social/fate.js';
import {drawPawn} from '../render/art/pawn.js';
import {SPECIES} from '../data/species.js';

// a variant by the meeting and the speaker, no stream drawn
const pick = (list, k) => list[Math.abs(k) % list.length];
const optSaid = (id, k) => pick(SAY_OPTION[id] || [commandOf(id)?.label || id], k);
const nameOf = (K, id) => K.members.find(m => m.id === id)?.name || '—';

// the meetings of a day (the last held up to it when none that day)
export function meetingsOf(K, day) {
  const M = K.social?.meetings || [];
  const that = M.filter(m => m.day === Math.floor(day));
  return that.length ? that : M.filter(m => m.day <= day).slice(-1);
}
// a meeting told: who was there, what each said, what was taken, who could not speak
export function meetingHtml(K, meet) {
  const took = optSaid(meet.pick, meet.day), lines = [];
  for (const v of meet.voices) {
    const m = K.members.find(x => x.id === v.id); if (!m) continue;
    const k = meet.day * 31 + v.id, social = m.local?.leans?.social ?? 0.5, why = v.why?.[0] ? pick(SAY_WHY[v.why[0]] || [], k) : '';
    const said = v.want === meet.pick ? (social < SPEECH.quietBelow ? SAY_ACT.quiet(took) : SAY_ACT.for(optSaid(v.want, k), social >= SPEECH.fullFrom || v.why?.length ? why : ''))
      : SAY_ACT.against(optSaid(v.want, k), why, took);
    const same = lines.find(x => x.said === said);   // (the same words from several: one line, their names)
    if (same) same.who.push(m.name); else lines.push({said, who: [m.name], against: v.want !== meet.pick});
  }
  // the round of talk, before the voices' last word (campaign/council.js debate)
  const T = meet.debate, talk = [];
  if (T?.objector != null) {
    const k = meet.day * 31 + T.objector, nm = id => esc(nameOf(K, id));
    talk.push(`<div class="fire-line"><b>${nm(T.by)}</b>: «${esc(SAY_TALK.propose(optSaid(T.proposal, k)))}»</div>`);
    talk.push(`<div class="fire-line against"><b>${nm(T.objector)}</b>: «${esc(SAY_TALK.object(optSaid(T.want, k), pick(SAY_WHY[T.why] || [], k)))}»</div>`);
    talk.push(`<div class="fire-line"><b>${nm(T.by)}</b>: «${esc(SAY_TALK[T.answer](optSaid(T.answer === 'yielded' ? T.want : T.answer === 'met' ? T.meet : T.proposal, k)))}»</div>`);
    if (T.swayed?.length) talk.push(`<div class="fire-line"><small class="muted">${T.swayed.map(nm).join(', ')} — ${SAY_TALK.swayed}</small></div>`);
  }
  const away = (meet.away || []).map(x => `${esc(nameOf(K, x.id))} (${x.why === 'captive' ? 'пленный — без голоса' : 'без голоса'})`).join(', ');
  const W = Object.entries(meet.w || {}).sort((p, q) => q[1] - p[1]).map(([id, w]) => `${esc(commandOf(id)?.label || id)} ${w}`).join(' · ');
  const told = lines.map(x => `<div class="fire-line${x.against ? ' against' : ''}"><b>${esc(x.who.join(', '))}</b>: «${esc(x.said)}»</div>`).join('');
  return `<div class="fire"><h4>Совет у костра, день ${meet.day + 1}</h4>${talk.join('')}${told}<p><b>Решили:</b> ${esc(commandOf(meet.pick)?.label || meet.pick || '—')}.${away ? ` <small class="muted">Не говорили: ${away}.</small>` : ''}</p><small class="muted" title="вес варианта — среднее голосов, затем жребий">веса: ${W}</small></div>`;
}

// a member's card: who it is, how tired, what it feels for the others and why, what it remembers, its promises
export function memberCardHtml(K, m) {
  const L = m.local || {}, S = K.social || {}, R = S.relations?.[m.id] || {};
  const char = [L.likes ? `любит ${esc(JOBS.get(L.likes)?.label || L.likes)}` : '', L.dislikes ? `не любит ${esc(JOBS.get(L.dislikes)?.label || L.dislikes)}` : '',
    ...(L.traits || []).map(id => esc(TRAITS.get(id)?.label || id)),
    ...Object.entries(L.leans || {}).filter(([, v]) => Math.abs(v - 0.5) >= 0.15).map(([k, v]) => `${v > 0.5 ? 'большая' : 'малая'} ${esc(LEAN_AXES[k]?.label || k)}`)].filter(Boolean).join(', ');
  const tired = m.social?.load?.tired || 0;
  const rel = Object.entries(R).sort((p, q) => Math.abs(q[1]) - Math.abs(p[1])).slice(0, 6).map(([id, v]) => {
    const why = reasonsOf(K, m.id, +id).slice(-2).map(f => FACT_KINDS[f.kind]?.label || f.kind).join(', ');
    return `<li>${esc(nameOf(K, +id))}: ${v > 0 ? 'тепло' : 'холодно'} (${Math.round(v * 10) / 10})${why ? ` — ${esc(why)}` : ''}</li>`;
  }).join('');
  const facts = new Map((S.facts || []).map(f => [f.id, f]));
  const mem = (m.social?.memory || []).slice().sort((p, q) => q.weight - p.weight || q.day - p.day).slice(0, 5).map(x => {
    const f = facts.get(x.fact); if (!f) return '';
    const who = [f.by, f.to].filter(id => id != null && id !== m.id).map(id => esc(nameOf(K, id))).join(', ');
    return `<li>день ${f.day + 1}: ${esc(FACT_KINDS[f.kind]?.label || f.kind)}${who ? ` — ${who}` : ''} <small class="muted">(${x.how === 'saw' ? 'видел' : x.how === 'heard' ? 'слышал' : 'сам'})</small></li>`;
  }).join('');
  const ST = {accepted: 'в силе', fulfilled: 'исполнено', failed: 'не вышло не по вине', impossible: 'стало невозможным', broken: 'нарушено', lapsed: 'истекло'};
  const vows = (S.commitments || []).filter(c => c.debtor === m.id || c.creditor === m.id).slice(-4).map(c =>
    `<li>${c.debtor === m.id ? `обещал${m.gender === 'f' ? 'а' : ''} ${esc(nameOf(K, c.creditor))}` : `${esc(nameOf(K, c.debtor))} обещал${K.members.find(x => x.id === c.debtor)?.gender === 'f' ? 'а' : ''}`} ${c.kind === 'escort' ? 'пойти рядом за едой' : 'подмену в дозоре'} — ${ST[c.status] || c.status}</li>`).join('');
  const fate = fateOf(m);
  return `<div class="pc"><h4>${esc(m.name)}${fate !== 'in' ? ` <small class="muted">(${fate === 'dead' ? 'погиб' : 'нет в отряде'})</small>` : ''}</h4>${char ? `<p>${char}</p>` : ''}<p>Усталость: ${Math.round(tired * 100)}%</p>` +
    `${rel ? `<h5>Отношения</h5><ul>${rel}</ul>` : ''}${mem ? `<h5>Помнит</h5><ul>${mem}</ul>` : ''}${vows ? `<h5>Обещания</h5><ul>${vows}</ul>` : ''}</div>`;
}

// ── the scene at the fire (plan D6): the company round the fire, the one who speaks lit, its words beneath; the meeting is
// the one recorded — the scene only shows it, from a step (0 … the voices) that the screen moves on, pauses, skips, plays again
export function drawFire(cv, K, meet, step) {
  const ctx = cv.getContext?.('2d'); if (!ctx) return;
  const dpr = globalThis.devicePixelRatio || 1, w = cv.clientWidth || 360, h = cv.clientHeight || 200;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2 + 6, R = Math.min(w * 0.4, h * 0.36);
  // the fire
  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, R * 0.55); g.addColorStop(0, 'rgba(255,190,90,0.9)'); g.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 0.55, 0, 6.283); ctx.fill();
  ctx.fillStyle = '#e8743a'; ctx.beginPath(); ctx.moveTo(cx - 7, cy + 6); ctx.quadraticCurveTo(cx, cy - 16, cx + 7, cy + 6); ctx.fill();
  const voices = meet.voices, n = Math.max(1, voices.length + (meet.away?.length || 0));
  const seat = k => [cx + Math.cos(-Math.PI / 2 + k / n * 6.283) * R, cy + Math.sin(-Math.PI / 2 + k / n * 6.283) * R * 0.8];
  const all = [...voices.map(v => ({id: v.id, v})), ...(meet.away || []).map(x => ({id: x.id, away: true}))];
  all.forEach((x, k) => {
    const m = K.members.find(o => o.id === x.id); if (!m) return;
    const [px, py] = seat(k), speaking = !x.away && k === step && step < voices.length;
    if (speaking) { ctx.fillStyle = 'rgba(255,220,140,0.35)'; ctx.beginPath(); ctx.arc(px, py, 18, 0, 6.283); ctx.fill(); }
    const sp = SPECIES.get(m.race), pawn = {id: m.id, species: m.race, gender: m.gender, equip: {}, faceX: px < cx ? 1 : -1};
    ctx.globalAlpha = x.away ? 0.4 : x.v && x.v.want !== meet.pick && step >= voices.length ? 0.7 : 1;
    if (!sp || !drawPawn(ctx, pawn, sp, px, py, 14, '#8a6a4a')) { ctx.fillStyle = '#c9b48a'; ctx.beginPath(); ctx.arc(px, py, 8, 0, 6.283); ctx.fill(); }
    ctx.globalAlpha = 1; ctx.fillStyle = speaking ? '#ffe2a0' : '#bfb6a2'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(m.name, px, py + 24);
  });
}
// the words of a step: who speaks and what (the last step — what was decided)
export function fireWords(K, meet, step) {
  const v = meet.voices[step];
  if (!v) return `Решили: ${commandOf(meet.pick)?.label || meet.pick || '—'}.`;
  const m = K.members.find(o => o.id === v.id), k = meet.day * 31 + v.id, took = optSaid(meet.pick, meet.day);
  const why = v.why?.[0] ? pick(SAY_WHY[v.why[0]] || [], k) : '', social = m?.local?.leans?.social ?? 0.5;
  const said = v.want === meet.pick ? (social < SPEECH.quietBelow ? SAY_ACT.quiet(took) : SAY_ACT.for(optSaid(v.want, k), why)) : SAY_ACT.against(optSaid(v.want, k), why, took);
  return `${m?.name || '—'}: «${said}»`;
}
