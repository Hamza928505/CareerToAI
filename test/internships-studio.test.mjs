import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  DEFAULT_INTERNSHIPS_DIR,
  detectAts,
  evaluatePostings,
  evaluateSinglePosting,
  evaluateWithCity,
  findCityAddress,
  getStudioState,
  loadCityHousing,
  readInternshipsProfile,
  runAtsCheckOnPdf,
  tailorChoices,
  tailorModel,
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

test("evaluateWithCity lets the AI pick the housing city when the advert names a city the typed field does not", async () => {
  const housing = loadCityHousing(DEFAULT_INTERNSHIPS_DIR);
  const profile = readInternshipsProfile(DEFAULT_INTERNSHIPS_DIR);
  const settings = { matchCityAddress: true, preferredDuration: "6 Monate", earliestStart: "01.03.2027", latestEnd: "30.09.2027" };
  const raw = { company: "ACME", position: "Pflichtpraktikum Software", text: "Pflichtpraktikum 6 Monate Vollzeit in unserem Büro in Eschborn." };
  const asked = [];
  const chat = async (args) => { asked.push(args); return { city: "Eschborn", housingCity: "Frankfurt am Main" }; };

  const res = await evaluateWithCity(raw, 1, profile, settings, housing, chat);
  assert.equal(res.location, "Eschborn");
  assert.equal(res.cityAddress.matched, true);
  assert.equal(res.cityAddress.city, "Frankfurt am Main");
  assert.match(res.contractWording, /Arbeitsort: Eschborn/);
  assert.deepEqual(JSON.parse(asked[0].user).CITIES.includes("Frankfurt am Main"), true);

  // A typed city that already matches never reaches the AI.
  asked.length = 0;
  const typed = await evaluateWithCity({ ...raw, location: "München" }, 1, profile, settings, housing, chat);
  assert.equal(typed.cityAddress.city, "München");
  assert.equal(asked.length, 0);

  // A made-up housing city, an empty answer or a failing AI leaves the Deggendorf address.
  for (const reply of [async () => ({ city: "", housingCity: "Atlantis" }), async () => { throw new Error("no provider"); }]) {
    const kept = await evaluateWithCity(raw, 1, profile, settings, housing, reply);
    assert.equal(kept.cityAddress.matched, false);
    assert.equal(kept.cityAddress.city, "Deggendorf");
  }
});

test("evaluatePostings gives every posting its own city address", async () => {
  const cities = { "Büro in Eschborn": { city: "Eschborn", housingCity: "Frankfurt am Main" }, "Büro in Wolfsburg": { city: "Wolfsburg", housingCity: "Wolfsburg" } };
  const chat = async ({ user }) => cities[Object.keys(cities).find((key) => JSON.parse(user).ADVERT.includes(key))];
  const res = await evaluatePostings({
    settings: { matchCityAddress: true, preferredDuration: "6 Monate", earliestStart: "01.03.2027", latestEnd: "30.09.2027" },
    chat,
    postings: [
      { company: "A", position: "Pflichtpraktikum", text: "Pflichtpraktikum 6 Monate Vollzeit, Büro in Eschborn." },
      { company: "B", position: "Pflichtpraktikum", text: "Pflichtpraktikum 6 Monate Vollzeit, Büro in Wolfsburg." },
    ],
  });
  assert.deepEqual(res.evaluated.map((e) => e.cityAddress.city), ["Frankfurt am Main", "Wolfsburg"]);
});

test("evaluatePostings sorts overview table by Verdict then Fit", async () => {
  const res = await evaluatePostings({
    chat: async () => ({ city: "", housingCity: "" }),
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

test("tailorModel: Opus by default, any provider by name with its own key, whatever LLM_PROVIDER says", () => {
  assert.deepEqual(tailorModel(undefined).config, { provider: "claude", model: "opus" });
  assert.deepEqual(tailorModel("rm -rf").config, { provider: "claude", model: "opus" }, "an unknown choice is Opus, never passed on");
  assert.equal(tailorModel("__proto__").choice, "opus");
  assert.deepEqual(tailorModel("sonnet").config, { provider: "claude", model: "sonnet" });
  assert.equal(tailorModel("haiku").label, "Claude Haiku");
  const env = { LLM_PROVIDER: "nvidia", NVIDIA_API_KEY: "nv-key", LLM_MODEL: "nvidia/some-model", OPENROUTER_API_KEY: "or-key" };
  assert.equal(tailorModel("nvidia", env).config.model, "nvidia/some-model", "the provider in use keeps its model");
  assert.equal(tailorModel("openrouter", env).config.provider, "openrouter", "another provider is used by name, not LLM_PROVIDER");
  assert.notEqual(tailorModel("openrouter", env).config.model, "nvidia/some-model", "LLM_MODEL belongs to the chosen provider only");
  assert.equal(tailorModel("gemini", env).config, null, "no key, no config");
  const choices = tailorChoices(env);
  assert.deepEqual(choices.filter((c) => c.ready).map((c) => c.id), ["opus", "sonnet", "haiku", "nvidia", "openrouter", "ollama"]);
  assert.ok(!JSON.stringify(choices).includes("-key"), "the picker's list never carries a key");
});
