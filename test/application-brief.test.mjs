import assert from "node:assert/strict";
import test from "node:test";

import { formatBrief } from "../lib/application-brief.mjs";

const settings = { docLang: "de", earliestStart: "01.03.2027", latestEnd: "30.09.2027", preferredDuration: "6 Monate", matchCityAddress: true };
const advert = "Aufgaben: Python und Docker. ".repeat(400); // far beyond the 6,000 characters the app sends to the model
const posting = {
  company: "Acme GmbH", title: "Praktikum KI", location: "Berlin", ref: "K-1", url: "https://acme.example/job", postingLang: "de",
  verdict: "LIKELY APPROVED", verdictReason: "All hard GJU requirements are satisfied.", fit: "High", covered: ["Python"], gaps: ["Kubernetes"],
  rules: [{ rule: "1. Duration", status: "Pass", evidence: "6 Monate" }], cityAddress: { matched: true, city: "Berlin", address: "Musterstr. 1, 10115 Berlin" },
  rawText: advert,
};

test("brief holds the profile, both base documents, the whole advert and the gaps", () => {
  const out = formatBrief({ date: "2026-11-14", settings, profile: { source: "student.json", skills: ["Python"] }, base: { cv: ["Kurzprofil", "Python"], cl: ["Sehr geehrte Damen und Herren,"] }, postings: [posting] });
  for (const part of ["APPLICATION 1 OF 1: Acme GmbH", "\"source\": \"student.json\"", "Kurzprofil", "Sehr geehrte Damen", "Gaps, never claim: Kubernetes", "Musterstr. 1", "1. Duration: Pass"]) assert.ok(out.includes(part), part);
  assert.ok(out.includes(advert.trim()), "the advert is not cut");
  assert.ok(!/undefined|\[object Object\]/.test(out));
});

test("brief shows the ATS assessment instead of the plain skill lists, and says when a base document is missing", () => {
  const assessment = { ats: "Greenhouse", language: "de", score: { total: 62 }, requirements: [{ status: "MET", kind: "must", requirement: "Python", term: "Python", evidence: "Umniah", wording: "Python-Entwicklung" }, { status: "GAP", kind: "nice", requirement: "Kubernetes", term: "Kubernetes" }], gaps: [{ term: "Kubernetes" }], weakAreas: [], recommendations: [{ action: "Name Docker", why: "must-have" }], knockouts: [{ question: "Visa?", answer: "Pflichtpraktikum" }] };
  const out = formatBrief({ date: "2026-11-14", settings: { ...settings, docLang: "en" }, profile: {}, base: { cv: null, cl: null }, postings: [{ ...posting, assessment }] });
  assert.ok(out.includes("Terms to use (the profile supports them): Python"));
  assert.ok(out.includes("Gaps, never claim: Kubernetes") && out.includes("Score: 62"));
  assert.ok(!out.includes("Profile skills the advert asks for"));
  assert.ok(out.includes("CV_Hamza_Salameh_EN.docx was not found"));
});
