/**
 * toast.js — small transient notices, bottom-right.
 *
 * Replaces the SweetAlert2 dependency the old designer pages carried for what
 * amounted to "copied!" confirmations. Nothing here blocks the page.
 */

let stack = null;

function ensureStack() {
  if (stack && document.body.contains(stack)) return stack;
  stack = document.createElement('div');
  stack.className = 'toast-stack';
  stack.setAttribute('role', 'status');
  stack.setAttribute('aria-live', 'polite');
  document.body.appendChild(stack);
  return stack;
}

/**
 * @param {string} message
 * @param {'ok'|'bad'|'plain'} [kind]
 * @param {number} [ms] visible duration
 */
export function toast(message, kind = 'plain', ms = 2400) {
  const host = ensureStack();
  const node = document.createElement('div');
  node.className = 'toast' + (kind === 'ok' ? ' toast-ok' : kind === 'bad' ? ' toast-bad' : '');
  node.textContent = message;
  host.appendChild(node);

  const close = () => {
    node.classList.add('leaving');
    node.addEventListener('animationend', () => node.remove(), { once: true });
  };
  const timer = setTimeout(close, ms);
  node.addEventListener('click', () => { clearTimeout(timer); close(); });
}
