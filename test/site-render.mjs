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
// One search for every IT internship in Germany: no strategy form, no hand-run GJU checker, results on the board moved
// from the private page (its hero, filters and list), which no longer exists.
// The search lives in the Shortlist panel; there is no panel of its own.
const shortlist = workspace.slice(workspace.indexOf('id="flow-review"'), workspace.indexOf('id="flow-apply"'));
assert.match(shortlist, /id="btn-start-search"/);
assert.match(shortlist, /id="search-use-profile"/);
assert.doesNotMatch(workspace, /id="flow-search"|href="#flow-search"/);
assert.doesNotMatch(workspace, /id="strategy-form"|id="flow-check"|id="checker"|href="#flow-check"|private-board/);
assert.match(workspace, /class="gb gb-hero"/);
// The board hero is the page's only hero, at the top and outside any tab panel; no stat tiles or funnel above the tabs.
assert.doesNotMatch(workspace, /ws-head|workspace-overview|id="stat-total"|id="mode-pill"/);
assert.equal((workspace.match(/gb-hero"/g) || []).length, 1);
assert.ok(workspace.indexOf('class="gb gb-hero"') < workspace.indexOf('id="settings-form"') && workspace.indexOf('class="gb gb-hero"') < workspace.indexOf('id="flow-review"'));
for (const stat of ['total', 'meets', 'fresh', 'companies']) assert.match(workspace, new RegExp(`data-stat="${stat}"`));
for (const filter of ['skills', 'status', 'city', 'kind', 'gju', 'apply', 'german', 'english', 'applicant', 'sort']) assert.match(workspace, new RegExp(`id="board-f-${filter}"`));
assert.match(workspace, /<option value="results">Board<\/option>/);

const options = JSON.parse(readFileSync(new URL('../src/assets/search-options.json', import.meta.url), 'utf8'));
assert.ok(options.roles.length >= 2900, 'ESCO role catalog should be complete');
assert.ok(options.cities.length >= 2000, 'Destatis city catalog should be complete');
assert.ok(options.cities.some(({ name }) => name === 'München'));
