import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const script = fs.readFileSync(new URL('../src/assets/editor-migration.js', import.meta.url), 'utf8');

function harness(saved, attachment) {
  let click, download;
  const button = { addEventListener: (_, fn) => { click = fn; } };
  const status = {};
  const db = {
    close() {},
    transaction: () => ({ objectStore: () => ({ get: () => {
      const req = { result: attachment };
      queueMicrotask(() => req.onsuccess());
      return req;
    } }) }),
  };
  vm.runInNewContext(script, {
    document: {
      querySelector: selector => selector.includes('status') ? status : button,
      createElement: () => ({ click() {}, remove() {} }),
      body: { append() {} },
    },
    localStorage: { getItem: key => { assert.equal(key, 'careertoai:v1'); return saved; } },
    indexedDB: { open: name => {
      assert.equal(name, 'careertoai');
      const req = { result: db };
      queueMicrotask(() => req.onsuccess());
      return req;
    } },
    FileReader: class {
      readAsDataURL(blob) { this.result = blob; queueMicrotask(() => this.onload()); }
    },
    Blob,
    URL: { createObjectURL: blob => { download = blob; return 'blob:test'; }, revokeObjectURL() {} },
    setTimeout: fn => fn(),
  });
  return { click: () => click(), status, button, download: () => download };
}

test('exports old text and embedded attachments without writing to old storage', async () => {
  const h = harness(JSON.stringify({ profile: { firstName: 'Test' }, certificates: [{ imageKey: 'scan' }] }),
    { name: 'scan.png', type: 'image/png', blob: 'data:image/png;base64,AA==' });
  await h.click();
  const data = JSON.parse(await h.download().text());
  assert.equal(data.version, 1);
  assert.equal(data.profile.firstName, 'Test');
  assert.deepEqual(data.images.scan, { name: 'scan.png', type: 'image/png', dataUrl: 'data:image/png;base64,AA==' });
  assert.equal(h.button.disabled, false);
});

test('reports missing drafts or attachments instead of downloading a broken backup', async () => {
  for (const saved of [null, '{invalid', JSON.stringify({ profile: {}, certificates: [{ imageKey: 'missing' }] })]) {
    const h = harness(saved);
    await h.click();
    assert.equal(h.download(), undefined);
    assert.match(h.status.textContent, /No old draft|Could not export/);
    assert.equal(h.button.disabled, false);
  }
});
