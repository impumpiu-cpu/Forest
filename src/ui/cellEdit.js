// A table cell's value as the text of its editor, and the text back as a value — the same words the cell shows
// (src/app/tablesView.js) and the fields of the creature constructor (src/app/beastView.js) use: «forest 1, meadow 0.5»,
// «S 1-10, P 3-11», «id, id». docs/TABLES.md.
import {STATS} from '../data/special.js';

// ── editing: a value as the text in its editor, and the text back as a value (the same words the cell shows)
export function editText(c, v) {
  if (v == null) return '';
  switch (c.type) {
    case 'map': return Object.entries(v).map(([k, x]) => `${k} ${x === Infinity ? '∞' : x}`).join(', ');
    case 'special': return Object.entries(v).map(([k, [lo, hi]]) => `${k} ${lo}-${hi}`).join(', ');
    case 'shift': return Object.entries(v).map(([k, x]) => `${k} ${x > 0 ? '+' : ''}${x}`).join(', ');
    case 'ids': return v.join(', ');
    case 'json': return typeof v === 'string' ? v : JSON.stringify(v);
    default: return String(v);
  }
}
const num = t => { const s = String(t).trim().replace(',', '.').replace('−', '-'); if (s === '∞' || /^infinity$/i.test(s)) return Infinity; const n = Number(s); if (s === '' || Number.isNaN(n)) throw new Error(`«${t}» — не число`); return n; };
const parts = t => String(t).split(/[,;·\n]+/).map(x => x.trim()).filter(Boolean);
function enumWord(values, w) {
  if (Array.isArray(values)) return w;
  if (Object.prototype.hasOwnProperty.call(values, w)) return w;
  const hit = Object.entries(values).find(([, x]) => (x && typeof x === 'object' ? x.label : x) === w);
  return hit ? hit[0] : w;
}
export function parseText(c, text) {
  const t = String(text).trim();
  switch (c.type) {
    case 'num': case 'int': return num(t);
    case 'text': return t;
    case 'ids': return parts(t);
    case 'map': return Object.fromEntries(parts(t).map(p => { const m = p.match(/^(\S+)\s+(.+)$/); if (!m) throw new Error(`«${p}»: нужно «ключ значение»`); return [m[1], c.values ? enumWord(c.values, m[2].trim()) : num(m[2])]; }));
    case 'special': return Object.fromEntries(parts(t).map(p => {
      const m = p.match(/^([A-Za-z])\s*(-?[\d.]+)\s*(?:[-–…]+\s*(-?[\d.]+))?$/); if (!m) throw new Error(`«${p}»: нужно «S 1-10»`);
      const k = m[1].toUpperCase(); if (!STATS.has(k)) throw new Error(`нет характеристики «${m[1]}»`);
      return [k, [num(m[2]), num(m[3] ?? m[2])]];
    }));
    case 'shift': return Object.fromEntries(parts(t).map(p => {
      const q = p.replace('−', '-');
      let m = q.match(/^([A-Za-z])\s*([+-]?[\d.]+)$/), k, n;
      if (m) [k, n] = [m[1], m[2]];
      else { m = q.match(/^([+-]?[\d.]+)\s*([A-Za-z])$/); if (!m) throw new Error(`«${p}»: нужно «S +1»`); [n, k] = [m[1], m[2]]; }
      if (!STATS.has(k.toUpperCase())) throw new Error(`нет характеристики «${k}»`);
      return [k.toUpperCase(), num(n)];
    }));
    case 'json': { try { return JSON.parse(t); } catch (e) { const n = Number(t.replace(',', '.')); return t !== '' && !Number.isNaN(n) ? n : t; } }
    default: return t;
  }
}

