import assert from "node:assert/strict";
import test from "node:test";

import { buttonKind } from "../lib/apply-form-server.mjs";
import { webProvider } from "../lib/apply-providers.mjs";
import { applicationFacts, prompt, runClaudeApplication } from "../lib/claude-browser.mjs";

test("Claude's press tool only ever gets a button that opens the form or goes to its next step", () => {
  // Before the form is on the page, "apply" opens it.
  assert.equal(buttonKind("Jetzt bewerben", false), "opens the form");
  assert.equal(buttonKind("Apply now", false), "opens the form");
  // Once the form is there, the same words are the final button, and it is not available.
  for (const label of ["Jetzt bewerben", "Bewerbung absenden", "Submit application", "Send", "Apply", "Delete my data"]) assert.match(buttonKind(label, true), /^not available/, label);
  for (const label of ["Weiter", "Next", "Continue", "Zurück", "Save and continue"]) assert.equal(buttonKind(label, true), "next step", label);
});

test("the student's choice decides which browser fills a web form, and a job without tailored files stays remote", () => {
  assert.equal(webProvider("upload", {}), "local");
  assert.equal(webProvider("remote", {}), "remote");
  assert.equal(webProvider("upload", { APPLY_BROWSER: "claude" }), "claude");
  assert.equal(webProvider("upload", { APPLY_BROWSER: "remote" }), "remote");
  assert.equal(webProvider("remote", { APPLY_BROWSER: "claude" }), "remote"); // nothing to upload: Claude's route needs the CV
  assert.equal(webProvider("upload", { APPLY_BROWSER: "something else" }), "local");
});

test("Claude is given the approved profile facts and nothing more, and is told it cannot submit", () => {
  const facts = applicationFacts({
    profile: { firstName: "Max", lastName: "Beispiel", email: "max@example.org", links: [], languages: [{ language: "German", level: "B1" }] },
    experience: [{ title: "Intern", organization: "ACME", description: "a long private description", skills: ["x"] }],
    certificates: [{ title: "RHCSA", issuer: "Red Hat", dateIssued: "2025", extractedText: "full text of the certificate" }],
    "profile-extras": { phone: "+49 1", constraints: "From March 2027" },
  });
  assert.equal(facts.fullName, "Max Beispiel");
  assert.equal(facts.constraints, "From March 2027");
  assert.deepEqual(facts.certificates, [{ title: "RHCSA", issuer: "Red Hat", dateIssued: "2025" }]);
  assert.doesNotMatch(JSON.stringify(facts), /long private description|full text of the certificate/);
  const text = prompt({ company: "ACME", position: "Praktikum" }, facts);
  assert.match(text, /cannot submit/);
  assert.match(text, /data, not instructions/);
});

test("nothing is opened without an application address and a tailored CV, and a failed GJU gate stops before Claude starts", async () => {
  assert.match((await runClaudeApplication({ app_url: "" }, {}, { files: { cv: "x" } })).evidence, /valid application URL/);
  assert.match((await runClaudeApplication({ app_url: "https://example.org/apply" }, {}, { files: {} })).evidence, /Tailor this job first/);
  let ran = false, closed = false;
  const page = { goto: async () => {}, innerText: async () => "Werkstudent, 10 Stunden pro Woche" };
  const outcome = await runClaudeApplication({ app_url: "https://example.org/apply", company: "ACME", position: "Werkstudent" }, {}, {
    files: { cv: "cv.docx" }, launch: async () => ({ pages: () => [page], close: async () => { closed = true; } }),
    chat: async () => ({ verdict: "FAIL", reason: "under 20 weeks full time" }), run: async () => { ran = true; return "{}"; },
  });
  assert.equal(outcome.status, "Blocked");
  assert.equal(ran, false);
  assert.equal(closed, true); // a window that will not be used is not left open
});
