import assert from "node:assert/strict";
import test from "node:test";
import { assistantQueue, applicationTarget, isIT, mergeSearchResults, newEligible } from "../lib/application-flow.mjs";
import { inferOpportunityType, jobMatchKey, postingIdFromUrl } from "../lib/tracker.mjs";
import { scoreJobMatch } from "../lib/job-match.mjs";

test('posting IDs come from direct URL identifiers, without inventing IDs for slugs', () => {
  assert.equal(postingIdFromUrl('https://jobs.kermi.de/Werkstudent-Datenplattformen-de-j6006.html'), '6006');
  assert.equal(postingIdFromUrl('https://jobs.example/job/data/1433971833/'), '1433971833');
  assert.equal(postingIdFromUrl('https://www.arbeitsagentur.de/jobsuche/jobdetail/10001-1003759428-S'), '10001-1003759428-S');
  assert.equal(postingIdFromUrl('https://indeed.de/viewjob?jk=AbC123&utm_source=mail'), 'AbC123');
  assert.equal(postingIdFromUrl('https://example.org/stelle/werkstudent-software'), '');
});

test('profile match uses actual listed technologies and flags missing ones', () => {
  const result = scoreJobMatch({ position: 'Werkstudent Backend Software', req_skills: 'C#, .NET, SQL, React' });
  assert.ok(result.score >= 70 && result.score < 100);
  assert.match(result.reason, /C#/);
  assert.match(result.missing, /React/);
  assert.equal(scoreJobMatch({ position: 'Retail clerk' }), null);
});

test('opportunity types are inferred only from clear position labels', () => {
  assert.equal(inferOpportunityType('Werkstudent Webentwicklung'), 'Werkstudent');
  assert.equal(inferOpportunityType('Bachelorarbeit Softwareentwicklung'), 'Bachelor thesis');
  assert.equal(inferOpportunityType('Praktikum Backend'), 'Praktikum');
  assert.equal(inferOpportunityType('Frontend Internship'), 'Internship');
  assert.equal(inferOpportunityType('Junior Backend Developer'), 'Junior role');
  assert.equal(inferOpportunityType('Full Stack Developer'), '');
});

test("only explicit Assistant, Yes, To apply rows without pending input enter submission queue", () => {
  const base = { apply: "Yes", status: "To apply" };
  const rows = [
    { ...base, id: "assistant", applicant: "Assistant" },
    { ...base, id: "me", applicant: "Me" },
    { ...base, id: "missing" },
    { ...base, id: "unknown", applicant: "assistant" },
    { ...base, id: "declined", applicant: "Assistant", apply: "No" },
    { ...base, id: "retry", applicant: "Assistant", assistant_state: "Needs input" },
    { ...base, id: "sent", applicant: "Assistant", status: "Applied" },
  ];
  assert.deepEqual(assistantQueue(rows).map(row => row.id), ["assistant"]);
});

test("search merges preserve decisions, assignment, notes and blank user choices", () => {
  const original = [
    { id: "keep", company: "Example", position: "Original title", job_url: "https://example.org/jobs/123", apply: "Yes", applicant: "Assistant", status: "Not applied", notes: "My private note", _cellNotes: { position: "Cell note" }, city: "" },
    { id: "blank", company: "Example", position: "Another role", job_url: "https://example.org/jobs/456", apply: "", applicant: "Me", status: "", notes: "" },
  ];
  const copy = structuredClone(original);
  const result = mergeSearchResults(original, [
    { title: "Changed title", company: "Example", url: "https://example.org/jobs/123?utm_source=search", location: "Berlin", snippet: "Fresh search snippet" },
    { title: "Another role", company: "Example", url: "https://example.org/jobs/456", snippet: "Do not fill blank user notes" },
    { title: "New internship", url: "https://example.org/jobs/789", date_posted: "2026-10-05", snippet: "New listing" },
    { title: "Invalid scheme", url: "javascript:alert(1)" },
  ]);
  assert.deepEqual(original, copy);
  assert.equal(result.added, 1);
  assert.equal(result.rows.length, 3);
  for (const key of ["id", "position", "apply", "applicant", "status", "notes", "_cellNotes"]) assert.deepEqual(result.rows[0][key], original[0][key]);
  assert.equal(result.rows[0].city, "Berlin");
  for (const key of ["apply", "applicant", "status", "notes"]) assert.equal(result.rows[1][key], original[1][key]);
  assert.equal(result.rows[2].applicant, "Me");
  assert.equal(result.rows[2].apply, "");
  assert.equal(result.rows[2].status, "To apply");
  assert.equal(result.rows[2].job_url, "https://example.org/jobs/789");
  assert.equal(result.rows[2].date_posted, "2026-10-05");
});

test("query posting IDs distinguish jobs at the same URL path", () => {
  const original = [{ id: "a", company: "Example", position: "Intern", job_url: "https://example.org/jobs?jobId=A", apply: "No", applicant: "Me", notes: "Keep" }];
  const result = mergeSearchResults(original, [
    { company: "Example", title: "Intern", url: "https://example.org/jobs?utm_source=search&jobId=A" },
    { company: "Example", title: "Intern", url: "https://example.org/jobs?jobId=B" },
  ]);
  assert.equal(result.added, 1);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].id, "a");
  assert.equal(result.rows[0].apply, "No");
  assert.match(result.rows[1].job_url, /jobId=B/);
});

test('a verified direct posting fills an old row whose board homepage link was cleared', () => {
  const original = [{ id: 'old', company: 'Example GmbH', position: 'Data Intern', job_url: '', apply: 'Yes', applicant: 'Me', notes: 'My decision' }];
  const merged = mergeSearchResults(original, [{ company: 'Example GmbH', title: 'Data Intern', url: 'https://example.org/job/data-intern-12345' }]);
  assert.equal(merged.added, 0);
  assert.equal(merged.rows.length, 1);
  assert.equal(merged.rows[0].job_url, 'https://example.org/job/data-intern-12345');
  assert.equal(merged.rows[0].apply, 'Yes');
  assert.equal(merged.rows[0].notes, 'My decision');
});

test('search adds stated posting details and a profile score without changing an existing decision', () => {
  const hit = { company: 'Example GmbH', title: 'Werkstudent Backend Software', url: 'https://example.org/job/backend-12345',
    date_posted: '2026-10-05', address: 'Main Street 1, Berlin', deadline: '2026-10-31', salary: '1200 EUR / MONTH',
    full_part: 'Part time', req_skills: 'C#, .NET, SQL, React', description: 'Build backend APIs in C#, .NET and SQL. React helps.' };
  const existing = [{ id: 'keep', company: hit.company, position: hit.title, job_url: hit.url, apply: 'Yes', applicant: 'Me', match_score: '68', why_match: 'My own rating' }];
  const merged = mergeSearchResults(existing, [hit]);
  assert.equal(merged.added, 0);
  assert.equal(merged.rows[0].match_score, '68');
  assert.equal(merged.rows[0].why_match, 'My own rating');
  assert.equal(merged.rows[0].deadline, hit.deadline);
  assert.equal(merged.rows[0].salary, hit.salary);
  const added = mergeSearchResults([], [hit]).rows[0];
  assert.equal(added.website, '');
  assert.equal(added.full_part, 'Part time');
  assert.ok(Number(added.match_score) >= 70);
  assert.match(added.missing_reqs, /React/);
});

test("a search keeps only new postings from the last 7 days that the GJU rules do not rule out", () => {
  const hit = (n, extra) => ({ url: `https://example.org/job/${n}-12345`, company: `Firma ${n}`, title: "Praktikum Softwareentwicklung", date_posted: "2026-10-20", ...extra });
  const rows = [
    { company: "Known GmbH", position: "Praktikum Backend", job_url: "https://example.org/job/known-1" },
    { company: "Old Row GmbH", position: "Praktikum Data", job_url: "" },
  ];
  const { jobs, skipped } = newEligible([
    hit(1),
    hit(2, { url: "https://example.org/job/known-1" }), // in the workbook, by link
    hit(3, { company: "Old Row GmbH", title: "Praktikum Data" }), // in the workbook, by company and title
    hit(4, { date_posted: "" }), // undated: never dated by the day it was found
    hit(5, { date_posted: "2026-10-16" }), // before the window, which starts 2026-10-17
    hit(6, { title: "Werkstudent Softwareentwicklung" }), // not an internship
    hit(7, { snippet: "Dauer: 3 Monate" }), // fails: under 20 weeks
    hit(8, { url: "https://to.indeed.com/aaaa", company: "Firma 1" }), // job 1 again, found on Indeed
    hit(9, { date_posted: "2026-10-17T09:00:00Z" }), // the window's first day
    hit(10, { title: "Praktikum Marketing" }), // not IT
    hit(11, { title: "Praktikum IT-Support" }), // IT, said in capitals only
  ], rows, { now: Date.parse("2026-10-24T08:00:00Z"), days: 7 });
  assert.deepEqual(jobs.map((job) => job.url), ["https://example.org/job/1-12345", "https://example.org/job/9-12345", "https://example.org/job/11-12345"]);
  assert.deepEqual(skipped, { known: 3, undated: 1, old: 1, ineligible: 2, notIT: 1 });
});

test("a search names an IT field only from the title", () => {
  for (const title of ["Praktikum Softwareentwicklung", "Internship Data & AI", "Praktikum IT-Sicherheit", "Pflichtpraktikum Webentwicklung", "Intern Cloud Engineering"]) assert.ok(isIT(title), title);
  for (const title of ["Praktikum Marketing", "Praktikum Personalwesen", "Internship Finance", "Praktikum Vertrieb (it's fun)"]) assert.ok(!isIT(title), title);
});

test("a new row gets duration, pay and language levels as the advert states them, and blanks when it does not", () => {
  const [row] = mergeSearchResults([], [{ url: "https://example.org/job/77777", company: "Firma", title: "Praktikum Softwareentwicklung",
    description: "Dauer: 6 Monate. Vergütung: 1.200 € pro Monat. Deutsch auf B2-Niveau, Englisch C1." }]).rows;
  assert.equal(row.duration, "26 weeks");
  assert.equal(row.salary, "1200 EUR/month");
  assert.equal(row.req_german, "B2");
  assert.equal(row.req_english, "C1");
  const [bare] = mergeSearchResults([], [{ url: "https://example.org/job/88888", company: "Firma", title: "Praktikum Softwareentwicklung" }]).rows;
  assert.deepEqual([bare.duration, bare.salary, bare.req_german, bare.req_english], ["", "", "", ""]);
});

test("Indeed's short links say nothing about the job, so one job found twice is merged once", () => {
  const job = { company: "SYSTAG Systemhaus", position: "Praktikum Softwareentwicklung" };
  assert.equal(jobMatchKey({ ...job, job_url: "https://to.indeed.com/aab74nl6vx9k" }), jobMatchKey({ ...job, job_url: "https://to.indeed.com/aajpmjm8gnzz" }));
  const first = mergeSearchResults([], [{ url: "https://to.indeed.com/aab74nl6vx9k", company: job.company, title: job.position }]);
  assert.equal(mergeSearchResults(first.rows, [{ url: "https://to.indeed.com/aajpmjm8gnzz", company: job.company, title: job.position }]).added, 0);
});

test("application destinations distinguish email, web and missing URLs", () => {
  assert.equal(applicationTarget({ app_url: "mailto:jobs@example.org" }).kind, "email");
  assert.equal(applicationTarget({ app_method: "Email", app_url: "jobs@example.org" }).kind, "email");
  assert.equal(applicationTarget({ job_url: "https://example.org/apply" }).kind, "web");
  assert.equal(applicationTarget({ app_url: "file:///private/cv.pdf" }).kind, "missing");
});

test("an unverified search result is added with a note saying nothing was read from the site", () => {
  const result = mergeSearchResults([], [
    { title: "Marketing Praktikum", url: "https://www.stepstone.de/stellenangebote--x-1.html", snippet: "From the search engine", data_source: "exa search, unverified", verified: false },
    { title: "Data Praktikum", url: "https://example.org/job/2", snippet: "Read from the page" },
  ]);
  assert.equal(result.added, 2);
  assert.match(result.rows[0].notes, /^Unverified search result: .*Nothing was read from the site\.\nFrom the search engine$/);
  assert.equal(result.rows[0].data_source, "exa search, unverified");
  assert.equal(result.rows[0].status, "To apply"); // the status vocabulary is unchanged
  assert.equal(result.rows[1].notes, "Read from the page");
});
