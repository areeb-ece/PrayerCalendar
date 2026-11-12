# CLAUDE.md

Prayer Calendar, a static page served at https://areeb-ece.github.io/PrayerCalendar/ by
GitHub Pages (deploy from `main`, root). No build step, no dependencies: ES modules in
`js/`, tested with `node --test` and a Playwright check (see README.md).

- `js/core.js` holds everything that isn't the DOM (astronomy, windows, timetable
  columns, .ics) and `js/pdf.js` the PDF, so the unit tests run them in Node. Keep it that
  way. The on-screen timetable and the PDF share `tableColumns`/`columnTime`.
- The shared design (themes, `sd-` components, settings panel, night sky) comes from
  `/design/` on the portfolio (areeb-ece/areeb-ece.github.io, `public/design/`).
  `assets/design/` is a copy for offline use; refresh it when the master changes. Colours,
  sizes and durations in `css/style.css` come from the master tokens only.
- CSP has no `style-src-attr`: never write `style="…"` in markup; use classes, or
  `el.style.setProperty` from script.
- Don't add city coordinates you can't verify; the list is a convenience, coordinates and
  "Use my location" cover everywhere else.

## Display rules

No inferable bloat in the UI or in exports (image, SVG, PDF, print, text). Displayed
text is bloat if any of these apply:

1. **Inferable from the view:** it restates what the viewer can already see or count on
   the same screen or export (totals of visible cards, per-column counts, "7 to go" next
   to a list of those 7).
2. **Not about this view:** it describes data that isn't shown (whole-sheet totals on an
   export of the goal path). Any number that stays is computed from exactly what that
   view displays.
3. **Trivia:** it doesn't help the user decide or do anything (link, card or machine
   counts, layout mode, generation dates and timestamps).
4. **Raw internal format:** an internal code where a human label exists ("1-1" →
   "Year 1 Sem 1", "202701" → "Winter 2027").
5. **Duplicate:** the same fact twice on one view. Keep the one in the most useful place.

Test for every candidate: given what's still visible, would the user lose anything they
need if it were gone? If not, leave it out.

Keep: legends and keys, a status label that is the only non-colour cue for that status,
titles, and any fact the user needs that appears nowhere else on the view. Useful text
in the wrong place gets moved, not deleted.
