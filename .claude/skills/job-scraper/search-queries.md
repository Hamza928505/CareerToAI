# Search Queries for Job Scraper

<!-- PROJECT SPINE
     A profile  .claude/skills/job-application-assistant/01-candidate-profile.md
     A tracker  data/applications.csv
     A statuses data/tracker-schema.json -->

<!-- SEARCH CONFIGURATION -->
The scraper **MUST** read the configuration from `data/search-strategy.json` (if it exists) to dynamically construct queries based on the user's selected **roles**, **cities**, and **types**. If `data/search-strategy.json` is missing or empty, fall back to the default roles: Software Engineering, Full-Stack .NET, Backend, Computer Vision in Germany.

## Installed portal CLIs (primary for `/scrape`)

`/scrape` discovers every portal skill under `job-search/.agents/skills/*/SKILL.md` and runs its CLI first. The installed CLIs are:
- `freehire-search` (configured for `--country DE`)
- `linkedin-search` (disabled currently, but available)
- `jobnet-search` (disabled, Danish portal)

The `site:` query templates in this file are the **WebSearch fallback** ?" for portals without a CLI, company career pages, or when a CLI fails.

## Search Sites

Primary:
- **stepstone.de**
- **indeed.de**
- **meinpraktikum.de**
- **arbeitsagentur.de**
- **linkedin.com/jobs**

## Query Categories

### Priority 1: Software / .NET Internships (German & English)

These match your core skills as a student looking for an internship.

```
site:stepstone.de "Praktikum" AND (".NET" OR "C#") Deutschland
site:stepstone.de "Internship" AND (".NET" OR "C#") Germany
site:indeed.de "Praktikum Softwareentwicklung" Deutschland
site:indeed.de "Software Engineering Intern" Germany
```

### Priority 2: Full-Stack / Web Development Internships

These match your front-end and full-stack experience (JavaScript, React, Bootstrap, Backend APIs).

```
site:stepstone.de "Praktikum Full Stack" Deutschland
site:stepstone.de "Werkstudent Full Stack" Deutschland
site:meinpraktikum.de "Webentwicklung"
site:indeed.de "Full Stack Intern" Germany
```

### Priority 3: Computer Vision / AI Internships

These match your graduation project experience (Python, PyTorch, YOLOv8).

```
site:stepstone.de "Praktikum Computer Vision" Deutschland
site:stepstone.de "Praktikum Machine Learning" Python Deutschland
site:indeed.de "Computer Vision Intern" Germany
site:indeed.de "AI Intern" Python Germany
```

### Priority 4: General Backend & Cloud (Linux / Azure)

Wider net for backend infrastructure roles matching your RedHat certs.

```
site:stepstone.de "Praktikum Backend" Deutschland
site:indeed.de "Backend Intern" Germany
site:stepstone.de "Werkstudent IT" Linux Deutschland
```
