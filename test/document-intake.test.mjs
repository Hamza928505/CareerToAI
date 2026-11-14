import assert from "node:assert/strict";
import test from "node:test";

import { ground, researchCredential } from "../lib/document-intake.mjs";

const proposal = (over = {}) => ({
  kind: "certificate", title: "Docker Fundamentals", organization: "Example Academy", location: "", startDate: "", endDate: "2025-06-01",
  credentialId: "ABC-123", credentialUrl: "javascript:alert(1)", level: "", description: "Covers containers.",
  skillsStated: ["Docker", "Kubernetes"], skillsSuggested: ["DevOps"], quotes: ["has completed Docker Fundamentals", "a line that is not there"], uncertain: ["endDate", "the scan is blurry"], ...over,
});
const analysis = (proposals) => ({ documentType: "certificate", language: "English", summary: "A certificate.", extractedText: "", keywords: ["Docker"], proposals });
const TEXT = "Example Academy certifies that Max has completed Docker Fundamentals on 1 June 2025. Credential ABC-123. Topics: Docker, images, volumes.";

test("a skill counts as in the document only when the document's own text names it", () => {
  const [p] = ground(analysis([proposal()]), TEXT).proposals;
  assert.deepEqual(p.skills, [{ name: "Docker", origin: "document" }, { name: "Kubernetes", origin: "suggestion" }, { name: "DevOps", origin: "suggestion" }]);
  // A quote that is not in the text is dropped; only field names count as "check this"; an address that is not http(s) is dropped.
  assert.deepEqual(p.quotes, ["has completed Docker Fundamentals"]);
  assert.deepEqual(p.check, ["endDate"]);
  assert.equal(p.credentialUrl, "");
});

test("a title or issuer that is not in the text is flagged for the student, not passed as read", () => {
  const result = ground(analysis([proposal({ title: "Advanced Kubernetes", organization: "Other School", credentialId: "" })]), TEXT);
  assert.deepEqual(result.proposals[0].check.sort(), ["endDate", "organization", "title"]);
  assert.equal(result.textTrusted, true);
});

test("a picture has no text code can read: nothing is marked as checked, and the page is told", () => {
  const result = ground(analysis([proposal()]), "", { trusted: false });
  assert.equal(result.textTrusted, false);
  assert.ok(result.proposals[0].skills.every((skill) => skill.origin === "suggestion"));
});

test("research keeps only sources the model used, puts the issuer's own site first, and gives up quietly", async () => {
  const env = { TAVILY_API_KEY: "t", LLM_PROVIDER: "ollama" };
  const fetchImpl = async () => ({ ok: true, json: async () => ({ results: [
    { title: "A blog", url: "https://someblog.net/docker", content: "Some blog text." },
    { title: "Docker Fundamentals", url: "https://www.example-academy.com/courses/docker", content: "Covers images, volumes and networking." },
  ] }) });
  const chat = async ({ user }) => {
    assert.match(user, /1\. \[official\] Docker Fundamentals/); // the issuer's own page is ranked first
    return { description: "Covers images, volumes and networking.", skills: ["Docker networking"], keywords: [], used: [1, 7] };
  };
  const found = await researchCredential({ title: "Docker Fundamentals", organization: "Example Academy" }, { env, fetchImpl, chat });
  assert.deepEqual(found.sources, [{ title: "Docker Fundamentals", url: "https://www.example-academy.com/courses/docker", official: true }]);
  assert.equal(await researchCredential({ title: "X", organization: "Y" }, { env, fetchImpl: async () => { throw new Error("offline"); }, chat }), null);
  assert.equal(await researchCredential({ title: "X", organization: "Y" }, { env: {}, fetchImpl, chat }), null); // no AI provider: nothing is looked up
});
