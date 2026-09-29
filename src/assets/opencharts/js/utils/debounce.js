/**
 * debounce.js
 * Returns a function that delays invoking `fn` until `wait` ms have
 * elapsed since the last call. Used to throttle resize events.
 *
 * @param {Function} fn    Function to debounce
 * @param {number}   wait  Milliseconds to wait
 * @returns {Function}
 */
export function debounce(fn, wait = 100) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, wait);
  };
}

/**
 * Returns a function that invokes `fn` at most once per animation frame.
 * Useful for scroll/mousemove handlers where debounce latency is too long.
 *
 * @param {Function} fn
 * @returns {Function}
 */
export function rafThrottle(fn) {
  let rafId = null;
  return function (...args) {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      fn.apply(this, args);
      rafId = null;
    });
  };
}