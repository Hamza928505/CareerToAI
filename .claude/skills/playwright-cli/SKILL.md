---
name: playwright-cli
description: Write, run, and debug end-to-end tests using Playwright.
---
# Playwright End-to-End Testing
When writing tests for web interfaces:
1. Prefer getByRole, getByText, and semantic locators over CSS selectors.
2. Ensure elements are visible and actionable before interacting.
3. Run tests using 
px playwright test (or unx).
4. If a test fails, read the error trace, use the trace viewer if necessary, and fix the timing/selector issue without compromising the application code.
