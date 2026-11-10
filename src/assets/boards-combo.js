/* A searchable dropdown, used for every list field on the page.
 *
 * A button shows the choice; opening it shows a popup with a search box, grouped options, counts and (when several
 * can be picked) a footer. Arrow keys move, Enter picks, Escape closes. The search box is a combobox over the listbox
 * (aria-activedescendant), so focus stays in the box while the options are announced. On phones the popup is a sheet
 * at the top of the screen, so the on-screen keyboard never covers it.
 *
 *   new Combo(hostElement, { id, label, icon, multiple, items, value, placeholder, hideZero, compact, onChange, footer })
 *   items: [{ value, label, group?, icon?, count?, keywords? }]   single selects bring their own "any" item with value ""
 */
const L = window.BoardLogic;
let uid = 0;

const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};
const icon = (classes) => { const i = make("i", classes); i.setAttribute("aria-hidden", "true"); return i; };

export class Combo {
  constructor(host, options) {
    this.o = { multiple: false, placeholder: "Any", items: [], hideZero: false, compact: false, maxRender: 160, noun: "internships", onChange() {}, footer: null, ...options };
    this.id = this.o.id || `combo${++uid}`;
    this.items = [];
    this.byValue = new Map();
    this.counts = new Map();
    this.hasCounts = false;
    this.sel = this.o.multiple ? [] : "";
    this.query = "";
    this.isOpen = false;
    this.options = []; // rendered options: { li, item }
    this.active = -1;
    this.build(host);
    this.setItems(this.o.items);
    if (this.o.value != null) this.setValue(this.o.value, { silent: true });
  }

  // ------------------------------------------------------------ DOM

  build(host) {
    const { id, o } = this;
    host.classList.add("field");
    if (o.compact) host.classList.add("compact");
    host.replaceChildren();

    this.label = make("span", "field-label" + (o.compact ? " sr" : ""));
    this.label.id = `${id}-label`;
    if (o.icon) this.label.append(icon(`fa-solid ${o.icon}`));
    this.label.append(document.createTextNode(o.label));

    this.root = make("div", "combo");
    this.box = make("div", "control combo-box");
    this.trigger = make("button", "combo-trigger");
    Object.assign(this.trigger, { type: "button", id });
    this.trigger.setAttribute("aria-haspopup", "listbox");
    this.trigger.setAttribute("aria-expanded", "false");
    this.trigger.setAttribute("aria-controls", `${id}-panel`);
    this.trigger.setAttribute("aria-labelledby", `${id}-label ${id}-value`);
    this.value$ = make("span", "combo-value");
    this.value$.id = `${id}-value`;
    this.trigger.append(this.value$, icon("fa-solid fa-chevron-down combo-caret"));
    this.clearBtn = make("button", "combo-clear");
    Object.assign(this.clearBtn, { type: "button" });
    this.clearBtn.setAttribute("aria-label", `Clear ${o.label}`);
    this.clearBtn.append(icon("fa-solid fa-xmark"));
    this.clearBtn.hidden = true;
    this.box.append(this.trigger, this.clearBtn);

    this.backdrop = make("div", "combo-backdrop");
    this.panel = make("div", "combo-panel");
    this.panel.id = `${id}-panel`;
    this.panel.hidden = true;
    const search = make("div", "combo-search");
    this.input = make("input", "combo-input");
    Object.assign(this.input, { type: "text", placeholder: `Search ${o.label.toLowerCase()}…`, autocomplete: "off", spellcheck: false });
    this.input.setAttribute("role", "combobox");
    this.input.setAttribute("aria-autocomplete", "list");
    this.input.setAttribute("aria-expanded", "true");
    this.input.setAttribute("aria-controls", `${id}-list`);
    this.input.setAttribute("aria-label", `Search ${o.label}`);
    this.input.setAttribute("autocapitalize", "off");
    search.append(icon("fa-solid fa-magnifying-glass"), this.input);
    this.list = make("ul", "combo-list");
    this.list.id = `${id}-list`;
    this.list.setAttribute("role", "listbox");
    this.list.setAttribute("aria-labelledby", `${id}-label`);
    if (o.multiple) this.list.setAttribute("aria-multiselectable", "true");
    this.empty = make("div", "combo-empty", "Nothing matches that search.");
    this.empty.hidden = true;
    this.status = make("div", "sr");
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    this.panel.append(search, this.list, this.empty, this.status);
    if (o.multiple || o.footer) {
      this.foot = make("div", "combo-foot");
      this.footExtra = make("span", "combo-foot-extra");
      const clear = make("button", "btn btn-sm btn-ghost", "Clear");
      Object.assign(clear, { type: "button" });
      const done = make("button", "btn btn-sm btn-primary", "Done");
      Object.assign(done, { type: "button" });
      clear.addEventListener("click", () => { this.setValue(o.multiple ? [] : ""); this.input.focus(); });
      done.addEventListener("click", () => this.close(true));
      this.foot.append(this.footExtra, clear, done);
      this.panel.append(this.foot);
      if (o.footer) o.footer(this.footExtra, this);
    }
    this.root.append(this.box, this.backdrop, this.panel);
    host.append(this.label, this.root);
    this.host = host;

    this.trigger.addEventListener("click", () => (this.isOpen ? this.close(true) : this.open()));
    this.trigger.addEventListener("keydown", (e) => {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); this.open(); }
    });
    this.clearBtn.addEventListener("click", () => { this.setValue(o.multiple ? [] : ""); this.trigger.focus(); });
    this.input.addEventListener("input", () => { this.query = this.input.value; this.renderList(); });
    this.input.addEventListener("keydown", (e) => this.onKey(e));
    this.list.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the search box
    this.list.addEventListener("click", (e) => {
      const li = e.target.closest("[role=option]");
      if (li) this.pick(this.options.find((x) => x.li === li).item);
    });
    this.list.addEventListener("mousemove", (e) => {
      const li = e.target.closest("[role=option]");
      const i = li ? this.options.findIndex((x) => x.li === li) : -1;
      if (i >= 0 && i !== this.active) this.setActive(i, false);
    });
    this.backdrop.addEventListener("click", () => this.close(true));
    this.root.addEventListener("focusout", (e) => {
      if (this.isOpen && !this.root.contains(e.relatedTarget)) this.close(false);
    });
    this.onDocDown = (e) => { if (this.isOpen && !this.root.contains(e.target)) this.close(false); };
    document.addEventListener("pointerdown", this.onDocDown);
  }

  destroy() { document.removeEventListener("pointerdown", this.onDocDown); this.host.replaceChildren(); }

  // ------------------------------------------------------------ data

  setItems(items) {
    this.items = items.map((it) => ({ ...it, _n: L.norm(`${it.label} ${it.keywords || ""} ${it.group || ""}`) }));
    this.byValue = new Map(this.items.map((it) => [it.value, it]));
    if (this.o.multiple) this.sel = this.sel.filter((v) => this.byValue.has(v));
    else if (!this.byValue.has(this.sel)) this.sel = this.byValue.has("") ? "" : this.sel;
    this.syncTrigger();
    if (this.isOpen) this.renderList();
  }

  /** value -> number of results choosing it would leave; options with none are dimmed (or hidden when hideZero). */
  setCounts(map) {
    this.counts = map;
    this.hasCounts = true;
    if (this.isOpen) this.renderList();
  }

  get value() { return this.o.multiple ? this.sel.slice() : this.sel; }

  setValue(value, { silent = false } = {}) {
    this.sel = this.o.multiple ? (Array.isArray(value) ? value.filter((v) => this.byValue.has(v)) : []) : (this.byValue.has(value) ? value : (this.byValue.has("") ? "" : value));
    this.syncTrigger();
    if (this.isOpen) this.renderList();
    if (!silent) this.o.onChange(this.value);
  }

  focus() { this.trigger.focus(); }

  // ------------------------------------------------------------ the button

  syncTrigger() {
    const { o } = this;
    const labels = (o.multiple ? this.sel : [this.sel]).map((v) => this.byValue.get(v)?.label).filter((t) => t);
    this.value$.replaceChildren();
    const chosen = o.multiple ? this.sel.length > 0 : this.sel !== "" && this.byValue.get(this.sel)?.value !== "";
    if (!chosen) {
      const text = o.multiple ? o.placeholder : (this.byValue.get("")?.label || o.placeholder);
      this.value$.append(make("span", "vtext is-placeholder", text));
    } else {
      this.value$.append(make("span", "vtext", labels.slice(0, 2).join(", ")));
      if (labels.length > 2) this.value$.append(make("span", "combo-more", `+${labels.length - 2}`));
    }
    const clearable = chosen && (o.multiple || this.byValue.has("")); // a select with no "any" choice (sort) always has a value
    this.clearBtn.hidden = !clearable;
    this.box.classList.toggle("has-value", clearable);
  }

  // ------------------------------------------------------------ the popup

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.root.classList.add("is-open");
    this.trigger.setAttribute("aria-expanded", "true");
    this.panel.hidden = false;
    const r = this.box.getBoundingClientRect();
    const room = window.innerHeight - r.bottom;
    this.panel.classList.toggle("drop-up", room < 360 && r.top > room);
    this.query = "";
    this.input.value = "";
    this.renderList();
    this.input.focus({ preventScroll: true });
    if (window.matchMedia("(max-width: 700px)").matches) document.documentElement.classList.add("has-sheet");
    else this.panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  close(returnFocus) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove("is-open");
    this.trigger.setAttribute("aria-expanded", "false");
    this.panel.hidden = true;
    document.documentElement.classList.remove("has-sheet");
    this.input.removeAttribute("aria-activedescendant");
    if (returnFocus) this.trigger.focus();
  }

  countOf(item) { return this.hasCounts ? (this.counts.get(item.value) || 0) : item.count; }

  isSelected(item) { return this.o.multiple ? this.sel.includes(item.value) : this.sel === item.value; }

  renderList() {
    const tokens = L.norm(this.query).trim().split(/\s+/).filter(Boolean);
    const querying = tokens.length > 0;
    const keepValue = this.options[this.active]?.item.value;
    this.list.replaceChildren();
    this.options = [];
    let shown = 0, total = 0, lastGroup = null;
    for (const item of this.items) {
      if (item.value === "" && querying) continue; // the "any" choice is for browsing, not for searching
      if (querying && !tokens.every((t) => item._n.includes(t))) continue;
      const count = this.countOf(item);
      if (this.o.hideZero && count === 0 && !querying && !this.isSelected(item)) continue;
      total++;
      if (shown >= this.o.maxRender) continue;
      if (item.group && item.group !== lastGroup) {
        const g = make("li", "combo-group", item.group);
        g.setAttribute("role", "presentation");
        this.list.append(g);
        lastGroup = item.group;
      }
      const selected = this.isSelected(item);
      const li = make("li", "combo-opt" + (selected ? " is-selected" : "") + (count === 0 ? " is-zero" : ""));
      li.id = `${this.id}-o${this.options.length}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(selected));
      if (this.o.multiple) { const tick = make("span", "tick"); tick.append(icon("fa-solid fa-check")); li.append(tick); }
      else if (item.icon) li.append(icon(`fa-solid ${item.icon} opt-icon`));
      li.append(this.labelNode(item.label, tokens[0]));
      if (count != null) li.append(make("span", "opt-count", String(count)));
      this.list.append(li);
      this.options.push({ li, item });
      shown++;
    }
    if (total > shown) { const note = make("li", "combo-note", `Showing ${shown} of ${total}. Type to narrow the list.`); note.setAttribute("role", "presentation"); this.list.append(note); }
    this.empty.hidden = this.options.length > 0;
    const keep = this.options.findIndex((x) => x.item.value === keepValue);
    const sel = this.options.findIndex((x) => this.isSelected(x.item));
    this.setActive(keep >= 0 ? keep : sel >= 0 ? sel : (this.options.length ? 0 : -1), keep < 0);
    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => { this.status.textContent = this.options.length ? `${total} options available` : "No options match"; }, 250);
  }

  /** The label with the first search word marked, when the match positions line up with the text. */
  labelNode(label, token) {
    const span = make("span", "opt-label");
    const flat = L.norm(label);
    const at = token && flat.length === label.length ? flat.indexOf(token) : -1;
    if (at < 0) { span.textContent = label; return span; }
    span.append(document.createTextNode(label.slice(0, at)), make("mark", null, label.slice(at, at + token.length)), document.createTextNode(label.slice(at + token.length)));
    return span;
  }

  setActive(i, scroll = true) {
    this.options[this.active]?.li.classList.remove("is-active");
    this.active = i;
    const cur = this.options[i];
    if (!cur) { this.input.removeAttribute("aria-activedescendant"); return; }
    cur.li.classList.add("is-active");
    this.input.setAttribute("aria-activedescendant", cur.li.id);
    if (scroll) cur.li.scrollIntoView({ block: "nearest" });
  }

  pick(item) {
    if (this.o.multiple) {
      const i = this.sel.indexOf(item.value);
      if (i >= 0) this.sel.splice(i, 1); else this.sel.push(item.value);
      this.query = ""; this.input.value = "";
      this.syncTrigger();
      this.renderList();
    } else {
      this.sel = item.value;
      this.syncTrigger();
      this.close(true);
    }
    this.o.onChange(this.value);
  }

  onKey(e) {
    const n = this.options.length;
    const move = (to) => { if (n) this.setActive(Math.max(0, Math.min(n - 1, to))); };
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); move(this.active < 0 ? 0 : (this.active + 1) % n === 0 && this.active === n - 1 ? n - 1 : this.active + 1); break;
      case "ArrowUp": e.preventDefault(); move(this.active <= 0 ? 0 : this.active - 1); break;
      case "PageDown": e.preventDefault(); move(this.active + 8); break;
      case "PageUp": e.preventDefault(); move(this.active - 8); break;
      case "Home": if (e.ctrlKey) { e.preventDefault(); move(0); } break;
      case "End": if (e.ctrlKey) { e.preventDefault(); move(n - 1); } break;
      case "Enter": e.preventDefault(); if (this.options[this.active]) this.pick(this.options[this.active].item); break;
      case "Escape": e.preventDefault(); e.stopPropagation(); if (this.query) { this.query = ""; this.input.value = ""; this.renderList(); } else this.close(true); break;
      case "Tab": this.close(false); break;
      case "Backspace": if (!this.input.value && this.o.multiple && this.sel.length) { this.sel.pop(); this.syncTrigger(); this.renderList(); this.o.onChange(this.value); } break;
      default: break;
    }
  }
}
