/**
 * EventBus.js
 * Minimal publish/subscribe event bus.
 * Used by BaseChart to emit lifecycle events without tight coupling to UI code.
 */

export class EventBus {
  constructor() {
    this._handlers = new Map();
  }

  /**
   * Subscribe to an event.
   * @param {string}   event    Event name
   * @param {Function} handler  Callback receives the event payload
   * @returns {Function} Unsubscribe function
   */
  on(event, handler) {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, new Set());
    }
    this._handlers.get(event).add(handler);

    // Return an unsubscribe function for convenience
    return () => this.off(event, handler);
  }

  /** Subscribe for one emission only, then auto-unsubscribe */
  once(event, handler) {
    const wrapper = (payload) => {
      handler(payload);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  /** Unsubscribe a specific handler */
  off(event, handler) {
    this._handlers.get(event)?.delete(handler);
  }

  /** Emit an event with an optional payload */
  emit(event, payload = {}) {
    this._handlers.get(event)?.forEach((fn) => {
      try { fn(payload); }
      catch (err) { console.error(`[EventBus] Handler error on "${event}":`, err); }
    });
  }

  /** Remove all handlers (called on destroy) */
  clear() {
    this._handlers.clear();
  }
}