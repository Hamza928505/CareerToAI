---
name: web-design-guidelines
description: Enforces modern web design standards, CSS variables, accessibility, and responsiveness.
---
# Web Design Guidelines
1. **Semantic HTML:** Always use proper landmarks (<main>, <section>, <nav>) and accessible ARIA attributes.
2. **CSS Variables:** Strictly adhere to the project's CSS variables (e.g., ar(--bg-surface)). Never hardcode HEX/RGB unless necessary.
3. **Responsive by Default:** Use Flexbox and CSS Grid. Avoid fixed widths.
4. **Dark Mode:** Ensure every component has a graceful fallback for prefers-color-scheme: dark or the project's data-theme.
