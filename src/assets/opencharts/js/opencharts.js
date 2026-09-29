/**
 * opencharts.js — the library as something a page imports.
 *
 * Until now the way out of OpenCharts was the export: a finished snippet with
 * the data inlined, copied into somebody's page. That is still the export's
 * job. This is the other door, for a developer who has the package installed
 * and a table already in hand:
 *
 *   import { render } from '@hamza928505/opencharts';
 *   const chart = render(document.querySelector('#host'), {
 *     chart: 'bar-vertical',
 *     data: rows,                       // CSV text, or JSON records
 *   });
 *
 * or, with no JavaScript of their own:
 *
 *   <open-chart chart="bar-vertical" data='[{"q":"Q1","sales":520},…]'></open-chart>
 *
 * Both are thin: `render` is `newSpec` + `applyData` + `renderChart`, the same
 * three calls the studio makes, and the element is `render` on connect and
 * `destroy` on disconnect. Nothing here draws. The rules the studio follows
 * hold here too — a renderer reads its spec and nothing else, libraries
 * arrive when a chart first needs them, `renderChart` stays synchronous and
 * hands back `whenReady` for callers that must have the finished thing.
 */

import { CHARTS, CATEGORIES, CATEGORY_ORDER, getChart, newSpec } from './studio/registry.js';
import { renderChart, destroyInstance, resizeInstance, generateCode } from './studio/engines.js';
import { applyData, parseTable, checkTableShape } from './studio/dataio.js';

export { CHARTS, CATEGORIES, CATEGORY_ORDER, getChart, newSpec, applyData, parseTable, generateCode };

/** Every chart, as the four facts a picker needs. */
export function charts() {
  return CHARTS.map((c) => ({ id: c.id, title: c.title, category: c.category, blurb: c.blurb }));
}

/**
 * Draw a chart into a host element.
 *
 * @param {Element} host
 * @param {object} options
 * @param {string} options.chart      a chart id — `charts()` lists them
 * @param {object} [options.spec]     fields merged over the chart's defaults
 * @param {string|object} [options.data]  a table: CSV text, JSON text, or
 *                                    already-parsed JSON records / `{headers, rows}`
 * @param {boolean} [options.header=true]  whether CSV text starts with a header
 *                                    row. A program's table nearly always does,
 *                                    and `Q,2024` cannot be told apart from data
 *                                    by looking — the studio asks a person; this
 *                                    takes the caller's word. JSON knows its own.
 * @param {number} [options.height]   the plate's height in px
 * @returns {{ spec: object, instance: object, whenReady: Promise, update(next): void, destroy(): void }}
 * @throws when `chart` names nothing, or `data` cannot be read by it —
 *   loudly, because a page that quietly drew the example under the caller's
 *   heading would be the worst outcome available.
 */
export function render(host, options = {}) {
  if (!host || !host.appendChild) throw new Error('render() needs a host element.');
  const def = getChart(options.chart);
  if (!def) throw new Error(`No chart called "${options.chart}". charts() lists the ids.`);

  const spec = { ...newSpec(def), ...(options.spec || {}) };
  if (options.data != null) {
    const table = typeof options.data === 'string' ? options.data : tableFrom(options.data);
    // The studio's own check is advisory — an extra notes column is still
    // usable, and a person is there to see the result. A program is not, so
    // too few columns is refused here: a chart drawn from one column under
    // the caller's heading is the quietest way a page can lie.
    const header = options.header === undefined ? true : !!options.header;
    const parsed = typeof table === 'string' ? parseTable(table, header) : table;
    const fit = checkTableShape(def, parsed);
    if (!fit.ok && /needs at least/.test(fit.message)) {
      throw new Error(`${def.title} could not read that data: ${fit.message}`);
    }
    const res = applyData(def, spec, parsed);
    if (!res.ok) throw new Error(`${def.title} could not read that data: ${res.message}`);
  }
  if (typeof def.onChange === 'function') def.onChange(spec);

  let instance = renderChart(def, host, spec, options.height ? { height: options.height } : {});
  const api = {
    spec,
    get instance() { return instance; },
    get whenReady() { return instance && instance.whenReady ? instance.whenReady : Promise.resolve(instance); },
    update(next = {}) {
      destroyInstance(instance);
      Object.assign(spec, next);
      if (typeof def.onChange === 'function') def.onChange(spec);
      instance = renderChart(def, host, spec, options.height ? { height: options.height } : {});
      return api;
    },
    resize() { if (instance) resizeInstance(instance); },
    destroy() { destroyInstance(instance); instance = null; host.innerHTML = ''; },
  };
  return api;
}

/** Already-parsed JSON as the text `applyData` reads, or a table passed through. */
function tableFrom(data) {
  if (data && Array.isArray(data.rows) && Array.isArray(data.headers)) return data;
  return JSON.stringify(data);
}

/**
 * `<open-chart chart="…" spec='{…}' data='…' height="340">`
 *
 * Re-renders when any attribute changes and tears down when removed, so a
 * page that swaps ten of them in and out leaks nothing. Errors land in the
 * element as text rather than in the console alone: a blank box that says
 * nothing is the failure this whole library is built not to ship.
 */
export class OpenChartElement extends HTMLElement {
  static get observedAttributes() { return ['chart', 'spec', 'data', 'height', 'header']; }

  connectedCallback() { this._draw(); }
  disconnectedCallback() { this._teardown(); }
  attributeChangedCallback() { if (this.isConnected) this._draw(); }

  /** The live handle from `render()`, or null. */
  get chart() { return this._api || null; }

  _teardown() {
    if (this._api) { this._api.destroy(); this._api = null; }
  }

  _draw() {
    this._teardown();
    const id = this.getAttribute('chart');
    let spec;
    try { spec = this.hasAttribute('spec') ? JSON.parse(this.getAttribute('spec')) : undefined; } catch (e) {
      this.textContent = `The spec attribute is not JSON: ${e.message}`;
      return;
    }
    const height = Number(this.getAttribute('height')) || undefined;
    try {
      this.style.display = 'block';
      this._api = render(this, {
        chart: id, spec, data: this.getAttribute('data') ?? undefined, height,
        header: this.getAttribute('header') !== 'false',
      });
    } catch (e) {
      this.textContent = e.message;
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('open-chart')) {
  customElements.define('open-chart', OpenChartElement);
}
