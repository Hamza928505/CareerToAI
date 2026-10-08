import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Run after `npm run build`: the public profile must stay readable as data grows.
const html = readFileSync(new URL('../_site/index.html', import.meta.url), 'utf8');
const projects = JSON.parse(readFileSync(new URL('../data/projects.json', import.meta.url), 'utf8'));
const prose = html.split('class="profile-prose">')[1]?.split('</div>')[0] || '';

assert.equal((html.match(/<article class="project" /g) || []).length, projects.length);
assert.ok((prose.match(/<p>/g) || []).length > 1, 'bio should render as paragraphs');
assert.match(html, /href="#contact-heading"/);

const workspace = readFileSync(new URL('../_site/workspace/index.html', import.meta.url), 'utf8');
for (const key of ['roles', 'cities', 'types']) {
  assert.match(workspace, new RegExp(`data-strategy-options="${key}"`));
  assert.match(workspace, new RegExp(`data-strategy-custom="${key}"`));
}
assert.match(workspace, /value="Software Engineering"/);
assert.match(workspace, /value="Praktikum"/);
assert.match(workspace, /id="strategy-save-status" role="status"/);
assert.match(workspace, /data-strategy-search="roles"/);
assert.match(workspace, /data-strategy-browse="roles"/);
assert.match(workspace, /data-strategy-search="cities"/);

const options = JSON.parse(readFileSync(new URL('../src/assets/search-options.json', import.meta.url), 'utf8'));
assert.ok(options.roles.length >= 2900, 'ESCO role catalog should be complete');
assert.ok(options.cities.length >= 2000, 'Destatis city catalog should be complete');
assert.ok(options.cities.some(({ name }) => name === 'München'));
