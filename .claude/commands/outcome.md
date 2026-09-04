# /outcome — record what happened, and learn from it

`$ARGUMENTS`: the company, and what happened. `/outcome Beispiel GmbH rejected`,
`/outcome Muster AG interview on 14 March`, `/outcome Technik Werke accepted`.

Adapted from `/outcome` in ai-job-search (MIT). The reason it exists: a rejection
you do not record teaches you nothing, and Part 3 says explicitly to find out why
you were rejected, because it makes the next application better.

## Step 1 — Update the row

Find the row in sheet `Search` of `internship-tracker.xlsx` by company name. If
there is no row, say so and stop — do not create one from a bare company name.

Set what the outcome implies:

| Outcome | Set |
|---|---|
| Sent | `Sent` = today. The sheet computes `Follow up due` itself |
| Followed up | `Followed up` = today |
| Reply received | `Answer` = Yes or No |
| Interview scheduled | `Interview` = the date, Status = `Interview` |
| Offer | Status = `Offer` |
| Accepted | Status = `Accepted` |
| Rejected | Status = `Rejected`, `Answer` = No |
| Withdrawn | Status = `Withdrawn`, with the reason in Notes |

Never run `npm run tracker` — it rewrites the workbook and discards rows.

## Step 2 — On a rejection, ask what it teaches

Not therapy, and not a post-mortem on one data point. Look at the row against the
rest of the sheet and say only what the data supports:

- Was the Fit % low? Then the row was honest and the outcome expected.
- Was it high? Then the score is not the reason — check the Check column, the
  timing, or whether it was a speculative application with no vacancy.
- Was there no reply at all, rather than a rejection? That is a different failure:
  either the application never arrived, or it was never read. Part 3's answer is
  to call — and to send more.
- Are three or more rejections showing the same missing skill? That is a `/upskill`
  finding, not a coincidence. Say so and point at `06-upskill.md`.

Then suggest asking the employer why. Part 3 recommends it and it is a short,
polite mail. Offer to draft it.

## Step 3 — On an acceptance, stop everything else

The moment a placement is accepted, four things happen before anything else, and
they are on the Checklist sheet already:

1. Tell the Office for Industrial Links — `oil@gju.edu.jo`
2. Tell the Project Office in Magdeburg — `interns@german-jordanian.org`
3. Send the company details and the contract to your Exchange Coordinator for
   approval (cc the Office for Industrial Links)
4. Cancel your other interviews — by phone if you can

Then check the contract is not shorter than **20 weeks**, and that you stay
enrolled at your host university for the second semester. Your visa and work
permit depend on that enrolment.

Offer to draft the cancellation mail. Part 3 has the German wording for it.

## Step 4 — Write back anything new

If the outcome surfaced a fact about the student — a skill an interviewer probed
that they do have, a project they described — it goes into the profile through
`/editor/` in the same turn. The standing rule in `SKILL.md` applies: a fact that
lives only in this conversation is gone by the next draft.
