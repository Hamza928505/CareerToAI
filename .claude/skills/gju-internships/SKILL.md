---
name: gju-internships
description: Find German Year internships on Indeed for a GJU major and check each one against the GJU internship rules (at least 20 weeks, full time, an allowed host and country), or check one internship advert the user pastes, links or names by Indeed job id. Saves the results as a .json file the German Year Kit website loads. Use when a GJU student asks to find, search, check, validate or vet an internship in Germany, including from a scheduled Cowork task.
---

# GJU internships: search Indeed and check against the GJU rules

The rules come from the German Year Manual §4.2–4.3 (Deans' Council decision 2015/46) and the GJU Praktikumsrichtlinien
(September 2021), both in `docs/rules-and-regulations/`. The plain-English version is the "Rules and edge cases"
section of `index.html`. Read the numbers from `data/rules.json` (the website uses the same file): `minWeeks`,
`maxRecognisedMonths`, `minMonthlySalary`, `approvedCountries`.

Without this folder open (a Claude Cowork task, a scheduled run), read the same files from the website:
`https://hamza928505.github.io/GJUYearKit/data/rules.json` and `https://hamza928505.github.io/GJUYearKit/board/majors.json`.

In a **scheduled run** nobody is there to answer: take the major and the place from the task's instructions, never ask,
stop at 12 adverts in step 2, and always finish with step 5. If the major is missing, say so in the report and save no file.

## 1. What you need from the student

Ask once, only for what is missing:
- **Major**: one of the GJU programmes in `board/majors.json` (needed to search, not to check one advert).
- **Where**: a city, or nowhere in particular (then use `Deutschland`).
- Optional: their German level, and the month they plan to start.

## 2. Search (skip when the student gives you one advert to check)

Needs the Indeed connector (`search_jobs`, `get_job_details`). If those tools are missing, say so: the student connects
Indeed in Claude's settings under Connectors. Until then, offer to check adverts they paste.

- From the major's entry in `board/majors.json`, take 2–3 `de` keywords and 1–2 `en` keywords. Search
  `Praktikum <de keyword>` and `Internship <en keyword>` with `country_code` `DE` and `location` the city or `Deutschland`.
- Leave `job_type` empty: Indeed's internship filter misses many German adverts.
- Each search returns up to 10 jobs. Drop duplicates (same company and title).
- Set aside, by title, what can never be the GJU internship, and list them in one "Skipped" line with the reason:
  Werkstudent / working student (part time), Abschlussarbeit / Bachelorarbeit / Masterarbeit / thesis on its own (a
  thesis, not the internship), Ausbildung and Duales Studium (training programmes), Schülerpraktikum (for school
  pupils), Vorpraktikum and Grundpraktikum (for people about to start university), Trainee and graduate jobs. Keep titles that combine Praktikum with one of these ("Praktikum / Abschlussarbeit",
  "Praktikant / Werkstudent"): the advert decides.
- Call `get_job_details` for the rest, up to 12. Ask before fetching more.

## 3. Check each advert

Read the whole description. For every fact, quote the advert's own words, or write **not stated**. Never take a value
from Indeed's "Job Type" or "Compensation" fields or from the title alone: they are often wrong (6-month full-time
internships show up as "Permanent" or "Part-time"). When Indeed's "Company" is empty, take the employer's name from
the advert text.

| Rule | Meets | Needs checking | Does not meet |
|---|---|---|---|
| **Duration**, at least `minWeeks` (20) weeks. Months × 52/12 = weeks, so 5 months is enough and 4 is not. | The stated minimum is 20 weeks or more | Not stated; a range across 20 weeks ("3–6 Monate", "mindestens 4 Monate"); "nach Absprache" | The stated maximum is under 20 weeks |
| **Full time** (Vollzeit) | "Vollzeit", "full-time", 35 hours a week or more | Not stated; 31–34 hours | Teilzeit, part-time, Werkstudent, 30 hours or less |
| **Host**: an industry, company or institution | A company, or an institution such as Fraunhofer, DLR or Max Planck | A university lab or chair (Lehrstuhl): needs a serious link to the study programme plus the Exchange Coordinator's and Dean's approval | — |
| **Country** | Germany (preferred); Austria, Switzerland, Luxembourg (approved easily) | German company elsewhere in Europe (Dean's approval); non-German company in a non-German-speaking European country (President's approval); German company outside Europe (Deans' Council and President); remote or home office | Anything else: generally not approved |

**Verdict**: *Meets the rules* when all four rules meet. *Does not meet* when any rule does not meet. Otherwise
*Needs checking*.

Add these as information. They never change the verdict:
- **Your major**: quote the "Studium der …" / "studying …" line. Say whether it fits, is unclear, or is another field.
- **Start**: quote it. The internship belongs in the second semester of the exchange year; another time needs the
  Dean's approval. Compare it with the planned start if the student gave one.
- **Languages**: quote the German and English requirements. Compare them with the student's level if given.
- **Pay**: quote it, or not stated. GJU sets no minimum pay. Only for a student who will stay past their visa: a salary
  of at least `minMonthlySalary` (861 €) a month counts as proof of funds for the extension.
- **Longer than `maxRecognisedMonths` (6) months**: fine, but only 6 months are recognised, and the residence permit
  must cover the stay.
- **Posted** more than 8 weeks ago: it may be filled. Say to check that it is still open.

## 4. Report

1. One line: the searches you ran, the location, and how many were found, skipped and checked.
2. A table, *Meets the rules* first, then *Needs checking*, then *Does not meet*:
   Internship (the title as a link to its Indeed URL, exactly as the tool returned it) | Company | City | Verdict | Why, in one line.
3. For each *Meets* and *Needs checking*: the four rule lines with their quotes, the information lines, and what to ask
   the company about anything not stated.
4. End with: this reads the advert only and is not GJU's approval. Before accepting, send the company details and the
   contract to your Exchange Coordinator at GJU, cc the Office for Industrial Links (Manual §4.2, point 7). Confirm on the
   original posting that it is still open.

## 5. Save (when searching, or when the student asks for the file)

Save the checked adverts as `gju-internships-YYYY-MM-DD.json` (the run's date), next to the report. The student loads it
into "Your Indeed results" at <https://hamza928505.github.io/GJUYearKit/search.html>, which reads exactly this shape:

```json
{
  "kind": "gju-internships", "version": 1,
  "runAt": "2026-10-21T08:00:00+02:00",
  "query": { "major": "Computer Engineering", "location": "Berlin" },
  "internships": [{
    "id": "the Indeed job key", "title": "", "url": "", "company": "", "city": "", "country": "Germany",
    "posted": "2026-10-19", "verdict": "meets", "why": "the one line from the table",
    "checks": [{ "rule": "Duration", "state": "ok", "quote": "6 Monate" }],
    "notes": [{ "label": "Pay", "text": "not stated" }]
  }]
}
```

- One entry per checked advert (not the skipped ones). `id` is Indeed's job key, so the same advert keeps its id from run
  to run. `url` is the Indeed link exactly as the tool returned it.
- `verdict`: `meets`, `check` or `fails` (Meets the rules, Needs checking, Does not meet).
- `checks`: the four rules of step 3 in order (Duration, Full time, Host, Country). `state` is `ok` (meets), `warn`
  (needs checking) or `bad` (does not meet), and `quote` is the advert's own words, or `not stated`.
- `notes`: the information lines (Your major, Start, Languages, Pay, Longer than 6 months, Posted), each with its quote
  or `not stated`. Leave out a line that does not apply.
- `posted` is `YYYY-MM-DD`, or `""` when the advert has no date. `runAt` is the time of the run with its offset.

## Checking one advert

The student pastes the text, gives an Indeed job id (`get_job_details`) or a link (fetch it; if that fails, ask them
to paste the text). Run step 3 and report it as a one-row table with the details below it.

## Never

- Fill in a value the advert does not state.
- Present a verdict as approval: only the Exchange Coordinator, the Dean or the President approve.
- Apply, or contact a company, for the student.
