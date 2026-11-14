import assert from "node:assert/strict";
import test from "node:test";

import { assessPosting, checkAssessment, coverageFrom, keywordLines, manualSections, score } from "../lib/ats-assess.mjs";

const profile = {
  profile: { education: [{ school: "German Jordanian University", degree: "Bachelor", fieldOfStudy: "Computer Science" }], languages: [{ language: "German", level: "B1" }], skills: [] },
  experience: [{ title: "Back End Developer", organization: "Umniah", skills: ["C#", "SQL"], evidence: { documentId: "doc-1" } }],
  projects: [{ name: "OpenCharts", skills: ["Playwright"] }],
  certificates: [{ title: "Red Hat System Administration I", skills: ["Linux"] }],
  allSkills: ["C#", "SQL", "Playwright", "Linux"],
};
const item = (over) => ({ requirement: "x", kind: "must", status: "MET", term: "C#", evidence: "Back End Developer, Umniah", wording: "C# in production", ...over });

test("a requirement is MET only when the profile holds it; an invented one is moved down and said so", () => {
  const { requirements } = checkAssessment({ requirements: [
    item({}),
    item({ term: "Kubernetes", evidence: "Ran clusters at a previous employer" }), // not in the profile, names no entry
    item({ term: "Informatik", evidence: "Bachelor Computer Science, German Jordanian University" }), // the degree is the proof, not the word
    item({ term: "Linux", evidence: "Red Hat System Administration I" }),
    item({ status: "GAP", term: "Rust", evidence: "made up", wording: "made up" }),
  ], knockouts: [], weakAreas: [], recommendations: [], language: "de" }, profile);
  assert.deepEqual(requirements.map((r) => [r.term, r.status, r.proof]), [
    ["C#", "MET", "document"],          // the entry came from an uploaded document
    ["Kubernetes", "PARTLY", ""],
    ["Informatik", "MET", "profile"],
    ["Linux", "MET", "document"],       // a certificate
    ["Rust", "GAP", ""],
  ]);
  assert.match(requirements[1].note, /Nothing in your profile/);
  assert.equal(requirements[4].evidence, ""); // a gap carries no evidence and no wording into the documents
  assert.equal(requirements[4].wording, "");
});

test("the keywords file keeps the gaps, so the parser's coverage is honest", () => {
  assert.deepEqual(keywordLines([{ kind: "must", term: "C#" }, { kind: "nice", term: "Rust" }, { kind: "must", term: "C#" }]), ["!C#", "Rust"]);
  // Terms a posting joined are looked for one by one: the CV says "C#" and ".NET", never "C# und .NET".
  assert.deepEqual(keywordLines([{ kind: "must", term: "C# und .NET" }, { kind: "nice", term: "REST APIs, ASP.NET Core" }]), ["!C# | .NET", "REST APIs | ASP.NET Core"]);
  const found = coverageFrom("## Keyword coverage\n\n| Type | Term | Count | Status |\n|---|---|---|---|\n| must | C# | 3 | found |\n| nice | Rust | 0 | MISSING (gap - add only if true) |");
  assert.equal(found.get("c#"), true);
  assert.equal(found.get("rust"), false);
});

test("the score explains itself: the profile alone before writing, the CV's own text and format after", () => {
  const requirements = [{ kind: "must", status: "MET", term: "C#" }, { kind: "must", status: "GAP", term: "Go" }, { kind: "nice", status: "PARTLY", term: "Docker" }];
  const before = score(requirements, null);
  assert.equal(before.basis, "profile");
  assert.equal(before.total, Math.round((0.5 * 0.75 + 0.5 * 0.25) * 100));
  const report = { ok: true, fails: 1, warns: 0, reportMd: "| must | C# | 2 | found |\n| nice | Docker | 0 | MISSING |" };
  const after = score(requirements, report);
  assert.equal(after.basis, "cv");
  assert.equal(after.parts.inCv, 0.5); // of the two terms the profile supports, one is in the CV; the gap is not counted against the CV
  assert.ok(after.parts.format < 1);
});

test("the manual's own sections are what the model is given", async () => {
  const manual = "# X\n\n## 0. Ground rules\nTruth first.\n\n## 1. Format\nOne column.\n\n## 2. Matching\nMET PARTLY GAP.\n\n## 7. How X screens\nBy questions.\n";
  assert.equal(manualSections(manual, [0, 2]), "## 0. Ground rules\nTruth first.\n\n## 2. Matching\nMET PARTLY GAP.");
  let seen = "";
  const result = await assessPosting({ posting: { company: "ACME", title: "Praktikum", url: "", text: "Wir suchen eine Praktikantin oder einen Praktikanten mit sehr guten Kenntnissen in C# und Erfahrung mit Go." } }, {
    profile, guidance: { ats: "Personio", manual: "Personio.md", companyNote: "", rules: manualSections(manual, [0, 2]), platform: manualSections(manual, [7]), company: "", found: true },
    chat: async ({ system }) => { seen = system; return { requirements: [item({}), item({ term: "Go", evidence: "", wording: "", status: "GAP" })], knockouts: [], weakAreas: [], recommendations: [], language: "de" }; },
  });
  assert.match(seen, /Truth first\./);
  assert.match(seen, /By questions\./);
  assert.deepEqual(result.gaps, [{ term: "Go", kind: "must" }]);
  assert.equal(result.score.basis, "profile");
  await assert.rejects(() => assessPosting({ posting: { text: "short" } }, { profile, guidance: { found: true } }), /too short/);
});
