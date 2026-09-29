/**
 * SourcesPanel.js — shows exactly which third-party code a chart pulls in.
 *
 * OpenCharts is meant to be copied from, so "what does this actually load?"
 * should be answerable without reading the export. Every library is named with
 * its version, licence and CDN, and its URL can be copied on its own.
 */

import { cdnOnly } from './cdn.js';
import { toast } from './toast.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/**
 * @param {HTMLElement} container the .sources element
 * @param {Array<object>} deps    from dependenciesFor(def)
 */
export function renderSources(container, deps) {
  container.innerHTML = '';
  const cdn = cdnOnly(deps);

  const head = el('div', 'sources-head');
  head.appendChild(el('span', null, 'Sources'));
  // Count scripts and data files separately — calling a boundary file a
  // "script" would be misleading in the one place meant to be precise.
  const scripts = cdn.filter((d) => d.kind !== 'data').length;
  const data = cdn.filter((d) => d.kind === 'data').length;
  const parts = [];
  if (scripts) parts.push(`${scripts} script${scripts > 1 ? 's' : ''}`);
  if (data) parts.push(`${data} data file${data > 1 ? 's' : ''}`);
  const count = el('span', 'count', parts.length ? parts.join(' + ') : 'no CDN');
  head.appendChild(count);
  container.appendChild(head);

  deps.forEach((lib) => {
    const row = el('div', 'source-row');

    const left = el('div');
    left.style.cssText = 'display:flex;flex-direction:column;gap:.15rem;min-width:150px';

    const nameLine = el('div', 'source-name');
    if (lib.homepage) {
      const a = el('a', null, lib.version ? `${lib.name} ${lib.version}` : lib.name);
      a.href = lib.homepage;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      nameLine.appendChild(a);
    } else {
      nameLine.textContent = lib.version ? `${lib.name} ${lib.version}` : lib.name;
    }
    left.appendChild(nameLine);
    left.appendChild(el('div', 'source-role', lib.role));

    const tags = el('div', 'source-tags');
    if (lib.license) tags.appendChild(el('span', 'pill', lib.license));
    if (lib.provider && lib.provider !== 'none') {
      tags.appendChild(el('span', 'pill', lib.provider));
    }

    row.append(left, tags);

    if (lib.url) {
      const urlBox = el('div', 'source-url');
      const code = el('code', null, lib.url);
      code.title = lib.url;
      const copy = el('button', null, '⧉');
      copy.type = 'button';
      copy.title = 'Copy this URL';
      copy.setAttribute('aria-label', `Copy the ${lib.name} CDN URL`);
      copy.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await navigator.clipboard.writeText(lib.url);
          toast(`${lib.name} URL copied`, 'ok');
        } catch {
          toast('Clipboard blocked by the browser', 'bad');
        }
      });
      urlBox.append(code, copy);
      row.appendChild(urlBox);
    } else if (lib.local) {
      const localBox = el('div', 'source-url');
      localBox.appendChild(el('code', null, lib.local));
      row.appendChild(localBox);
    }

    container.appendChild(row);
  });

  if (!cdn.length) {
    container.appendChild(el('div', 'source-note',
      'Nothing is fetched from a CDN for this chart — copy the code and it runs offline.'));
  }
}
