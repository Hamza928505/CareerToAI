/**
 * timeaxis.js — dates read as dates.
 *
 * Every chart read its x labels as a list of words, so `2024-01`, `Jan 24`
 * and `1/24` were three categories, a missing month was not a gap, and ticks
 * could not thin themselves by year. It was the single largest reason a real
 * spreadsheet looked wrong here and right in Datawrapper.
 *
 * Two pieces, and both are serialised into exported code, so each is written
 * to reference nothing but its own arguments and the other:
 *
 * - `parseDateLabel(text, dayFirst)` reads the spellings people actually
 *   type into a spreadsheet's first column and returns a UTC timestamp, or
 *   NaN. It is deliberately strict about one thing: a bare month name is not
 *   a date. `Jan` has no year, so it names a slot rather than a moment, and
 *   the twelve-month examples every line chart opens with stay categorical —
 *   which is also what stops thirteen months from `Jan` to `Jan` landing on
 *   one tick.
 *
 * - `installDateAdapter()` teaches Chart.js's time scale to use the browser's
 *   own `Date` and `Intl`. Chart.js ships no adapter of its own and expects
 *   one from date-fns, Luxon or Moment — 60–300KB so a chart can know that
 *   a month follows a month. Native `Date` knows that, and an export that
 *   asks for no further library keeps the promise every other export makes.
 *
 * Everything is UTC end to end. A label that says `2024-01-01` must draw and
 * read as the first of January wherever the page is opened, and local time
 * would shift it to New Year's Eve for half the world.
 *
 * `profile.js` reads dates through `looksDateLike`, which is this parser plus
 * the bare month and quarter names it refuses — a column of `Jan … Dec` is
 * still *ordered*, which is what the recommender cares about, even though it
 * cannot be placed on a time axis.
 */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * A date label as a UTC timestamp, or NaN.
 *
 * Accepted, in the order they are tried:
 *   2024-01-15  2024/01/15  2024-01-15T10:30(:00)(Z)  2024-01-15 10:30
 *   2024-01  2024/01
 *   2024                       (a four-digit year between 1800 and 2200)
 *   2024-Q1  2024 Q1  Q1 2024  Q1-2024  Q1'24
 *   Jan 2024  January 2024  Jan-24  Jan '24  Jan-2024  2024 Jan
 *   15 Jan 2024  Jan 15, 2024  January 15 2024  15-Jan-24
 *   15/01/2024  01/15/2024  15.01.2024  15-01-2024  15/01/24
 *
 * The last row is the ambiguous one. `dayFirst` says which way to read
 * `03/04/2024`; `dateOrder()` works it out for a whole column, from any
 * value whose first or second part is past twelve.
 *
 * Self-contained on purpose — it is serialised into every export that draws
 * a time axis, and it may reference nothing outside its own body.
 */
export function parseDateLabel(text, dayFirst) {
  if (text == null) return NaN;
  if (typeof text === 'number') {
    return Number.isInteger(text) && text >= 1800 && text <= 2200 ? Date.UTC(text, 0, 1) : NaN;
  }
  const s = String(text).trim();
  if (!s) return NaN;
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthIndex = (word) => {
    const m = MONTHS.indexOf(String(word).slice(0, 3).toLowerCase());
    // A word that starts like a month but is not one — "Market" — is not May.
    if (m < 0) return -1;
    const full = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
      'september', 'october', 'november', 'december'][m];
    const w = String(word).toLowerCase().replace(/\.$/, '');
    return w === MONTHS[m] || w === full || (w.length >= 3 && full.startsWith(w)) ? m : -1;
  };
  const year = (y) => {
    const n = Number(y);
    if (!Number.isFinite(n)) return NaN;
    if (String(y).length <= 2) return n + (n < 70 ? 2000 : 1900);
    return n;
  };
  const utc = (y, m, d, hh, mm, ss) => {
    if (!(y >= 1000 && y <= 9999) || m < 0 || m > 11 || d < 1 || d > 31) return NaN;
    const t = Date.UTC(y, m, d, hh || 0, mm || 0, ss || 0);
    // February 30th is not a date, whatever Date.UTC is willing to roll it to.
    return new Date(t).getUTCDate() === d ? t : NaN;
  };
  let m;

  // ISO and near-ISO: year first is never ambiguous.
  if ((m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/i))) {
    const t = utc(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    if (!Number.isFinite(t) || !m[7] || /^z$/i.test(m[7])) return t;
    const off = m[7].match(/([+-])(\d{2}):?(\d{2})/);
    return t - (off[1] === '-' ? -1 : 1) * (+off[2] * 60 + +off[3]) * 60000;
  }
  if ((m = s.match(/^(\d{4})[-/](\d{1,2})$/))) return utc(+m[1], +m[2] - 1, 1);
  if ((m = s.match(/^(\d{4})$/))) return +m[1] >= 1800 && +m[1] <= 2200 ? Date.UTC(+m[1], 0, 1) : NaN;

  // Quarters.
  if ((m = s.match(/^(\d{4})[\s-]*q([1-4])$/i))) return utc(+m[1], (+m[2] - 1) * 3, 1);
  if ((m = s.match(/^q([1-4])[\s'-]*(\d{2}|\d{4})$/i))) return utc(year(m[2]), (+m[1] - 1) * 3, 1);

  // Month names, with a year: "Jan 2024", "Jan-24", "Jan '24", "2024 Jan".
  if ((m = s.match(/^([a-z]{3,9})\.?[\s'-]*(\d{2}|\d{4})$/i))) {
    const mo = monthIndex(m[1]);
    return mo < 0 ? NaN : utc(year(m[2]), mo, 1);
  }
  if ((m = s.match(/^(\d{4})[\s-]+([a-z]{3,9})\.?$/i))) {
    const mo = monthIndex(m[2]);
    return mo < 0 ? NaN : utc(+m[1], mo, 1);
  }
  // Month names with a day: "15 Jan 2024", "15-Jan-24", "Jan 15, 2024", "January 15 2024".
  if ((m = s.match(/^(\d{1,2})[\s-]+([a-z]{3,9})\.?[\s,-]+(\d{2}|\d{4})$/i))) {
    const mo = monthIndex(m[2]);
    return mo < 0 ? NaN : utc(year(m[3]), mo, +m[1]);
  }
  if ((m = s.match(/^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2}|\d{4})$/i))) {
    const mo = monthIndex(m[1]);
    return mo < 0 ? NaN : utc(year(m[3]), mo, +m[2]);
  }

  // Numeric day and month, year last: the one that needs to be told the order.
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
    const a = +m[1];
    const b = +m[2];
    const y = year(m[3]);
    // Only one reading can be right when a part is past twelve.
    if (a > 12 && b <= 12) return utc(y, b - 1, a);
    if (b > 12 && a <= 12) return utc(y, a - 1, b);
    return dayFirst ? utc(y, b - 1, a) : utc(y, a - 1, b);
  }
  return NaN;
}

/**
 * Which way round a column of `03/04/2024` labels reads.
 *
 * Any value whose first part is past twelve settles it as day-first; any
 * whose second part is settles it as month-first. With no evidence either way
 * it is month-first, which is what `Date` itself assumes — and the reader is
 * told, because a guess that is not said is a guess that cannot be corrected.
 *
 * @returns {{ dayFirst: boolean, decided: boolean }}
 */
export function dateOrder(labels) {
  let dayFirst = false;
  let decided = false;
  for (const v of labels || []) {
    const m = String(v == null ? '' : v).trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
    if (!m) continue;
    if (+m[1] > 12) { dayFirst = true; decided = true; break; }
    if (+m[2] > 12) { dayFirst = false; decided = true; break; }
  }
  return { dayFirst, decided };
}

/** True when the column is ambiguous day/month numerals with nothing to settle it. */
export function dateOrderIsGuess(labels) {
  const o = dateOrder(labels);
  if (o.decided) return false;
  return (labels || []).some((v) => /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.test(String(v == null ? '' : v).trim()));
}

/**
 * Can this list of labels be placed on a time axis?
 *
 * Every filled label has to parse — a single `Total` row at the bottom makes
 * the column a list of words again — and there have to be at least two
 * distinct moments, or there is no axis to draw. Bare month names fail on
 * purpose; see the header.
 */
export function isDateLabels(labels) {
  if (!Array.isArray(labels) || labels.length < 2) return false;
  const { dayFirst } = dateOrder(labels);
  const seen = new Set();
  for (const v of labels) {
    if (v == null || String(v).trim() === '') continue;
    const t = parseDateLabel(v, dayFirst);
    if (!Number.isFinite(t)) return false;
    seen.add(t);
  }
  return seen.size >= 2;
}

/**
 * The coarsest unit that describes every label: what a tooltip should say.
 *
 * A yearly series should read "2024" on hover, not "Jan 2024"; a monthly one
 * "Jan 2024", not "1 Jan 2024". Decided once from the whole column rather
 * than per value, or January would read as a year in a series of months.
 *
 * @returns {'year'|'quarter'|'month'|'fullday'|'datetime'}
 */
export function dateGranularity(labels) {
  const { dayFirst } = dateOrder(labels);
  const ds = (labels || []).map((v) => parseDateLabel(v, dayFirst)).filter(Number.isFinite).map((t) => new Date(t));
  if (!ds.length) return 'datetime';
  if (ds.some((d) => d.getUTCHours() || d.getUTCMinutes() || d.getUTCSeconds())) return 'datetime';
  if (ds.some((d) => d.getUTCDate() !== 1)) return 'fullday';
  if (ds.every((d) => d.getUTCMonth() === 0)) return 'year';
  if (ds.every((d) => d.getUTCMonth() % 3 === 0)
    && /q[1-4]/i.test((labels || []).map(String).join(' '))) return 'quarter';
  return 'month';
}

/**
 * A cell that reads as a moment or a slot in time — what the profiler wants.
 *
 * `parseDateLabel` plus the two things it refuses for an axis: a bare month
 * name and a bare quarter. `Jan … Dec` cannot be placed on a time scale, but
 * it is ordered, and "ordered" is the property that makes a line chart honest.
 */
export function looksDateLike(value) {
  if (Number.isFinite(parseDateLabel(value))) return true;
  const s = String(value == null ? '' : value).trim().toLowerCase().replace(/\.$/, '');
  if (/^q[1-4]$/.test(s)) return true;
  const m = MONTHS.indexOf(s.slice(0, 3));
  if (m < 0) return false;
  const full = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
    'september', 'october', 'november', 'december'][m];
  return s === MONTHS[m] || (s.length >= 3 && full.startsWith(s));
}

/**
 * Teach Chart.js's time scale to use the browser's own Date.
 *
 * Chart.js expects a date adapter from a library; this is that adapter in
 * ninety lines of native `Date`, UTC throughout. Format names are the unit
 * names themselves, so `format(time, 'month')` is "Jan 2024"; `'fullday'`
 * adds the year for a tooltip, where the tick's shorthand is not enough.
 *
 * `parse(value, fmt)` hands the `time.parser` string through to
 * `parseDateLabel` as the day-first flag, which is how a chart whose column
 * `dateOrder` read as day-first tells the adapter so. Idempotent: installing
 * twice is a no-op.
 *
 * Self-contained apart from `parseDateLabel`, which is emitted beside it.
 */
export function installDateAdapter() {
  const Chart = typeof window !== 'undefined' ? window.Chart : null;
  if (!Chart || !Chart._adapters || Chart.__ocDateAdapter) return;
  Chart.__ocDateAdapter = true;

  const UNIT_MS = { millisecond: 1, second: 1e3, minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5 };
  const fmt = (opts) => new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ...opts });
  const F = {
    datetime: fmt({ year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    millisecond: fmt({ hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }),
    second: fmt({ hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    minute: fmt({ hour: '2-digit', minute: '2-digit' }),
    hour: fmt({ hour: 'numeric' }),
    day: fmt({ month: 'short', day: 'numeric' }),
    week: fmt({ month: 'short', day: 'numeric' }),
    month: fmt({ month: 'short', year: 'numeric' }),
    year: fmt({ year: 'numeric' }),
    fullday: fmt({ year: 'numeric', month: 'short', day: 'numeric' }),
  };
  const startOf = (t, unit, weekday) => {
    const d = new Date(t);
    switch (unit) {
      case 'second': d.setUTCMilliseconds(0); break;
      case 'minute': d.setUTCSeconds(0, 0); break;
      case 'hour': d.setUTCMinutes(0, 0, 0); break;
      case 'day': d.setUTCHours(0, 0, 0, 0); break;
      case 'week': {
        d.setUTCHours(0, 0, 0, 0);
        const wd = weekday == null ? 1 : weekday;
        d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - wd + 7) % 7));
        break;
      }
      case 'month': d.setUTCHours(0, 0, 0, 0); d.setUTCDate(1); break;
      case 'quarter': d.setUTCHours(0, 0, 0, 0); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - (d.getUTCMonth() % 3)); break;
      case 'year': d.setUTCHours(0, 0, 0, 0); d.setUTCMonth(0, 1); break;
      default: break;
    }
    return d.getTime();
  };
  const add = (t, n, unit) => {
    const d = new Date(t);
    switch (unit) {
      case 'month': d.setUTCMonth(d.getUTCMonth() + n); return d.getTime();
      case 'quarter': d.setUTCMonth(d.getUTCMonth() + 3 * n); return d.getTime();
      case 'year': d.setUTCFullYear(d.getUTCFullYear() + n); return d.getTime();
      default: return t + n * (UNIT_MS[unit] || 1);
    }
  };
  const diff = (a, b, unit) => {
    const A = new Date(a);
    const B = new Date(b);
    const months = (A.getUTCFullYear() - B.getUTCFullYear()) * 12 + (A.getUTCMonth() - B.getUTCMonth());
    switch (unit) {
      case 'month': return months;
      case 'quarter': return months / 3;
      case 'year': return months / 12;
      default: return (a - b) / (UNIT_MS[unit] || 1);
    }
  };

  Chart._adapters._date.override({
    formats() {
      return {
        datetime: 'datetime', millisecond: 'millisecond', second: 'second', minute: 'minute',
        hour: 'hour', day: 'day', week: 'week', month: 'month', quarter: 'quarter', year: 'year',
      };
    },
    parse(value, format) {
      if (value == null) return null;
      if (value instanceof Date) return value.getTime();
      if (typeof value === 'number' && !(format && /year/.test(format))) return value;
      const t = parseDateLabel(value, format === 'dmy');
      return Number.isFinite(t) ? t : null;
    },
    format(time, format) {
      const d = new Date(time);
      if (format === 'quarter') return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
      return (F[format] || F.datetime).format(d);
    },
    add,
    diff,
    startOf,
    endOf(time, unit) { return add(startOf(time, unit), 1, unit) - 1; },
  });
}

/** Does this built Chart.js config draw any scale on time? */
export function usesTimeScale(config) {
  const scales = config && config.options && config.options.scales;
  return !!scales && Object.values(scales).some((s) => s && s.type === 'time');
}
