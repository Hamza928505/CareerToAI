# Where to search — German portals

ai-job-search ships portal skills for the Danish market (Jobindex, Jobnet,
Akademikernes Jobbank). This is the German replacement, taken from
`src/assets/gy-internships/search-tools/jobborsen.pdf` and Part 3. The same list
is on the home page under "Finding an internship".

## Search terms that actually work

German adverts are titled by field, not by seniority. Search
`Praktikum <Bereich>` and `Pflichtpraktikum <Bereich>`:

```
Praktikum Maschinenbau          Praktikum Bauleitung
Praktikum Softwareentwicklung   Praktikum Logistik
Praktikum Elektrotechnik        Praktikum Architektur
Praktikum Verfahrenstechnik     Praktikum Rechnungswesen
```

Also try `Werkstudent` — but see `01-eligibility.md`: a Werkstudent contract is
not automatically a recognised `Pflichtpraktikum`.

## Internship portals

| Site | Notes |
|---|---|
| meinpraktikum.de | Internships only, well filtered |
| praktikum.info · praktika.de · praktikumsstellen.de | Internship-specific |
| connecticum.de/praktikum | Graduate and internship fairs too |
| unicum.de · bonding.de | Student-focused |

## General boards

indeed.de · stepstone.de · jobboerse.arbeitsagentur.de · monster.de ·
stellenanzeigen.de · academics.de · kimeta.de · jobmensa.de · meinestadt.de ·
jobworld.de · absolventa.de

`jobboerse.arbeitsagentur.de` is the Federal Employment Agency's own board — free,
comprehensive, and under-used by students.

## Not a board, and better than one

- **Your host university.** Notice board, Career Center, International Office,
  and your own professors. Part 3 lists this first for a reason.
- **The Project Office in Magdeburg** (`interns@german-jordanian.org`) will send a
  list of German companies matching your field. Ask for it.
- **Speculative applications** (`Initiativbewerbung`). Most companies never post
  an internship. Phone first, ask whether they take interns and who should receive
  it, then apply — same form and structure, with the subject line saying it is
  speculative.

## Before scraping anything

If a session ever automates fetching from these sites, check `robots.txt` and the
site's terms first, and do not hammer them. ai-job-search has a `robots_check.py`
for exactly this; the courtesy is the point, not the tooling. For a student
sending fifty applications by hand, reading the boards in a browser is both
sufficient and uncontroversial.

## Housing, once you have the offer

wg-gesucht.de · studis-online.de · immobilienscout24.de · immowelt.de ·
immonet.de · zwischenmiete.de · studenten-wg.de · housinganywhere.com ·
djh.de (hostels, for the first few days)

Ask the company first — many help their interns find a room. Also check the local
`Studentenwerk`, which keeps rooms for students enrolled at its universities.
