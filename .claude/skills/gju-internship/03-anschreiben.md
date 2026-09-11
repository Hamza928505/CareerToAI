# Writing the Anschreiben

The two-agent drafter–reviewer split is from ai-job-search (MIT). What it reviews
against is GJU's own Part 2 checklist, which is already written out on the home
page under "The cover letter" and in
`src/assets/gy-internships/application-process/praktikumsinfo2_anschreiben_en_neues_logo.pdf`.

Three worked samples sit in `src/assets/gy-internships/samples/cover-letter/`.
Read one before drafting — they are written for a GJU exchange student and carry
the exact phrasing German employers expect.

---

## Hard form rules (Part 2)

Non-negotiable. A letter that breaks one of these is wrong regardless of content.

- **One page.** Four to eight sentences of body text. Not more.
- Left-aligned, **not justified**. Real paragraphs.
- One font throughout, 11–12 pt, single line spacing.
- **No abbreviations anywhere.**
- Do not start sentence after sentence with `ich`.
- Same page header as the CV: name, address, phone, e-mail.
- Company block: company, contact person, department, street, postcode and city.
- **Bold subject line** carrying the job title, the reference number, where the
  advert was seen and its publication date.
- Personal salutation. `Sehr geehrte Frau Müller`, never
  `Sehr geehrte Damen und Herren` when a name can be found.
- Close with `Mit freundlichen Grüßen`, the current date, a scanned signature, and
  `Anlagen` beneath it.

## What the body must answer

1. Why this internship? What is genuinely interesting about it?
2. Which of the student's experiences are relevant?
3. Which characteristics describe them — with evidence for each?
4. What are their goals?
5. How do they meet the requirements the advert names?
6. Why them, and not someone else?

Open with something about *them*, not about you. `Hiermit bewerbe ich mich` is
the opening Part 2 explicitly tells you to avoid. `Sie suchen …` works. If the
student has already phoned, referring to that call is the strongest opening
available.

---

## Step 1 — DRAFTER

Write the letter. Sources: `data/profile.json`, `data/experience.json`,
`data/certificates.json`, and the fit evaluation from `02-fit-evaluation.md`.

State that the internship is a **`Pflichtpraktikum`** — a mandatory part of the
degree, at least 20 weeks — in the second paragraph. It answers the employer's
first three questions at once: why a student, how long, and why the paperwork is
straightforward.

## Step 2 — REVIEWER

A separate pass, reading the draft cold. Its job is to find fault, not to praise.
It checks, in this order:

**Factual grounding audit.** Every claim in the letter must trace to
`data/profile.json`, `data/experience.json` or `data/certificates.json`. A claim
that does not is removed — not softened, removed. This is deliberately strict and
it cannot tell an invention from a real fact the student mentioned in conversation
last week. That is why the standing rule in `SKILL.md` exists: confirmed facts get
written back to the data files in the same turn they surface.

**The Part 2 checklist**, item by item — all seventeen. The list is on the home
page under "Cover letter checklist" and is worth quoting back with each item
marked.

**Language.** If the advert is German, is the German correct and idiomatic? Flag
anything that reads as translated-from-English. Part 2 is blunt that the letter
should be checked by a German speaker — say so, and name the Project Office
(`interns@german-jordanian.org`) and the host university's Career Center.

**The copy-paste trap.** Is the company name right? Is the contact person right?
Is the subject line's reference number the one from *this* advert? Part 2 calls
this out specifically because it is the most common fatal error.

## Step 3 — DRAFTER revises

Apply the review. Then present the letter with a short note on what changed and
anything the reviewer flagged that the student has to resolve themselves — a fact
that needs confirming, a German check, a missing contact name.

---

## What not to do

- **Do not invent a contact person.** If the advert names none and the website
  gives none, tell the student to phone and ask. That call is a Part 3
  recommendation in its own right.
- **Do not repeat the CV.** Part 2 is explicit: briefly outline previous roles,
  then connect them to *this* advert's requirements.
- **Do not claim German you cannot back.** The profile's German level is a fact
  in the data. Part 4's advice is better anyway: saying your German is not perfect
  but improving is honest and lands well.
- **Do not exceed one page** to fit more in. Cut content instead.
