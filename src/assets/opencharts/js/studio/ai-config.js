/** A tab-scoped connection to the user's local OpenCharts MCP server. */
import { toast } from './toast.js';

const SESSION_KEY = 'opencharts.agent-connection';
let sessionSettings;
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};
function removeLegacyKeys() {
  try {
    localStorage.removeItem('opencharts.ai-key');
    localStorage.removeItem('opencharts.ai-settings');
  } catch { /* Storage may be unavailable. */ }
}
removeLegacyKeys();

function localURL(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { /* handled below */ }
  if (!url || url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.search || !['/', '/index.html'].includes(url.pathname)) {
    throw new Error('Use the local OpenCharts link from opencharts_status, such as http://127.0.0.1:8765/#mcp=…');
  }
  return url;
}
export function parseAgentLink(link) {
  const url = localURL(link);
  const match = url.hash.match(/^#mcp=([a-f0-9]{64})$/i);
  if (!match) throw new Error('The connection link must include the complete #mcp= token from opencharts_status.');
  return { endpoint: url.origin, token: match[1].toLowerCase() };
}
function normalizeSettings(settings) {
  if (!settings || typeof settings.endpoint !== 'string' || typeof settings.token !== 'string') {
    throw new Error('Paste the local connection link from your agent.');
  }
  const url = localURL(settings.endpoint);
  if (url.hash || !/^[a-f0-9]{64}$/i.test(settings.token)) throw new Error('The local connection link is incomplete.');
  return { endpoint: url.origin, token: settings.token.toLowerCase() };
}
export async function setAiSettings(settings) {
  const value = normalizeSettings(settings);
  sessionSettings = value;
  removeLegacyKeys();
  let persisted = true;
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(value)); } catch { persisted = false; }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('opencharts-agent-change'));
  return { ok: true, persisted };
}
export function clearAiSettings() {
  sessionSettings = null;
  removeLegacyKeys();
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Memory still cleared. */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('opencharts-agent-change'));
}
async function checkConnection(settings, signal) {
  const response = await fetch(settings.endpoint + '/health', {
    headers: { 'x-opencharts-token': settings.token }, signal,
    credentials: 'omit', redirect: 'error', cache: 'no-store',
  });
  if (!response.ok) throw new Error('The local connection was refused. Ask your agent for a fresh opencharts_status link.');
  const health = await response.json();
  if (health.name !== 'OpenCharts MCP' || health.connected !== true) {
    throw new Error('OpenCharts MCP is not connected. Enable it in your agent, then try again.');
  }
}

// Consume only a local connection fragment, never a chart/share fragment.
const autoConnection = (async () => {
  if (typeof location === 'undefined' || !/^#mcp=/.test(location.hash)) return;
  let settings;
  try { settings = parseAgentLink(location.href); } catch { return; }
  history.replaceState(history.state, '', location.pathname + location.search);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    await checkConnection(settings, controller.signal);
    await setAiSettings(settings);
  } catch {
    toast('Could not connect to your local agent. Open Connect agent and paste a fresh link from opencharts_status.', 'bad', 6500);
  } finally { clearTimeout(timeout); }
})();
export async function getAiSettings() {
  await autoConnection;
  if (sessionSettings === undefined) {
    try { sessionSettings = normalizeSettings(JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')); }
    catch { sessionSettings = null; }
  }
  return sessionSettings ? { ...sessionSettings } : null;
}

export function openAiConfigDialog() {
  return new Promise((resolve) => {
    const returnFocus = document.activeElement;
    const scrim = el('div', 'dlg-scrim ask-scrim');
    const box = el('div', 'ask ai-config');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'ai-config-title');
    const main = el('div', 'ask-main');
    const title = el('h2', 'ask-title', 'Connect agent');
    title.id = 'ai-config-title';
    main.append(title, el('p', 'ask-text', 'Use Codex, Claude Code or another MCP-capable agent signed in on your device. Your agent handles AI access under its own plan and usage limits.'));
    const label = el('label', 'dlg-label', 'Local connection link');
    label.htmlFor = 'ai-config-link';
    const input = el('input', 'link-input');
    input.id = label.htmlFor;
    input.type = 'url';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'http://127.0.0.1:8765/#mcp=…';
    input.setAttribute('aria-describedby', 'ai-config-hint ai-config-error');
    const hint = el('p', 'ask-text', 'Ask your agent to call opencharts_status. Open its local link or paste it here. Keep this link private; it connects this tab to the agent on your device.');
    hint.id = 'ai-config-hint';
    const error = el('p', 'analyst-status is-bad');
    error.id = 'ai-config-error';
    error.setAttribute('role', 'alert');
    const fields = el('div', 'ai-config-fields');
    fields.append(label, input, hint, error);
    const guide = el('details', 'ai-config-advanced');
    guide.appendChild(el('summary', null, 'First-time setup'));
    guide.appendChild(el('p', 'ask-text', 'Download OpenCharts, install Node.js 20 or newer, and run npm install in the OpenCharts folder. Add its MCP server to your signed-in agent using the full path on your device:'));
    for (const [name, command] of [
      ['Codex', 'codex mcp add opencharts -- node /absolute/path/to/OpenCharts/tools/mcp-server.mjs'],
      ['Claude Code', 'claude mcp add --transport stdio opencharts -- node /absolute/path/to/OpenCharts/tools/mcp-server.mjs'],
    ]) guide.append(el('p', 'dlg-label', name), el('pre', 'ai-config-command', command));
    guide.append(el('p', 'dlg-label', 'Other MCP clients'), el('pre', 'ai-config-command', JSON.stringify({
      mcpServers: { opencharts: { command: 'node', args: ['/absolute/path/to/OpenCharts/tools/mcp-server.mjs'] } },
    }, null, 2)));
    guide.appendChild(el('p', 'ask-text', 'Restart or reconnect your agent, then ask it to call opencharts_status. After sending a message here, ask the agent to read the pending OpenCharts request and reply. Keep the agent running while you chat.'));
    const docs = el('a', null, 'Download and setup instructions');
    docs.href = 'https://github.com/Hamza928505/OpenCharts#connect-codex-claude-code-or-another-mcp-agent';
    docs.target = '_blank';
    docs.rel = 'noopener noreferrer';
    guide.appendChild(docs);
    main.append(fields, guide, el('p', 'ask-text', 'Only messages you send and their data are shared with the connected agent. Local analysis works without a connection. The connection is kept for this browser tab; OpenCharts does not sign into an AI account.'));
    const foot = el('div', 'ask-foot');
    const clear = el('button', 'btn', 'Disconnect');
    const cancel = el('button', 'btn', 'Cancel');
    const save = el('button', 'btn btn-primary', 'Connect');
    for (const button of [clear, cancel, save]) button.type = 'button';
    clear.style.marginRight = 'auto';
    foot.append(clear, cancel, save);
    main.appendChild(foot);
    box.appendChild(main);
    scrim.appendChild(box);
    document.body.appendChild(scrim);
    let closed = false;
    let edited = false;
    let loading = null;
    const done = (value) => {
      if (closed) return;
      closed = true;
      loading?.abort();
      document.removeEventListener('keydown', onKey, true);
      scrim.remove();
      returnFocus?.focus();
      resolve(value);
    };
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); done(false); }
      if (event.key === 'Tab') {
        const focusable = [...box.querySelectorAll('input, button, summary, a[href]')]
          .filter((node) => !node.disabled && node.getClientRects().length);
        const first = focusable[0], last = focusable.at(-1);
        if (!box.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    input.addEventListener('input', () => { edited = true; error.textContent = ''; input.removeAttribute('aria-invalid'); });
    getAiSettings().then((settings) => {
      if (!closed && !edited && settings) input.value = `${settings.endpoint}/#mcp=${settings.token}`;
    });
    cancel.addEventListener('click', () => done(false));
    clear.addEventListener('click', () => { clearAiSettings(); toast('Agent disconnected', 'ok'); done(true); });
    save.addEventListener('click', async () => {
      if (loading) return;
      let settings;
      try { settings = parseAgentLink(input.value); } catch (err) {
        error.textContent = err.message;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      loading = new AbortController();
      const active = loading;
      const timeout = setTimeout(() => active.abort(), 5000);
      save.disabled = input.disabled = clear.disabled = true;
      save.textContent = 'Connecting…';
      cancel.focus();
      error.textContent = '';
      try {
        await checkConnection(settings, active.signal);
        if (closed) return;
        const result = await setAiSettings(settings);
        toast(result.persisted ? 'Agent connected for this tab' : 'Agent connected for this page only', 'ok');
        done(true);
      } catch (err) {
        if (closed) return;
        error.textContent = err instanceof TypeError || active.signal.aborted
          ? 'Could not reach OpenCharts MCP. Keep your agent running, allow local network access if asked, or open the local link from opencharts_status.'
          : err.message;
        input.setAttribute('aria-invalid', 'true');
      } finally {
        clearTimeout(timeout);
        loading = null;
        save.disabled = input.disabled = clear.disabled = false;
        save.textContent = 'Connect';
        if (!closed) input.focus();
      }
    });
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); save.click(); } });
    scrim.addEventListener('mousedown', (event) => { if (event.target === scrim) done(false); });
    document.addEventListener('keydown', onKey, true);
    input.focus();
  });
}
