import assert from 'node:assert/strict';
import test from 'node:test';

// results-data.js reads the board's helpers from the global, as the page does after loading board-logic.js.
await import('../src/assets/board-logic.js');
const R = await import('../src/assets/results-data.js');

const file = (runAt, internships) => JSON.stringify({ kind: 'gju-internships', version: 1, runAt, query: { major: 'Computer Engineering', location: 'Berlin' }, internships });
const advert = (id, extra = {}) => ({ id, title: `Praktikum ${id}`, url: `https://de.indeed.com/viewjob?jk=${id}`, company: 'Beispiel GmbH', city: 'Berlin', posted: '2026-10-19', verdict: 'meets', why: '6 months, full time', checks: [{ rule: 'Duration', state: 'ok', quote: '6 Monate' }], notes: [], ...extra });

test('rejects files that are not GJU internship results, with a reason', () => {
  assert.throws(() => R.parseResults('not json'), /not a JSON file/);
  assert.throws(() => R.parseResults(JSON.stringify({ version: 1, profile: {} })), /not a GJU internships result/);
  assert.throws(() => R.parseResults(file('yesterday', [])), /runAt/);
});

test('cleans untrusted rows: unsafe links dropped, unknown verdicts and states made safe, rows without an id skipped', () => {
  const parsed = R.parseResults(file('2026-10-21T08:00:00+02:00', [
    advert('a', { url: 'javascript:alert(1)', verdict: 'approved', checks: [{ rule: 'Duration', state: 'great', quote: 'x' }] }),
    { title: 'no id' }, advert('a'),
  ]));
  assert.equal(parsed.runAt, '2026-10-21T06:00:00.000Z');
  assert.equal(parsed.internships.length, 1);
  const [row] = parsed.internships;
  assert.equal(row.url, '');
  assert.equal(row.verdict, 'check');
  assert.equal(row.checks[0].state, 'warn');
});

test('merging keeps when a row was first seen, marks new rows, and keeps rows missing from the latest run', () => {
  const first = R.mergeResults(null, R.parseResults(file('2026-10-20T08:00:00Z', [advert('a'), advert('b')])));
  assert.equal(first.rows.filter((r) => R.isNew(r, first)).length, 0); // the first file has nothing to compare with
  const second = R.mergeResults(first, R.parseResults(file('2026-10-21T08:00:00Z', [advert('a', { verdict: 'fails' }), advert('c')])));
  const by = Object.fromEntries(second.rows.map((r) => [r.id, r]));
  assert.equal(by.a.firstSeen, '2026-10-20T08:00:00.000Z');
  assert.equal(by.a.verdict, 'fails');
  assert.ok(R.isNew(by.c, second) && !R.isNew(by.a, second));
  assert.ok(!R.inLatest(by.b, second));
  // an older file loaded afterwards changes neither the latest run nor the newer copy of a row
  const third = R.mergeResults(second, R.parseResults(file('2026-10-19T08:00:00Z', [advert('a')])));
  assert.equal(third.runAt, second.runAt);
  assert.equal(third.rows.find((r) => r.id === 'a').verdict, 'fails');
});

test('hidden rows stay out until the Hidden status is chosen; other filters combine', () => {
  const rows = R.mergeResults(null, R.parseResults(file('2026-10-21T08:00:00Z', [
    advert('a'), advert('b', { city: 'München', verdict: 'check' }), advert('c', { posted: '2026-08-01' }),
  ]))).rows;
  const status = { a: 'hidden' };
  const ids = (f, skip) => R.filterRows(rows, { ...R.defaultFilters(), ...f }, status, skip, new Date('2026-10-21T12:00:00Z')).map((r) => r.id).sort();
  assert.deepEqual(ids({}), ['b', 'c']);
  assert.deepEqual(ids({ statuses: ['hidden'] }), ['a']);
  assert.deepEqual(ids({ cities: ['munchen'] }), ['b']);
  assert.deepEqual(ids({ posted: '30' }), ['b']);
  assert.deepEqual(ids({ q: 'praktikum munchen' }), ['b']); // accents do not matter
  assert.deepEqual(ids({ verdicts: ['check'] }, 'verdicts'), ['b', 'c']);
});

test('sorting puts an advert without a company last', () => {
  const rows = R.mergeResults(null, R.parseResults(file('2026-10-21T08:00:00Z', [advert('a', { company: 'Zalando' }), advert('b', { company: '' }), advert('c', { company: 'Bosch' })]))).rows;
  assert.deepEqual(R.sortRows(rows, 'company', 1).map((r) => r.id), ['c', 'a', 'b']);
});

test('the CSV keeps umlauts, quotes cells and never starts a cell with a formula', () => {
  const rows = R.mergeResults(null, R.parseResults(file('2026-10-21T08:00:00Z', [advert('a', { title: '=HYPERLINK("x")', city: 'München' })]))).rows;
  const csv = R.toCsv(rows, { a: 'applied' });
  assert.ok(csv.startsWith('﻿"Internship"'));
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.match(csv, /"München"/);
  assert.match(csv, /"Applied"/);
});
