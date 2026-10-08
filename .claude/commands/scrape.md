---
description: Searches all configured job portals and gathers matching postings.
---

# PROJECT SPINE
- `data/profile.json`: Your professional profile.
- `data/applications.csv`: Your tracking sheet.

# OVERVIEW
Use the saved Job Search Strategy to find current individual postings. The workspace Search button uses the configured search and page-fetch MCPs; portal CLIs in `job-search/.agents/skills/` remain available for targeted searches.

# STEPS
1. Read the saved roles, cities and opportunity types from `data/search-strategy.json`.
2. Search the configured platforms for individual posting URLs, then fetch each candidate page live. Add only pages that load successfully, identify a matching JobPosting, and state a `datePosted` equal to today's date in Germany. Do not treat the search-index date or the date found as the publication date.
3. Merge verified results into `data/applications.csv` and `job_search_tracker.xlsx`, preserving existing notes, decisions and assignments. Put the individual posting URL in `Link to posting` and the verified date in `Date posted`.
4. Report failed platforms and rejected or unverifiable results. An empty verified result is valid; do not fill the tracker with category pages or undated listings.
