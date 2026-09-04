# Fit evaluation

Scores a posting **only after** `01-eligibility.md` returns PASS or NEEDS APPROVAL.

The five dimensions and their weights are deliberately identical to the Fit %
formula in `internship-tracker.xlsx`, so the spreadsheet and this workflow can
never disagree about the same posting. If you change one, change the other:
the formula is built in `scripts/make-internship-tracker.mjs` (`SCORE`).

| Dimension | Max | Rule |
|---|---|---|
| Skills matched | 40 | The share of the skills the advert names that the student actually has. All of them → 40, proportionally less otherwise. |
| Duration | 20 | 20 weeks or more → 20. 15–19 → 10. Under 15 → 0. |
| Country | 15 | Germany 15. Austria / Switzerland / Luxembourg 12. Anywhere else 5. |
| Paid | 15 | Paid and ≥ 861 €/month → 15. Paid but less → 10. Unknown → 5. Unpaid → 0. |
| Language | 10 | English or bilingual → 10. German-only → 10 if the student's German is B2+, else 5. |

## Matching skills honestly

Read the student's skills from `data/profile.json`, every entry in
`data/experience.json`, and every entry in `data/certificates.json`. That union is
the whole claim — nothing else counts.

Match **whole words**, the same rule the sheet uses: normalise punctuation to
spaces on both sides and require the skill to appear as a token. The skill `R`
matches "Statistics with R" and must not match every advert containing the letter
r. `CI/CD` in the profile must still meet `CI/CD-Pipeline` in an advert.

Three failure modes to avoid:

- **Do not credit a near-miss.** `SolidWorks` is not `CATIA`. `ASP.NET Core` is
  not `ASP.NET MVC`. Say "adjacent, not held" and leave it out of the count.
- **Do not credit the study programme as a skill.** Being enrolled in mechanical
  engineering is not the same as having `Finite Element Analysis (FEA)`.
- **Do count the German ones.** If the advert says `Zerspanungstechnik` and the
  profile says `Zerspanungstechnik`, that is a match. Adverts are matched in their
  own language.

When the advert asks for something genuinely close to what the student has, say so
in prose under the table. That is where a cover letter finds its argument — but it
is not a point.

## Reporting

```
Fit: 74 / 100

  Skills      28/40   6 of the 9 named: SolidWorks, AutoCAD, GD&T, …
                      missing: CATIA, ANSYS, Pneumatik
  Duration    20/20   24 weeks, stated in the advert
  Country     15/15   Stuttgart, Germany
  Paid        10/15   650 €/month — below the 861 € visa threshold
  Language     5/10   German-only; profile says B1

Adjacent, not counted: Autodesk Inventor (they ask for CATIA — same class of tool)
```

Then the verdict, in one sentence, and what would move it: usually one question to
the employer (duration, pay) or one skill worth naming in the letter.

## Whether to phone first

Part 3 is explicit that a call before a speculative application is worth it, and
that a first call gives the letter a far better opening than `Hiermit bewerbe ich
mich`. Recommend calling when:

- the advert names no contact person (you need one for the salutation),
- duration or pay is unstated and it changes the verdict,
- it is a speculative application with no posted vacancy.

Give the student three questions to ask, not a script, and remind them Part 4's
advice: name clearly, be short, get off the line.

## What this does not do

It does not rank against other postings — the tracker's sortable Fit % column does
that. It does not decide. A high score is not permission to apply: the gate is.
