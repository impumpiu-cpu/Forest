// The pictures (src/art/**/*.svg) → src/art/sprites.js, the module the game reads (render/art/sprite.js). The SVG files
// are the source a person edits in Inkscape, Figma or by hand (docs/ART.md); sprites.js is made from them and kept in
// git, so the game opens without a build step. tools/serve.mjs remakes it whenever the game asks for it, so an edited
// picture shows on a reload; `npm run art` remakes it by hand, `npm run build` before bundling, tools/art-check.mjs
// fails when it is behind the files.
//
// What is read (the contract in docs/ART.md): the root viewBox; path, circle, ellipse, rect, polygon, polyline, line
// and g; fill, stroke, stroke-width, opacity — as attributes or in style=""; transform (matrix, translate, scale,
// rotate, skewX/Y) on any of them; class — the size steps (detail, figure, small) and flags (any other word: the part
// is drawn only when the painter is given that flag; no-<flag> — only when it is not); data-anchor="name" on a circle
// or ellipse — a point (and a radius) the painter places things at, not drawn. The rest (defs, metadata, text,
// gradients, images, Inkscape's own attributes) is skipped; art-check names what was skipped.
import {readdirSync, readFileSync, statSync, writeFileSync, existsSync} from 'node:fs';
import {join, relative, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ART_DIR = join(ROOT, 'src', 'art');
export const OUT = join(ART_DIR, 'sprites.js');
export const LOD = new Set(['detail', 'figure', 'small']);
const SHAPES = new Set(['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line']);
const SKIP = new Set(['defs', 'metadata', 'title', 'desc', 'style', 'sodipodi:namedview', 'inkscape:perspective', 'clipPath', 'mask', 'pattern', 'linearGradient', 'radialGradient', 'symbol']);

export function svgFiles(dir = ART_DIR) {
  const out = [];
  (function walk(d) { for (const f of readdirSync(d).sort()) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.svg')) out.push(p); } })(dir);
  return out;
}

const num = v => (v == null || v === '' ? 0 : parseFloat(v));
const r3 = v => Math.round(v * 1000) / 1000;
function attrsOf(s) {
  const a = {};
  for (const m of s.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) a[m[1]] = m[2] ?? m[3];
  if (a.style) for (const kv of a.style.split(';')) { const [k, v] = kv.split(':').map(x => x && x.trim()); if (k && v != null) a[k] = v; }
  return a;
}
// 2-D matrices as [a, b, c, d, e, f] (x' = a·x + c·y + e)
const I = [1, 0, 0, 1, 0, 0];
const mul = (p, q) => [p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3], p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5]];
function parseTransform(t) {
  let m = I;
  if (!t) return m;
  for (const [, fn, args] of t.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const v = args.split(/[\s,]+/).filter(Boolean).map(Number);
    let q = I;
    if (fn === 'matrix') q = v;
    else if (fn === 'translate') q = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
    else if (fn === 'scale') q = [v[0], 0, 0, v[1] ?? v[0], 0, 0];
    else if (fn === 'rotate') {
      const a = (v[0] * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      q = [c, s, -s, c, 0, 0];
      if (v.length === 3) q = mul(mul([1, 0, 0, 1, v[1], v[2]], q), [1, 0, 0, 1, -v[1], -v[2]]);
    } else if (fn === 'skewX') q = [1, 0, Math.tan((v[0] * Math.PI) / 180), 1, 0, 0];
    else if (fn === 'skewY') q = [1, Math.tan((v[0] * Math.PI) / 180), 0, 1, 0, 0];
    m = mul(m, q);
  }
  return m;
}
const isI = m => m.every((v, k) => Math.abs(v - I[k]) < 1e-9);

function ellipseD(cx, cy, rx, ry) { return `M${r3(cx - rx)} ${r3(cy)}A${r3(rx)} ${r3(ry)} 0 1 0 ${r3(cx + rx)} ${r3(cy)}A${r3(rx)} ${r3(ry)} 0 1 0 ${r3(cx - rx)} ${r3(cy)}Z`; }
function shapeD(tag, a) {
  switch (tag) {
    case 'path': return (a.d || '').replace(/\s+/g, ' ').trim();
    case 'circle': return ellipseD(num(a.cx), num(a.cy), num(a.r), num(a.r));
    case 'ellipse': return ellipseD(num(a.cx), num(a.cy), num(a.rx), num(a.ry));
    case 'line': return `M${num(a.x1)} ${num(a.y1)}L${num(a.x2)} ${num(a.y2)}`;
    case 'polygon': case 'polyline': {
      const p = (a.points || '').trim().split(/[\s,]+/).map(Number);
      let d = '';
      for (let k = 0; k + 1 < p.length; k += 2) d += (k ? 'L' : 'M') + p[k] + ' ' + p[k + 1];
      return tag === 'polygon' ? d + 'Z' : d;
    }
    case 'rect': {
      const x = num(a.x), y = num(a.y), w = num(a.width), h = num(a.height);
      let rx = a.rx != null ? num(a.rx) : a.ry != null ? num(a.ry) : 0, ry = a.ry != null ? num(a.ry) : rx;
      rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
      if (!rx || !ry) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${r3(x + rx)} ${y}H${r3(x + w - rx)}A${rx} ${ry} 0 0 1 ${x + w} ${r3(y + ry)}V${r3(y + h - ry)}A${rx} ${ry} 0 0 1 ${r3(x + w - rx)} ${y + h}H${r3(x + rx)}A${rx} ${ry} 0 0 1 ${x} ${r3(y + h - ry)}V${r3(y + ry)}A${rx} ${ry} 0 0 1 ${r3(x + rx)} ${y}Z`;
    }
  }
  return '';
}
const paint = v => (v == null || v === '' || v === 'inherit' ? undefined : v === 'none' || v === 'transparent' ? null : v);

// one SVG text → {box, parts, anchors, skipped}
export function parseSvg(text) {
  const out = {box: [0, 0, 100, 100], parts: [], anchors: {}, skipped: new Set()};
  const stack = [{fill: 'black', stroke: null, w: 1, o: 1, cls: [], m: I}];
  let skipDepth = 0;
  for (const m of text.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([\w:-]+)([^>]*?)(\/?)>/g)) {
    const [, close, tag, rest, self] = m;
    if (tag.startsWith('?') || tag === '!DOCTYPE') continue;
    if (skipDepth) { if (SKIP.has(tag) || tag === 'g') { if (close) skipDepth--; else if (!self) skipDepth++; } continue; }
    if (close) { if (tag === 'g' || tag === 'svg' || tag === 'a') stack.pop(); continue; }
    if (SKIP.has(tag)) { if (!self) skipDepth = 1; continue; }
    const a = attrsOf(rest), top = stack[stack.length - 1];
    const st = {
      fill: paint(a.fill) !== undefined ? paint(a.fill) : top.fill,
      stroke: paint(a.stroke) !== undefined ? paint(a.stroke) : top.stroke,
      w: a['stroke-width'] != null ? num(a['stroke-width']) : top.w,
      o: top.o * (a.opacity != null ? num(a.opacity) : 1),
      cls: [...top.cls, ...(a.class || '').split(/\s+/).filter(Boolean)],
      m: a.transform ? mul(top.m, parseTransform(a.transform)) : top.m,
    };
    if (tag === 'svg') {
      if (a.viewBox) out.box = a.viewBox.split(/[\s,]+/).map(Number);
      else if (a.width && a.height) out.box = [0, 0, num(a.width), num(a.height)];
      if (!self) stack.push(st);
      continue;
    }
    if (tag === 'g' || tag === 'a') { if (!self) stack.push(st); continue; }
    if (!SHAPES.has(tag)) { out.skipped.add(tag); if (!self) skipDepth = 1; continue; }
    if (a['data-anchor']) {
      const p = isI(st.m) ? [num(a.cx), num(a.cy)] : [st.m[0] * num(a.cx) + st.m[2] * num(a.cy) + st.m[4], st.m[1] * num(a.cx) + st.m[3] * num(a.cy) + st.m[5]];
      out.anchors[a['data-anchor']] = [r3(p[0]), r3(p[1]), r3(num(a.r ?? a.rx) * Math.hypot(st.m[0], st.m[1]))];
      continue;
    }
    const d = shapeD(tag, a);
    if (!d) continue;
    const fill = tag === 'line' || tag === 'polyline' ? (paint(a.fill) ?? null) : st.fill;
    const part = {d};
    if (fill) part.f = fill;
    if (st.stroke) { part.s = st.stroke; part.w = r3(st.w); }
    if (st.o < 1) part.o = r3(st.o * (a['fill-opacity'] != null ? num(a['fill-opacity']) : 1));
    const lod = st.cls.filter(c => LOD.has(c)), flags = st.cls.filter(c => !LOD.has(c));
    if (lod.length) part.lod = lod[lod.length - 1];
    if (flags.length) part.when = [...new Set(flags)];
    if (!isI(st.m)) part.m = st.m.map(r3);
    if (part.f || part.s) out.parts.push(part);
  }
  return out;
}

export function buildSprites({write = true} = {}) {
  const files = svgFiles(), sprites = {}, problems = [];
  for (const f of files) {
    const key = relative(ART_DIR, f).replace(/\\/g, '/').replace(/\.svg$/, '');
    let s;
    try { s = parseSvg(readFileSync(f, 'utf8')); } catch (e) { problems.push(`${key}: ${e.message}`); continue; }
    if (s.skipped.size) problems.push(`${key}: пропущено ${[...s.skipped].join(', ')}`);
    if (!s.parts.length) problems.push(`${key}: ни одной фигуры`);
    sprites[key] = {box: s.box, parts: s.parts, ...(Object.keys(s.anchors).length ? {anchors: s.anchors} : {})};
  }
  const body = Object.entries(sprites).map(([k, s]) => `  ${JSON.stringify(k)}: ${JSON.stringify(s)},`).join('\n');
  const text = `// Made by tools/art-build.mjs from src/art/**/*.svg — do not edit: edit the SVG and reload (tools/serve.mjs remakes it)\n// or run \`npm run art\`. docs/ART.md.\nexport const SPRITES = {\n${body}\n};\n`;
  if (write && (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== text)) writeFileSync(OUT, text);
  return {text, count: files.length, problems};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {count, problems} = buildSprites();
  console.log(`src/art/sprites.js: ${count} картинок`);
  for (const p of problems) console.log('  ' + p);
}
