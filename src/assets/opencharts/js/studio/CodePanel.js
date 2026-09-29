/**
 * CodePanel.js — the eight views under the chart.
 *
 * Five are generated source — HTML, CSS, JS, Standalone and the AI Prompt —
 * rendered with line numbers and syntax colouring, with copy and download.
 * Three are not: Spec is the chart as JSON and takes a paste back, Colours is
 * the palette as a set, and AI Analyst asks for a chart in a sentence. Those
 * mount a component instead of highlighted text (`view` on the tab), and Copy
 * and Download stand down where there is nothing to copy.
 *
 * The prompt is prose rather than code, so it is the one tab that wraps and
 * drops the line numbers — numbering a paragraph helps nobody, and `pre` would
 * push every sentence off the right-hand edge.
 */

import { highlight } from './highlight.js';
import { toast } from './toast.js';
import { PROMPT_MODES, readPromptMode, writePromptMode } from './prompt.js';
import { paletteEditor } from './palette-ui.js';
import { analystPanel } from './analyst-ui.js';
import { attachColourPicker } from './colorpicker.js';

const TABS = [
  { id: 'html',       label: 'HTML',       lang: 'html' },
  { id: 'css',        label: 'CSS',        lang: 'css'  },
  { id: 'js',         label: 'JS',         lang: 'js'   },
  { id: 'standalone', label: 'Standalone', lang: 'html' },
  // `lang: 'text'` is not a highlighter — it is the fallthrough, which escapes
  // and returns the source untouched.
  { id: 'prompt',     label: 'AI Prompt',  lang: 'text', prose: true },
  // The chart as data rather than as code: what the share link already
  // serialises, written out where a person can read, diff and paste it.
  // Highlighted as JS because JSON is a subset of it and the highlighter
  // colours strings, numbers and punctuation the same way.
  { id: 'spec',       label: 'Spec',       lang: 'js',   editable: true },
  // Not code at all: the palette as a set. The sidebar edits one colour beside
  // its series and the data table edits one against its column, and neither
  // answers "do these twelve work together", which is the question a palette
  // raises. `view: true` means it renders a component rather than source.
  { id: 'colours',    label: 'Colours',    lang: 'text', view: 'colours' },
  // The eighth view, and the third that is not code: a sentence in, a spec
  // back, previewed before anything is applied. It lives here rather than in
  // the sidebar because what it produces is a *spec*, which is what the two
  // tabs beside it print — and because the answer lands through `onApplySpec`,
  // the same door a pasted spec uses.
  { id: 'analyst',    label: 'AI Analyst', lang: 'text', view: 'analyst' },
];

/** What the copy toast calls each view. */
const COPIED = {
  standalone: 'Standalone page',
  prompt: 'Prompt',
  spec: 'Spec',
};

const PROMPT_LEAD = 'Copy this, then attach your own spreadsheet or CSV to any AI assistant. ';

export class CodePanel {
  /**
   * @param {HTMLElement} root  the .codepanel element
   */
  constructor(root) {
    this.root = root;
    this.active = 'html';
    this.code = { html: '', css: '', js: '', standalone: '', prompt: '', promptShort: '', spec: '' };
    /** Set by StudioApp: (parsed) => ({ ok, message }). */
    this.onApplySpec = null;
    this.editing = false;
    this.filename = 'chart';
    this._build();
  }

  _build() {
    this.root.innerHTML = '';

    const bar = document.createElement('div');
    bar.className = 'code-bar';

    this.tabButtons = TABS.map((tab) => {
      const b = document.createElement('button');
      b.className = 'tab' + (tab.id === this.active ? ' active' : '');
      b.type = 'button';
      b.textContent = tab.label;
      b.dataset.tab = tab.id;
      b.addEventListener('click', () => this.show(tab.id));
      bar.appendChild(b);
      return b;
    });

    const actions = document.createElement('div');
    actions.className = 'code-actions';

    // Which prompt the reader wants is a property of the reader, not of the
    // chart, so it is remembered — and the gallery tiles read the same answer.
    this.promptMode = readPromptMode();
    this.modeSwitch = document.createElement('div');
    this.modeSwitch.className = 'prompt-modes';
    this.modeSwitch.setAttribute('role', 'group');
    this.modeSwitch.setAttribute('aria-label', 'How much the prompt should carry');
    this.modeButtons = PROMPT_MODES.map((m) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'prompt-mode' + (m.id === this.promptMode ? ' active' : '');
      b.textContent = m.label;
      b.dataset.mode = m.id;
      b.title = m.note;
      b.setAttribute('aria-pressed', String(m.id === this.promptMode));
      b.addEventListener('click', () => this.setPromptMode(m.id));
      this.modeSwitch.appendChild(b);
      return b;
    });
    actions.appendChild(this.modeSwitch);

    /* Undo and redo.
     *
     * They live here rather than beside the chart because this bar is where
     * the other verbs are, and because what they undo is the *spec* — the same
     * thing the Spec tab two buttons along prints. The data grid has had its
     * own undo since it shipped; it covers the table and nothing else, so
     * every colour, slider and toggle in the studio was a one-way door.
     */
    this.undoBtn = document.createElement('button');
    this.undoBtn.className = 'btn btn-sm';
    this.undoBtn.type = 'button';
    this.undoBtn.title = 'Undo the last change (Ctrl+Z)';
    this.undoBtn.innerHTML = '<span aria-hidden="true">↶</span> Undo';
    this.undoBtn.addEventListener('click', () => this.onUndo && this.onUndo());

    this.redoBtn = document.createElement('button');
    this.redoBtn.className = 'btn btn-sm';
    this.redoBtn.type = 'button';
    this.redoBtn.title = 'Redo (Ctrl+Shift+Z)';
    this.redoBtn.innerHTML = '<span aria-hidden="true">↷</span> Redo';
    this.redoBtn.addEventListener('click', () => this.onRedo && this.onRedo());

    this.copyBtn = document.createElement('button');
    this.copyBtn.className = 'btn btn-sm';
    this.copyBtn.type = 'button';
    this.copyBtn.innerHTML = '<span aria-hidden="true">⧉</span> Copy';
    this.copyBtn.addEventListener('click', () => this.copy());

    this.dlBtn = document.createElement('button');
    this.dlBtn.className = 'btn btn-sm';
    this.dlBtn.type = 'button';
    this.dlBtn.innerHTML = '<span aria-hidden="true">↓</span> Download .html';
    this.dlBtn.addEventListener('click', () => this.download());

    this.editBtn = document.createElement('button');
    this.editBtn.className = 'btn btn-sm';
    this.editBtn.type = 'button';
    this.editBtn.addEventListener('click', () => this.toggleEdit());

    actions.append(this.undoBtn, this.redoBtn, this.copyBtn, this.editBtn, this.dlBtn);
    this.setHistory({ canUndo: false, canRedo: false });
    bar.appendChild(actions);

    const scroll = document.createElement('div');
    scroll.className = 'code-scroll';
    this.gutter = document.createElement('div');
    this.gutter.className = 'gutter';
    this.body = document.createElement('pre');
    this.body.className = 'code-body';
    // One textarea, reused: the Spec tab swaps to it to take a pasted spec
    // and swaps back after. A second highlighted view would have to be kept
    // in step with this one for no gain.
    this.editor = document.createElement('textarea');
    this.editor.className = 'code-edit';
    this.editor.spellcheck = false;
    this.editor.hidden = true;
    this.editor.setAttribute('aria-label', 'Chart spec, as JSON');
    scroll.append(this.gutter, this.body, this.editor);

    this.note = document.createElement('div');
    this.note.className = 'code-note';

    this.root.append(bar, scroll, this.note);
    this.scroll = scroll;
  }

  /**
   * Load a fresh set of generated views.
   * @param {{html:string,css:string,js:string,standalone:string,prompt:string,promptShort:string,note:string}} code
   * @param {string} filename  base name for the download
   */
  /**
   * Light the two buttons according to what there is to go back to.
   *
   * A control that cannot do anything must not look as though it can — the
   * same rule the grid's own pair follows.
   */
  setHistory({ canUndo, canRedo }) {
    if (this.undoBtn) this.undoBtn.disabled = !canUndo;
    if (this.redoBtn) this.redoBtn.disabled = !canRedo;
  }

  /**
   * The chart the panel is showing, for the views that edit rather than print.
   *
   * The code tabs need only strings; the Colours tab needs the definition and
   * the live spec, because it writes to them.
   */
  setChart(def, spec, onChange) {
    this.def = def;
    this.spec = spec;
    this.onSpecEdit = onChange;
  }

  setCode(code, filename) {
    this.code = code;
    this.filename = filename || 'chart';
    this._paint();
  }

  /** What the given tab is currently showing. The prompt has two forms. */
  _srcFor(tabId) {
    if (tabId !== 'prompt') return this.code[tabId] || '';
    return (this.promptMode === 'data' ? this.code.promptShort : this.code.prompt) || '';
  }

  /**
   * The prompt in whichever form is selected.
   *
   * The stage bar copies it without opening the tab, so the Full/Data only
   * choice has to be resolved in one place rather than guessed at twice.
   */
  promptText() {
    return this._srcFor('prompt');
  }

  setPromptMode(mode) {
    this.promptMode = mode;
    writePromptMode(mode);
    this.modeButtons.forEach((b) => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    this._paint();
  }

  show(tabId) {
    // Switching tabs abandons an unapplied edit rather than carrying it to a
    // view it does not belong to.
    if (this.editing && tabId !== 'spec') this.editing = false;
    this.active = tabId;
    this.tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === tabId));
    this._paint();
    this.scroll.scrollTop = 0;
  }

  _paint() {
    const tab = TABS.find((t) => t.id === this.active) || TABS[0];
    const src = this._srcFor(this.active);

    // While editing, the textarea owns the view and must not be repainted from
    // under the typist — a rebuild fires on every control change, and one of
    // those landing mid-paste would discard what was pasted.
    this.editor.hidden = !this.editing;
    this.body.hidden = !!this.editing;
    if (this.editing) {
      this.gutter.hidden = true;
      this.modeSwitch.hidden = true;
      this.dlBtn.style.display = 'none';
      this.editBtn.hidden = false;
      this.editBtn.textContent = 'Apply spec';
      this.editBtn.classList.add('btn-primary');
      this.note.textContent = 'Paste a spec over this and apply it. '
        + 'A spec for another chart opens that chart.';
      return;
    }
    this.editBtn.classList.remove('btn-primary');
    this.editBtn.hidden = !tab.editable;
    this.editBtn.textContent = 'Paste a spec';

    if (tab.view) {
      // A component, not source: it owns its own DOM and writes to the spec.
      this.body.innerHTML = '';
      this.body.classList.remove('prose');
      if (this.def && this.spec) {
        this.body.appendChild(tab.view === 'analyst'
          // The analyst never touches the spec itself; it hands back what a
          // paste would, through the function a paste goes through.
          ? analystPanel(this.def, this.spec, {
            onApply: (parsed) => (this.onApplySpec
              ? this.onApplySpec(parsed)
              : { ok: false, message: 'Nothing to apply to.' }),
          })
          : paletteEditor(this.def, this.spec, () => {
            if (this.onSpecEdit) this.onSpecEdit();
          }));
      }
      this.gutter.hidden = true;
      this.gutter.innerHTML = '';
      this.modeSwitch.hidden = true;
      this.copyBtn.style.display = 'none';
      this.dlBtn.style.display = 'none';
      this.editBtn.hidden = true;
      this.note.textContent = tab.view === 'analyst'
        ? 'Your table and your sentence go through your local MCP bridge to your signed-in agent, '
          + 'using its account and plan. Nothing is applied until you press Apply.'
        : 'Every colour this chart draws with. '
          + 'Changing one here is the same edit as changing it in the sidebar.';
      return;
    }
    this.copyBtn.style.display = '';

    this.body.innerHTML = highlight(src, tab.lang);
    this.body.classList.toggle('prose', !!tab.prose);
    if (tab.id === 'spec') this._decorateColours(src);

    // Line numbers down the side of a paragraph are noise, so the prose tab
    // has no gutter at all rather than an empty one taking up its rule.
    this.gutter.hidden = !!tab.prose;
    this.gutter.innerHTML = '';
    if (!tab.prose) {
      const lines = src.split('\n').length;
      const frag = document.createDocumentFragment();
      for (let i = 1; i <= lines; i++) {
        const s = document.createElement('span');
        s.textContent = String(i);
        frag.appendChild(s);
      }
      this.gutter.appendChild(frag);
    }

    this.modeSwitch.hidden = !tab.prose;

    // The dependency note under the code answers "what else does this need?",
    // which is not the question the prompt tab leaves you with.
    const mode = PROMPT_MODES.find((m) => m.id === this.promptMode) || PROMPT_MODES[0];
    this.note.textContent = tab.prose ? PROMPT_LEAD + mode.note : (this.code.note || '');

    // Downloading only makes sense for the complete document.
    this.dlBtn.style.display = this.active === 'standalone' ? '' : 'none';
  }

  /** Swap between reading the spec and editing it. */
  /**
   * Put a clickable swatch beside every colour printed in the Spec tab.
   *
   * The spec is the chart as data, and a hex string in it is the one value a
   * reader cannot judge by reading. The swatch is inserted into the highlighted
   * output rather than the source, so the highlighter stays a pure function of
   * the text.
   *
   * A pick edits the *printed JSON* and re-applies the whole thing, rather than
   * resolving the hex back to a path in the spec. The highlighter emits text in
   * source order, so the nth swatch on screen is the nth match in the source —
   * which is all the mapping this needs, and it cannot disagree with what the
   * reader is looking at.
   */
  _decorateColours(src) {
    if (!this.onApplySpec) return;
    const HEX = /#[0-9a-fA-F]{6}\b/g;
    const spans = [];
    let m = HEX.exec(src);
    while (m) { spans.push({ at: m.index, len: m[0].length, hex: m[0] }); m = HEX.exec(src); }
    if (!spans.length) return;

    // Walk the highlighted output in document order and pair each printed hex
    // with its match in the source.
    const walker = document.createTreeWalker(this.body, NodeFilter.SHOW_TEXT);
    const found = [];
    let node = walker.nextNode();
    while (node) {
      const local = /#[0-9a-fA-F]{6}\b/g;
      let hit = local.exec(node.nodeValue);
      while (hit) { found.push({ node, hex: hit[0] }); hit = local.exec(node.nodeValue); }
      node = walker.nextNode();
    }

    found.forEach((entry, i) => {
      const slot = spans[i];
      // If the two ever disagree, decorate nothing rather than wire a swatch
      // to the wrong colour.
      if (!slot || slot.hex !== entry.hex) return;
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'spec-swatch';
      dot.style.background = entry.hex;
      dot.title = `Change ${entry.hex}`;
      dot.setAttribute('aria-label', `Change the colour ${entry.hex}`);
      attachColourPicker(dot, () => slot.hex, (next) => {
        const edited = src.slice(0, slot.at) + next + src.slice(slot.at + slot.len);
        let parsed = null;
        try { parsed = JSON.parse(edited); } catch { parsed = null; }
        if (!parsed) { toast('That colour could not be applied', 'bad'); return; }
        const res = this.onApplySpec(parsed);
        if (res && res.ok === false) toast(res.message, 'bad');
      });
      // Before the string, so the swatch reads as a marker on the value rather
      // than as part of it.
      entry.node.parentNode.insertBefore(dot, entry.node);
    });
  }

  toggleEdit() {
    if (!this.editing) {
      this.editing = true;
      this.editor.value = this._srcFor('spec');
      this._paint();
      this.editor.focus();
      this.editor.setSelectionRange(0, 0);
      return;
    }
    this.applyEdit();
  }

  applyEdit() {
    let parsed;
    try {
      parsed = JSON.parse(this.editor.value);
    } catch (err) {
      // Say where it broke. "Unexpected token } in JSON at position 412" is
      // the one part of a parse error that is actually useful.
      toast(`That is not valid JSON — ${err.message}`, 'bad');
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      toast('A spec has to be a JSON object.', 'bad');
      return;
    }
    const res = this.onApplySpec ? this.onApplySpec(parsed) : { ok: false, message: 'Nothing to apply to.' };
    if (!res || !res.ok) {
      toast((res && res.message) || 'That spec could not be applied.', 'bad');
      return;
    }
    this.editing = false;
    this._paint();
    toast(res.message || 'Spec applied', 'ok');
  }

  async copy() {
    const src = this._srcFor(this.active);
    try {
      await navigator.clipboard.writeText(src);
      this.copyBtn.innerHTML = '<span aria-hidden="true">✓</span> Copied';
      setTimeout(() => { this.copyBtn.innerHTML = '<span aria-hidden="true">⧉</span> Copy'; }, 1800);
      toast(`${COPIED[this.active] || this.active.toUpperCase()} copied`, 'ok');
    } catch {
      // Clipboard API needs a secure context; select the text so Ctrl+C works.
      const range = document.createRange();
      range.selectNodeContents(this.body);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      toast('Clipboard blocked — text selected, press Ctrl+C', 'bad');
    }
  }

  download() {
    const blob = new Blob([this.code.standalone || ''], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.filename}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(`${this.filename}.html downloaded`, 'ok');
  }
}
