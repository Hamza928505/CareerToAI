---
framework_version: 1.1.1
generated: true
---

<!-- GENERATED FILE - do not edit by hand. -->
<!-- Source: data/profile.json, data/experience.json, data/projects.json, data/certificates.json, data/profile-extras.json -->
<!-- Rebuild: npm run profile   (check in CI: npm run profile:check) -->

# Candidate Profile

## Identity
- **Name:** Hamza Salameh
- **Location:** Amman, Jordan
- **Phone:** _not set — add it to data/profile-extras.json_
- **Email:** H.Salameh03@gju.edu.jo
- **LinkedIn:** https://www.linkedin.com/in/hamza-salameh-287a53258/
- **GitHub:** https://github.com/Hamza928505
- **Status:** _not set — add it to data/profile-extras.json_
- **Constraints:** _not set — add it to data/profile-extras.json_

### Languages

<!-- The Language Gate in 04-job-evaluation.md treats an undeclared language as a hard
no, not a gap to smooth over. Edit data/profile.json (or /editor/ → Basics), not this file. -->

| Language | Level | Notes |
|----------|-------|-------|
| Arabic | Native |  |
| English | B1 (intermediate) |  |
| German | B1 (intermediate) |  |

## Education

| Degree | Period | Institution | Key Topics |
|--------|--------|-------------|------------|
| Bachelor, Computer Science | September 2022 – September 2027 | German Jordanian University | I’m a Computer Science student with a passion for software development and cybersecurity. I have experience with .NET, MySQL, and front-end development (HTML, CSS, JavaScript, Bootstrap). Currently, I’m expanding my knowledge in cloud computing (Azure) and ethical hacking. My goal is to contribute to innovative projects that improve security and user experience. |

## Professional Experience

### Full Stack Developer - Umniah (July 2025 – October 2025)
Amman, Jordan · Hybrid · Full time

- First of three summer semesters in Umniah's Dual Studies program, based in the Digital & IT department.
- A hybrid, three-month intensive focused on front-end web development.
- Delivered 57 responsive web pages using HTML5, CSS3 and JavaScript, applying consistent semantic markup, structure and cross-browser compatibility across the full set.
- Built mobile-first layouts with Bootstrap 5 — grid system, components and utility classes — for maintainable, reusable UI patterns instead of one-off CSS.
- Used jQuery for DOM manipulation, event handling and dynamic behaviour, including form validation and interactive UI components.
- Worked inside a live Digital & IT team environment, iterating on review feedback from senior developers rather than building in isolation.
- Established the front-end foundation I built on in the following two semesters, when the same skills were paired with a C#/.NET back end.
- Skills: ASP.NET, ASP.NET MVC, ASP.NET Core, ASP.NET Web API, Full-Stack Development, REST APIs, C#, Object-Oriented Programming (OOP), HTML5, HTML, Cascading Style Sheets (CSS), JavaScript, Bootstrap5, MySQL

### Back End Developer - Umniah (July 2024 – October 2024)
Amman, Jordan · Hybrid · Full time

- Second semester of the Dual Studies program at Umniah — a hybrid, three-month placement in the Digital & IT department.
- Focus moved from the front end to back-end engineering, APIs and databases.

  

• Built a complete login and user-management system with full CRUD operations, covering registration, authentication, session handling and create/read/update/delete on user records.



• Programmed in C# using object-oriented principles — classes, inheritance, encapsulation and interfaces — to keep the codebase modular and extensible.



• Developed and consumed REST APIs on the .NET stack, defining endpoints and connecting them to the front-end layer I had learned to build the previous summer.



• Tested and debugged every endpoint in Postman, validating request and response payloads, status codes and error handling before integration.



• Designed and queried relational SQL databases — table schemas, relationships and joins — as the persistence layer behind the system.
- Skills: C#, ASP.NET MVC, ASP.NET Core, ASP.NET Web API, ASP.NET, MySQL

### Frontend Developer - Umniah (July 2023 – October 2023)
Amman, Jordan · Hybrid · Full time

- Final semester of the Dual Studies program at Umniah — a hybrid, three-month placement in the Digital & IT department, delivering a production system end to end as the sole developer.

  

• Independently designed, built and tested a full-stack back-office system that lets customers submit complaints, including image attachments, directly to Umniah's call centre team.



• Owned the entire stack alone: front-end interface, back-end logic, REST APIs, database design, image upload and storage handling, and testing — every line of code was mine.



• Gave call centre agents a single structured place to receive complaints together with their supporting images, rather than handling them across separate channels.



• The system is still in active production use at Umniah today, continuing to serve the call centre team well beyond the end of my placement.



• Combined the front-end skills from semester one with the C#, .NET, REST API and SQL foundation from semester two into one self-directed delivery.
- Skills: JavaScript, HTML, Cascading Style Sheets (CSS), Bootstrap5, Front-End Development, Front-end Coding, HTML5

## Independent Projects

### ExpenseTracker (March 2026 – Present)
Front-end and Software engineering
[Project](https://hamza928505.github.io/ExpenseTracker/) · [Source](https://github.com/Hamza928505/ExpenseTracker)

- ================================================================================
EXPENSETRACKER — LINKEDIN POSITIONING PACK
Prepared 10 September 2026
Source: github.com/Hamza928505/ExpenseTracker (analysed directly from the code)
================================================================================

HOW TO USE THIS FILE
  Section 1 — general/project analysis
  Section 2 — technical analysis
  Section 3 — LinkedIn positioning advice
  Section 4 — ready-to-paste copy (6 variants)
  Section 5 — [NEEDS INFORMATION] — the gaps only you can fill

Everything below is taken from the actual repository.
- Nothing is invented.
- Where a claim could not be verified from the code, it is marked.


================================================================================
SECTION 1 — GENERAL PROJECT INFORMATION
================================================================================

--------------------------------------------------------------------------------
1.1 PROJECT NAME AND ONE-LINE DESCRIPTION
--------------------------------------------------------------------------------

Name:  ExpenseTracker

Pick whichever one-liner fits the context:

  (a) A multi-currency personal finance tracker that runs entirely in the
      browser — no backend, no accounts, no build step.

  (b) A client-side expense tracker that shows your monthly balance in every
      currency you hold, and keeps working offline.

  (c) A framework-free personal finance PWA built in vanilla JavaScript, with
      live multi-currency conversion and user-defined categories.

(a) is the safest default. (c) is the strongest for engineering audiences.

--------------------------------------------------------------------------------
1.2 WHAT PROBLEM DOES IT SOLVE?
--------------------------------------------------------------------------------

Two problems, and the second is the one that makes the project distinctive.

  1.
- Ordinary expense tracking.
- Logging income and spending, categorising it,
     and seeing where the money went over a month.

  2.
- Living across currencies.
- Most trackers assume one currency.
- If you earn
     in one and spend in another, "how much do I have this month?" has more
     than one correct answer.
- ExpenseTracker answers it in all of them at once:
     you set a main currency, add the others you care about, and tap to switch
     between them — JD 1,271.60 becomes $1,792.96 with no page reload and no
     network call.
- A third problem is solved by the architecture rather than a feature: most
finance apps require an account and store your spending on someone else's
server.
- This one stores everything in your browser's localStorage.
- There is no
sign-up, no server, and no analytics.

--------------------------------------------------------------------------------
1.3 WHY THE PROBLEM MATTERS
--------------------------------------------------------------------------------

Keep this grounded — avoid inflating it.

  - Multi-currency life is common, not niche: students abroad, remote workers
    paid in foreign currency, freelancers with international clients, and people
    in the Gulf and Levant who hold both local currency and USD.
- Existing free
    trackers usually force a single currency and make you do conversion by hand.

  - Financial data is sensitive.
- A tracker that never transmits your spending
    removes the privacy question entirely rather than asking you to trust a
    privacy policy.

  - Offline capability matters for a tool you open in a shop or a taxi.
- Cached exchange rates mean the app is fully usable without a connection.

--------------------------------------------------------------------------------
1.4 TARGET USERS
--------------------------------------------------------------------------------

  - People who earn or spend in more than one currency (students abroad,
    freelancers with foreign clients, expatriate workers).
  - Anyone who wants a simple tracker without creating an account.
  - Users on low-end phones or poor connectivity — the app has no framework
    payload and works offline once loaded.
  - Secondary audience: developers looking at it as a reference for building a
    non-trivial front end without a framework.

--------------------------------------------------------------------------------
1.5 WHAT MAKES IT USEFUL OR DIFFERENT
--------------------------------------------------------------------------------

  - Multi-currency as a first-class idea, not a settings toggle.
- The balance
    panel shows the month in several currencies at once, and switching is a tap.

  - Correct currency handling, not just display conversion.
- Amounts are always
    stored in your main currency.
- Typing an amount while viewing another
    currency converts it on save.
- Changing your main currency re-denominates
    the entire ledger at the live rate, behind a confirmation that shows the
    rate — and refuses outright if no rate is available, rather than quietly
    relabelling JD 1,271.60 as $1,271.60.

  - Genuinely user-extensible categories.
- You add income and expense categories
    with a name, an icon (40 available) and a colour (16 available).
- Yours
    behave identically to the 13 built-ins everywhere — add sheet, filter chips,
    day-grouped list, breakdown bars and charts.
- Deleting one leaves its
    existing transactions intact with the name preserved.

  - No build step and no runtime CDN.
- Every third-party asset is vendored into
    the repo, so the app does not break when a CDN does, and it runs from a
    local folder.

  - Privacy by construction.
- There is no backend to leak.

--------------------------------------------------------------------------------
1.6 REAL-WORLD APPLICATIONS AND POTENTIAL IMPACT
--------------------------------------------------------------------------------

Honest framing — this is a personal-scale tool, and saying so is more credible
than claiming otherwise.

  - Directly usable as a daily personal budgeting tool, installable to a phone
    home screen as a PWA.
  - The currency layer generalises: the same approach fits invoicing tools,
    travel expense logs, or any app where stored values and displayed values
    are in different units.
  - As a portfolio artefact it demonstrates that you can carry a non-trivial
    front end from design system to deployment without a framework.

[NEEDS INFORMATION] Do you have any real usage — friends or family using it,
feedback received, or a course/competition it was submitted to? Real usage is
far more persuasive than potential usage, and I have no way to verify it.

--------------------------------------------------------------------------------
1.7 WHAT YOU LEARNED
--------------------------------------------------------------------------------

[NEEDS INFORMATION] This has to be yours — I cannot write your reflection for
you honestly.
- Below are candidate learnings that are grounded in decisions
genuinely visible in the code.
- Confirm, edit or discard each one.
- Candidate A — Unit correctness is a design problem, not a formatting problem.
- Making currency switching a single tap exposed a real bug: amounts typed
    while viewing a foreign currency were being stored as if they were already
    in the base currency.
- The lesson is that "what is stored" and "what is
    shown" must be separated explicitly, and that making a feature easier to
    use is a good way to surface flaws in it.
- Candidate B — Refusing to act can be the correct behaviour.
- When no exchange
    rate is available, the app declines to change your main currency instead of
    guessing.
- Deciding when software should stop rather than approximate.
- Candidate C — Working without a framework forces you to own state and
    rendering.
- No reactivity system means being deliberate about when to
    re-render and where state lives.
- Candidate D — Vendoring dependencies is a reliability decision, with a
    trade-off in repository size (155 flag SVGs total roughly 2.2 MB).
- Candidate E — Designing a token-based system up front made adding dark mode
    and new components a matter of reusing variables rather than rewriting CSS.

--------------------------------------------------------------------------------
1.8 SKILLS THE PROJECT DEMONSTRATES
--------------------------------------------------------------------------------

  Technical:
    - Vanilla JavaScript at a level beyond tutorial scope (state management,
      event delegation, DOM rendering, async control flow, localStorage
      schema design)
    - CSS architecture: design tokens, theming, responsive layout across six
      breakpoints
    - Data visualisation with Chart.js, re-themed at runtime
    - REST API integration with caching and offline fallback
    - PWA fundamentals: manifest, icon sets, installability
    - Accessibility: semantic HTML, ARIA, focus management, reduced motion
    - Git and CI/CD via GitHub Actions

  Professional:
    - Scoping and finishing a project alone, from design system to deployment
    - Writing documentation others can follow (the README is thorough)
    - Deliberate technical decisions with stated trade-offs
    - Attention to correctness, including fixing a bug that was not reported

--------------------------------------------------------------------------------
1.9 WHY IT IS WORTH POSTING ON LINKEDIN
--------------------------------------------------------------------------------

  - It is live and clickable.
- A recruiter can use it in ten seconds, on a
    phone, with no sign-up.
- Very few student projects clear that bar.
  - It has one memorable, specific detail — the currency tap — that survives
    being skimmed.
  - The absence of a framework is a genuine talking point.
- It shows you
    understand what React does for you, not just how to call it.
  - The correctness story (finding and fixing the unit bug) is the kind of
    thing interviewers actually ask about and most portfolio posts lack.
  - It is finished.
- Deployed, documented, licensed (MIT).


================================================================================
SECTION 2 — TECHNICAL INFORMATION
================================================================================

--------------------------------------------------------------------------------
2.1 ARCHITECTURE AND WORKFLOW
--------------------------------------------------------------------------------

A three-page static site over a shared core.
- There is no backend and no build
step — the source that ships is the source you write.

  index.html / index.js          Dashboard: balance panel, in/out cards,
                                 three charts, spending breakdown
  transactions.html / .js        Filter chips, day-grouped activity list
  settings.html / .js            Theme, currencies, categories, data stats,
                                 currency converter, danger zone

  shared.css   (~2,000 lines)    Design tokens, layout, every shared component
  shared.js    (~1,290 lines)    State, localStorage, icon registry, category
                                 system, currency engine, add sheet, dialogs

  libs/                          Vendored Bootstrap, Chart.js, SweetAlert2,
                                 Plus Jakarta Sans, 155 country flag SVGs

Data flow on every page is the same loop:

  localStorage  ->  in-memory arrays (txs, recurringTxs, customCats,
                    walletCurrencies, ratesData)
                ->  a page-level render() that rebuilds the DOM from state
                ->  user action mutates state, calls save(), calls render()

Rendering is full re-render of the affected container rather than diffing.
- At this data scale that is the simpler and faster choice, and it removes an
entire class of stale-DOM bugs.
- Because containers are rebuilt, click handlers
live on the containers via event delegation rather than on the elements.

--------------------------------------------------------------------------------
2.2 TECHNOLOGIES USED
--------------------------------------------------------------------------------

  Language / markup    HTML5, CSS3, JavaScript (ES6+)
  Layout               Bootstrap 5.3 — grid and spacing utilities only
  Charts               Chart.js 4.4
  Dialogs              SweetAlert2 11
  Typography           Plus Jakarta Sans, self-hosted variable WOFF2
  Persistence          Web Storage API (localStorage)
  External API         exchangerate-api.com (v4 latest rates)
  Flags                155 country SVGs, vendored locally
  CI/CD                GitHub Actions
  Hosting              GitHub Pages
  Version control      Git / GitHub
  Licence              MIT

  Frontend:  everything above.
- Backend:   none.
- This is deliberate, and worth stating rather than omitting.
- Database:  none. localStorage only.
- AI/ML:     none.
- Do not imply otherwise.

--------------------------------------------------------------------------------
2.3 DATA HANDLING
--------------------------------------------------------------------------------

Eight localStorage keys, each a JSON document:

  et_txs               transaction array
  et_recurring         recurring templates with a lastDate cursor
  et_categories        user-defined categories, split income / expense
  et_wallet            the currencies shown under the balance
  et_rates             cached rate table { base, date, rates }
  et_base_currency     the currency amounts are stored in
  et_display_currency  the currency currently shown
  et_theme             "light" or "dark"

Transaction shape:

  { id, desc, amount, type, category, date }

Two data-handling decisions worth mentioning in an interview:

  - amount is always in the base currency.
- Display conversion happens at
    render time; entry conversion happens at save time.
- The stored value and
    the shown value are deliberately different concerns.

  - Reading user-supplied data is defensive. loadCustomCats() validates every
    field, checks the colour against a hex pattern, verifies the icon exists in
    the registry, and falls back to a safe default rather than trusting what is
    in storage.
- All user text is escaped before insertion into HTML.

--------------------------------------------------------------------------------
2.4 ALGORITHMS AND NOTABLE TECHNICAL APPROACHES
--------------------------------------------------------------------------------

  Single-fetch rate table
    One request returns every rate against the base currency.
- Switching display
    currency is then a table lookup, not a network call — instant, and it works
    offline from the cached table.
- This is the core reason the tap feels
    immediate.
- Base-currency invariant
    Entry converts display -> base on save; display converts base -> display on
    render.
- Changing the base multiplies every stored amount by the old-to-new
    rate, so value is preserved and only the unit changes.
- Icon registry with runtime hydration
    61 SVG icons live in one object.
- Static markup writes
    <i data-icon="home"></i> and hydrateIcons() swaps in the SVG; JS-generated
    markup calls icon('home') directly.
- No icon font, no emoji, no sprite
    sheet — and icons inherit currentColor, so theming is free.
- Category merge layer
    Built-ins are a constant; user categories are merged on top at read time.
    catDef() resolves any category value and never throws — an unknown value
    (a deleted category on an old transaction) degrades to a neutral default
    with the original name preserved.
- Recurring transactions
    On startup, each template advances month by month from its lastDate cursor
    until it reaches the current month, generating any missed entries.
- This
    handles the case where the app was not opened for several months.
- Flag fallback that preserves layout
    A flag that fails to load is replaced by a two-letter badge with identical
    dimensions, so no row reflows.

--------------------------------------------------------------------------------
2.5 DEPLOYMENT
--------------------------------------------------------------------------------

  GitHub Actions workflow (.github/workflows/static.yml) deploys the repository
  to GitHub Pages on every push to main, with a concurrency group so queued
  deployments do not cancel a run in progress.
- Live:  https://hamza928505.github.io/ExpenseTracker/
  Code:  https://github.com/Hamza928505/ExpenseTracker

  There is no build step in the pipeline — the repository is uploaded as-is.

--------------------------------------------------------------------------------
2.6 INTEGRATIONS AND EXTERNAL SERVICES
--------------------------------------------------------------------------------

  exchangerate-api.com is the only external service called at runtime, and the
  only outbound request the app makes.
- No analytics, no tracking, no auth
  provider, no CDN dependency.

--------------------------------------------------------------------------------
2.7 TECHNICAL CHALLENGES AND HOW THEY WERE SOLVED
--------------------------------------------------------------------------------

  Challenge 1 — Currency switching was slow and network-bound.
- Naively, changing display currency means fetching a new rate.
- That makes a
    UI tap depend on the network.
- Solution: fetch the full rate table once against the base currency and
    cache it in localStorage.
- Switching becomes a lookup.
- Works offline.
- Challenge 2 — Stored amounts silently meant the wrong thing.
- Amounts typed while viewing a foreign currency were stored raw, as if they
    were already in the base currency.
- Making switching a single tap turned a
    rare bug into a likely one.
- Solution: establish the base-currency invariant.
- Convert on save, show the
    user what will actually be stored, and convert the whole ledger when the
    base changes.
- Challenge 3 — Changing the base currency relabelled history.
- Switching base from JOD to USD left 1,271.60 in storage and simply started
    calling it dollars.
- Solution: multiply every stored amount by the old-to-new rate behind a
    confirmation that states the rate, and refuse the change entirely when no
    rate is available rather than corrupting the ledger.
- Challenge 4 — Flags that render consistently, offline.
- Emoji flags do not render on Windows, and an image CDN is a dependency and
    a privacy leak.
- Solution: vendor 155 SVGs locally with a same-size lettered fallback.
- Trade-off accepted: about 2.2 MB in the repository, but the browser only
    fetches the handful actually displayed.
- Challenge 5 — Custom categories touching every surface.
- Categories appear in the add sheet, filter chips, list rows, breakdown bars
    and two charts.
- A hardcoded list in each place would guarantee drift.
- Solution: one merge layer and three accessors (catColor, catIcon,
    catLabel).
- Every surface reads from it, including the filter chips, which
    were converted from hardcoded HTML to rendered output.

--------------------------------------------------------------------------------
2.8 PERFORMANCE, SECURITY AND OPTIMISATION
--------------------------------------------------------------------------------

  Performance
    - No framework runtime and no bundle to parse.
    - The rate cache removes network latency from currency switching.
    - Flags are lazy-loaded; only displayed flags are fetched.
    - The variable font is self-hosted and subset into latin / latin-ext.
    - Chart instances are destroyed before re-creation to avoid canvas leaks.
    - The stored theme is applied by an inline script before first paint, so
      there is no flash of the wrong theme.
- Security and privacy
    - No backend, so no server-side attack surface and no data in transit
      beyond the rate request.
    - All user-supplied text is escaped before HTML insertion (XSS).
    - Data read back from localStorage is validated, not trusted.
    - No third-party scripts at runtime; nothing loaded from a CDN.
- Scalability — be honest here
    localStorage is per-browser and roughly 5 MB.
- There is no sync across
    devices and no multi-user support.
- The full re-render approach is
    appropriate for personal-scale data and would need virtualisation at very
    large volumes.
- Saying this plainly reads as engineering judgement; claiming
    the app "scales" would not.

--------------------------------------------------------------------------------
2.9 THE MOST INTERESTING IMPLEMENTATION DETAIL
--------------------------------------------------------------------------------

If you only get to describe one thing in an interview, describe the
base-currency invariant and the refusal path:

  The app separates the currency a value is stored in from the currency it is
  shown in, and enforces that separation at both boundaries.
- Entry converts in,
  display converts out, and changing the base converts the entire ledger.
- When
  the conversion cannot be done correctly — no rate available — the app
  refuses the operation instead of producing a number that looks right and is
  wrong.
- That is a correctness argument, not a feature list, and it is the strongest
technical signal the project sends.

--------------------------------------------------------------------------------
2.10 VERIFIED PROJECT NUMBERS
--------------------------------------------------------------------------------

Use these freely — every one was counted from the repository.

  4,805   lines of hand-written HTML, CSS and JavaScript
          (1,946 JS / 2,019 CSS / 840 HTML; excludes vendored libraries)
  3       pages
  61      SVG icons in the registry
  13      built-in categories (3 income, 10 expense)
  40      icons and 16 colours available for user-made categories
  155     currencies mapped to vendored country flags
  8       localStorage keys
  6       responsive breakpoints, all min-width / mobile-first
  1       external API dependency
  0       build tools, bundlers, or runtime CDN dependencies
  21      commits, solo (verified from git history)
  MIT     licence


================================================================================
SECTION 3 — LINKEDIN POSITIONING
================================================================================

--------------------------------------------------------------------------------
3.1 STRONGEST TECHNICAL SKILLS TO LIST
--------------------------------------------------------------------------------

  Tier 1 — genuinely evidenced, lead with these:
    JavaScript (ES6+) · Front-End Development · HTML5 · CSS3 ·
    Responsive Web Design · Progressive Web Apps (PWA) · REST API Integration ·
    Data Visualization · Web Accessibility (WCAG) · Git

  Tier 2 — real but supporting:
    Bootstrap · Chart.js · Web Storage API · GitHub Actions · CI/CD ·
    UI/UX Design · Design Systems · Software Architecture

  Do not list: React, TypeScript, Node.js, SQL, Docker, or any backend or ML
  skill.
- None of them appear in this project, and a recruiter who asks will
  find out.

--------------------------------------------------------------------------------
3.2 STRONGEST SOFT / PROFESSIONAL SKILLS
--------------------------------------------------------------------------------

  - Independent ownership — scoped, built, documented and shipped alone
  - Attention to correctness — found and fixed a unit bug nobody reported
  - Technical decision-making with explicit trade-offs
  - Technical writing — the README is thorough and current
  - User empathy — the multi-currency feature comes from a real problem
  - Product thinking — knowing when software should refuse rather than guess

--------------------------------------------------------------------------------
3.3 RECRUITER KEYWORDS
--------------------------------------------------------------------------------

  JavaScript, Vanilla JavaScript, ES6, Front-End Developer, Frontend Engineer,
  HTML5, CSS3, Responsive Design, Mobile-First, Progressive Web App, PWA,
  Web Application, Single Page Application, REST API, API Integration,
  localStorage, Client-Side, Chart.js, Data Visualization, Dashboard,
  Bootstrap, UI/UX, Design System, Dark Mode, Accessibility, WCAG, ARIA,
  Git, GitHub, GitHub Actions, CI/CD, GitHub Pages, Web Performance,
  Cross-Browser, FinTech, Personal Finance, Multi-Currency

--------------------------------------------------------------------------------
3.4 ROLES THIS PROJECT SUPPORTS
--------------------------------------------------------------------------------

  Strong fit:
    Front-End Developer / Engineer (junior, graduate, intern)
    Web Developer
    JavaScript Developer
    UI Developer / UI Engineer

  Reasonable fit with other evidence:
    Full-Stack Developer — only if you have separate backend work to show.
- This project has no backend and will not support the claim alone.
- Software Engineer (generalist, entry level)
    Mobile Web / PWA Developer

  Not supported by this project:
    Data Scientist, AI/ML Engineer, Backend Engineer, DevOps, Cybersecurity.
- Do not position it for these.

--------------------------------------------------------------------------------
3.5 WHAT TO HIGHLIGHT PUBLICLY
--------------------------------------------------------------------------------

  Highlight:
    - The tap-to-switch multi-currency balance (concrete and memorable)
    - Built without a framework, and why
    - The correctness bug you found and fixed
    - Offline capability via the cached rate table
    - User-extensible categories
    - Design tokens driving light and dark themes
    - Accessibility work
    - Live deployed link — the single most valuable item

  Leave out:
    - localStorage key names and JSON schemas
    - Individual function names (catDef, hydrateIcons, and so on)
    - CSS custom-property names and hex values
    - File-by-file line counts
    - The exact number of icons or colours in a picker
    - Bootstrap breakpoint pixel values
    - Anything a reader cannot evaluate in five seconds

  Rule of thumb: state the decision and its consequence, not the implementation
  detail. "Cached the full rate table so switching works offline" belongs on
  LinkedIn. "ratesData is a JSON object under et_rates" belongs in the README.


================================================================================
SECTION 4 — LINKEDIN-READY OUTPUT
================================================================================

--------------------------------------------------------------------------------
4.1 PROJECTS SECTION DESCRIPTION  (1,942 characters — limit is 2,000)
--------------------------------------------------------------------------------

Form fields:
  Project name : ExpenseTracker — Multi-Currency Personal Finance PWA
  Start date   : March 2026
  End date     : Present   [or September 2026 — see Section 5]
  URL          : https://hamza928505.github.io/ExpenseTracker/

--- COPY BELOW THIS LINE ---

A fully client-side, multi-currency personal finance app built with vanilla
JavaScript — no framework, no build step, no backend.
- Data never leaves the
browser: no accounts, no servers, no tracking.
- WHAT IT DOES
• Multi-currency balance — set a main currency and as many others as you like.
- Each flies its country's flag under your balance; tap one and the whole page
re-denominates instantly (JD 1,271.60 → $1,792.96).
- One API call caches every
rate in localStorage, so switching still works offline.
• Custom categories — add income and expense categories with a name, an icon
from 40, and a colour.
- Yours behave exactly like the 13 built-ins across the
add sheet, filter chips, breakdown and charts.
• Analytics — three Chart.js views (6-month cash flow, category split,
whole-month split) that re-render live in the active theme.
• Recurring monthly transactions, month-by-month navigation, day-grouped
activity list.
• Installable PWA with a full iOS/Android icon set, including maskable variants.
- ENGINEERING NOTES
• ~4,800 lines of hand-written HTML/CSS/JS across 3 pages, zero build tooling.
• A CSS custom-property design system drives light and dark themes; the stored
theme is applied before first paint, so there's no flash of the wrong one.
• Mobile-first across all six Bootstrap breakpoints — bottom nav on phones,
sidebar from 992px up.
• 61 SVG icons in one registry, hydrated at runtime.
- No icon font, no emoji.
• Accessibility verified in both themes at 390px and 1440px: 4.5:1 body
contrast, 44×44 touch targets, visible focus rings, ARIA roles,
prefers-reduced-motion honoured.
• Every third-party asset vendored locally — Bootstrap, Chart.js, SweetAlert2,
the variable font, 155 flag SVGs — so the app runs fully offline.
• Continuously deployed to GitHub Pages via GitHub Actions.
- Tech: HTML5 · CSS3 · Vanilla JavaScript (ES6+) · Bootstrap 5.3 · Chart.js 4.4
· SweetAlert2 11 · Web Storage API · PWA · GitHub Actions

--- COPY ABOVE THIS LINE ---

--------------------------------------------------------------------------------
4.2 MAIN LINKEDIN POST  (~2,150 characters — limit is 3,000)
--------------------------------------------------------------------------------

--- COPY BELOW THIS LINE ---

I built ExpenseTracker — a personal finance app that runs entirely in the
browser.
- No backend, no accounts, no build step.
- It started as a straightforward income and expense tracker.
- The part that
turned out to be interesting was currency.
- If you earn in one currency and spend in another, "how much do I have this
month?" doesn't have a single answer.
- So the balance panel shows your month in
every currency you care about.
- You set a main currency, add the others, and tap
to switch — JD 1,271.60 becomes $1,792.96 instantly.
- One API call caches every
rate locally, so it keeps working with no connection.
- Building that feature exposed a bug I would otherwise have shipped: amounts
typed while viewing dollars were being stored as if they were dinars.
- Making
currency switching a single tap turned a rare problem into a likely one.
- So I fixed the underlying idea rather than the symptom.
- Amounts are now always
stored in your main currency and converted on entry.
- Changing your main
currency re-denominates the whole ledger at the live rate, behind a
confirmation showing that rate — and if no rate is available, the app refuses
the change instead of quietly relabelling JD 1,271.60 as $1,271.60.
- That last part is the thing I am most pleased with.
- Software that stops when it
cannot be correct is better than software that guesses.
- Other pieces I enjoyed building:

→ Categories are not a fixed list.
- You add your own with a name, an icon and a
colour, and they behave like the built-ins everywhere — the add form, the
filters, the breakdown, the charts.

→ Light and dark themes from a single set of CSS custom properties, applied
before first paint so there is no flash of the wrong theme.

→ Every dependency vendored into the repo — Bootstrap, Chart.js, SweetAlert2,
the font, the country flags — so nothing breaks when a CDN does.

→ About 4,800 lines of hand-written HTML, CSS and JavaScript.
- No framework, no
bundler.
- Working without a framework was the point.
- I wanted to understand state,
rendering and persistence directly instead of letting a library make those
decisions for me.

#JavaScript #WebDevelopment #Frontend #PWA #OpenSource

--- COPY ABOVE THIS LINE ---

--------------------------------------------------------------------------------
4.3 TECHNICAL VERSION  (for a developer audience)
--------------------------------------------------------------------------------

--- COPY BELOW THIS LINE ---

ExpenseTracker: a multi-currency finance tracker in ~4,800 lines of vanilla
JS/CSS/HTML.
- No framework, no bundler, no backend.
- Some notes on the parts that
were actually hard.
- Rate handling.
- Switching display currency shouldn't cost a network round trip.
- One request fetches the entire rate table against the base currency and caches
it in localStorage, so switching is a table lookup — instant, and functional
offline.
- Changing currency does not touch the network at all.
- The base-currency invariant.
- Stored values and displayed values are different
concerns, and the app enforces that at both boundaries: entry converts display
→ base on save, render converts base → display, and changing the base
multiplies every stored amount by the old-to-new rate so value is preserved and
only the unit changes.
- When no rate exists, the operation is refused rather
than approximated.
- Relabelling JD 1,271.60 as $1,271.60 would be worse than
doing nothing.
- Rendering.
- No reactivity system, so state lives in module-scope arrays hydrated
from localStorage, and each page owns a render() that rebuilds its containers
from state.
- Full re-render rather than diffing — at personal-data scale it is
faster to reason about and eliminates stale-DOM bugs.
- Since containers are
rebuilt, handlers are delegated to the containers.
- Extensibility.
- Categories are a merge layer: built-in constants plus
user-defined entries from storage, resolved through accessors that never throw.
- An unknown category — one deleted while transactions still reference it —
degrades to a neutral default with its original name preserved.
- Every surface
reads through that layer, including the filter chips, which I converted from
hardcoded markup to rendered output so they cannot drift.
- Icons. 61 SVGs in a single registry.
- Static markup writes a data attribute and
gets hydrated; JS-generated markup calls the registry directly.
- Icons inherit
currentColor, so theming costs nothing.
- Assets.
- Everything vendored — Bootstrap, Chart.js, SweetAlert2, the variable
font, 155 country flag SVGs.
- Costs ~2.2 MB in the repo; buys a build that
cannot be broken by someone else's CDN.
- Flags lazy-load and fall back to a
same-size lettered badge, so a failed load never reflows a row.
- Deployed on GitHub Pages via GitHub Actions on push to main.
- Code: https://github.com/Hamza928505/ExpenseTracker

--- COPY ABOVE THIS LINE ---

--------------------------------------------------------------------------------
4.4 NON-TECHNICAL VERSION  (for recruiters and general audiences)
--------------------------------------------------------------------------------

--- COPY BELOW THIS LINE ---

I built and launched ExpenseTracker, a free web app for tracking personal
income and spending.
- The problem I wanted to solve: most budgeting apps assume you use one currency.
- If you earn in one and spend in another — which is true for a lot of students,
freelancers and people working abroad — you end up doing conversion in your
head or in a separate calculator.
- ExpenseTracker shows your monthly balance in every currency you use at once.
- You choose your main currency, add the others, and tap to switch between them.
- Two things I decided early and kept:

It asks for nothing.
- No account, no email, no sign-up.
- Your financial data is
stored on your own device and never sent anywhere.
- There is no server holding
your spending history, because there is no server.
- It works without internet.
- Once loaded, you can add transactions, browse past
months and switch currencies with no connection.
- You can install it on your phone's home screen like a normal app, use it in
light or dark mode, sort spending into your own categories, and see where your
money went through simple charts.
- I built the whole thing myself — the design, the code and the deployment — and
it is live and free to use.
- Try it: https://hamza928505.github.io/ExpenseTracker/

--- COPY ABOVE THIS LINE ---

--------------------------------------------------------------------------------
4.5 LINKEDIN SKILLS TO ADD TO YOUR PROFILE
--------------------------------------------------------------------------------

Add these to Skills, then tag them on the ExpenseTracker project entry.
- Ordered by strength of evidence — add the top ten first.

   1.
- JavaScript
   2.
- Front-End Development
   3.
- HTML5
   4.
- Cascading Style Sheets (CSS)
   5.
- Responsive Web Design
   6.
- Progressive Web Applications (PWA)
   7.
- Web Development
   8.
- REST APIs
   9.
- Data Visualization
  10.
- Web Accessibility
  11.
- Git
  12.
- GitHub Actions
  13.
- Bootstrap
  14.
- Chart.js
  15.
- UI/UX Design
  16.
- Continuous Integration and Continuous Delivery (CI/CD)
  17.
- Software Design Patterns
  18.
- Mobile-First Design
  19.
- Web Performance Optimization
  20.
- Technical Documentation

--------------------------------------------------------------------------------
4.6 CV BULLET POINTS
--------------------------------------------------------------------------------

Full version — use for a dedicated Projects section:

  ExpenseTracker — Multi-Currency Personal Finance PWA          Mar 2026 – Present
  Solo project · Live: hamza928505.github.io/ExpenseTracker · MIT licence

  • Built and deployed a client-side personal finance application in ~4,800
    lines of vanilla JavaScript, HTML and CSS, with no framework, bundler or
    backend.
  • Designed a multi-currency engine that caches a full exchange-rate table in
    localStorage from a single API call, making currency switching instant and
    fully functional offline across 155 supported currencies.
  • Enforced a base-currency invariant separating stored from displayed values,
    eliminating a unit-conversion defect that silently mis-stored amounts
    entered in a non-base currency.
  • Implemented a user-extensible category system with icon and colour
    selection, resolved through a single merge layer consumed by six UI
    surfaces to prevent drift.
  • Developed a CSS custom-property design system supporting light and dark
    themes across six mobile-first breakpoints, with the stored theme applied
    pre-paint to eliminate flash-of-incorrect-theme.
  • Built three interactive Chart.js visualisations that re-render against live
    theme tokens.
  • Met accessibility targets in both themes at 390px and 1440px: 4.5:1 body
    contrast, 44×44px touch targets, visible focus indicators, ARIA roles and
    prefers-reduced-motion support.
  • Automated deployment to GitHub Pages via GitHub Actions on push to main.
  • Vendored all third-party assets locally, removing every runtime CDN
    dependency.
- Condensed version — three lines, for a one-page CV:

  • Built and deployed a multi-currency personal finance PWA in ~4,800 lines of
    vanilla JavaScript, HTML and CSS — no framework, bundler or backend.
  • Designed an offline-capable currency engine caching a full rate table from
    one API call, and enforced a stored-vs-displayed value invariant that
    eliminated a silent unit-conversion defect.
  • Delivered a token-based design system with light/dark theming across six
    mobile-first breakpoints, meeting 4.5:1 contrast and 44×44px target
    requirements; automated deployment via GitHub Actions.
- Verb bank if you rewrite: Built · Designed · Implemented · Engineered ·
Architected · Automated · Eliminated · Enforced · Optimised · Deployed.
- Avoid: Utilised, Leveraged, Spearheaded, Revolutionised.


================================================================================
SECTION 5 — [NEEDS INFORMATION]
================================================================================

Five things I could not determine from the code.
- Answer these and the copy
above becomes fully accurate.

  1.
- IS THE PROJECT ONGOING OR FINISHED?
     Git shows commits from 9 March 2026 to 10 September 2026.
- I have written
     "March 2026 – Present" throughout.
- If you consider it complete, say so and
     I will change it to "March 2026 – September 2026".

  2.
- WHAT DID YOU ACTUALLY LEARN? (most important gap)
     Section 1.7 contains five candidate learnings drawn from real decisions in
     the code, but I will not put a personal reflection in your mouth.
- Tell me
     which ring true — or give me your own in one sentence — and I will work it
     into the main post, which is where it carries the most weight.

  3.
- CONTEXT — coursework, personal project, or something else?
     If it was for a university module, a bootcamp, or a competition, that is
     worth naming.
- If it was purely self-directed, that is also worth saying,
     and reads differently.

  4.
- ANY REAL USAGE OR FEEDBACK?
     Do you use it yourself day to day? Has anyone else? Any feedback that
     changed the product? Real usage beats "potential impact" every time, and
     I have deliberately not claimed any.

  5.
- WHAT ROLE ARE YOU TARGETING?
     I have positioned this for front-end and junior software engineering
     roles, which is what the evidence supports.
- If you are aiming somewhere
     specific — a particular company, internship, or graduate scheme — tell me
     and I will re-weight the emphasis.
- Also worth confirming (minor):
     The accessibility figures in 4.1 and 4.6 (4.5:1 contrast, 44×44 targets)
     come from your own README.
- I verified the 44×44 targets in the CSS but did
     not independently re-measure contrast ratios.
- If you did measure them,
     they are safe to publish as written.

================================================================================
END
================================================================================
- Skills: Front-End Development, HTML5, Cascading Style Sheets (CSS), Responsive Web Design, Web Development, Progressive Web Applications (PWA), REST APIs, Data Visualization, Web Accessibility, Git, GitHub, GitHub Actions, Bootstrap, Chart.js, UI/UX Design, Continuous Integration and Continuous Delivery (CI/CD), Software Design Patterns, Mobile-First Design, Web Performance Optimization, Technical Documentation

### Visual-Sentinel (May 2024 – October 2026)
AI/Computer Vision Engineer, Embedded Systems Engineer, and Full-Stack Developer · KAFD, JODBI and GJU
[Project](https://hamza928505.github.io/VisualSentinel/) · [Source](https://github.com/Hamza928505/VisualSentinel)

- ### 1.
- General Project Information

*   **Project Name:** Visual Sentinel
*   **One-line Description:** An edge-based, cloud-free AI stereo vision system for drone detection, 3D localization, and payload inspection.
*   **What problem does the project solve?** Detecting, precisely locating (in 3D space), and inspecting drones in real-time using entirely off-grid, edge-deployed hardware. 
*   **Why is this problem important?** As drones become ubiquitous, unauthorized or malicious drone flights pose significant security risks to airports, critical infrastructure, and private events.
- Having a system that works at the edge—without relying on cloud infrastructure or internet access—is critical for field deployment and rapid response.
*   **Who are the target users or beneficiaries?** Defense contractors, physical security teams, border patrol, airspace regulators, and computer vision researchers.
*   **What makes the project useful or different?** It successfully bridges multiple disciplines: hardware (dual Canon cameras + Raspberry Pis), embedded systems (C orchestration), geometric math (stereo triangulation), and deep learning (YOLOv8 + custom PyTorch regression network).
- It also includes a unique feature that uses multi-frame super-resolution (homography) to reconstruct clear images of the drone's sides to check for attached payloads.
*   **Real-world applications and potential impact:** Airspace monitoring, defense tracking systems, perimeter security, and identifying smuggled items or explosives attached to drones.
*   **What I learned from building it:** How to design an end-to-end system architecture.
- This project goes far beyond a simple ML tutorial; it demonstrates hardware-software synchronization, dealing with physical real-world noise (IMU tilt, disparity collapse at long distances), and building full-stack applications (from C-level networking to interactive web dashboards).
*   **What skills the project demonstrates:** Systems engineering, hardware integration, computer vision (stereo geometry), deep learning, embedded C programming, Python, and frontend visualization.
*   **What makes this project worth mentioning on LinkedIn:** It is a massive, highly complex graduation project grounded in real-world constraints (107 actual field experiments).
- It proves you can handle messy, real-world data and engineer robust solutions around hardware limitations.

---

### 2.
- Technical Information

*   **Architecture and overall workflow:** Dual Raspberry Pi 4 edge nodes equipped with IMUs and GPS are synchronized via a C orchestrator.
- They capture stereo video streams.
- A fine-tuned YOLOv8 detects the drone. 3D position is estimated via two paths: an IMU-corrected stereo triangulation calculation, and a custom PyTorch ML regression network.
- The resulting 3D coordinates (Height, Depth, lateral X) are projected into global GPS coordinates and displayed on a Leaflet map.
*   **Technologies, frameworks, libraries:** Python 3.9, PyTorch 2.x, YOLOv8 (Ultralytics), C (Embedded), HTML/CSS/JavaScript, OpenCV, Leaflet.js.
*   **Hardware:** Raspberry Pi 4 (dual), Canon EOS R10 cameras, MPU-6050 IMUs, GPS modules.
*   **AI/ML components:** 
    *   YOLOv8s fine-tuned with heavy augmentation on combined datasets for drone detection.
    *   **DroneDepthNet:** A custom residual Multi-Layer Perceptron (MLP) trained to predict target depth and height using 26 engineered features (physics, bounding box sizes, IMU data).
*   **Algorithms or important technical approaches:**
    *   Stereo Triangulation ($Z = f \times B / d$).
    *   IMU Sensor Fusion to correct camera tilt (Roll) and geometric height/depth estimates.
    *   Multi-frame super-resolution using SIFT keypoints, kNN matching, and RANSAC homography to reconstruct airframe sides.
    *   Log-space target regression to prevent large-distance errors from dominating the loss function.
*   **Important technical challenges & Solutions:**
    *   *Challenge:* Triangulation disparity collapses at long ranges, causing massive depth errors. 
    *   *Solution:* Engineered `DroneDepthNet`, an ML model that looks at bounding box apparent size, confidence, and IMU data to estimate depth independent of pure pixel disparity.
    *   *Challenge:* Camera rigs are rarely perfectly level, ruining height estimates. 
    *   *Solution:* Integrated MPU-6050 IMUs and wrote a mathematical fusion layer to apply a roll-correction rotation matrix before calculating geometry.
    *   *Challenge:* Recognizing payloads on tiny, noisy drone images.
    *   *Solution:* Designed a homography-based fusion pipeline to warp and stack multiple frames, canceling noise and super-resolving the drone's side profiles.
*   **Performance/Evaluation:** Rigorously evaluated using 107 field experiments with strict Train/Val/Test splits stratified by camera baseline.

---

### 3.
- LinkedIn Positioning

*   **Strongest technical skills to list:** Computer Vision, Deep Learning (PyTorch), Edge AI / Edge Computing, Sensor Fusion, Embedded Systems (C), Python, YOLO.
*   **Strongest soft/professional skills:** End-to-end system architecture, hardware-software integration, rigorous scientific testing, solving physical/real-world constraints.
*   **Relevant keywords:** Computer Vision, Object Detection, Stereo Vision, Sensor Fusion, PyTorch, Edge AI, Raspberry Pi, ML Regression, Geospatial mapping.
*   **Roles this project supports:** Computer Vision Engineer, Machine Learning Engineer, Edge AI Developer, Embedded Software Engineer, Robotics Software Engineer.
*   **What is impressive enough to highlight:** The custom `DroneDepthNet` regression network (and training it in log-space), the multi-frame homography super-resolution for payload inspection, and the sheer scale of the system (hardware + C + Python ML + Web Dashboard + 107 real-world experiments).
*   **What is unnecessary/too low-level:** Exact pixel formulas, file paths (e.g., `make_shareable.py`), and the exact number of nodes in the MLP hidden layers.
- Keep the focus on the *impact* of the engineering choices.

---

### 4.
- LinkedIn-Ready Output

#### 1.
- Short Project Description (For LinkedIn Projects Section)
**Visual Sentinel — Edge AI Stereo Vision System**
Designed and built a complete edge-deployed hardware and software system for real-time drone detection and 3D localization.
- The system synchronizes dual Raspberry Pi and Canon camera units using a custom C orchestrator.
- It features a fine-tuned YOLOv8 model for detection, and uses both geometric stereo triangulation and a custom PyTorch ML regression network (fused with IMU sensor data) to estimate 3D positions without cloud connectivity.
- Evaluated across 107 field experiments, the system projects live coordinates onto an interactive web dashboard and utilizes homography-based multi-frame super-resolution to inspect airframe payloads.

#### 2.
- Strong LinkedIn Post
🚀 I’m incredibly proud to share **Visual Sentinel**, an end-to-end AI drone detection and 3D localization system I built for my graduation research project!

With drones becoming increasingly common, detecting and precisely tracking them in 3D space—especially at the edge without internet access—is a complex and critical challenge for physical security.
- I wanted to see if I could build a completely off-grid solution from the ground up.
- Over the past year, I integrated custom hardware, embedded C, computer vision, and deep learning into one cohesive pipeline:

📷 **Hardware & Edge Orchestration:** Dual Raspberry Pi 4 units equipped with Canon cameras, IMUs, and GPS, fully synchronized over a local network using a custom C-based CLI.
🤖 **Edge AI Detection:** A fine-tuned YOLOv8 model detects aerial targets in real-time under diverse sky conditions.
📍 **3D Localization & Sensor Fusion:** To calculate physical distance and height accurately, I engineered two independent paths:
1️⃣ A geometric stereo triangulation pipeline fused with IMU orientation data to correct for camera tilt.
2️⃣ **DroneDepthNet**: A custom PyTorch regression network using 26 engineered physical features to overcome the limitations of stereo disparity at long distances.
🔍 **Payload Inspection:** I built a multi-frame super-resolution pipeline using SIFT and homography to generate clear, magnified images of the drone's sides to check for attached payloads.
🗺️ **Live Dashboard:** The local 3D coordinates are projected into global GPS coordinates and visualized on an interactive Leaflet map.
- Evaluating this required conducting 107 structured field experiments.
- It was an amazing journey learning how to handle real-world physical noise with software and ML!

Check out the architecture and project details here: [Link to GitHub/Demo]
Let me know your thoughts or questions below! 👇

#ComputerVision #EdgeAI #MachineLearning #PyTorch #YOLOv8 #EmbeddedSystems #RaspberryPi #GraduationProject #SoftwareEngineering

#### 3.
- Technical Version (For engineering audiences / GitHub bio)
Built a fully localized, cloud-free stereo vision pipeline for UAV tracking.
- The system architecture leverages dual Raspberry Pi edge nodes managed by a custom multi-process C orchestrator for hardware synchronization.
- Object detection is handled by a fine-tuned YOLOv8 model.
- To solve the problem of disparity collapse at long distances, I developed `DroneDepthNet`—a PyTorch residual MLP trained on log-space targets that regresses drone depth and height using a 26-feature vector combining bounding box apparent size, stereo disparity, and MPU-6050 IMU sensor fusion.
- The pipeline is robust to physical camera tilt and includes a SIFT/RANSAC homography layer for multi-frame super-resolution of the tracked object.
- Visualizations and geographic (GPS) projections are handled via a custom JS/Leaflet dashboard. 

#### 4.
- Non-Technical Version (For recruiters)
I designed and developed "Visual Sentinel," a smart camera system capable of automatically detecting drones and calculating exactly where they are in the sky.
- Because it was designed for security use cases, I engineered it to run completely "at the edge," meaning it processes all the AI and mathematics on local mini-computers without needing an internet connection.
- The system can even take blurry, distant video of a drone and enhance it to check if the drone is carrying a dangerous payload.
- I successfully tested and proved the system in the real world across over 100 field experiments.

#### 5.
- Relevant LinkedIn Skills/Keywords
- **Deep Learning / AI:** PyTorch, YOLOv8, Machine Learning, Neural Networks, Sensor Fusion.
- **Computer Vision:** OpenCV, Stereo Vision, Homography, Object Detection, Image Super-Resolution.
- **Software Engineering:** Python, Embedded C, Edge Computing, Hardware-Software Integration.
- **Tools / Other:** Raspberry Pi, GPS/Geospatial Mapping, JavaScript (Leaflet.js).

#### 6.
- CV Bullet-Point Version
*   **Designed and built an edge-deployed AI stereo vision system** capable of real-time drone detection and 3D geospatial localization without cloud dependencies.
*   **Developed a custom C-based orchestration tool** to synchronize dual Raspberry Pi edge nodes, managing network discovery, hardware IMU polling, and synchronized camera triggering.
*   **Fine-tuned a YOLOv8 object detection model** and integrated it with an IMU-corrected stereo triangulation pipeline to track aerial targets in 3D space.
*   **Engineered "DroneDepthNet," a PyTorch residual MLP** that regresses target depth and height using 26 engineered physical features, overcoming standard stereo disparity limitations at long ranges.
*   **Built a multi-frame super-resolution pipeline** using SIFT, RANSAC, and homography to rebuild clear, magnified images of airframe sides for payload inspection.
*   **Conducted 107 structured field experiments** to rigorously evaluate system accuracy, projecting the calculated local 3D coordinates onto a global GPS web dashboard.
- Skills: Computer Vision, Deep Learning, Machine Learning, PyTorch, Python, Object Detection, Embedded Systems, Edge Computing, Sensor Fusion, OpenCV, Stereo Vision, 3D Computer Vision, Image Processing, Image Super-Resolution, Feature Detection, Homography, SIFT, RANSAC, Camera Calibration, Embedded Software, Edge AI, Raspberry Pi, Hardware-Software Integration, System Integration, Systems Engineering, C, Embedded C, JavaScript, HTML, CSS, IMU, GPS, Robotics, 3D Localization, Geospatial Data, Computer Vision Systems, Leaflet, Data Visualization, Interactive Maps, Front-End Development, Neural Networks, YOLO, Regression Analysis, Model Training, Model Evaluation

### OpenCharts (May 2026 – Present)
Frontend Engineer, Software Engineer and Data Visualization Engineer
[Project](https://hamza928505.github.io/OpenCharts/) · [Source](https://github.com/Hamza928505/OpenCharts)

- # OpenCharts: Project Analysis & LinkedIn Positioning

## 1.
- General Project Information
* **Project Name**: OpenCharts
* **One-Line Description**: A privacy-first, zero-build data visualization library of 114 interactive chart types that turns your spreadsheets into production-ready code or tailored AI prompts.
* **Problem Solved**: Visualizing data on the web is tedious.
- Developers often struggle with complex charting APIs, wrestling with data formats, and modifying broken examples.
- Handing it off to AI tools usually results in hallucinated syntax or broken D3 code.
* **Why Important**: It bridges the gap between raw data and web-ready visualizations instantly, without forcing users to compromise their data privacy by uploading it to a third-party server.
* **Target Users**: Software Engineers, Data Analysts, UI Developers, and Technical Writers.
* **What Makes it Different**: The "Match my data" feature automatically filters the 114 charts to only those that mathematically fit the user's uploaded spreadsheet.
- It processes everything locally in the browser (no server uploads) and exports exact HTML/CSS/JS code, standalone pages, or AI prompts.
- It achieves all this with absolutely no build step.
* **Real-World Applications**: Rapid prototyping of data dashboards, generating production-ready code for web applications, creating accessible and colorblind-safe data reports, and assisting LLMs in writing accurate charting code.
* **What I Learned**: Building a complex frontend architecture without a bundler, managing massive datasets (like 150k+ geographical coordinates) in-browser, abstracting multiple rendering engines (Chart.js, D3, Canvas) behind a unified interface, and writing rigorous headless E2E tests for visual elements.
* **Skills Demonstrated**: Vanilla JavaScript mastery, Data Visualization, UI/UX Design, Automated E2E Testing, AI Integration, and Performance Optimization.
* **LinkedIn Worthiness**: It is a massive, highly polished engineering effort solving a real developer pain point.
- Features like in-browser Excel parsing, a suite of 655 E2E tests, and deep accessibility features show senior-level attention to detail and engineering maturity.

## 2.
- Technical Information
* **Architecture & Workflow**: A pure frontend, zero-build vanilla JavaScript (ES modules) application.
- Data flows from local file parsing -> session storage -> in-memory transformation pipeline (filter, group, bin, sort, limit) -> unified chart registry -> specific rendering engine.
* **Technologies Used**: Vanilla JavaScript (ES6+), HTML5 Canvas, SVG, CSS, Playwright.
* **Renderers**: Chart.js, D3.js, custom Canvas 2D engines, custom OpenCharts engine, and DOM/CSS.
* **Data Handling**: Client-side `FileReader` parsing for `.xlsx`, `.csv`, `.tsv`, and `.txt` files.
- No network requests are made for data processing.
* **AI Integration**: Dynamically generates tailored AI prompts containing the exact data schema, current table state, and isolated source code to prevent LLM hallucinations during hand-off.
* **Deployment/Infrastructure**: Published via GitHub Packages with automated CI/CD workflows using GitHub Actions.
* **Technical Challenges**: 
  - Ensuring smooth UI performance while parsing and transforming large spreadsheets entirely in-memory.
  - Abstracting 5 radically different rendering engines (SVG vs Canvas vs DOM) under a single UI/UX workflow and spec format.
  - Guaranteeing accessibility dynamically (e.g., advising on colorblindness overlaps instantly for any generated palette).
* **Solutions**: 
  - Built a custom linear data transformation pipeline before rendering, meaning calculations are only done once as an edit rather than reactive layers.
  - Created a robust chart registry pattern to decouple the editor UI from the renderers.
  - Implemented real-time color-contrast and deficiency checking algorithms.
* **Performance & Scale**: Instant load times due to the zero-build architecture.
- Only requested dependencies are loaded at runtime.
- Tested against hundreds of edge cases with 655 Playwright headless E2E tests to ensure absolute stability.

## 3.
- LinkedIn Positioning
* **Strongest Technical Skills**: JavaScript (ES6+), Frontend Architecture, Data Visualization (D3.js, Chart.js, HTML5 Canvas), Playwright (E2E Testing), CI/CD.
* **Strongest Soft Skills**: Empathy (Accessibility & UX focus), Product Thinking, Problem Solving, Technical Documentation.
* **Keywords for Recruiters**: Vanilla JS, Data Visualization, D3.js, Frontend Engineering, No-Build, Playwright, E2E Testing, Accessibility (a11y), Generative AI Integration.
* **Roles Supported**: Frontend Engineer, Software Engineer, UI Developer, Developer Tooling Engineer.
* **Impressive Details to Highlight**: 
  - The massive test suite (655 headless E2E tests).
  - 100% client-side processing of Excel/CSV for strict privacy.
  - The zero-build vanilla JS architecture (rare nowadays and shows deep language understanding).
  - The innovative AI prompt generation to fix LLM charting hallucinations.
* **What to Omit**: Low-level implementation details of specific CSS quirks, basic HTML setup, or the exact npm commands to install dependencies.
- Keep the focus on architecture, scale, and user impact.

## 4.
- LinkedIn-Ready Output

### 1.
- Short Project Description (For LinkedIn 'Projects' Section)
**OpenCharts**
*A privacy-first, zero-build data visualization library of 114 interactive charts.
- It processes Excel and CSV files entirely in the browser to recommend compatible charts, allowing users to live-edit and export production-ready HTML/CSS/JS, standalone components, or hallucination-free AI prompts.
- Tested robustly with 650+ E2E Playwright tests.*

### 2.
- Strong LinkedIn Post (Professional yet Natural)
I recently built **OpenCharts**, an interactive library of 114 chart types designed to fix how tedious web data visualization can be.
- Usually, charting means wrestling with complex APIs, fighting bundlers, or watching AI hallucinate broken D3 syntax.
- I wanted to build something faster, safer, and completely frictionless.
- Here’s what makes OpenCharts different:
🔒 **100% Privacy-First:** It parses Excel and CSV files entirely in the browser.
- Zero data is ever sent to a server.
⚡ **Zero-Build Architecture:** Built with pure Vanilla JS and ES modules.
- No Webpack, no Vite—just instant loading.
🧠 **Smart AI Integration:** It generates context-aware AI prompts that inject your exact data schema and codebase, completely eliminating LLM hallucinations when handing off to Claude or ChatGPT.
📊 **"Match My Data":** Paste a spreadsheet, and the engine instantly filters the 114 charts to show only the ones that mathematically fit your data structure.
✅ **Robustly Tested:** Backed by an automated CI suite of 655 headless Playwright tests.
- It also includes built-in data reshaping, real-time colorblind-accessibility warnings, and full screen-reader support.
- You can check out the source code and try it live here: [Link]
I’d love to hear what the developer community thinks of the zero-build approach! 👇

#JavaScript #DataVisualization #FrontendEngineering #WebDevelopment #D3js #Playwright

### 3.
- Technical Version (For Engineers/Developers)
**OpenCharts: A Zero-Build Visualization Pipeline**
I engineered OpenCharts, a vanilla JS web application that abstracts 5 rendering engines (Chart.js, D3, Canvas 2D, OpenCharts custom engine, DOM) across 114 chart types.
- The core challenge was handling large-scale data transformation securely.
- I built a client-side parsing engine (leveraging the FileReader API) that processes `.xlsx` and `.csv` files locally, passing data via session storage into a custom linear pipeline (filter -> group -> bin -> sort).
- To ensure the zero-build setup remained robust, I implemented a comprehensive CI/CD pipeline using GitHub Actions, running 655 headless Playwright E2E tests that validate canvas rendering, data injection, and generated HTML/CSS/JS exports.
- Additionally, I integrated an AI prompt generator that dynamically bundles the chart's source and data schema to prevent LLM hallucination during code generation.

### 4.
- Non-Technical Version (For Recruiters/General Audience)
**OpenCharts: Making Data Easy to See and Share**
I developed a web tool called OpenCharts that helps businesses and analysts instantly turn raw spreadsheets into beautiful, interactive charts.
- One of the biggest challenges companies face is data privacy—so I designed this tool to process all data locally on the user's computer without ever uploading it to a server.
- Users simply paste their data, and the system automatically recommends the best charts, warns them if the colors aren't colorblind-friendly, and generates the exact code needed to paste into their own websites.
- It's built to be lightning-fast, highly secure, and extremely user-friendly.

### 5.
- Relevant LinkedIn Skills/Keywords
* JavaScript (ES6+)
* Frontend Architecture
* Data Visualization
* D3.js
* Chart.js
* HTML5 Canvas
* Automated Testing (Playwright)
* Continuous Integration/Continuous Deployment (CI/CD)
* Web Accessibility (a11y)
* Prompt Engineering / AI Integration

### 6.
- CV Bullet-Point Version
* Engineered a privacy-first, zero-build web application in Vanilla JavaScript, abstracting 5 rendering engines (D3, Chart.js, Canvas) to deliver 114 interactive chart types.
* Implemented 100% client-side parsing for Excel and CSV files, enabling secure, in-browser data transformations without server uploads.
* Built a dynamic AI prompt generator that injects data schemas and isolated code to prevent LLM hallucinations during chart scaffolding.
* Authored a rigorous suite of 655 headless E2E tests using Playwright in a CI/CD pipeline to guarantee rendering accuracy and export reliability.
* Integrated real-time accessibility features, including colorblindness deficiency algorithms and automated screen-reader descriptions.
- Skills: JavaScript, JavaScript ES6, Frontend Development, Frontend Architecture, Software Engineering, Web Development, Data Visualization, D3.js, Chart.js, HTML5, HTML5 Canvas, CSS, SVG, Playwright, Automated Testing, End-to-End Testing, Continuous Integration, Continuous Deployment, CI/CD, GitHub Actions, Web Accessibility, Accessibility, AI Integration, Generative AI, Prompt Engineering, Data Processing, Data Transformation, Excel, CSV, Performance Optimization, UI/UX Design, User Interface Design, User Experience Design, Vanilla JavaScript, ES Modules, Client-Side Development, Responsive Web Design, Interactive Data Visualization, Developer Tools, Technical Documentation, Git, GitHub

### Little Hands Software (October 2025 – Present)
Full-Stack Engineering, Database Architecture, application security and Real-world business logic · Little Hands Kindergarten

- ================================================================================
LITTLE HANDS - KINDERGARTEN MANAGEMENT SYSTEM
LinkedIn / CV presentation pack
Prepared: 10 September 2026
================================================================================

Everything below is drawn from the actual codebase (both repositories).
- Anything I could not verify from the code is marked [NEEDS INFORMATION] and
listed again at the very end so you can fill it in before posting.


================================================================================
0.
- VERIFIED PROJECT FACTS (the numbers you are allowed to quote)
================================================================================

Two repositories, two phases of the same product:

  Phase 1 - "LittleHands" (ASP.NET Core Web API, v1.0.0)
     ~10,500 lines of C#
     12 controllers in v1 + 2 controllers in v2 (API versioning)
     29 DTOs, 20 FluentValidation validators
     Layered: Controllers -> BAL (business) -> DAL (Dapper) -> MySQL
     JWT auth, Swagger/OpenAPI, Serilog, rate limiting, CORS, health checks

  Phase 2 - "LittleHandsSite" (ASP.NET Core 8 MVC, standalone v2.0.0)
     ~9,200 lines of C# + ~11,800 lines of vanilla JavaScript (37 admin modules)
     23 admin views (Razor), ~4,900 lines of CSS, ~4,700 lines of Razor
     Talks to MySQL directly via Dapper; the API project was folded in
     Cookie authentication, strict CSP, GUID-based routing

  Shared data layer
     MySQL, 20+ tables (students, parents, employees, classrooms, vehicles,
     trips, payment accounts/plans/installments/transactions, attendance,
     expenses, accounts, e-invoices, academic terms)
     9 hand-written, versioned SQL migration scripts

  Timeline: first commit 17 June 2026, still actively developed (Sept 2026)
  Language of the product: Arabic, full RTL interface
  Packaged releases: LittleHands-WithApi-v1.0.0-win-x64 and
                     LittleHands-Standalone-v2.0.0-win-x64 (self-contained)
  Deployment: IIS on Windows; Dockerfile also present

  No AI/ML component.
- Do not claim one - the "intelligence" in this project is
  ordinary deterministic domain logic (scheduling, routing, pattern detection),
  and it is more honest and more impressive to describe it as such.


================================================================================
1.
- GENERAL / PROJECT PERSPECTIVE
================================================================================

--- Project name ---------------------------------------------------------------

Little Hands - Kindergarten Management System

--- One-line description (pick one) ---------------------------------------------

A. "A full Arabic RTL management system for a kindergarten - students, parents,
    staff, buses, attendance and finances - built end to end in ASP.NET Core 8
    and MySQL, from database schema to printable receipts and certificates."

B. "An end-to-end school-administration platform (ASP.NET Core 8, MySQL, Dapper)
    that replaces paper registers and spreadsheets with one Arabic-first system
    covering enrolment, tuition instalments, attendance alerts, bus routing and
    printable official documents."

C. (shortest, for the Projects section headline)
   "Arabic RTL kindergarten management system - ASP.NET Core 8 + MySQL + Dapper."

--- What problem does it solve? ------------------------------------------------

Small private kindergartens run on paper and Excel.
- The same child's data lives
in a registration form, a tuition notebook, an attendance register and the bus
driver's head.
- That causes concrete, everyday failures:

  * Nobody can answer "who hasn't paid?" without reading a payment ledger by eye.
  * Nobody notices a child has been absent four days in a row until someone
    happens to remember.
  * A new bus driver gets a list of names and no idea what order to drive in.
  * Registration contracts, receipts, health cards and graduation certificates
    are hand-filled, and the same child's name is written out five times.
  * Rolling the school into a new academic year (promote, graduate, re-open
    tuition accounts) is a manual re-typing marathon with no undo.
- The system turns each of those into a screen: a "who hasn't paid" page, an
absence-alert page, an optimised bus route on a map, one-click printable
documents, and a reversible academic-year rollover.

--- Why the problem matters ----------------------------------------------------

* It is money and safety, not convenience.
- A missed instalment is unrecovered
  revenue for a small business; an unnoticed absence streak can be a child at
  risk; an unreachable emergency contact during an allergic reaction is the
  worst-case version of "the data was in another notebook".
* Arabic-first administrative software for small institutions is genuinely
  under-served.
- Most affordable school systems are English-first with RTL
  bolted on, which fails on exactly the parts that matter here: printed
  documents, name ordering, number agreement in generated text.
* The staff are not technical.
- If the software is harder than the paper, the
  paper wins - so the whole design constraint was "must be faster than the
  notebook on the first day".

--- Target users / beneficiaries ------------------------------------------------

  Primary   : kindergarten administrator / director (daily operator)
  Secondary : teachers (attendance, class rosters, health cards)
              accountant / owner (tuition, arrears, expenses, tax return)
              bus drivers (printed route sheet with per-student QR navigation)
  Indirect  : parents (accurate receipts, WhatsApp reminders, official
              contracts and certificates)

[NEEDS INFORMATION] Is the system in real daily use at a kindergarten, and
roughly how many students/staff are on it? A single true sentence like "in
daily use at a kindergarten with ~N children" is the strongest line in the
whole post - but only if it is true.

--- What makes it useful / different -------------------------------------------

1.
- It is Arabic-first, not translated.
- RTL layout, Arabic validation messages,
   Arabic ENUM values in the database, Arabic-Indic numerals where a document
   calls for them, and generated sentences that agree with the child's gender -
   because a graduation certificate carries one specific child's name.

2.
- It produces the paperwork the institution actually hands people.
- Registration
   contracts and employment contracts transcribed from the real Word originals,
   payment receipts with the amount written out in Arabic words, A4 health and
   emergency cards, landscape graduation certificates - all print-exact.

3.
- Derived state instead of stored state, deliberately.
- Instalment "paid/overdue"
   status and absence alerts are computed on every request from the underlying
   transactions and attendance rows.
- Cancel a receipt and the student is back in
   the arrears list instantly; fix an attendance record and the alert clears -
   with no reconciliation job, no background worker and no data to migrate.

4.
- Every destructive operation is reversible or guarded.
- The academic-year
   rollover records the *before* state per student, so it can be undone whole or
   one student at a time - and it refuses to undo anything a printed receipt is
   attached to.

5.
- Zero third-party JavaScript at runtime.
- Every library is self-hosted; the
   browser makes no cross-origin call except map tiles.
- All third-party geo work
   is proxied server-side.
- That is what lets the Content-Security-Policy stay
   'self' end to end.

--- Real-world applications and potential impact -------------------------------

* Directly reusable by any small private school or nursery in the Arab world -
  the domain model (terms, plans, instalments, buses, classes) is generic.
* The instalment/arrears engine generalises to any subscription or plan-based
  billing where receipts must stay auditable.
* The bus-route feature generalises to any small last-mile routing problem
  (deliveries, staff shuttles).
* Immediate operational impact for the operator: arrears become a list instead
  of an audit, absences become an alert instead of a memory, and year-end
  rollover becomes one reviewable screen instead of a week of re-typing.

--- What I learned building it -------------------------------------------------

* Deriving state beats storing it.
- The first design stored an instalment's paid
  status; it went stale the moment a receipt was cancelled.
- Recomputing from the
  transactions - a waterfall allocation over the schedule - deleted an entire
  class of bug.
* A destructive feature is not finished until it can be undone.
- Building the
  year rollover was half the work; building the undo, and proving it by dumping
  six tables before and after and diffing them, was the other half.
* Security constraints are design constraints, not a checklist at the end.
- A
  strict CSP forbids inline styles - which means every dynamic value has to move
  to a CSS class or the CSSOM, and that shapes how you write UI code.
* Printing is real engineering.
- A wrong CSS media query fired on paper as well
  as on screen and silently halved a page of cards for months; a fixed-size
  sheet without border-box printed every certificate twice.
- Verifying print
  layout meant automating headless Chrome and counting PDF pages.
* Talking to a non-technical user beats guessing.
- The most-used pages in the
  system - arrears, absence alerts, printable route sheets - all came from
  watching what someone was doing on paper, not from a feature list.
* Refactoring an architecture is allowed.
- Collapsing a separate Web API into the
  MVC app removed a whole deployment unit, the CORS surface and the network hop -
  because there was exactly one client and it was server-rendered.

[NEEDS INFORMATION] Anything you'd add here in your own words? Personal lessons
are the highest-signal part of a LinkedIn post and shouldn't be written for you.

--- Skills the project demonstrates --------------------------------------------

  Full-stack ownership from schema to print stylesheet
  Relational data modelling and hand-written SQL (no ORM to hide behind)
  Transactional integrity across multi-table writes
  Applied security (authn/authz, CSP, SSRF, IDOR, CSRF, upload validation)
  Algorithms applied to a real constraint (TSP heuristics, allocation, pattern
    detection over time series)
  API design, versioning and documentation
  Legacy/architecture migration (API -> standalone) without breaking the client
  Localisation and RTL/internationalisation done properly
  Requirements gathering from a non-technical stakeholder
  Deployment and packaging (IIS, self-contained builds, Docker)

--- Why it's worth posting on LinkedIn -----------------------------------------

It is a complete product, not a tutorial project: real users, real money moving
through it, real printed documents, a real migration between two architectures,
and a documented history of bugs found and fixed with evidence.
- It shows
judgement (what to derive vs store, what to make reversible, what to refuse to
do in bulk), which is the thing that separates a student project from
professional work - and judgement is the hardest thing to demonstrate on a CV.


================================================================================
2.
- TECHNICAL PERSPECTIVE
================================================================================

--- Architecture: phase 1 (Web API, v1.0.0) ------------------------------------

  Client -> ASP.NET Core Web API -> BAL -> DAL (Dapper) -> MySQL

  * Classic layered architecture with explicit separation:
      Controllers/            thin HTTP endpoints, versioned (v1, v2)
      BALs/                   business rules per entity (BALStudent, ...)
      Repositories/ + DALs/   interfaces + Dapper implementations
      DTOs/ Requests/ Responses/  transport contracts, ApiResponse<T> wrapper
      Validators/             20 FluentValidation validators
      Middlewares/            global exception handling -> consistent ApiError
      Extensions/             composition root split by concern (auth, CORS,
                              rate limiting, Swagger, versioning, DI)
  * API versioning via Asp.Versioning: route /api/v{version}/[controller],
    with v2 introduced for Student and Payment without breaking v1 clients.
  * JWT bearer authentication (+ API-key scheme documented in Swagger for
    service-to-service), BCrypt password hashing, role-based access.
  * Rate limiting with several named policies (fixed / sliding / strict).
  * Serilog structured logging: console in development, rolling files in
    production, enriched with environment and thread ID.
  * Swagger/OpenAPI UI per version; /health endpoint for liveness.
  * EF Core is referenced and a DbContext exists, but data access is deliberately
    Dapper - hand-written SQL, explicit transactions. (Say this plainly; "I chose
    Dapper over EF and here's why" reads better than pretending EF isn't there.)

--- Architecture: phase 2 (standalone MVC, v2.0.0) -----------------------------

  Browser -> ASP.NET Core 8 MVC (/Admin/api/*) -> Repositories -> MySQL

  Why the migration: there was exactly one consumer of the API and it was a
  server-rendered site owned by the same team.
- Merging them removed a deployment
  unit, the CORS surface, a network hop and a second set of credentials, and let
  the CSP tighten to connect-src 'self'.
- How it was done without a rewrite of the client:
    The API's DALs + BALs + Validators were ported wholesale into
    Data/Repositories/.
- Interfaces were renamed I*ApiService -> I*Repository but
    method signatures were kept identical - so the controller and all 37
    front-end modules needed no changes.
- Same SQL, same transaction boundaries,
    same Arabic validation messages, same { ok, message, data } envelope.
- Server-side pieces worth naming:
    RepositoryBase        RunAsync / RunInTransactionAsync wrappers that
                          translate MySQL error codes (1062 duplicate key,
                          1451/1452 FK, 1364/1366 strict mode) into Arabic
                          user-facing messages inside one result envelope
    IDbConnectionFactory  returns an already-open connection, because
                          LAST_INSERT_ID() is session-scoped
    Validation.cs         an accumulator that collects *all* errors and joins
                          them (matching FluentValidation's old behaviour)
    Pure-function modules InstallmentSchedule.cs, AbsencePatterns.cs,
                          TermRollover.cs, RouteOptimizer.cs - all decision logic
                          with no DB or HTTP, so it is testable in isolation

--- Technology stack -----------------------------------------------------------

  Backend      C#, .NET 8, ASP.NET Core (MVC + Web API)
  Data access  Dapper 2.1, MySql.Data 9.7, hand-written SQL, explicit
               transactions, custom Dapper type handlers (BIT(1)->bool,
               CHAR(36)->Guid, Arabic enum mapping)
  Database     MySQL (20+ tables, InnoDB, FKs, Arabic ENUMs, strict sql_mode
               with ONLY_FULL_GROUP_BY), 9 versioned SQL migrations
  Frontend     Razor views, vanilla JavaScript (ES6, no framework, 37 modules),
               Bootstrap 5 RTL, custom CSS
  Libraries    Leaflet (maps), Chart.js (dashboard), SweetAlert2 (dialogs),
               jQuery + jQuery Validation, AOS (animations), qrcode.js,
               self-hosted Tajawal / Baloo Bhaijaan 2 fonts
               (all self-hosted - no CDN anywhere, by CSP policy)
  API phase    FluentValidation, Asp.Versioning, Swashbuckle/Swagger,
               Serilog (+ enrichers, console/file sinks), JWT Bearer, BCrypt
  External     OpenStreetMap tiles, Nominatim (geocoding), OSRM (driving
               routes), Google Maps short-link resolution - all proxied
               server-side, never called from the browser
  Tooling      Git, Visual Studio, Docker, IIS, dotnet publish (self-contained
               win-x64), dotnet format, headless Chrome via DevTools Protocol
               for print verification

--- Database and data handling -------------------------------------------------

* 20+ tables covering people (students, parents, employees, phone numbers and
  their junction tables), academics (classrooms, terms, attendance), transport
  (vehicles, trips, trip-student stops) and finance (payment accounts, plans,
  instalments, transactions, expenses, e-invoices).
* Multi-table writes run in one transaction.
- Student registration alone is:
  create payment account -> insert student -> link trips -> insert parents and
  their phones -> assign plan -> generate instalment schedule.
- All or nothing.
* Mutually-referencing FKs handled explicitly: the payment account is inserted
  first (the student's account column is NOT NULL), then the student, then the
  account is stamped with the student ID - a documented, deliberate insert order.
* Delete policy is per entity and intentional: people are soft-deleted
  (IsActive = 0), classrooms and payment plans are guarded hard-deletes (refused
  while non-empty), transactions are cancelled rather than removed.
* Migrations are plain, dated, reviewed .sql files applied deliberately - a
  choice, for a single production database whose Arabic ENUMs an automatic
  migration generator handles badly.
* Query discipline: candidate-picker screens fetch students, their current
  class/bus/plan and GROUP_CONCAT-ed parent names and phones in ONE query to
  avoid N+1; bulk link/unlink applies the diff in one UPDATE per direction
  inside a transaction rather than looping per student.

--- Algorithms and notable technical approaches --------------------------------

1.
- Bus route ordering (TSP heuristic)
   Ordering stops is a travelling-salesman problem, not a shortest-path search.
- Implemented as nearest-neighbour from the kindergarten followed by a 2-opt
   improvement pass, with Haversine great-circle distances - enough to order
   nearby stops with no external service and no API key.
- The resulting stop
   order is then sent to OSRM to fetch real road geometry for drawing.
- Students sharing a location are merged into one stop first.

2.
- Instalment schedule + waterfall allocation
   A plan total is divided by the instalment count, rounded to 2dp, with the
   remainder added to the last instalment so the schedule sums to the plan total
   exactly (550 over 9 = 61.11 x 8 + 61.12).
- Paid-ness is never stored: the
   account's non-cancelled transactions are summed and waterfalled across
   instalments in due-date order to derive status and days-late.
- A grace period
   separates "late" from "flagged", and the reported days-late remains the true
   figure during the grace window.

3.
- Absence pattern detection
   Two rules over attendance history, and they treat an excused absence
   differently on purpose.
- A consecutive-absence streak counts only unexcused
   absences and is broken by any other status - because the alert means "the
   child is missing and we don't know why".
- An attendance-rate drop over a
   rolling 30-day window counts excused absences as absent - because that metric
   asks "is the child in class?".
- Consecutive means consecutive *recorded* days
   (weekends have no row), windows are rolling not calendar, and a minimum
   number of recorded days prevents a newly-enrolled child from being flagged
   instantly.

4.
- Reversible academic-year rollover
   Promotes each cohort a level, graduates the top level, and opens a NEW payment
   account per student for the new year - not a re-assigned plan, because
   regenerating a schedule on the same account would erase last year's debt.
- Two
   accounts means two independent debts and last year's stays collectable.
- Every
   moved student's *before* state (level, class, plan, account) is logged, which
   is what makes undo possible - whole-cohort or single-student - and the undo
   refuses outright if a receipt was already issued against an account the
   rollover created.

5.
- Client-side rule engine mirrored from the server
   Bulk-assign eligibility (grade level vs class level, transport plan required
   for a bus, inactive students excluded) lives in one dependency-free module so
   the UI can list every excluded student *by name and reason* before sending the
   request, instead of the server silently dropping them.
- Exclusions are matched
   by ID, never by name - siblings and cousins share names in this dataset.

--- Security ------------------------------------------------------------------

  Authentication   Cookie auth, HttpOnly + SameSite=Strict + Secure in
                   production, sliding expiry; fallback authorization policy so
                   the whole app is authenticated by default and only public
                   pages opt out
  Password hashing PBKDF2-HMAC-SHA256 at 600,000 iterations (OWASP guidance),
                   stored as pbkdf2-sha256$iterations$salt$hash so parameters
                   travel with the hash; constant-time verification, and a dummy
                   hash computed for unknown usernames so response timing does
                   not reveal whether an account exists
  Authorization    Role-gated admin area; non-admin roles are refused at login
                   rather than let into a dead end
  IDOR             Every URL-exposed identifier is a GUID on all entity tables;
                   sequential integer IDs never leave the server
  CSRF             Antiforgery validation applied globally to every non-GET
  Rate limiting    Per-IP global limit, plus a much stricter policy on login
  CSP              default/script/style/font/connect-src 'self', object-src
                   'none', frame-ancestors 'none' - one documented exception for
                   OpenStreetMap tile images.
- No inline styles or handlers
                   anywhere, including in JS-generated markup
  SSRF             The Google-Maps link resolver fetches a user-supplied URL, so
                   its HttpClient uses a connect callback that refuses any
                   non-public IP (loopback, private, link-local incl. the cloud
                   metadata address, CGNAT, ULA) - checked on every redirect hop
                   and at the actually-connected address, so DNS rebinding fails
                   too; response body capped at 512 KB
  File upload      Extension allow-list AND magic-number verification of the real
                   file header, 2 MB cap, entity allow-list, sequential
                   server-side naming
  Headers          nosniff, X-Frame-Options DENY, Referrer-Policy,
                   Permissions-Policy, COOP/CORP, HSTS in production
  Open redirect    returnUrl validated against local URLs only

--- Performance / scalability considerations -----------------------------------

* Single-query candidate loading with GROUP_CONCAT instead of N+1 per student.
* Set-based bulk operations: one UPDATE per direction inside a transaction.
* Derived financial state avoids a reconciliation job entirely.
* Aggregated dashboard endpoint instead of a dozen per-widget calls.
* Front-end table behaviour (sorting, pagination, CSV export, responsive
  stacking) is one shared module driven by data attributes, so a new list page
  costs zero extra JavaScript.
* Honest scope note: this is a single-institution system on a single MySQL
  instance.
- It is not architected for multi-tenancy or horizontal scale, and
  saying so is better than implying otherwise.
- The known hardening item before
  any public deployment is replacing the elevated database connection with a
  least-privilege user scoped to the schema.

--- Integrations ---------------------------------------------------------------

  OpenStreetMap tiles     map rendering (Leaflet)
  Nominatim               address -> coordinates geocoding (server-side)
  OSRM                    real driving-route geometry, distance and duration
  Google Maps short links resolved server-side by following redirects to
                          extract pin coordinates from a parent-pasted link
  WhatsApp (wa.me)        pre-filled Arabic message links for absence, payment
                          reminder and bus-delay templates - link only, nothing
                          is sent automatically, no API, no cost, and no phone
                          number or message text ever passes through the server
  QR codes                per-student Google Maps link on the printed driver
                          route sheet, generated locally as a data: URI

--- Interesting implementation details (the ones engineers will react to) ------

* Blocked-verb tunnel.
- Some client security suites silently drop PUT and DELETE,
  which presents as "adding works, editing and deleting don't - on one machine".
- The client always tries the real verb first, and only on a network failure or
  405 retries once as POST with X-HTTP-Method-Override, then remembers the
  fallback for the session.
- The server restores the method before routing, and
  deliberately refuses to honour an override to GET - because the antiforgery
  filter exempts GET, so allowing it would be a CSRF bypass.
* Localised date input.
- A browser renders <input type="date"> in the OS locale,
  and no HTML or CSS attribute changes it - so an English Windows shows
  mm/dd/yyyy on an Arabic page.
- The fix is a visible text field in DD/MM/YYYY
  layered over the native control, with the element's value property redefined
  so programmatic writes stay in sync.
- Applied globally; zero per-page code.
* Never format a display date via new Date(v).toISOString().
- The API returns a
  zone-less timestamp, the browser reads it as local, and converting back to UTC
  lands a full day early in Jordan (UTC+3).
- Dates are sliced textually instead.
* Print engineering, verified not assumed. @page margin 0 is what suppresses the
  browser's own header/footer; a responsive breakpoint must be scoped to
  "@media screen" or it fires on paper too (A4 at zero margin is 794px); page
  padding must sit on a per-sheet element because a container's padding-top is
  painted once, not per fragment.
- All confirmed by driving headless Chrome's
  Page.printToPDF with preferCSSPageSize and counting pages - the CLI
  --print-to-pdf flag ignores @page size and silently renders US Letter.
* No quotation marks around names in UI text.
- Multi-word Arabic names were being
  wrapped in guillemets purely to separate them from the surrounding sentence;
  they are now rendered as their own bold line, statuses as coloured chips and
  control names as pills - the separation is visual, which is what it should
  have been.
* CSV export with a UTF-8 BOM and CRLF, because Excel otherwise decodes Arabic
  names as mojibake, plus formula-injection defusing for cells beginning = @ + -
  (while deliberately leaving +962 phone numbers and negative amounts alone).


================================================================================
3.
- LINKEDIN POSITIONING
================================================================================

--- Strongest technical skills to list -----------------------------------------

  C#  |  .NET 8  |  ASP.NET Core MVC  |  ASP.NET Core Web API  |  REST API design
  SQL  |  MySQL  |  Dapper (micro-ORM)  |  Database design  |  Query optimisation
  JavaScript (ES6)  |  HTML5  |  CSS3  |  Bootstrap  |  Razor
  Authentication & authorisation  |  Web application security (OWASP)
  Git  |  Docker  |  IIS deployment  |  Software architecture  |  Full-stack dev
  Internationalisation / RTL  |  Data modelling  |  Algorithms

--- Strongest soft / professional skills ---------------------------------------

  Requirements gathering from non-technical stakeholders
  Product thinking (choosing what to build from watching real work)
  Technical decision-making and documenting trade-offs
  Attention to correctness in domains where mistakes cost money
  Independent end-to-end ownership and delivery
  Debugging discipline (evidence-based, verified rather than assumed)
  Written technical communication and documentation
  Long-term maintenance of a real system with real users

--- Keywords recruiters search for ---------------------------------------------

  ASP.NET Core, .NET 8, C#, MVC, Web API, REST API, Dapper, MySQL, SQL,
  Entity Framework, JWT, authentication, CSRF, CSP, OWASP, Swagger, OpenAPI,
  API versioning, FluentValidation, Serilog, Razor, Bootstrap, JavaScript,
  jQuery, Leaflet, Chart.js, Docker, IIS, Git, full-stack developer, backend
  developer, .NET developer, software engineer, database design, transactions,
  RTL, Arabic localisation, school management system, ERP

--- Roles this project supports ------------------------------------------------

  Strong fit   : Backend Developer (.NET) - the strongest fit
                 Full-Stack Developer (.NET / MVC)
                 Software Engineer (graduate / junior)
                 .NET Developer
  Reasonable   : Web Developer, Database Developer, Application Support Engineer
  Partial      : Application Security (you can speak credibly to CSP, SSRF,
                 IDOR, CSRF, password hashing - as a developer with a security
                 mindset, not as a security specialist; frame it that way)
  Not supported: AI/ML Engineer, Data Scientist.
- There is no ML in this project
                 and claiming otherwise will not survive a first interview.

--- Worth highlighting publicly ------------------------------------------------

  YES  The scale and completeness (two architectures, ~20k lines, 20+ tables,
       real users, real printed documents)
  YES  The API -> standalone consolidation, and *why* it was the right call
  YES  Derived-vs-stored financial state, and the bug class it eliminated
  YES  The reversible rollover and the receipt guard that blocks a bad undo
  YES  The security posture as a whole (CSP 'self', PBKDF2 600k, GUID routing,
       SSRF guard, magic-number upload validation)
  YES  The TSP heuristic for bus routing - concrete CS applied to a real need
  YES  Arabic-first / RTL as an engineering constraint, not a checkbox
  YES  One or two verified debugging stories - the print-CSS media-query bug and
       the PUT/DELETE tunnel are the two best

--- Too low-level for LinkedIn -------------------------------------------------

  NO   Specific column typos in the legacy schema
  NO   Element-ID collisions between partial views
  NO   Individual CSS class names, DOM IDs, file paths
  NO   Bootstrap utility-class choices, exact pixel breakpoints
  NO   Anything reading as a bug list - one story with a lesson, not five
  NO   Local ports, connection strings, credentials, database usernames
  NO   Real names, phone numbers or any data from the live database
  NO   The exact grace-period and threshold constants (interview material, not
       post material)


================================================================================
4.
- LINKEDIN-READY OUTPUT
================================================================================

--------------------------------------------------------------------------------
4.1  SHORT PROJECT DESCRIPTION (LinkedIn "Projects" section)
--------------------------------------------------------------------------------

Little Hands - Kindergarten Management System
ASP.NET Core 8 - MySQL - Dapper - JavaScript   |   June 2026 - present

A full Arabic (RTL) management system for a kindergarten, built end to end:
student and staff registration, parent records, classrooms, attendance,
tuition plans with instalment scheduling and arrears tracking, expenses, bus
routes on a map, and print-ready official documents (contracts, receipts,
health & emergency cards, graduation certificates).
- Started as a versioned ASP.NET Core Web API (JWT, Swagger, FluentValidation,
Serilog) with a separate MVC front-end, then consolidated into a single
standalone MVC application talking to MySQL directly through Dapper - removing
a deployment unit, the CORS surface and a network hop while keeping the client
code unchanged.
- Technical highlights: transactional multi-table writes across a 20+ table
schema; instalment status derived from transactions rather than stored, so
cancelling a receipt instantly restores the debt; a reversible academic-year
rollover that logs each student's prior state and refuses to undo anything a
printed receipt depends on; nearest-neighbour + 2-opt bus-route ordering with
OSRM road geometry; and a strict security posture (CSP 'self', PBKDF2-HMAC-SHA256
at 600k iterations, GUID-only public identifiers, global CSRF validation,
SSRF-guarded outbound fetches, magic-number upload validation).

--------------------------------------------------------------------------------
4.2  LINKEDIN POST - general / professional version
--------------------------------------------------------------------------------

I've spent the last few months building Little Hands, a management system for a
kindergarten - and it taught me more than any course I've taken.
- The starting point wasn't a feature list.
- It was a notebook.
- Tuition in one
book, attendance in a register, bus stops in the driver's head, and the same
child's name hand-written on five different forms.
- So the questions that matter
most to a small school were the hardest ones to answer: who hasn't paid? who
has been missing all week? what order does the bus drive in?

The system is now one Arabic (RTL) application covering registration, parents,
staff, classrooms, attendance, tuition plans and instalments, expenses, bus
routes on a map, and every document the kindergarten actually hands to people -
contracts, receipts, health & emergency cards and graduation certificates, all
print-exact on A4.
- Three decisions I'd defend in any code review:

-> Payment status is calculated, never stored.
- Instalments are worked out from
   the actual receipts on every request.
- Cancel a receipt and the student is back
   in the arrears list immediately - no reconciliation job, no stale rows.

-> Anything destructive has to be reversible.
- Rolling the school into a new
   academic year promotes every child, graduates the oldest class and opens new
   tuition accounts.
- It records each student's previous state, so it can be
   undone - for the whole cohort or one child - and it refuses to undo anything
   a printed receipt already depends on.

-> Security is a design constraint, not a final checklist.
- Strict CSP, GUID-only
   public identifiers, PBKDF2 password hashing, CSRF on every write, and
   magic-number validation on uploads.
- All of that shaped how the code is
   written, not what was bolted onto it at the end.
- It also began life as a separate Web API with an MVC client, and I later merged
the two.
- One consumer, one team - the extra service was buying complexity and
nothing else.
- Being willing to undo your own architecture turned out to be a
skill of its own.
- Tech: C#, .NET 8, ASP.NET Core MVC, MySQL, Dapper, JavaScript, Bootstrap RTL,
Leaflet, Chart.js, Docker, IIS.
- Happy to talk about any part of it - especially the financial modelling or the
security side.

#dotnet #csharp #aspnetcore #mysql #softwareengineering #fullstack #webdevelopment

--------------------------------------------------------------------------------
4.3  TECHNICAL VERSION - for developers / engineers
--------------------------------------------------------------------------------

Little Hands: an Arabic-first kindergarten management system in ASP.NET Core 8.
- A few implementation decisions worth writing down.

1) Derived state over stored state.
- Instalment "paid / overdue" is not a column.
- The repository sums the account's
non-cancelled transactions and waterfalls that total across the schedule in
due-date order to derive status and days-late.
- The schedule itself divides the
plan total by the instalment count and pushes the rounding remainder into the
last instalment, so it sums to the total exactly (550 over 9 = 61.11 x 8 +
61.12).
- Payoff: cancelling a receipt puts the student straight back into
arrears, with no reconciliation job and no migration.
- Same principle for absence
alerts - detection rules are pure functions re-run per request, so correcting an
attendance record clears the alert immediately.

2) The rollover is reversible because it records the "before", not an inverse.
- Year-end promotes each level, graduates the top one, and opens a NEW payment
account per student - not a re-assigned plan, because regenerating a schedule on
the same account would erase last year's debt.
- Two accounts, two independent
debts, last year's still collectable.
- Each moved student's prior level, class,
plan and account is logged, so undo is a read of that log rather than an
inferred reverse operation - and it refuses outright when a receipt exists
against an account the rollover created, because deleting it would destroy a
printed receipt's audit trail.

3) One SQL gotcha that cost real debugging time.
- Reaching a student via JOIN tbl_student s ON s.PaymentAccountID = a.ID travels
through the student's pointer to their *current* account.
- The moment a second
account exists, last year's account has no student on that join - and its
overdue instalments silently vanish from the arrears page without being paid.
- The join has to go the other way: s.ID = a.StudentID.

4) TSP, not shortest path.
- Ordering bus stops is a travelling-salesman problem.
- Nearest-neighbour from the
kindergarten, then a 2-opt improvement pass, Haversine distances - no external
service, no API key.
- The resulting order goes to OSRM for real road geometry.
- Students at the same location are merged into one stop first.

5) Security as a constraint on how code is written.
- CSP is 'self' for script/style/font/connect (one documented exception for map
tiles), which forbids inline styles - so every dynamic value goes through a CSS
class or the CSSOM, including in JS-generated markup.
- All third-party geo work
(Nominatim, OSRM, Google Maps link resolution) is proxied server-side, which is
what keeps connect-src 'self' true.
- The link resolver fetches a user-supplied
URL, so its HttpClient has a connect callback that rejects non-public IPs on
every redirect hop and at the actually-connected address - DNS rebinding fails
too.
- Public identifiers are GUIDs everywhere; integer IDs never leave the
server.
- Passwords are PBKDF2-HMAC-SHA256 at 600k iterations with the parameters
stored alongside the hash, constant-time verification, and a dummy hash for
unknown usernames so timing doesn't leak account existence.

6) Two front-end bugs that were genuinely interesting.
- A responsive breakpoint written as @media (max-width: 767.98px) also matches
while printing - the print viewport is the page box, and A4 at zero margin is
794px.
- A card sheet built for four per page silently printed two, on every
machine, for as long as the page existed.
- Scope print-affecting breakpoints to
@media screen and (...).
- Verifying the fix meant driving headless Chrome's
Page.printToPDF with preferCSSPageSize and counting pages - the --print-to-pdf
CLI flag ignores @page { size } and renders US Letter regardless.
- Separately: some client security suites drop PUT and DELETE, which presents as
"adding works, editing doesn't - on one machine".
- The client tries the real verb
first and only retries as POST with X-HTTP-Method-Override on a failure or 405,
caching that for the session.
- The server-side restore is deliberately narrow and
refuses to honour an override to GET, since the antiforgery filter exempts GET.
- Stack: C# / .NET 8, ASP.NET Core MVC, Dapper + hand-written SQL over MySQL
(20+ tables, explicit transactions), vanilla JS, Bootstrap RTL, Leaflet,
Chart.js, Docker, IIS.
- Previous iteration was a versioned Web API
(Asp.Versioning, JWT, FluentValidation, Serilog, Swagger) that I later folded
into the MVC app - one consumer meant the extra service was pure overhead.

--------------------------------------------------------------------------------
4.4  NON-TECHNICAL VERSION - recruiters / general audience
--------------------------------------------------------------------------------

Over the past few months I built a complete management system for a
kindergarten, and I want to share it - not for the code, but for the problem.
- Small schools run on paper.
- Tuition is tracked in one notebook, attendance in
another, and the bus route exists mostly in the driver's memory.
- It works, until
someone needs an answer: which families are behind on payments? which child has
been absent all week? what happens when a new driver takes the route?

The system I built answers those questions on one screen each.
- It handles student and staff registration, parent contact details, classrooms,
daily attendance, tuition plans and instalments, expenses, and bus routes shown
on a real map.
- It also prints the paperwork the kindergarten actually uses -
registration contracts, payment receipts, emergency health cards for teachers,
and graduation certificates - filled in automatically instead of by hand.
- The whole interface is in Arabic and laid out right-to-left, because the people
using it are not developers and the software has to be faster than the notebook
on the first day, or the notebook wins.
- Two things I'm most pleased with:

- The system flags problems on its own.
- If a child is absent several days in a
  row, or their attendance drops noticeably, it appears on an alerts page with
  the parents' phone numbers ready - instead of relying on someone remembering.

- Nothing important is unrecoverable.
- Moving every student up a year at the end
  of the academic year is a big, risky operation, so I built it to be reversible
  - for the whole school or a single child - with safeguards that block an undo
  that would invalidate a receipt already given to a parent.
- Building it taught me things a course can't: how to gather requirements from
someone who has never used software like this, how to design around money and
safety where mistakes have real consequences, and when to simplify your own
earlier work rather than defend it.
- Built with C#, .NET, MySQL and JavaScript.
- Happy to walk anyone through it.

#softwaredevelopment #dotnet #webdevelopment

--------------------------------------------------------------------------------
4.5  LINKEDIN SKILLS / KEYWORDS TO ADD TO YOUR PROFILE
--------------------------------------------------------------------------------

Add as profile Skills:

  C#                                ASP.NET Core
  .NET                              ASP.NET MVC
  Web API                           RESTful APIs
  MySQL                             SQL
  Database Design                   Dapper
  Entity Framework Core             JavaScript
  HTML5                             CSS
  Bootstrap                         jQuery
  Object-Oriented Programming       Software Architecture
  Full-Stack Development            Back-End Web Development
  Front-End Development             Web Application Security
  Authentication                    Git
  Docker                            IIS
  Relational Databases              Algorithms
  Data Structures                   Software Development Life Cycle (SDLC)
  Problem Solving                   Technical Documentation
  Requirements Analysis             Localisation / RTL

Free-text keywords worth appearing in your About/Experience text:
  JWT authentication, OWASP, Content Security Policy, CSRF protection,
  SQL transactions, API versioning, Swagger/OpenAPI, FluentValidation, Serilog,
  Leaflet, Chart.js, OpenStreetMap, OSRM, RTL/Arabic UI, school management
  system, ERP, payment/instalment tracking, print/PDF layout, headless Chrome

--------------------------------------------------------------------------------
4.6  CV BULLET POINTS
--------------------------------------------------------------------------------

Little Hands - Kindergarten Management System            June 2026 - Present
Solo developer - C#, ASP.NET Core 8, MySQL, Dapper, JavaScript

- Designed and built an end-to-end Arabic (RTL) school-management platform
  covering student/staff registration, attendance, tuition and instalment
  billing, expenses, bus routing and print-ready official documents -
  approximately 20,000 lines of C# and JavaScript over a 20+ table MySQL schema.

- Architected the system twice and consolidated it: delivered a versioned
  ASP.NET Core Web API (14 controllers across v1/v2, JWT auth, FluentValidation,
  Serilog, Swagger/OpenAPI, rate limiting, health checks), then merged it into a
  single MVC application to remove a deployment unit, the CORS surface and a
  network hop - porting the full data layer with identical method signatures so
  no client code required changes.

- Implemented transactional multi-table operations (student registration writes
  across payment account, student, parents, phone numbers, bus stops and
  instalment schedule in a single transaction) with MySQL error codes translated
  into user-facing messages.

- Eliminated a class of data-staleness bugs by deriving payment status from
  transactions rather than storing it - cancelling a receipt restores the debt
  instantly, with no reconciliation job or data migration.

- Built a reversible end-of-year rollover that promotes and graduates students
  and opens new tuition accounts, logging each student's prior state to support
  whole-cohort and per-student undo, with a guard that refuses any undo which
  would invalidate an issued receipt; verified by diffing six database tables
  before and after a full rollover-and-undo cycle.

- Implemented bus-route optimisation as a TSP heuristic (nearest-neighbour with
  2-opt refinement over Haversine distances) and integrated OSRM for road
  geometry and Nominatim for geocoding, both proxied server-side.

- Applied a defence-in-depth security model: PBKDF2-HMAC-SHA256 password hashing
  at 600,000 iterations with constant-time verification, cookie authentication
  with a fallback authorisation policy, GUID-only public identifiers to prevent
  IDOR, global CSRF validation, strict Content-Security-Policy ('self'),
  SSRF-guarded outbound requests, per-IP rate limiting, and magic-number
  validation on file uploads.

- Wrote and applied 9 versioned SQL migrations against a live database, and
  authored the project's technical documentation covering schema constraints,
  transaction boundaries and deliberate design trade-offs.
- Shorter 3-bullet variant (for a one-page CV):

- Built and deployed a full Arabic (RTL) kindergarten management system in
  ASP.NET Core 8 / MySQL / Dapper covering enrolment, attendance, tuition
  instalments, expenses, bus routing and printable official documents - ~20k
  lines across a 20+ table schema, sole developer.
- Migrated the product from a separate versioned Web API (JWT, FluentValidation,
  Serilog, Swagger) into a single MVC application, cutting a deployment unit and
  the CORS surface while keeping all client code unchanged.
- Implemented derived financial state, a reversible academic-year rollover with
  receipt-integrity guards, TSP-based bus-route optimisation, and a security
  model spanning PBKDF2 hashing, strict CSP, GUID public identifiers, CSRF, SSRF
  and upload validation.


================================================================================
5. [NEEDS INFORMATION] - please confirm before you post
================================================================================

These are the only gaps.
- I've written around them rather than guessing, but the
final text is noticeably stronger with real answers.

1.
- IS IT LIVE? Is the system actually in daily use at a real kindergarten, or is
   it built for one but not yet in production? This changes the strongest line
   in every version above.

2.
- SCALE.
- If it is in use: roughly how many students, staff and buses are on it?
   ("~120 children across 6 classes and 3 buses" is far stronger than nothing.)

3.
- CONTEXT.
- Is this a university/senior project, freelance/paid work, a family
   business, or personal work? Recruiters read "delivered for a real client"
   very differently from "personal project" - both are fine, but state it.

4.
- TEAM.
- Were you the sole developer throughout? I've written it as solo based
   on the commit history - confirm, and if anyone else contributed, say what
   they did.

5.
- PUBLIC REPO / DEMO.
- Is there a public GitHub link, screenshots, or a short
   demo video you can attach? A LinkedIn post with 2-3 screenshots of the Arabic
   UI (dashboard, arrears page, bus-route map) will outperform text alone by a
   wide margin.
- If the repo is private, say "code is private (real student
   data)" - that reads as professional, not evasive.

6.
- MEASURABLE OUTCOME.
- Any real before/after you can honestly claim? For
   example: time to prepare a new academic year, time to produce a monthly
   arrears list, or how registration paperwork used to be handled.
- One true
   number ("year-end rollover went from days of re-typing to one reviewable
   screen") lifts the whole CV bullet list.
- Do not invent one.

7.
- TIMELINE.
- Git history shows 17 June 2026 to now.
- Was there earlier work
   (design, requirements, the database schema) before the first commit? If so
   the honest date range is longer.

8.
- SCREENSHOT SAFETY.
- If you post screenshots, blur or replace real student and
   parent names and phone numbers first - there is live family data in this
   system, and a screenshot of it is a data-protection problem, not a demo.

================================================================================
END
================================================================================
- Skills: C#, .NET, .NET 8, ASP.NET Core, ASP.NET Core MVC, ASP.NET Core Web API, RESTful APIs, Web API Development, MySQL, SQL, Dapper, Database Design, Relational Databases, Data Modeling, Query Optimization, Database Transactions, JavaScript, JavaScript ES6, HTML5, CSS3, Bootstrap, Bootstrap RTL, Razor, jQuery, Object-Oriented Programming, Software Architecture, Full-Stack Development, Back-End Web Development, Front-End Development, Web Application Development, Web Application Security, OWASP, Authentication, Authorization, JWT, Cookie Authentication, CSRF Protection, Content Security Policy (CSP), SSRF Protection, API Security, Rate Limiting, Password Hashing, FluentValidation, Swagger, OpenAPI, API Versioning, Serilog, Git, Docker, IIS, CI/CD, Algorithms, Data Structures, Algorithm Design, TSP Algorithms, Software Engineering, Software Development, System Integration, Requirements Analysis, Requirements Gathering, Technical Documentation, Debugging, Problem Solving, Localization, Internationalization, RTL Development, Arabic Localization, UI/UX Design, Leaflet, Chart.js, OpenStreetMap, OSRM, Geospatial Data, Data Visualization, Print/PDF Generation, Headless Browser Testing

### AL-Gen Plus (October 2025 – December 2026)
Research Assistant · GJU-DAIS-Lab

- ================================================================================
                          AL-Gen+ (ALGenPlus)
       AI-Powered Network Attack Simulation & IDS Training System
================================================================================

                         PROJECT OVERVIEW (LinkedIn)

================================================================================

WHAT IS AL-Gen+?
----------------
AL-Gen+ is an AI-powered cybersecurity research platform designed for
generating, simulating, and analyzing network traffic — both benign and
malicious — to train Machine Learning models for Intrusion Detection Systems
(IDS).
- The project bridges the gap between synthetic data generation and
real-world attack execution, providing researchers and cybersecurity
professionals with a unified tool to produce high-quality, labeled datasets
for ML-based threat detection.
- This project is the foundation of 2 research papers and represents a
comprehensive end-to-end pipeline covering data generation, real attack
simulation, traffic capture, feature engineering, and ML model training.

================================================================================

PROBLEM STATEMENT
-----------------
Training effective IDS models requires large, diverse, and accurately labeled
datasets of network traffic.
- Public datasets like CICIDS, NSL-KDD, and UNSW-NB15
are widely used, but they suffer from staleness, limited attack diversity, and
schema incompatibilities.
- AL-Gen+ solves this by enabling researchers to:

  1.
- Generate unlimited synthetic attack and benign traffic with configurable
     statistical distributions
  2.
- Execute real attacks in isolated environments for ground-truth labeled data
  3.
- Merge synthetic and real data seamlessly (identical 22-column schema)
  4.
- Train and evaluate ML models directly within the platform

================================================================================

DUAL-MODE ARCHITECTURE
-----------------------

AL-Gen+ operates in two complementary modes:

  ┌──────────────────────────────────────────────────────────────────────────┐
  │                         MODE 1: SYNTHETIC                               │
  │                                                                         │
  │  Generates realistic synthetic network logs using statistical           │
  │  distributions (Gaussian, Uniform, Exponential, Poisson, Zipf,         │
  │  Mixture).
- Supports configurable attack intensity, ratio, seed          │
  │  reproducibility, and multi-vector blended attack campaigns.            │
  │                                                                         │
  │  → Safe, fast, scalable: 100,000+ records per minute                   │
  │  → No real network required                                             │
  │  → Ideal for rapid prototyping and large-scale ML training              │
  └──────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────────┐
  │                      MODE 2: REAL ATTACK                                │
  │                                                                         │
  │  Executes actual network attacks against a localhost test server or a   │
  │  VirtualBox VM running Ubuntu + Apache2 (isolated environment).         │
  │                                                                         │
  │  → Ground-truth labeled data from real packet exchanges                 │
  │  → Live server response display as proof of attack impact               │
  │  → Temporal Mode: Normal → Transition → Full Attack phases              │
  │  → Supports traffic capture and real-time analysis                      │
  └──────────────────────────────────────────────────────────────────────────┘

Both modes produce CSV files with an identical 22-column schema, making them
fully mergeable for unified ML training pipelines.

================================================================================

ATTACK TYPES SUPPORTED (12 Total)
----------------------------------

NETWORK LAYER ATTACKS (6):
  1.
- SYN Flood         — TCP SYN flooding, exhausts connection tables
  2.
- UDP Flood         — Connectionless high-speed packet flooding
  3.
- Nmap SYN Scan     — Port scanning using SYN packets
  4.
- Nmap NULL Scan    — Stealth scan with no TCP flags set
  5.
- Hulk (HTTP Flood) — Massive HTTP GET request flooding
  6.
- Slowloris         — Slow HTTP DoS, holds connections open with partial
                         requests (50–300 simultaneous connections)

APPLICATION LAYER ATTACKS (6) — via DVWA (Damn Vulnerable Web Application):
  7.
- SQL Injection             — Classic SQLi with 100,000 payloads
  8.
- SQL Injection (Blind)     — Time-based and boolean blind SQLi (50,348 payloads)
  9.
- Command Injection         — OS command injection (86,792 payloads)
  10.
- XSS DOM                  — DOM-based cross-site scripting (10,000 payloads)
  11.
- XSS Reflected            — Reflected XSS (10,000 payloads)
  12.
- XSS Stored               — Stored XSS via guestbook (18,140 payloads)

Total payload files: 275,280+ real-world attack payloads included.
- Frame sizes are calibrated from real Wireshark captures (e.g., SQLi: 271–353
bytes mean 321, Command Injection: 259–771 bytes mean 511).

================================================================================

DATA PROCESSING PIPELINE
-------------------------
The project includes a dedicated data processing pipeline (implemented in a
separate Colab notebook) that processes and unifies 14 public network traffic
datasets into 3 standardized categories:

  TYPE 1: BINARY CLASSIFICATION
  ─────────────────────────────
  Labels: Normal vs.
- Attack (is_malicious: 0 or 1)
  Use case: Simple anomaly detection, "is this traffic malicious?"

  TYPE 2: MULTI-CLASS CLASSIFICATION
  ───────────────────────────────────
  Labels: Normal, DoS, Probe, R2L, U2R, DDoS, Web Attack, etc.
- Use case: Attack category identification

  TYPE 3: FINE-GRAINED CLASSIFICATION
  ────────────────────────────────────
  Labels: Individual attack names (SYN_Flood, SQL_Injection, Hulk, etc.)
  Use case: Precise attack fingerprinting

THE 14 PUBLIC DATASETS USED:
  1.
- CICIDS-2017          — Modern network intrusion dataset
  2.
- CICIDS-2018          — Updated version with more attack types
  3.
- NSL-KDD              — Improved version of KDD'99
  4.
- UNSW-NB15            — Australian Centre for Cyber Security dataset
  5.
- CTU-13               — Botnet traffic dataset
  6.
- ISCX-2012            — Intrusion detection evaluation dataset
  7.
- Bot-IoT              — IoT botnet traffic dataset
  8.
- ToN-IoT              — Telemetry/OS/Network IoT dataset
  9.
- CIC-DDoS-2019        — Distributed denial-of-service dataset
  10.
- HIKARI-2021          — Encrypted traffic dataset
  11.
- LITNET-2020          — Lithuanian academic network dataset
  12.
- Edge-IIoT            — Industrial IoT edge dataset
  13.
- NF-UQ-NIDS           — NetFlow-based unified dataset
  14. 5G-NIDD              — 5G network intrusion dataset

NOTE: The processing code has been removed from the main project (it was
part of a separate research effort), but the methodology and results are
documented in the research papers.
- One dataset's processing code is retained
as a reference implementation.

================================================================================

DATA SCHEMA (22 Columns — Unified Across All Modes)
-----------------------------------------------------

  NETWORK INFORMATION (5 columns):
    src_ip, dst_ip, src_port, dst_port, protocol

  PACKET STATISTICS (4 columns):
    packet_count, bytes, packets, duration

  CONNECTION STATISTICS (2 columns):
    connection_attempts, request_frequency

  PACKET SIZE STATISTICS (2 columns):
    packet_size_avg, packet_size_std

  TIMING STATISTICS (2 columns):
    inter_arrival_time_avg, inter_arrival_time_std

  ATTACK FLAGS (5 columns):
    hulk_flag, syn_flood_flag, udp_flood_flag,
    nmap_syn_scan_flag, nmap_null_scan_flag

  CLASSIFICATION (2 columns):
    attack_type (string label), is_malicious (0/1)

================================================================================

TEMPORAL MODE — REALISTIC ATTACK SIMULATION
--------------------------------------------
AL-Gen+ features a unique Temporal Mode that simulates realistic attack
scenarios across three sequential phases:

  Phase 1: Normal Traffic   (30% of duration) — Baseline benign traffic
  Phase 2: Transition       (20% of duration) — Gradual intensity increase
  Phase 3: Full Attack      (50% of duration) — Maximum attack intensity

This produces training data that teaches ML models to detect the early
warning signs of an attack during the transition phase — critical for
real-time IDS deployment.
- Attack Patterns Available:
  • Steady   — Constant rate with ±2% natural variation
  • Burst    — 3x peaks every 4 seconds, then cooldown
  • Random   — Variable rate within ±30% bounds
  • Gradual  — Starts at 50%, increases linearly to 150%

================================================================================

BLENDED (MULTI-VECTOR) ATTACK CAMPAIGNS
-----------------------------------------
The blended attack generator creates coordinated multi-vector attack
campaigns combining network-layer and application-layer attacks:

  Allowed Combinations:
  • SYN_Flood + SQL_Injection
  • SYN_Flood + XSS_Stored
  • UDP_Flood + Command_Injection
  • Nmap_SYN_Scan + SQL_Injection_Blind
  • Nmap_NULL_Scan + XSS_Reflected
  • Hulk + SQL_Injection

Each campaign receives a unique campaign ID, enabling ML models to learn
coordinated attack patterns — a capability absent from most public datasets.

================================================================================

MACHINE LEARNING PIPELINE
---------------------------

Built-in ML training directly within the GUI:

  Algorithms Supported:
    • Random Forest         — 95–98% accuracy
    • Gradient Boosting     — 97–99% accuracy
    • Support Vector Machine (SVM) — 92–96% accuracy
    • Logistic Regression
    • K-Nearest Neighbors (KNN)

  Pipeline:
    CSV Data → Label Encoding → Feature Scaling → Train/Test Split →
    Model Training → Evaluation (Accuracy, Precision, Recall, F1) →
    Confusion Matrix → Save Model (.pkl)

  Recommended Dataset Sizes:
    • Small:   1,000 records   (<1 min training)
    • Medium:  10,000 records  (1–5 min training)
    • Large:   100,000 records (5–30 min training)

================================================================================

TECHNOLOGY STACK
-----------------

  Language:        Python 3.9+
  GUI Framework:   PyQt5 (blue theme for Synthetic, red theme for Real Attack)
  Data Processing: Pandas, NumPy
  Machine Learning: Scikit-learn, Joblib
  Web Attacks:     Requests, BeautifulSoup4, lxml
  Networking:      Socket (stdlib), Scapy (optional, advanced capture)
  Traffic Capture: tshark (Wireshark CLI) / tcpdump
  Virtualization:  VirtualBox (Bridged Adapter, Ubuntu VM + Apache2)
  Web App Target:  DVWA (Damn Vulnerable Web Application)
  Notebook:        Google Colab (dataset processing pipeline)

================================================================================

PROJECT ARCHITECTURE — FILE STRUCTURE
---------------------------------------

  CORE EXECUTION FILES (7):
  ├── interface.py                  — Main GUI, entry point (2,631 lines)
  ├── real_attack_module.py         — Real attack execution engine (1,782 lines)
  ├── dvwa_attack_module.py         — DVWA web application attacks (1,531 lines)
  ├── layered_ids_generator.py      — Synthetic data generation engine (965 lines)
  ├── blended_attack_generator.py   — Multi-vector blended campaigns (603 lines)
  ├── traffic_analyzer.py           — Traffic capture & feature engineering (538 lines)
  ├── start_test_server.py          — Local HTTP test server (port 8000)
  └── test_vm_connection.py         — VM connectivity diagnostic tool

  PAYLOAD FILES (6):
  ├── Payloads/sql_payloads.txt                — 100,000 SQL injection payloads
  ├── Payloads/sql_blind_payloads.txt          — 50,348 blind SQLi payloads
  ├── Payloads/command_injection_payloads.txt   — 86,792 command injection payloads
  ├── Payloads/xss_dom_payloads.txt            — 10,000 DOM XSS payloads
  ├── Payloads/xss_reflected_payloads.txt      — 10,000 reflected XSS payloads
  └── Payloads/xss_stored_payloads.txt         — 18,140 stored XSS payloads

  DOCUMENTATION (10+ files):
  ├── README.md                     — Comprehensive project guide
  ├── TECHNICAL_ARCHITECTURE.md     — Full technical architecture
  ├── COMPLETE_DOCUMENTATION.md     — Complete reference documentation
  ├── PROJECT_SUMMARY_EN.md         — English project summary
  └── ... (guides for VM setup, attacks, interface, troubleshooting)

  CONFIGURATION:
  └── requirements.txt              — Python dependencies

Total codebase: ~8,000+ lines of Python across 7 core modules.

================================================================================

RESEARCH PAPERS
----------------
This project is the practical foundation for 2 research papers focused on:

  Paper 1: Network traffic generation and IDS dataset creation
           — Covers the synthetic and real data generation methodology
           — Evaluates dataset quality against 14 public benchmarks
           — Demonstrates schema unification across heterogeneous datasets

  Paper 2: ML-based intrusion detection using generated datasets
           — Compares classifier performance on synthetic vs. real vs. merged data
           — Evaluates temporal attack detection capabilities
           — Analyzes multi-vector (blended) attack campaign detection

================================================================================

KEY INNOVATIONS & DIFFERENTIATORS
-----------------------------------

  1.
- DUAL-MODE DATA GENERATION
     Synthetic + Real attack data with identical schemas — first of its kind
     to produce fully compatible and mergeable outputs from both approaches.

  2. 275,000+ REAL ATTACK PAYLOADS
     Massive payload libraries for 6 web application attack types, sourced
     from real-world vulnerability databases and penetration testing tools.

  3.
- TEMPORAL MODE
     Three-phase attack simulation (Normal → Transition → Attack) that
     produces data capturing the subtle early signatures of an emerging
     attack — enabling proactive detection model training.

  4.
- MULTI-VECTOR CAMPAIGNS
     Coordinated cross-layer attacks with unique campaign IDs, modeling
     realistic Advanced Persistent Threat (APT) behavior.

  5. 14-DATASET PROCESSING PIPELINE
     Unified processing of 14 public IDS datasets into 3 classification
     types (Binary, Multi-class, Fine-grained), creating one of the
     largest standardized IDS training corpora available.

  6.
- WIRESHARK-CALIBRATED FRAME SIZES
     DVWA attack frame sizes calibrated from real Wireshark captures,
     ensuring synthetic data matches real-world network characteristics.

  7.
- INTEGRATED ML PIPELINE
     End-to-end from data generation → training → evaluation → model export,
     all within a single GUI application.

================================================================================

PERFORMANCE METRICS
--------------------

  Generation Speed:
    • Synthetic:  100,000+ records/minute
    • Real Attack: 1,000+ packets/second

  ML Accuracy (on generated datasets):
    • Random Forest:     95–98%
    • Gradient Boosting: 97–99%
    • SVM:               92–96%

  Data Validation Rate: 99.5%+ (no null/zero values in critical fields)

  Resource Usage:
    • CPU:  20–40% (medium intensity attack)
    • RAM:  200–500 MB
    • Disk: ~1 MB per 10,000 records

================================================================================

SKILLS & TECHNOLOGIES DEMONSTRATED
-------------------------------------

  ✓ Cybersecurity & Ethical Hacking
  ✓ Network Protocol Analysis (TCP/UDP/ICMP/HTTP)
  ✓ Intrusion Detection Systems (IDS/IPS)
  ✓ Machine Learning for Security (Supervised Classification)
  ✓ Feature Engineering (22 network traffic features)
  ✓ Statistical Data Generation (Gaussian, Poisson, Zipf, Mixture)
  ✓ Python Development (8,000+ lines across 7 modules)
  ✓ GUI Development (PyQt5, dual-theme interface)
  ✓ Web Application Security (OWASP Top 10: SQLi, XSS, CMDi)
  ✓ Network Programming (Socket, TCP/UDP operations)
  ✓ Data Science (Pandas, NumPy, Scikit-learn)
  ✓ Virtual Machine Management (VirtualBox, Bridged Networking)
  ✓ Traffic Analysis (Wireshark/tshark, tcpdump, PCAP processing)
  ✓ Dataset Engineering (14 public datasets, schema unification)
  ✓ Research & Academic Writing (2 research papers)
  ✓ Linux System Administration (Apache2, UFW, networking)
  ✓ Web Scraping & Automation (BeautifulSoup, Requests, session handling)
  ✓ Multi-threaded Programming (QThread, concurrent attack workers)
  ✓ Software Architecture & Documentation
  ✓ Penetration Testing (DVWA, payload engineering)

================================================================================

ETHICAL NOTICE
--------------
This system is designed exclusively for ethical and educational use.
- All attacks are executed only within isolated environments (localhost or
VirtualBox VMs) that the user owns and controls.
- The project strictly
adheres to responsible disclosure and ethical hacking principles.

================================================================================

HOW TO RUN
-----------

  # Install dependencies
  pip install -r requirements.txt

  # Launch the main interface
  python interface.py

  # For localhost attack testing, run the test server first:
  python start_test_server.py

================================================================================

PROJECT INFO
-------------
  Name:      AL-Gen+ (ALGenPlus)
  Version:   1.0 Final
  Language:  Python 3.9+
  License:   Internal Use / Research
  Status:    Production Ready

================================================================================
                     © AL-Gen+ — Network Attack Simulation
                        & IDS Training Research System
================================================================================
- Skills: Cybersecurity, Ethical Hacking, Penetration Testing, Intrusion Detection Systems (IDS), Network Security, Network Protocols, Network Programming, Traffic Analysis, Wireshark, Machine Learning, Scikit-Learn, Feature Engineering, Data Science, Pandas, NumPy, Python, PyQt5, Web Application Security, OWASP, SQL Injection, Cross-Site Scripting (XSS), Linux, VirtualBox, Dataset Engineering, Statistical Data Analysis, Multithreading, Software Architecture, Technical Documentation, Research, Academic Writing

## Technical Skills

<!-- Aggregated from data/profile.json skills plus every skill tagged on a role,
project or certificate. The split below is what /upskill and the Fit score read:
evidenced skills carry something behind them, declared ones do not (yet). -->

### Evidenced by a role, project or certificate
- HTML5
- JavaScript
- Teamwork
- Data Visualization
- Front-End Development
- Problem Solving
- Team Collaboration
- Time Management
- ASP.NET Core
- C#
- Cascading Style Sheets (CSS)
- Git
- HTML
- Machine Learning
- Technical Documentation
- Artificial Intelligence (AI)
- ASP.NET
- Chart.js
- Generative AI
- GitHub
- Linux
- MySQL
- Object-Oriented Programming (OOP)
- Prompt Engineering
- UI/UX Design
- AI Literacy
- ASP.NET MVC
- ASP.NET Web API
- Bootstrap
- Bootstrap5
- CI/CD
- CLI
- Computer Vision
- Critical Thinking
- CSS
- Cybersecurity
- Deep Learning
- Developer Tools
- Ethical Hacking
- Full-Stack Development
- Geospatial Data
- GitHub Actions
- JavaScript ES6
- Leaflet
- OWASP
- Python
- Responsible AI
- Responsive Web Design
- REST APIs
- Software Architecture
- Software Engineering
- System Administration
- System Integration
- System Monitoring
- Web Accessibility
- Web Application Security
- Web Development
- .NET
- .NET 8
- 3D Computer Vision
- 3D Localization
- Academic Writing
- Accessibility
- Administration
- AI Agents
- AI Ethics
- AI Integration
- AI Productivity
- AI Tools
- AI-Assisted Learning
- AI-Assisted Research
- AI-Assisted Writing
- Algorithm Design
- Algorithms
- Android Development
- API Security
- API Versioning
- Arabic Localization
- Artificial Intelligence
- Artificial Neural Networks
- ASP.NET Core MVC
- ASP.NET Core Web API
- Authentication
- Authorization
- Automated Testing
- Back-End Web Development
- Bash
- Bootstrap RTL
- C
- Camera Calibration
- Citizenship
- Civic Engagement
- Classification
- Claude Code
- Client-Side Development
- Communication
- Computer Vision Systems
- Content Security Policy (CSP)
- Continuous Deployment
- Continuous Integration
- Continuous Integration and Continuous Delivery (CI/CD)
- Cookie Authentication
- Cross-Site Scripting (XSS)
- Cryptography
- CSRF Protection
- CSS3
- CSV
- CTF
- D3.js
- Dapper
- Data Analysis
- Data Modeling
- Data Processing
- Data Science
- Data Structures
- Data Transformation
- Database Design
- Database Transactions
- Dataset Engineering
- Debugging
- Democracy & Governance
- Dialogue & Interpersonal Communication
- Digital Forensics
- Docker
- Edge AI
- Edge Computing
- Embedded C
- Embedded Software
- Embedded Systems
- End-to-End Testing
- ES Modules
- Excel
- Feature Detection
- Feature Engineering
- FluentValidation
- Front-end Coding
- Frontend Architecture
- Frontend Development
- Generative AI Tools
- GPS
- Hardware-Software Integration
- Headless Browser Testing
- Homography
- HTML5 Canvas
- IIS
- Image Processing
- Image Super-Resolution
- IMU
- Interactive Data Visualization
- Interactive Maps
- Internationalization
- Intrusion Detection Systems (IDS)
- jQuery
- JWT
- Knowledge of Legislation & Rule of Law
- Kotlin
- Large Language Models (LLMs)
- Leadership
- Linux System Administration
- Localization
- Logical Volume Manager (LVM)
- Mobile-First Design
- Model Evaluation
- Model Training
- Multithreading
- Network Programming
- Network Protocols
- Network Security
- Network Troubleshooting
- Neural Networks
- NumPy
- Object Detection
- Object-Oriented Programming
- OpenAPI
- OpenCV
- OpenStreetMap
- OSRM
- Pandas
- Password Hashing
- Penetration Testing
- Performance Optimization
- Playwright
- Political Participation
- Print/PDF Generation
- Problem Solving×
- Progressive Web Applications (PWA)
- PyQt5
- PyTorch
- Query Optimization
- RANSAC
- Raspberry Pi
- Rate Limiting
- Razor
- Red Hat Enterprise Linux (RHEL)
- Regression Analysis
- Relational Databases
- Requirements Analysis
- Requirements Gathering
- Research
- RESTful APIs
- Robotics
- RTL Development
- Scikit-Learn
- SELinux
- Sensor Fusion
- Serilog
- SIFT
- Software Design Patterns
- Software Development
- SQL
- SQL Injection
- SSRF Protection
- Statistical Analysis
- Statistical Data Analysis
- Stereo Vision
- SVG
- Swagger
- Systems Engineering
- Team Collaboration×
- Teamwork×
- Traffic Analysis
- TSP Algorithms
- User Experience Design
- User Interface Design
- Vanilla JavaScript
- VirtualBox
- Web API Development
- Web Application Development
- Web Performance Optimization
- Wireshark
- XML
- YOLO

### Declared, not yet evidenced
- [object Object]

### Certifications
- **Android Developer Fundamentals** — Ministry of Digital Economy & Entrepreneurship (2026-08-29)
- **Artificial Intelligence Fundamentals** — Ministry of Digital Economy & Entrepreneurship (2026-05-24)
- **Data Analysis Fundamentals** — Ministry of Digital Economy & Entrepreneurship (2026-08-29)
- **Programming Fundamentals** — Ministry of Digital Economy & Entrepreneurship (2026-08-29)
- **Cyber Warriors Training** — National Cyber Security Center (NCSCJO) (2024-09-15)
- **English** — German Jordanian University (2026-02-09)
- **Foundational C# with Microsoft** — freeCodeCamp
- **GJU Hackthon App 2024** — German Jordanian University (2024-05-27)
- **GJU Hackthon Problem Solving 2024** — German Jordanian University (2024-05-27)
- **GJU Hackthon Problem Solving 2025** — German Jordanian University (2025-05-27)
- **GJU 3030** — German Jordanian University (2026-05-04)
- **IEEEXtreme18** — IEEEXtreme Region 8 (2024-10-26)
- **IEEEXtreme19** — IEEEXtreme Region 8 (2025-10-25)
- **Red Hat Certified System Administrator RH124 (RHCSA)** — Red Hat (2025-12-23)
- **Red Hat System Administration II (RH134 - RHA) - Ver. 9.3** — Red Hat
- **GJUDaF-Zertifikat** — German Jordanian University
- **أنا أشارك** — USAID (2022-06-21)
- **Claude Code 101** — Anthropic (2026-04-17)
- **Claude 101** — Anthropic (2026-04-13)
- **AI Fluency for students** — Anthropic (2026-04-14)
- **BISSIT Summer School** — Institute of Manufacturing Technology, FME Brno University of Technology (2026-08-21)

_233 skills total._

## Publications

_No publications listed. Add them to data/profile-extras.json._

## Awards

_No awards listed. Add them to data/profile-extras.json._

## References

_No references listed. Add them to data/profile-extras.json._

