import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { applyAssignments, cannotAutomate, decideApplicants, isCandidate } from "../lib/assign-applicant.mjs";
import { TAILORED_DIRS } from "../lib/student-files.mjs";

const made = [];
function tailored(name) {
  fs.mkdirSync(TAILORED_DIRS[0], { recursive: true });
  const file = path.join(TAILORED_DIRS[0], name);
  fs.writeFileSync(file, "docx-bytes");
  made.push(file);
  return name;
}
test.after(() => made.forEach((file) => fs.rmSync(file, { force: true })));

const base = { apply: "Yes", status: "To apply", applicant: "Me" };

test("only the student's own, still-open, Apply=Yes rows are looked at", () => {
  assert.equal(isCandidate({ ...base }), true);
  assert.equal(isCandidate({ ...base, applicant: "" }), true);
  for (const change of [{ applicant: "Assistant" }, { apply: "No" }, { apply: "" }, { status: "Applied" }, { assistant_state: "Needs input" }]) {
    assert.equal(isCandidate({ ...base, ...change }), false, JSON.stringify(change));
  }
});

test("code refuses rows the assistant could not apply to, with a reason", () => {
  const cv = tailored("zz_assign_cv.docx");
  assert.match(cannotAutomate({ ...base }), /no application link/i);
  assert.match(cannotAutomate({ ...base, job_url: "https://firma.de/job" }), /Tailor the documents/);
  assert.match(cannotAutomate({ ...base, app_method: "Email", app_url: "not-an-address", cv_file: cv }), /e-mail|link/i);
  assert.equal(cannotAutomate({ ...base, job_url: "https://firma.de/job", cv_file: cv }), "");
  assert.equal(cannotAutomate({ ...base, contact_email: "hr@firma.de", app_method: "Email", cv_file: cv }), "");
});

test("the model can keep a row with the student but can never add one the code refused", async () => {
  const cv = tailored("zz_assign_cv2.docx");
  const rows = [
    { ...base, id: "plain", company: "A", position: "Praktikum", contact_email: "hr@a.de", app_method: "Email", cv_file: cv },
    { ...base, id: "portfolio", company: "B", position: "Praktikum", job_url: "https://b.de/job", cv_file: cv, notes: "Please attach a portfolio" },
    { ...base, id: "nolink", company: "C", position: "Praktikum" },
    { ...base, id: "untailored", company: "D", position: "Praktikum", job_url: "https://d.de/job" },
    { ...base, id: "silent", company: "E", position: "Praktikum", job_url: "https://e.de/job", cv_file: cv },
    { ...base, id: "already", applicant: "Assistant", company: "F", position: "Praktikum", job_url: "https://f.de/job", cv_file: cv },
    { ...base, id: "unfiltered", company: "G", position: "Praktikum", job_url: "https://g.de/job", cv_file: cv },
  ];
  const calls = [];
  const chat = async (input) => {
    calls.push(input);
    return { decisions: [
      { id: "plain", who: "Assistant", reason: "Standard application by e-mail." },
      { id: "portfolio", who: "Me", reason: "The advert asks for a portfolio." },
      { id: "nolink", who: "Assistant", reason: "Looks fine." }, // refused by code, so never counted
      { id: "untailored", who: "Assistant", reason: "Looks fine." },
    ] }; // nothing for "silent"
  };
  const ids = ["plain", "portfolio", "nolink", "untailored", "silent", "already"]; // not "unfiltered"
  const { assign, keep } = await decideApplicants(rows, ids, { chat });

  assert.deepEqual(assign.map((a) => a.id), ["plain"]);
  assert.deepEqual(keep.map((k) => k.id).sort(), ["nolink", "portfolio", "silent", "untailored"]);
  assert.equal(calls.length, 1);
  const asked = JSON.parse(calls[0].user.replace("JOBS:\n", "")).map((j) => j.id);
  assert.deepEqual(asked.sort(), ["plain", "portfolio", "silent"]); // refused, already-assigned and unfiltered rows never reach the model
  assert.match(calls[0].system, /untrusted/);
  assert.match(keep.find((k) => k.id === "silent").reason, /stays with you/);

  const updated = applyAssignments(rows, assign);
  assert.equal(updated.find((r) => r.id === "plain").applicant, "Assistant");
  assert.match(updated.find((r) => r.id === "plain").notes, /Applicant set to Assistant: Standard application/);
  assert.equal(updated.filter((r) => r.applicant === "Assistant").length, 2); // "plain" plus the one that already was
  assert.equal(rows.find((r) => r.id === "plain").applicant, "Me"); // input untouched
});

test("a model failure changes nothing", async () => {
  const cv = tailored("zz_assign_cv3.docx");
  const rows = [{ ...base, id: "x", company: "A", position: "P", contact_email: "hr@a.de", app_method: "Email", cv_file: cv }];
  await assert.rejects(decideApplicants(rows, ["x"], { chat: async () => { throw new Error("provider down"); } }), /provider down/);
});
