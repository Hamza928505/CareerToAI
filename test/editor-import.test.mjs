import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Exercise the page's actual import gate without adding a browser dependency.
const source = fs.readFileSync(new URL('../src/assets/editor.js', import.meta.url), 'utf8');
const start = source.indexOf('async function importJson(file)');
const end = source.indexOf('// ---------------------------------------------------------------------------', start);
const importer = source.slice(start, end);

async function check(payload, empty = false) {
  let error, prompted = false, adopted = false;
  const context = vm.createContext({
    dialog: {},
    draftIsEmpty: () => empty,
    alertError: (title, message) => { error = { title, message }; },
    Swal: { fire: () => { prompted = true; return { isConfirmed: false }; }, close() {} },
    busy() {}, adoptState: () => { adopted = true; }, renderAll() {}, save() {}, toast() {},
  });
  vm.runInContext(importer, context);
  await context.importJson({ name: 'profile.json', text: async () => payload });
  return { error, prompted, adopted };
}

test('accepts version 1 exports and requests confirmation before replacing a draft', async () => {
  const result = await check(JSON.stringify({ version: 1, profile: { firstName: 'Test', skills: ['Python'] },
    certificates: [{ imageKey: 'scan' }], images: { scan: { type: 'image/png', dataUrl: 'data:image/png;base64,AA==' } } }));
  assert.equal(result.error, undefined);
  assert.equal(result.prompted, true);
});

test('rejects malformed profiles and remote attachment URLs before changing data', async () => {
  for (const payload of ['{bad', '{}', '{"profile":"bad"}', '{"profile":{},"certificates":[null]}',
    '{"profile":{},"images":{"scan":{"dataUrl":"https://example.com/private"}}}']) {
    const result = await check(payload);
    assert.ok(result.error, payload);
    assert.equal(result.prompted, false);
  }
});

test('imports straight away when the draft is empty', async () => {
  const result = await check(JSON.stringify({ version: 1, profile: { firstName: 'Test' } }), true);
  assert.equal(result.error, undefined);
  assert.equal(result.prompted, false);
  assert.equal(result.adopted, true);
});
