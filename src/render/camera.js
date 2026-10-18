// A camera over a grid of cells, shared by the screens that draw one: zoom 1 shows the whole grid in
// the box, (cx, cy) is the centre of the view in cells. After clamp(), S is the size of a cell in CSS
// pixels and (ox, oy) the pixel of the grid's top-left corner, so a point (x, y) in cells sits at
// (ox + x·S, oy + y·S). The zoom stops when a cell is MAX_CELL_PX across. (render/renderer.js keeps
// its own copy of this arithmetic for the local map; it will move here when it is next touched.)
export const MAX_CELL_PX = 40;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class Camera {
  constructor(w, h) { this.w = w; this.h = h; this.reset(); }
  reset() { this.zoom = 1; this.cx = this.w / 2; this.cy = this.h / 2; this.S = 1; this.ox = 0; this.oy = 0; }

  fit(cw, ch) { return Math.min(cw / this.w, ch / this.h); }
  maxZoom(cw, ch) { return Math.max(1, MAX_CELL_PX / this.fit(cw, ch)); }

  // keep the zoom within limits and the grid on screen; a grid smaller than the view stays centred
  clamp(cw, ch) {
    this.zoom = clamp(this.zoom, 1, this.maxZoom(cw, ch));
    const S = this.fit(cw, ch) * this.zoom, hx = cw / 2 / S, hy = ch / 2 / S;
    this.cx = this.w <= 2 * hx ? this.w / 2 : clamp(this.cx, hx, this.w - hx);
    this.cy = this.h <= 2 * hy ? this.h / 2 : clamp(this.cy, hy, this.h - hy);
    this.S = S; this.ox = cw / 2 - this.cx * S; this.oy = ch / 2 - this.cy * S;
    return this;
  }

  // a point of the box (CSS pixels from its top-left corner) → grid coordinates in cells
  toCell(px, py) { return [(px - this.ox) / this.S, (py - this.oy) / this.S]; }

  // zoom by `factor`, keeping the grid point under (px, py) where it is
  zoomAt(cw, ch, factor, px, py) {
    this.clamp(cw, ch);
    const [mx, my] = this.toCell(px, py);
    this.zoom = clamp(this.zoom * factor, 1, this.maxZoom(cw, ch));
    const S = this.fit(cw, ch) * this.zoom;
    this.cx = mx - (px - cw / 2) / S; this.cy = my - (py - ch / 2) / S;
    return this.clamp(cw, ch);
  }

  pan(cw, ch, dx, dy) { this.clamp(cw, ch); this.cx -= dx / this.S; this.cy -= dy / this.S; return this.clamp(cw, ch); }
}
