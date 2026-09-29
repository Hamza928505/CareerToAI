/**
 * palette-ui.js — the two pieces of furniture that edit a chart's colours.
 *
 * `colourWarning` was born inside `ControlPanel.js`, where two widgets needed
 * it. The Colours tab in the code panel is the third caller, and a third copy
 * of a statement about the palette would be a third thing to keep true — so it
 * lives here, with the editor that grew beside it.
 *
 * Neither of these knows where a chart keeps its colours. `paletteOf` answers
 * that once, for both, and its `set(i, hex)` writes back to whichever array a
 * colour came from.
 */

import { confusablePairs, describePairs, simulate, CVD_KINDS, paletteOf } from './cvd.js';
import { attachColourPicker } from './colorpicker.js';
import { RAMPS, valuesFor, defaultRule, colourByValue, describeRule, rampAt, rampById } from './colourby.js';
import { toast } from './toast.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/**
 * The colour-vision warning and its simulate toggle.
 *
 * `read()` hands back the colours whenever they are asked for rather than a
 * snapshot, because every caller repaints on edit and a captured list would go
 * stale on the first colour change.
 *
 * @param {() => string[]} read
 * @param {(i: number) => string} nameAt   what to call colour i
 * @param {() => void} repaint             redraw the swatches in the new mode
 */
export function colourWarning(read, nameAt, repaint) {
  const warn = el('p', 'palette-warn');
  const sim = el('button', 'palette-sim');
  sim.type = 'button';
  let showing = '';

  function paint() {
    // Only the colours this chart actually uses. Checking the whole eight-colour
    // palette would report pairs no reader will ever see side by side.
    const pairs = confusablePairs(read());
    warn.textContent = describePairs(pairs, nameAt);
    warn.hidden = !pairs.length;
    sim.hidden = !pairs.length && !showing;
    sim.textContent = showing
      ? 'Back to normal vision'
      : `See it as a ${(CVD_KINDS.find((k) => k.key === (pairs[0] || {}).kind) || CVD_KINDS[0]).label} reader`;
    sim.dataset.kind = showing || (pairs[0] || {}).kind || CVD_KINDS[0].key;
  }

  sim.addEventListener('click', () => {
    showing = showing ? '' : (sim.dataset.kind || CVD_KINDS[0].key);
    repaint();
  });

  return { warn, sim, paint, showing: () => showing };
}

/**
 * The whole palette in one place: a swatch, a name and a hex per series.
 *
 * The sidebar edits a colour one row at a time, next to that series' name and
 * values; the data table edits it against the column or row it belongs to.
 * Neither shows the palette *as a set*, which is the thing you need when the
 * question is "do these twelve work together" rather than "what colour is
 * this one".
 *
 * Rebuilt rather than updated in place: an edit can change how many series
 * there are, and a stale row would write to an index that has gone — the same
 * rule the control panel and the grid both follow.
 *
 * @param {object} def
 * @param {object} spec   mutated in place, like every other control
 * @param {Function} onChange  called after a colour is picked
 */
export function paletteEditor(def, spec, onChange) {
  const host = el('div', 'palette-editor');

  function paint() {
    host.innerHTML = '';
    const palette = paletteOf(def, spec);

    if (!palette.colors.length) {
      host.appendChild(el('p', 'palette-editor-empty',
        'This chart draws in a single colour, so there is no palette to set.'));
      return;
    }

    const cvd = colourWarning(
      () => paletteOf(def, spec).colors,
      (i) => paletteOf(def, spec).names[i] || '',
      () => paint(),
    );

    const list = el('div', 'palette-editor-list');
    palette.colors.forEach((hex, i) => {
      const row = el('div', 'palette-editor-row');

      const dot = el('button', 'palette-editor-dot');
      dot.type = 'button';
      // Simulated while previewing, but the picker still edits the real
      // colour: this is inspection, never an edit.
      dot.style.background = cvd.showing() ? simulate(hex, cvd.showing()) : hex;
      dot.setAttribute('aria-label', `Colour ${i + 1}${palette.names[i] ? `, ${palette.names[i]}` : ''}`);
      attachColourPicker(dot, () => paletteOf(def, spec).colors[i] || hex, (next) => {
        paletteOf(def, spec).set(i, next);
        paint();
        onChange();
      });

      const name = el('span', 'palette-editor-name', palette.names[i] || `Series ${i + 1}`);
      const code = el('span', 'palette-editor-hex', hex);

      row.append(dot, name, code);
      list.appendChild(row);
    });

    const head = el('p', 'palette-editor-head',
      `${palette.colors.length} colours, read from ${palette.from === 'colors'
        ? 'the chart’s colour list' : 'each series'}.`);

    host.append(head, list, cvd.warn, cvd.sim);
    const byValue = colourByPanel(def, spec, (said) => {
      paint();
      onChange();
      toast(`Coloured ${said}`, 'ok', 3600);
    });
    if (byValue) host.appendChild(byValue);
    cvd.paint();
  }

  paint();
  return host;
}

/* ── colour by value ────────────────────────────────────────────────────── */

/**
 * The rule a reader is building, kept against the spec it is about.
 *
 * The Colours tab is re-mounted on every rebuild — a colour picked, a value
 * typed anywhere — and a half-built rule that vanished on each keystroke
 * would be unusable. A WeakMap keyed by the spec object survives rebuilds and
 * is dropped with the spec when a chart is switched or an undo replaces it.
 */
const RULE_STATE = new WeakMap();

/**
 * "Bars above target green, below red"; "shade by size". A rule is built here,
 * previewed as a strip of swatches beside the items it would colour, and
 * written into the palette on Apply — an edit, like a transform, so the export
 * carries colours and not a rule. Offered only where `valuesFor` can say which
 * number belongs to which colour.
 */
function colourByPanel(def, spec, applied) {
  const aligned = valuesFor(def, spec);
  if (!aligned) return null;

  const state = RULE_STATE.get(spec) || { kind: 'threshold', col: aligned.columns[0].index, rule: null };
  RULE_STATE.set(spec, state);
  if (!aligned.columns.some((c) => c.index === state.col)) state.col = aligned.columns[0].index;
  const values = () => aligned.values(state.col);
  if (!state.rule || state.rule.kind !== state.kind) state.rule = defaultRule(state.kind, values());

  const wrap = el('div', 'colour-by');
  const head = el('div', 'colour-by-head');
  head.appendChild(el('h3', 'colour-by-title', 'Colour by value'));
  head.appendChild(el('p', 'colour-by-sub',
    `Using ${aligned.describe(state.col)}. Runs once, when you apply it — the colours are written into the chart, not a rule.`));
  wrap.appendChild(head);

  const row = el('div', 'colour-by-row');
  const kindSel = el('select', 'colour-by-select');
  kindSel.setAttribute('aria-label', 'Kind of rule');
  [['threshold', 'Two colours, above and below a value'], ['gradient', 'Shade from low to high'], ['diverging', 'Diverge around a midpoint']]
    .forEach(([v, l]) => kindSel.appendChild(new Option(l, v, false, v === state.kind)));
  kindSel.addEventListener('change', () => { state.kind = kindSel.value; state.rule = null; repaint(); });
  row.appendChild(kindSel);

  if (aligned.columns.length > 1) {
    const colSel = el('select', 'colour-by-select');
    colSel.setAttribute('aria-label', 'Column to colour by');
    aligned.columns.forEach((c) => colSel.appendChild(new Option(c.name, String(c.index), false, c.index === state.col)));
    colSel.addEventListener('change', () => { state.col = Number(colSel.value); state.rule = null; repaint(); });
    row.appendChild(colSel);
  }
  wrap.appendChild(row);

  const fields = el('div', 'colour-by-fields');
  const rule = state.rule;
  const num = (key, label) => {
    const box = el('input', 'colour-by-num');
    box.type = 'number';
    box.step = 'any';
    box.value = rule[key];
    box.setAttribute('aria-label', label);
    box.addEventListener('input', () => { rule[key] = Number(box.value); preview(); });
    const lab = el('label', 'colour-by-field');
    lab.append(el('span', null, label), box);
    return lab;
  };
  const swatch = (key, label) => {
    const dot = el('button', 'colour-by-dot');
    dot.type = 'button';
    dot.style.background = rule[key];
    dot.setAttribute('aria-label', label);
    attachColourPicker(dot, () => rule[key], (hex) => { rule[key] = hex; dot.style.background = hex; preview(); });
    const lab = el('label', 'colour-by-field');
    lab.append(el('span', null, label), dot);
    return lab;
  };
  const rampSel = (kind) => {
    const sel = el('select', 'colour-by-select');
    sel.setAttribute('aria-label', 'Ramp');
    RAMPS.filter((r) => r.kind === kind).forEach((r) => sel.appendChild(new Option(r.label, r.id, false, r.id === rule.ramp)));
    sel.addEventListener('change', () => { rule.ramp = sel.value; preview(); });
    const strip = el('span', 'colour-by-ramp');
    const paintStrip = () => {
      strip.style.background = `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((t) => rampAt(rampById(rule.ramp), t)).join(', ')})`;
    };
    sel.addEventListener('change', paintStrip);
    paintStrip();
    const lab = el('label', 'colour-by-field');
    lab.append(el('span', null, 'Ramp'), sel, strip);
    return lab;
  };

  if (rule.kind === 'threshold') {
    fields.append(num('at', 'At or above'), swatch('above', 'Colour above'), swatch('below', 'Colour below'));
  } else if (rule.kind === 'diverging') {
    fields.append(rampSel('diverging'), num('mid', 'Midpoint'), num('lo', 'Low end'), num('hi', 'High end'));
  } else {
    fields.append(rampSel('sequential'), num('lo', 'Low end'), num('hi', 'High end'));
  }
  wrap.appendChild(fields);

  // What Apply would do, item by item, before it does it.
  const strip = el('div', 'colour-by-preview');
  wrap.appendChild(strip);
  const names = aligned.palette.names;
  function preview() {
    strip.innerHTML = '';
    const out = colourByValue(values(), rule, (i) => aligned.palette.colors[i]);
    out.forEach((hex, i) => {
      const chip = el('span', 'colour-by-chip');
      const dot = el('i', 'colour-by-chip-dot');
      dot.style.background = hex;
      chip.append(dot, el('span', null, `${names[i] || `#${i + 1}`} · ${Number.isFinite(values()[i]) ? values()[i] : '—'}`));
      chip.title = hex;
      strip.appendChild(chip);
    });
  }
  preview();

  const actions = el('div', 'colour-by-actions');
  const apply = el('button', 'btn btn-sm btn-primary', 'Apply colours');
  apply.type = 'button';
  apply.addEventListener('click', () => {
    const out = colourByValue(values(), rule, (i) => aligned.palette.colors[i]);
    const palette = paletteOf(def, spec);
    out.forEach((hex, i) => palette.set(i, hex));
    applied(describeRule(rule, aligned.describe(state.col)));
  });
  actions.appendChild(apply);
  actions.appendChild(el('span', 'colour-by-note', describeRule(rule, aligned.describe(state.col)).replace(/^./, (c) => c.toUpperCase()) + '.'));
  wrap.appendChild(actions);

  function repaint() {
    const fresh = colourByPanel(def, spec, applied);
    if (fresh) wrap.replaceWith(fresh);
  }
  return wrap;
}
