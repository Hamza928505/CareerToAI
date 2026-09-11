# Skill gaps and what to learn next

Adapted from `/upskill` in ai-job-search (MIT). Same idea — compare the postings
you tracked against your own profile and turn the difference into a study plan —
rewired onto the data this project already keeps.

Both read the same CSV now: `data/tracker.csv`. This one leans on its `Skills they
ask for` column, the same column `npm run skills:harvest` feeds into the editor's
suggestions. So the gap analysis and the skill suggestions come from one source of
truth: the adverts you actually applied to.

## Inputs

| Source | Role |
|---|---|
| `data/tracker.csv` | The demand side. Every `Skills they ask for` cell, with its row Fit % and Status |
| `data/profile.json`, `data/experience.json`, `data/certificates.json` | The supply side — everything you can honestly claim |
| `data/skill-pool.json` | Already-harvested advert skills, if `npm run skills:harvest` has run |
| `data/skill-taxonomy.json` | ESCO, for the German label of a gap and for related skills |

Two modes:

- **Aggregate** — no argument. Every row in the tracker.
- **Targeted** — a posting URL or pasted text. One advert, for interview prep or
  a decision on whether to apply.

## Method

1. **Collect demand.** Split each `Skills they ask for` cell the way
   `scripts/harvest-tracker-skills.mjs` does: a comma or newline list splits on
   separators; prose is matched against the library instead of chopped up. Count
   how many adverts name each skill.
2. **Collect supply.** The union of profile, experience and certificate skills.
   Whole-word matching, same rule as everywhere else — `R` is not every word with
   an r in it.
3. **Subtract.** A gap is a skill named by adverts and absent from the profile.
4. **Weight by demand, not by ease.** Rank gaps by how many adverts asked for
   them, then by whether those adverts scored well on Fit % — a skill blocking
   three 80-point postings matters more than one appearing in a single 40.

## Report

```
Demand across 23 tracked adverts

  HAVE                          adverts   Fit % of those adverts
    SolidWorks                     11      avg 71
    AutoCAD                         9      avg 68
    Technisches Zeichnen            6      avg 74

  GAP                           adverts   avg Fit %   German label (ESCO)
    CATIA                           8       74        CATIA
    SPS-Programmierung              5       81        PLC-Programmierung
    Pneumatik                       4       66        Pneumatik
```

Then the plan: **three gaps at most**, in study order, each with why it is first,
roughly how long, and one or two concrete resources found by search. Prefer free
and German-language where the adverts are German — learning the term in German is
half the value, because that is the word the advert uses.

## Rules

- **Never add a gap to the profile.** This report says what to learn, not what you
  know. Only the student, through `/editor/`, adds a skill they actually have.
- **Say when there is no gap.** If the adverts ask for what the student already
  has and the Fit % is still low, the problem is duration, country, pay or
  language — not skills. Say so and point at the tracker's Check column.
- **Fewer than five tracked adverts is not a dataset.** Say the sample is too
  small and suggest tracking more before drawing conclusions.
- Two weeks before an internship starts is not the moment to learn a new CAD
  package. Recommend what fits the time actually available.

## Afterwards

If the student picks up a gap skill, it goes in the profile through `/editor/` —
then `npm run tracker` recomputes every Fit % in the workbook against the new
skill set. That is the loop closing: adverts → gaps → learning → profile → better scores.
