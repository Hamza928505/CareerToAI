# /rank — what to do next, in order

Reads `internship-tracker.xlsx` and tells you which rows deserve attention today.
Adapted from `/rank` in ai-job-search (MIT).

The sheet already sorts by Fit %. This does the thing a spreadsheet cannot: weigh
score against **what is about to go stale**.

## Read

Sheet `Search` in `internship-tracker.xlsx`. Every row with a Company. For each:
Fit %, Status, Sent, Follow up due, Answer, Interview, Weeks, Country, Paid?, and
the Check column.

Never run `npm run tracker` here — it rewrites the workbook from scratch and would
discard every row.

## Order the output by urgency, not by score

**1 · Overdue** — `Sent` is set, `Followed up` is empty, and `Follow up due` has
passed. Part 3 is specific: wait about two weeks, then call and ask politely
whether the application arrived and when to expect an answer. Name the company and
the contact person for each.

**2 · Answered, not booked** — `Answer` is Yes and `Interview` is empty. Book it.

**3 · Accepted, not reported** — Status is Accepted. Tell the Office for
Industrial Links and the Project Office in Magdeburg, send the company details and
contract to your Exchange Coordinator, and cancel the other interviews. Until that
is done nothing else on the list matters.

**4 · Ready to send** — Status `To apply`, highest Fit % first, but drop anything
whose Check column is non-empty to the bottom with the reason shown. A 90-point
posting that is 12 weeks long is not a good posting.

**5 · Researching** — everything else, by Fit %.

## Report

```
Do today
  ! Follow up   Beispiel GmbH — sent 18 days ago, no answer   (Frau Müller, 0711 …)
  ! Book        Muster AG — they said yes on the 3rd

Ready to send        Fit   Check
  Technik Werke       84    —
  Bau Partner         79    Below 861 EUR/month
  Nord Systeme        91    Under the 20-week minimum   ← ask about duration first

Still researching: 6 rows
```

Close with the count of applications sent so far and the plain reminder from
Part 3: fifty or more is normal, and rejections are normal. If the sent count is
low, that is the finding — not the ranking.

## What this does not do

It does not change the sheet. It reads and reports. Any status change is the
student's, or `/outcome`'s.
