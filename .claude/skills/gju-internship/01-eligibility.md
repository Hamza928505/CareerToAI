# Eligibility gate — run before scoring, always

Adapted from the eligibility gate in ai-job-search (MIT). The insight is his: work
rights are a **hard filter, not a scoring dimension**, and a posting that is silent
about them has not granted anything.

Two different questions, easy to conflate:

- **Permission** — may this student hold this placement at all? Visa, residence
  permit, the employer's own rules.
- **Recognition** — will GJU count it towards the German Year? Duration, country,
  who has to approve it.

A placement can pass one and fail the other. Both are hard stops, and neither is
worth a single point of Fit %.

---

## Part 1 — Permission

The student is a GJU exchange student in Germany on a national student visa, with
a `Bestätigung Pflichtpraktikum` from the International Office. That confirmation
is what makes a mandatory internship lawful beyond the normal student work limit.

Read the posting's requirements section **verbatim** and classify:

| Posting wording | Verdict |
|---|---|
| Requires German or EU **citizenship**, permanent residency, or an unrestricted work permit | **FAIL — hard stop.** Quote the wording back to the student. Do not score, do not draft. |
| Requires a **security clearance** (`Sicherheitsüberprüfung`), or is defence, nuclear, or critical infrastructure | **FAIL** in most cases — normally gated on citizenship. Verify the specific scheme rather than assuming. |
| Explicitly welcomes international students, names `Pflichtpraktikum`, or says `Praktikum im Rahmen des Studiums` | **PASS** — and say so in the letter, it removes the employer's main worry. |
| Says `Werkstudent` rather than `Praktikum` | **CHECK.** A Werkstudent contract is not a `Pflichtpraktikum` and may not be recognised. Confirm with the Exchange Coordinator before applying. |
| **Silent** on nationality and work rights | **PROCEED, marked unverified.** Check the employer's careers page before drafting. |

**Silence is not permission.** Large graduate and `Praktikanten` programmes at
banks, insurers, public bodies and anything touching critical infrastructure
routinely gate eligibility on their own site rather than in the advert.

**A company-wide "we welcome international applicants" line is not role-level
permission.** The common pattern is a general welcome followed by a named list of
the programmes it covers. Confirm this specific posting appears on that list.

---

## Part 2 — Recognition by GJU

Sources: German Year Manual §4, `GJU-Praktikumsrichtlinien`, Decision 2015/46 —
all in `src/assets/gy-internships/rules-and-regulations/`.

| Check | Rule | If it fails |
|---|---|---|
| **Duration** | 20 weeks minimum, full time. Up to 6 months recognised. | Under 20 weeks does not satisfy the requirement on its own. Do not treat "we could extend" as duration; get it in the contract. |
| **Country** | Germany preferred; Austria, Switzerland, Luxembourg approved easily. | German company elsewhere in Europe → Dean. Non-German company elsewhere in Europe → President. German company outside Europe → Deans' Council **and** President. Anything else → generally not approved. |
| **Employer type** | Industry, company or institution. | A university laboratory or similar needs a genuine link to the study programme **plus** explicit Exchange Coordinator and Dean approval. |
| **Timing** | The internship semester, after the study semester. | Any other timing needs the Dean's formal approval. |
| **Parallel study** | No GJU courses during the internship semester. | Only a resit exam for a course already taken and failed. |

Flag, do not fail, when the posting is silent on duration — most adverts are.
Duration is the first thing to ask the employer about, and the answer decides
whether the rest of the process is worth anything.

---

## Part 3 — Practical stops worth catching early

- **Unpaid.** Not disqualifying, and common for a `Pflichtpraktikum` — German
  minimum-wage law exempts mandatory internships. But budget 700–1,000 €/month,
  and if the placement will run past the visa, an extension needs proof of at
  least **861 €/month** or a refilled blocked account.
- **Start date past the semester end.** If it runs 1–2 months over, that is a
  `Fiktionsbescheinigung`; more than three months means full enrolment for another
  semester. Both are in `src/index.njk` under "Staying longer than planned".
- **Location with no housing.** Ask the company; many help. Dorms run 200–500 €/month
  and often want a two-month deposit.

---

## Output of this gate

Report, in this order, before any score:

```
Permission:  PASS | FAIL | UNVERIFIED   — with the posting's own wording quoted
Recognition: PASS | NEEDS APPROVAL | FAIL — naming who has to approve it
Flags:       duration unknown · unpaid · runs past the visa · …
```

On a **FAIL**, stop there. Say which rule it breaks and cite the document. Do not
soften it into a low score, and do not draft an application the student cannot
lawfully take or GJU will not count.
