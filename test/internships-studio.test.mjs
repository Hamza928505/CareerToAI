import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  DEFAULT_INTERNSHIPS_DIR,
  detectAts,
  evaluatePostings,
  evaluateSinglePosting,
  findCityAddress,
  getStudioState,
  loadCityHousing,
  readInternshipsProfile,
  runAtsCheckOnPdf,
} from "../lib/internships-studio.mjs";

test("loadCityHousing loads 93 German cities and findCityAddress matches München / Heidelberg", () => {
  const cities = loadCityHousing(DEFAULT_INTERNSHIPS_DIR);
  assert.ok(cities.length >= 90, `Expected >= 90 cities, got ${cities.length}`);

  const munich = findCityAddress("München, Bayern", cities);
  assert.equal(munich.matched, true);
  assert.equal(munich.city, "München");
  assert.ok(munich.address.includes("München"));

  const heidelberg = findCityAddress("Walldorf / Heidelberg", cities);
  assert.equal(heidelberg.matched, true);
  assert.equal(heidelberg.city, "Heidelberg");
});

test("detectAts identifies Workday and SAP SuccessFactors manuals", () => {
  const workday = detectAts("https://nvidia.wd5.myworkdayjobs.com/de-DE/career", "NVIDIA");
  assert.equal(workday.name, "Workday");
  assert.equal(workday.manual, "Workday.md");

  const bmw = detectAts("https://bmwgroup.jobs/de", "BMW Group");
  assert.equal(bmw.name, "SAP SuccessFactors");
  assert.equal(bmw.manual, "SAP SuccessFactors.md");
});

test("evaluateSinglePosting applies GJU Rules 1-10 accurately", () => {
  const profile = readInternshipsProfile(DEFAULT_INTERNSHIPS_DIR);

  // 1. Likely Approved posting
  const approved = evaluateSinglePosting(
    {
      company: "Siemens AG",
      position: "Pflichtpraktikum AI & Software Engineering (m/w/d)",
      location: "München",
      text: `
        Wir suchen ab 01.03.2027 für 6 Monate in Vollzeit (38 Stunden/Woche) am Standort München
        einen Praktikanten (Pflichtpraktikum). Vor Ort im deutschsprachigen Engineering-Team.
        Aufgaben: Entwicklung von Machine Learning Modellen mit Python, PyTorch, Docker und SQL.
      `,
    },
    1,
    profile
  );
  assert.equal(approved.verdict, "LIKELY APPROVED");
  assert.equal(approved.shouldBuildDocs, true);
  assert.ok(approved.covered.some((s) => /python/i.test(s)));

  // 2. Likely Rejected (non-negotiable: Werkstudent + 100% remote)
  const rejected = evaluateSinglePosting(
    {
      company: "RemoteCorp",
      position: "Werkstudent Data Entry",
      location: "100% Remote",
      text: "Werkstudententätigkeit 15–20 Std/Woche, 100% Remote von zu Hause.",
    },
    2,
    profile
  );
  assert.equal(rejected.verdict, "LIKELY REJECTED");
  assert.equal(rejected.negotiable, false);
  assert.equal(rejected.shouldBuildDocs, false);

  // 3. Negotiable Fail (3 Monate duration, otherwise full-time on-site CS role)
  const negotiableFail = evaluateSinglePosting(
    {
      company: "SAP SE",
      position: "Praktikum Python Backend Development",
      location: "Heidelberg",
      text: "Praktikum für 3 Monate in Vollzeit (40 Std./Woche) vor Ort in Heidelberg. Python, SQL, Git.",
    },
    3,
    profile
  );
  assert.equal(negotiableFail.verdict, "LIKELY REJECTED");
  assert.equal(negotiableFail.negotiable, true);
  assert.equal(negotiableFail.shouldBuildDocs, true);
  assert.match(negotiableFail.email.body, /20 Wochen|6 Monate/);
});

test("evaluatePostings sorts overview table by Verdict then Fit", () => {
  const res = evaluatePostings({
    postings: [
      {
        company: "RemoteOnly",
        position: "Werkstudent",
        location: "100% Remote",
        text: "Werkstudent 15–20 Std/Woche 100% remote",
      },
      {
        company: "BMW Group",
        position: "Pflichtpraktikum AI / Python (m/w/d)",
        location: "München",
        text: "Pflichtpraktikum 6 Monate Vollzeit 38h/Woche vor Ort in München ab 01.03.2027 auf Deutsch. Python, PyTorch, Docker, SQL, Git.",
      },
    ],
  });
  assert.equal(res.overview.length, 2);
  assert.equal(res.overview[0].company, "BMW Group");
  assert.equal(res.overview[0].verdict, "LIKELY APPROVED");
  assert.equal(res.overview[1].company, "RemoteOnly");
  assert.equal(res.overview[1].verdict, "LIKELY REJECTED");
});

test("getStudioState and runAtsCheckOnPdf inspect Desktop\\Internships", async () => {
  const state = getStudioState();
  assert.equal(state.exists, true);
  assert.ok(state.cvs.length >= 10, "Expected existing tailored CVs in CVs/");
  assert.ok(state.templates.some((t) => t.slot === "cv_de" && t.present));
  assert.ok(state.templates.some((t) => t.slot === "cl_de" && t.present));

  const samplePdf = path.join(DEFAULT_INTERNSHIPS_DIR, "Input Data", "Lebenslauf_Hamza_Salameh_DE.pdf");
  const ats = await runAtsCheckOnPdf({ pdfPath: samplePdf, keywords: ["Python", "Docker"] });
  assert.equal(ats.ok, true);
  assert.equal(ats.fails, 0);
  assert.ok(ats.reportMd.includes("Summary:"));
});
