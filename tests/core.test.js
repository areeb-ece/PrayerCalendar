// Unit tests for js/core.js: `npm test` (node --test, no browser).
import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../js/core.js";

const MIN = 60000;

function settings(place, method = "isna", patch = {}) {
  const s = C.defaultSettings();
  s.place = { name: place.name || "Test", lat: place.lat, lon: place.lon, tz: place.tz || "UTC", elevation: 0 };
  C.applyMethod(s, method);
  return Object.assign(s, patch);
}

// Reference times from the adhan library (adhan-js 4.4.3, unrounded, with its method
// adjustments set to zero), a separate implementation of the astronomy.
const REFERENCE = [
  { lat: 43.8971, lon: -78.8658, m: "isna", date: "2026-06-21", fajr: "2026-06-21T07:41:24Z", sunrise: "2026-06-21T09:33:04Z", zawal: "2026-06-21T17:17:20Z", asr1: "2026-06-21T21:24:25Z", asr2: "2026-06-21T22:38:12Z", sunset: "2026-06-22T01:01:35Z", isha: "2026-06-22T02:53:15Z" },
  { lat: 43.8971, lon: -78.8658, m: "isna", date: "2026-12-21", fajr: "2026-12-21T11:19:24Z", sunrise: "2026-12-21T12:46:38Z", zawal: "2026-12-21T17:13:38Z", asr1: "2026-12-21T19:23:11Z", asr2: "2026-12-21T19:58:22Z", sunset: "2026-12-21T21:40:37Z", isha: "2026-12-21T23:07:53Z" },
  { lat: 21.4225, lon: 39.8262, m: "mwl", date: "2026-03-20", fajr: "2026-03-20T02:11:03Z", sunrise: "2026-03-20T03:24:58Z", zawal: "2026-03-20T09:28:11Z", asr1: "2026-03-20T12:53:21Z", asr2: "2026-03-20T13:50:24Z", sunset: "2026-03-20T15:31:42Z", isha: "2026-03-20T16:41:22Z" },
  { lat: 23.81, lon: 90.41, m: "karachi", date: "2026-09-10", fajr: "2026-09-09T22:26:42Z", sunrise: "2026-09-09T23:42:58Z", zawal: "2026-09-10T05:55:25Z", asr1: "2026-09-10T09:22:28Z", asr2: "2026-09-10T10:22:36Z", sunset: "2026-09-10T12:07:31Z", isha: "2026-09-10T13:23:37Z" },
  { lat: -33.8688, lon: 151.2093, m: "mwl", date: "2026-01-15", fajr: "2026-01-14T17:19:10Z", sunrise: "2026-01-14T18:59:29Z", zawal: "2026-01-15T02:04:25Z", asr1: "2026-01-15T05:49:04Z", asr2: "2026-01-15T07:01:49Z", sunset: "2026-01-15T09:09:00Z", isha: "2026-01-15T10:42:32Z" },
];

test("times agree with an independent implementation to within a minute", () => {
  for (const r of REFERENCE) {
    const t = C.dayTimes(r.date, settings(r, r.m));
    for (const k of ["fajr", "sunrise", "zawal", "asr1", "asr2", "sunset", "isha"]) {
      const diff = Math.abs(t[k] - Date.parse(r[k])) / MIN;
      assert.ok(diff < 1, `${r.date} ${r.lat},${r.lon} ${k} is ${diff.toFixed(2)} min off`);
    }
  }
});

test("local dates map to the right UTC instants east and west of Greenwich", () => {
  // Sydney's 15 January Fajr is still 14 January in UTC; Oshawa's sunset is the next UTC day.
  assert.equal(C.isoDate(C.dayTimes("2026-01-15", settings({ lat: -33.87, lon: 151.21 }, "mwl")).fajr), "2026-01-14");
  assert.equal(C.isoDate(C.dayTimes("2026-06-21", settings({ lat: 43.9, lon: -78.87 })).sunset), "2026-06-22");
});

test("Mithlain is later than Mithl, and the method presets set the angles", () => {
  const s = settings({ lat: 43.9, lon: -78.87 });
  const t = C.dayTimes("2026-11-04", s);
  assert.ok(t.asr2 - t.asr1 > 30 * MIN);
  assert.equal(s.fajrAngle, 15);
  C.applyMethod(s, "makkah");
  assert.equal(s.ishaMode, "minutes");
  assert.equal(s.ishaMinutes, 90);
  const m = C.dayTimes("2026-11-04", s);
  assert.equal(m.isha - m.maghrib, 90 * MIN);
  C.applyMethod(s, "jafari");
  assert.equal(s.maghribMode, "angle");
  assert.equal(C.matchMethod(s), "jafari");
  s.fajrAngle = 16.5;
  assert.equal(C.matchMethod(s), "custom");
});

test("Umm al-Qura's Isha is 120 minutes after Maghrib in Ramadan", () => {
  const s = settings({ lat: 21.42, lon: 39.83, tz: "Asia/Riyadh" }, "makkah");
  const r = C.dayTimes("2027-02-20", s); // 13 Ramadan 1448
  const n = C.dayTimes("2027-04-20", s);
  assert.equal(r.isha - r.maghrib, 120 * MIN);
  assert.equal(n.isha - n.maghrib, 90 * MIN);
});

test("next Ramadan from the Umm al-Qura calendar", () => {
  assert.deepEqual(C.nextRamadan("2026-11-04"), { start: "2027-02-08", end: "2027-03-08" });
  assert.deepEqual(C.nextRamadan("2027-02-20"), { start: "2027-02-20", end: "2027-03-08" });
});

test("a day's windows run in order and the gap avoids the makrooh times", () => {
  const s = settings({ lat: 43.9, lon: -78.87, tz: "America/Toronto" }, "isna", { range: { start: "2026-11-04", end: "2026-11-04" } });
  for (const k in s.events) s.events[k].on = true;
  const w = C.windows(s);
  const by = Object.fromEntries(w.windows.map((x) => [x.key, x]));
  const t = w.days[0];
  assert.ok(by.fajr.end <= by.sunrise.start + MIN);
  assert.equal(by.sunrise.end - by.sunrise.start, 15 * MIN);
  assert.equal(by.gap.start, by.sunrise.end);
  assert.equal(by.gap.end, by.zawal.start);
  assert.equal(by.zawal.end - by.zawal.start, 5 * MIN);
  assert.ok(by.dhuhr.start >= by.zawal.end);
  assert.equal(by.dhuhr.end, by.asr.start);
  assert.equal(by.asr.end, by.maghrib.start);
  assert.equal(by.sunset.end, by.maghrib.start);
  assert.equal(by.maghrib.end, by.isha.start);
  // Isha ends at midnight: halfway from sunset to the next day's Fajr
  assert.equal(by.isha.end, Math.round(t.midnight / MIN) * MIN);
  assert.ok(by.third.end > by.third.start && by.third.start > by.isha.end);
  // with the makrooh times left out of the file, the gap runs from sunrise to Dhuhr
  s.events.sunrise.on = s.events.zawal.on = false;
  const g = C.windows(s).windows.find((x) => x.key === "gap");
  assert.equal(g.start, by.fajr.end);
  assert.equal(g.end, by.dhuhr.start);
});

test("Dahwa Kubra starts istiwa halfway between Fajr and sunset", () => {
  const s = settings({ lat: 43.9, lon: -78.87 }, "isna", { range: { start: "2026-11-04", end: "2026-11-04" }, mkZawalMode: "dahwa" });
  const w = C.windows(s);
  const t = w.days[0];
  const z = w.windows.find((x) => x.key === "zawal");
  assert.equal(z.start, Math.round((t.fajr + t.sunset) / 2 / MIN) * MIN);
  assert.ok(z.end - z.start > 30 * MIN);
});

test("both Asr times: overlapping or split, and where Dhuhr ends", () => {
  const s = settings({ lat: 43.9, lon: -78.87 }, "isna", { range: { start: "2026-11-04", end: "2026-11-04" }, asr: "both" });
  s.events.asr1.on = s.events.asr2.on = true;
  let ev = Object.fromEntries(C.events(s).map((e) => [e.key, e]));
  assert.ok(!ev.asr, "no single Asr event with both on");
  assert.equal(ev.asr1.end, ev.asr2.end);
  assert.equal(ev.dhuhr.end, ev.asr1.start);
  s.asrSplit = true;
  s.dhuhrEnd = "mithlain";
  ev = Object.fromEntries(C.events(s).map((e) => [e.key, e]));
  assert.equal(ev.asr1.end, ev.asr2.start);
  assert.equal(ev.dhuhr.end, ev.asr2.start);
  s.asr = "hanafi";
  ev = Object.fromEntries(C.events(s).map((e) => [e.key, e]));
  assert.ok(!ev.asr1 && !ev.asr2 && ev.asr);
  assert.equal(ev.asr.start, ev.dhuhr.end);
});

test("Asr can end where the sunset makrooh time begins, and Isha at Fajr", () => {
  const s = settings({ lat: 43.9, lon: -78.87 }, "isna", { range: { start: "2026-11-04", end: "2026-11-05" }, asrEnd: "makrooh", ishaEnd: "fajr" });
  const w = C.windows(s).windows;
  const asr = w.find((x) => x.key === "asr"), mk = w.find((x) => x.key === "sunset");
  assert.equal(asr.end, mk.start);
  const isha = w.find((x) => x.key === "isha" && x.date === "2026-11-04");
  const fajr = w.find((x) => x.key === "fajr" && x.date === "2026-11-05");
  assert.equal(isha.end, fajr.start);
});

test("titles, Jumu'ah, short events and cautious rounding", () => {
  const s = settings({ lat: 43.9, lon: -78.87 }, "isna", { range: { start: "2026-11-06", end: "2026-11-06" } }); // a Friday
  s.events.fajr.title = "Fajr at home";
  let ev = Object.fromEntries(C.events(s).map((e) => [e.key, e]));
  assert.equal(ev.dhuhr.title, "Jumu'ah");
  assert.equal(ev.fajr.title, "Fajr at home");
  s.length = "start";
  s.startMinutes = 10;
  ev = Object.fromEntries(C.events(s).map((e) => [e.key, e]));
  assert.equal(ev.fajr.end - ev.fajr.start, 10 * MIN);
  assert.ok(ev.sunrise.end - ev.sunrise.start === 15 * MIN, "makrooh windows keep their length");
  s.length = "window";
  const raw = C.dayTimes("2026-11-06", s);
  s.rounding = "safe";
  ev = Object.fromEntries(C.events(s).map((e) => [e.key, e]));
  assert.ok(ev.fajr.start >= raw.fajr && ev.fajr.start - raw.fajr < MIN);
  assert.ok(ev.fajr.end <= raw.sunrise);
  assert.ok(ev.sunrise.start <= raw.sunrise);
  for (const e of Object.values(ev)) assert.equal(e.start % MIN, 0);
});

test("high latitudes: the rule fills in Fajr and Isha, or they're left out", () => {
  const s = settings({ lat: 59.91, lon: 10.75, tz: "Europe/Oslo" }, "mwl", { range: { start: "2026-06-21", end: "2026-06-21" } });
  assert.equal(s.highLat, "angle");
  let w = C.windows(s);
  assert.deepEqual(w.notes.adjustedFajr, ["2026-06-21"]);
  assert.deepEqual(w.notes.adjustedIsha, ["2026-06-21"]);
  assert.ok(w.windows.some((x) => x.key === "fajr"));
  s.highLat = "none";
  w = C.windows(s);
  assert.ok(!w.windows.some((x) => x.key === "fajr" || x.key === "isha"));
  assert.ok(w.notes.missing.length > 0);
  // the middle-of-the-night rule puts Isha and the next Fajr at the same moment: noted, not drawn
  s.highLat = "middle";
  w = C.windows(s);
  assert.deepEqual(w.notes.empty, ["2026-06-21 isha"]);
  // Tromsø in midsummer: no sunset at all
  const p = settings({ lat: 69.65, lon: 18.96 }, "mwl", { range: { start: "2026-06-21", end: "2026-06-22" } });
  assert.deepEqual(C.windows(p).notes.polar, ["2026-06-21", "2026-06-22"]);
});

test("a range can be up to a year", () => {
  const s = settings({ lat: 43.9, lon: -78.87 }, "isna", { range: { start: "2026-11-04", end: "2027-11-03" } });
  assert.deepEqual(C.problems(s), {});
  assert.equal(C.windows(s).days.length, 365);
  s.range.end = "2027-11-04";
  assert.match(C.problems(s).range, /up to a year/);
  s.range = { start: "2027-02-28", end: "2026-01-01" };
  assert.match(C.problems(s).range, /before the first/);
  assert.equal(C.addYears("2028-02-29", 1), "2029-02-28");
  s.place.lat = null;
  assert.ok(C.problems(s).place);
});

test("the .ics file: CRLF lines folded at 75 bytes, escaped text, UTC times, reminders", () => {
  const s = settings({ name: "Oshawa, Canada; café", lat: 43.9, lon: -78.87, tz: "America/Toronto" }, "isna", { range: { start: "2026-11-04", end: "2026-11-05" }, withLocation: true, withTimes: true, calName: "Prayer times, Oshawa" });
  s.events.fajr.alarm = "10";
  s.events.dhuhr.alarm = "0";
  s.events.isha.title = "Isha — a very long title that runs well past the seventy-five byte limit of a line";
  const ics = C.makeIcs(s, C.events(s), Date.UTC(2026, 10, 1));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  const lines = ics.split("\r\n");
  for (const l of lines) assert.ok(new TextEncoder().encode(l).length <= 75, `too long: ${l}`);
  assert.ok(ics.includes("X-WR-CALNAME:Prayer times\\, Oshawa"));
  assert.ok(ics.includes("LOCATION:Oshawa\\, Canada\\; café"));
  assert.ok(ics.includes("TRIGGER:-PT10M") && ics.includes("TRIGGER:PT0S"));
  assert.ok(ics.includes("TRANSP:TRANSPARENT"));
  assert.match(ics, /DTSTART:20261104T\d{6}Z/);
  const unfolded = ics.replace(/\r\n /g, "");
  assert.ok(unfolded.includes("SUMMARY:Isha — a very long title that runs well past the seventy-five byte limit of a line"));
  const uids = unfolded.match(/^UID:.*$/gm);
  assert.equal(new Set(uids).size, uids.length, "every event has its own UID");
  assert.equal(uids.length, C.events(s).length);
});

test("saved settings are merged with the defaults, ignoring bad values", () => {
  const s = C.mergeSettings({ fajrAngle: "18", asr: "hanafi", place: { lat: 10, lon: "x" }, events: { fajr: { on: false } }, bogus: 1 });
  assert.equal(s.fajrAngle, 15);
  assert.equal(s.asr, "hanafi");
  assert.equal(s.place.lat, 10);
  assert.equal(s.place.lon, null);
  assert.equal(s.events.fajr.on, false);
  assert.equal(s.events.fajr.title, "Fajr");
  assert.ok(!("bogus" in s));
});
