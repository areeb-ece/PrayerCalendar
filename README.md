# Prayer Calendar

**Live: [areeb-ece.github.io/prayercalendar](https://areeb-ece.github.io/prayercalendar/)** · made by areeb

Prayer times for your location as a calendar file (.ics) for Google, Apple or Outlook
Calendar. Each prayer is an event lasting its whole window, and the makrooh times and the
gap between Fajr and Dhuhr can go in too. You choose the method, the angles, how Asr is
reckoned and what goes in the file, and preview every day before you download it.

It's a static page with no build step, no framework and no server. Everything is worked
out in your browser tab; the page can't make network requests.

---

## What it does

- **Place:** pick from a built-in list of 135 cities, use your browser's location,
  or paste coordinates from a map. The time zone comes with the city (or your device),
  and can be changed. Optional elevation.
- **Dates:** any range up to a year, with quick picks for the next 30 days, 3 months,
  the rest of the year, 12 months and the next Ramadan (from the Umm al-Qura calendar).
- **Method:** ISNA, Muslim World League, Egyptian, Karachi, Umm al-Qura, Dubai, Qatar,
  Kuwait, Gulf, Singapore, Diyanet, UOIF, Russia, Tehran and Shia Ithna Ashari, or your
  own Fajr and Isha angles (or Isha a set number of minutes after Maghrib, with a
  separate Ramadan value). Maghrib at sunset, minutes after it, or at an angle.
- **Asr:** Mithl (Shafi'i, Maliki, Hanbali), Mithlain (Hanafi), or **both at once**: two
  events, Asr (Mithl) and Asr (Mithlain), overlapping or split where the second begins,
  with Dhuhr ending at either.
- **Makrooh times:** sunrise (minutes after sunrise), istiwa (minutes before zawal, or
  from Dahwa Kubra, halfway between Fajr and sunset) and sunset (minutes before sunset).
- **The gaps:** an event for the time between Fajr and Dhuhr, which starts after the
  sunrise makrooh time and stops at istiwa when those are in the file, and one for the
  last third of the night.
- **Where windows end:** Asr at sunset or where the sunset makrooh time begins; Isha at
  midnight, the last third of the night or Fajr; the night measured from sunset to Fajr
  or to sunrise.
- **High latitudes:** where the sky never gets dark enough for the Fajr or Isha angle,
  the twilight angle rule, one-seventh of the night or the middle of the night places
  them, or they're left out. Days that use a rule are marked.
- **Adjustments:** minutes after zawal for Dhuhr, and ± minutes for each time to match
  a mosque's timetable.
- **The file:** switch each event on or off, rename it, add a reminder; Dhuhr can be
  called Jumu'ah on Fridays; prayer events can last the whole window or a set number of
  minutes; nearest or cautious rounding; free or busy; the place name and the day's
  times in each event's notes if you want them.

Settings are saved in your browser. The look (theme, accent, corners, motion, night sky)
comes from the gear menu shared with [areeb-ece.github.io](https://areeb-ece.github.io/)
and its other tools.

## How the times are worked out

The sun's declination and the equation of time come from the standard low-precision
solar formulas, evaluated for each local date at the place and refined three times at
each time's own moment. Fajr and Isha are when the sun is the chosen angle below the
horizon; sunrise and sunset at 0.833° (refraction and the sun's radius, plus a dip for
elevation); zawal when the sun crosses the meridian; Asr when a shadow is one (Mithl) or
two (Mithlain) times an object's length plus its noon shadow. Every time is a UTC instant,
and the file stores UTC, so daylight saving needs no special handling.

The unit tests check the times against [adhan-js](https://github.com/batoulapps/adhan-js),
a separate implementation, at five places across both hemispheres: every time agrees to
within a minute.

## Running it

```sh
npm run serve                 # http://localhost:8080 (the shared design needs the portfolio; see below)
npm test                      # unit tests (node --test)
npm i --no-save playwright@1.56.1 && npx playwright install chromium
npm run test:browser          # end-to-end check, offline fallback
DESIGN_DIR=../areeb-ece.github.io/public/design npm run test:browser   # with the shared design
```

```
index.html          the page
css/style.css       its layout (colours and components come from /design/)
js/core.js          the sun, the prayer times, the windows and the .ics file (no DOM)
js/cities.js        the city list
js/app.js           the page's controls, timeline and timetable
js/theme.js         offline fallback for the shared design
assets/design/      copy of the portfolio's tokens.css and ui.css, for offline use
tests/              core.test.js (node --test), browser-check.js (Playwright)
```

## Privacy

- The page's Content Security Policy includes `connect-src 'none'`: it can't send
  anything over the network. The city list is part of the page.
- "Use my location" asks your browser, which asks you first. The coordinates stay in
  the tab, and in this browser's saved settings until you reset them.
- No analytics, no trackers, no fonts or scripts from anywhere else.

## Credits

- [mononoki](https://github.com/madmalik/mononoki) by Matthias Tellen, SIL Open Font
  License (`assets/fonts/OFL-mononoki.txt`)
- The calculation methods' angles are as their organisations publish them, in the form
  [adhan-js](https://github.com/batoulapps/adhan-js) and
  [PrayTimes.org](http://praytimes.org/) document them.

Check the times against your local mosque: methods and practice differ between
communities, and this tool can't know which one yours follows.
