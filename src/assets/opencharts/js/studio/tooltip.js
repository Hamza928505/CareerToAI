/**
 * tooltip.js — hover readouts for the charts that draw themselves.
 *
 * Chart.js brings its own tooltips, so the 39 charts on that renderer were the
 * only ones you could interrogate. The other 59 drew a picture and told you
 * nothing: a bar was a bar, and the number behind it was unreachable. These two
 * helpers close that gap, one for each way the library draws.
 *
 * **Both functions are serialised verbatim into exported code**, so neither may
 * reference anything outside its own body — no imports, no module constants, no
 * shared style object. That is why the CSS is inline and repeated, and why the
 * two `readout()` builders below are twins rather than one helper. See "One
 * build function, two outputs" in CLAUDE.md.
 *
 * **One rule holds both of them together: the readout is rebuilt, never
 * remembered.** It is a child of the chart's host, and the host is emptied by
 * `renderChart` before every render and by a D3 or DOM `mount` on every redraw.
 * A flag saying "already attached" survives that; the node it was attached
 * about does not.
 */

/**
 * Hover readouts for an SVG chart.
 *
 * Delegated from the host rather than bound per mark: a chart with 12,000 city
 * dots would otherwise pay for 12,000 listeners, and marks are rebuilt on every
 * redraw. A mark opts in by carrying `data-tip`.
 *
 * **The readout and the listener have different lifetimes, and must not share
 * one guard.** The listener is bound to the host, which outlives every redraw.
 * The readout is a *child* of the host — and a D3 or DOM mount empties its host
 * on every redraw, as does `renderChart` before every render. Behind a single
 * `__ocTips` flag that left a live handler writing into a node that had been
 * thrown away: hover worked on first paint and was dead from the first control
 * edit onward, on every self-drawn chart in the library. So the node is asked
 * for by `readout()`, which rebuilds it whenever it is no longer there, and
 * only the binding is guarded.
 *
 * @param {HTMLElement} host the element the chart was mounted into
 */
function attachTips(host) {
  if (!host) return;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

  const readout = () => {
    const found = host.__ocTip;
    // `parentElement === host` rather than `isConnected`: it also catches a
    // node that is still in the document but no longer in this chart.
    if (found && found.parentElement === host) return found;
    const node = document.createElement('div');
    node.setAttribute('role', 'tooltip');
    node.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;opacity:0;'
      + 'z-index:20;max-width:240px;padding:.34rem .5rem;border-radius:6px;'
      + 'background:rgba(22,22,26,.94);color:#fff;white-space:pre-line;'
      + 'font:12px/1.45 "IBM Plex Sans",system-ui,sans-serif;'
      + 'box-shadow:0 4px 14px rgba(0,0,0,.3);transition:opacity .1s';
    host.appendChild(node);
    host.__ocTip = node;
    return node;
  };
  readout();

  if (host.__ocTipBound) return;
  host.__ocTipBound = true;

  let shown = false;
  const hide = () => {
    if (!shown) return;
    shown = false;
    // Deliberately not through `readout()`: building a node in order to hide
    // it would put a readout back on a host that has no chart in it.
    const node = host.__ocTip;
    if (node && node.parentElement === host) node.style.opacity = '0';
  };

  host.addEventListener('mousemove', (e) => {
    let mark = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;

    // A network's links and a dendrogram's branches are hairlines, so the
    // pointer is almost never exactly on one. Probe a small ring around the
    // cursor before giving up — eight hit-tests, no bookkeeping, and it turns
    // "this chart has no tooltips" into "this chart has tooltips".
    if (!mark && typeof document.elementFromPoint === 'function') {
      // Two rings, near before far, so the closest mark still wins. A
      // dendrogram's branches are a pixel and a half wide; one ring at 6px
      // rescued the arcs and left the trees untouched.
      const RING = [
        [5, 0], [-5, 0], [0, 5], [0, -5], [4, 4], [-4, 4], [4, -4], [-4, -4],
        [11, 0], [-11, 0], [0, 11], [0, -11], [8, 8], [-8, 8], [8, -8], [-8, -8],
      ];
      for (let i = 0; i < RING.length && !mark; i++) {
        const el = document.elementFromPoint(e.clientX + RING[i][0], e.clientY + RING[i][1]);
        const near = el && el.closest ? el.closest('[data-tip]') : null;
        // Only marks inside this chart: the ring can reach past its edge.
        if (near && host.contains(near)) mark = near;
      }
    }

    if (!mark) { hide(); return; }

    const tip = readout();
    tip.textContent = mark.getAttribute('data-tip');
    const box = host.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;

    // Measure before placing, so the tip can be flipped or nudged rather than
    // hanging off the edge of a chart that sits flush against the page.
    tip.style.opacity = '1';
    shown = true;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const left = Math.max(4, Math.min(box.width - w - 4, x - w / 2));
    const top = y - h - 12 < 4 ? y + 18 : y - h - 12;
    tip.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
  });

  host.addEventListener('mouseleave', hide);
}

/**
 * Hover readouts for a canvas chart.
 *
 * A canvas has no elements to hover, so `draw()` reports the shapes it painted
 * and this hit-tests them. Shapes are searched newest first: later marks are
 * drawn on top, so where two overlap the one you can see is the one that wins.
 *
 * Three shapes, because a bounding box is the wrong answer for two thirds of
 * this library. A pie wedge's box covers most of the circle and would steal
 * every neighbour's hover; a packed bubble's box overlaps four others.
 *
 *   rect   { x, y, w, h, text }
 *   circle { cx, cy, r, text }
 *   wedge  { cx, cy, r0, r1, a0, a1, text }   angles in radians, a0 < a1
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Array<object>} regions
 */
function attachCanvasTips(canvas, regions) {
  if (!canvas || !regions || !regions.length) return;
  const host = canvas.parentElement;
  if (!host) return;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

  // Asked for rather than cached, for the same reason as `attachTips` above:
  // the readout lives inside the host and `renderChart` empties the host
  // before every render, so a truthy `__ocCanvasTip` is no evidence the node
  // is still on the page. Holding it in the listener's closure meant hover
  // worked once and then wrote to a node nobody could see.
  const readout = () => {
    const found = host.__ocCanvasTip;
    if (found && found.parentElement === host) return found;
    const node = document.createElement('div');
    node.setAttribute('role', 'tooltip');
    node.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;opacity:0;'
      + 'z-index:20;max-width:240px;padding:.34rem .5rem;border-radius:6px;'
      + 'background:rgba(22,22,26,.94);color:#fff;white-space:pre-line;'
      + 'font:12px/1.45 "IBM Plex Sans",system-ui,sans-serif;'
      + 'box-shadow:0 4px 14px rgba(0,0,0,.3);transition:opacity .1s';
    host.appendChild(node);
    host.__ocCanvasTip = node;
    return node;
  };
  readout();

  // Every redraw hands over a fresh set of boxes; keep one listener and let it
  // read the latest, or a resize would leave stale hit areas behind.
  canvas.__ocRegions = regions;

  if (!canvas.__ocTipBound) {
    canvas.__ocTipBound = true;
    let shown = false;
    const hide = () => {
      if (!shown) return;
      shown = false;
      const node = host.__ocCanvasTip;
      if (node && node.parentElement === host) node.style.opacity = '0';
    };

    canvas.addEventListener('mousemove', (e) => {
      const box = canvas.getBoundingClientRect();
      const x = e.clientX - box.left;
      const y = e.clientY - box.top;
      const list = canvas.__ocRegions || [];

      let hit = null;
      for (let i = list.length - 1; i >= 0; i--) {
        const r = list[i];
        let inside;
        if (r.r != null) {
          const dx = x - r.cx;
          const dy = y - r.cy;
          inside = dx * dx + dy * dy <= r.r * r.r;
        } else if (r.r1 != null) {
          const dx = x - r.cx;
          const dy = y - r.cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < r.r0 || dist > r.r1) {
            inside = false;
          } else {
            // Normalise both the mark's span and the cursor to one turn, so a
            // wedge that crosses the -π/π seam still matches.
            const TAU = Math.PI * 2;
            const norm = (a) => ((a % TAU) + TAU) % TAU;
            const from = norm(r.a0);
            const span = Math.min(TAU, Math.max(0, r.a1 - r.a0));
            inside = norm(Math.atan2(dy, dx) - from) <= span;
          }
        } else {
          inside = x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
        }
        if (inside) { hit = r; break; }
      }

      // Nothing exactly under the cursor. A barcode plot's rules are two
      // pixels wide and a scatter dot is three across, so requiring the
      // pointer to land *inside* the mark made those charts read as having no
      // hover at all — which is what they were reported as. Fall back to the
      // nearest mark within a small radius, so aiming near a mark is enough.
      if (!hit) {
        const SLACK = 14;
        let best = Infinity;
        for (let i = list.length - 1; i >= 0; i--) {
          const r = list[i];
          let d;
          if (r.r != null) {
            d = Math.max(0, Math.sqrt((x - r.cx) * (x - r.cx) + (y - r.cy) * (y - r.cy)) - r.r);
          } else if (r.r1 != null) {
            // Approximate a wedge by the point at its middle: exact tests
            // already catch every wedge big enough to aim at, and this only
            // has to rescue the thin ones.
            const mid = (r.a0 + r.a1) / 2;
            const rad = (r.r0 + r.r1) / 2;
            const mx = r.cx + Math.cos(mid) * rad;
            const my = r.cy + Math.sin(mid) * rad;
            d = Math.sqrt((x - mx) * (x - mx) + (y - my) * (y - my));
          } else {
            const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
            const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
            d = Math.sqrt(dx * dx + dy * dy);
          }
          // Strictly nearer, so of two equally close marks the later-drawn one
          // wins — the same rule the exact pass uses, for the same reason.
          if (d < best && d <= SLACK) { best = d; hit = r; }
        }
      }
      if (!hit) { hide(); return; }

      const tip = readout();
      tip.textContent = hit.text;
      tip.style.opacity = '1';
      shown = true;
      const hostBox = host.getBoundingClientRect();
      const px = e.clientX - hostBox.left;
      const py = e.clientY - hostBox.top;
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      const left = Math.max(4, Math.min(hostBox.width - w - 4, px - w / 2));
      const top = py - h - 12 < 4 ? py + 18 : py - h - 12;
      tip.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
    });

    canvas.addEventListener('mouseleave', hide);
  }
}

/**
 * Build the `tip` a canvas `draw()` calls to report what it painted.
 *
 * Takes either a rectangle positionally — `tip(x, y, w, h, text)`, which is
 * what most charts want and reads cleanly at the call site — or a shape object
 * for the circles and wedges a box would misrepresent.
 */
function recordTip(regions) {
  return function tip(a, b, c, d, e) {
    if (a && typeof a === 'object') {
      if (a.text != null) regions.push(a);
      return;
    }
    if (e == null) return;
    regions.push({ x: a, y: b, w: c, h: d, text: String(e) });
  };
}

export { attachTips, attachCanvasTips, recordTip };
