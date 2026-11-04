/* PRAYER/CALENDAR core: the sun, the prayer times, the day's windows and the .ics file.
   No DOM here, so the unit tests (tests/core.test.js) run it in Node as it is.

   Times come from the sun's position (the standard low-precision solar formulas, good to
   well under a minute for this purpose), computed for each local calendar date at the
   place and returned as UTC instants. The calendar file stores UTC, so daylight saving
   and the place's time zone only matter when times are shown. */

const RAD = Math.PI / 180;
const sin = (d) => Math.sin(d * RAD);
const cos = (d) => Math.cos(d * RAD);
const tan = (d) => Math.tan(d * RAD);
const asin = (x) => Math.asin(x) / RAD;
const acos = (x) => Math.acos(x) / RAD;
const atan2 = (y, x) => Math.atan2(y, x) / RAD;
const acot = (x) => Math.atan(1 / x) / RAD;
const wrap = (a, b) => a - b * Math.floor(a / b);
const MIN = 60000;
const HOUR = 3600000;
const DAY = 86400000;

// ── calculation methods ──────────────────────────────────────────────────────
// Twilight angles (degrees below the horizon) or minutes after Maghrib, as each
// organisation publishes them. maghrib: degrees below the horizon instead of sunset.
// night: how the night is halved for midnight ("fajr": sunset to Fajr, "sunrise":
// sunset to sunrise).
export const METHODS = {
  isna: { label: "ISNA (North America)", fajr: 15, isha: 15 },
  mwl: { label: "Muslim World League", fajr: 18, isha: 17 },
  egypt: { label: "Egyptian General Authority of Survey", fajr: 19.5, isha: 17.5 },
  karachi: { label: "University of Islamic Sciences, Karachi", fajr: 18, isha: 18 },
  makkah: { label: "Umm al-Qura, Makkah", fajr: 18.5, ishaMinutes: 90, ishaRamadan: 120 },
  dubai: { label: "Dubai", fajr: 18.2, isha: 18.2 },
  qatar: { label: "Qatar", fajr: 18, ishaMinutes: 90 },
  kuwait: { label: "Kuwait", fajr: 18, isha: 17.5 },
  gulf: { label: "Gulf region", fajr: 19.5, ishaMinutes: 90 },
  singapore: { label: "Singapore (MUIS)", fajr: 20, isha: 18 },
  turkey: { label: "Diyanet, Turkey", fajr: 18, isha: 17 },
  france: { label: "UOIF, France (12°)", fajr: 12, isha: 12 },
  russia: { label: "Spiritual Administration of Muslims of Russia", fajr: 16, isha: 15 },
  tehran: { label: "Institute of Geophysics, Tehran", fajr: 17.7, isha: 14, maghrib: 4.5, night: "fajr" },
  jafari: { label: "Shia Ithna Ashari (Leva Institute, Qum)", fajr: 16, isha: 14, maghrib: 4, night: "fajr" },
};

// Every event the file can hold, in the order of a day. kind: "prayer" windows round
// inwards (start later, end earlier) with safe rounding; "makrooh" windows round outwards.
export const EVENTS = [
  { key: "fajr", kind: "prayer", title: "Fajr", group: "Prayers" },
  { key: "sunrise", kind: "makrooh", title: "Makrooh: sunrise", group: "Makrooh times" },
  { key: "gap", kind: "gap", title: "Between Fajr and Dhuhr", group: "Between prayers" },
  { key: "zawal", kind: "makrooh", title: "Makrooh: istiwa", group: "Makrooh times" },
  { key: "dhuhr", kind: "prayer", title: "Dhuhr", group: "Prayers" },
  { key: "asr", kind: "prayer", title: "Asr", group: "Prayers" },
  { key: "asr1", kind: "prayer", title: "Asr (Mithl)", group: "Prayers" },
  { key: "asr2", kind: "prayer", title: "Asr (Mithlain)", group: "Prayers" },
  { key: "sunset", kind: "makrooh", title: "Makrooh: sunset", group: "Makrooh times" },
  { key: "maghrib", kind: "prayer", title: "Maghrib", group: "Prayers" },
  { key: "isha", kind: "prayer", title: "Isha", group: "Prayers" },
  { key: "third", kind: "gap", title: "Last third of the night", group: "Between prayers" },
];
export const EVENT = Object.fromEntries(EVENTS.map((e) => [e.key, e]));

export function defaultSettings() {
  const events = {};
  for (const e of EVENTS) events[e.key] = { on: e.kind === "prayer", title: e.title, alarm: "" };
  events.sunrise.on = events.zawal.on = events.sunset.on = true;
  return {
    place: { name: "", lat: null, lon: null, tz: "", elevation: 0 },
    range: { start: "", end: "" },
    method: "isna",
    fajrAngle: 15,
    ishaMode: "angle", // "angle" or "minutes" after Maghrib
    ishaAngle: 15,
    ishaMinutes: 90,
    ishaRamadan: 0, // minutes after Maghrib in Ramadan (0: same as the rest of the year)
    maghribMode: "sunset", // "sunset", "minutes" after sunset, or "angle"
    maghribMinutes: 0,
    maghribAngle: 4,
    asr: "shafii", // "shafii" (Mithl, one shadow), "hanafi" (Mithlain, two) or "both"
    asrSplit: false, // with both: Asr (Mithl) ends where Asr (Mithlain) begins
    dhuhrEnd: "mithl", // with both: where Dhuhr ends
    dhuhrMinutes: 0, // after zawal
    highLat: "angle", // "angle" (angle ÷ 60 of the night), "middle", "seventh" or "none"
    night: "fajr", // "fajr" (sunset to Fajr) or "sunrise" (sunset to sunrise)
    adjust: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
    mkSunrise: 15, // minutes after sunrise
    mkZawalMode: "minutes", // "minutes" before zawal, or "dahwa" (from the midpoint of Fajr and sunset)
    mkZawal: 5,
    mkSunset: 15, // minutes before sunset
    asrEnd: "sunset", // "sunset" or "makrooh" (where the sunset makrooh window begins)
    ishaEnd: "midnight", // "midnight", "third" (where the last third begins) or "fajr"
    length: "window", // "window" (the whole window) or "start" (a short event at the start)
    startMinutes: 15,
    rounding: "nearest", // "nearest" or "safe"
    jumuah: true,
    busy: false,
    withLocation: false,
    withTimes: false,
    calName: "Prayer times",
    clock: "12",
    hijri: false,
    events,
  };
}

// Fills in a saved or hand-edited object with defaults, keeping only values of the right type.
export function mergeSettings(saved) {
  const d = defaultSettings();
  const pick = (def, val) => {
    if (def === null) return typeof val === "number" && isFinite(val) ? val : null;
    if (def && typeof def === "object") {
      const o = {};
      for (const k of Object.keys(def)) o[k] = pick(def[k], val && typeof val === "object" ? val[k] : undefined);
      return o;
    }
    return typeof val === typeof def && (typeof val !== "number" || isFinite(val)) ? val : def;
  };
  const out = pick(d, saved);
  // place.lat/lon default to null, so they went through the number branch above
  return out;
}

// Applies a method's angles to the settings (the angles stay editable afterwards).
export function applyMethod(s, name) {
  const m = METHODS[name];
  s.method = name;
  if (!m) return s;
  s.fajrAngle = m.fajr;
  if (m.ishaMinutes) { s.ishaMode = "minutes"; s.ishaMinutes = m.ishaMinutes; }
  else { s.ishaMode = "angle"; s.ishaAngle = m.isha; }
  s.ishaRamadan = m.ishaRamadan || 0;
  if (m.maghrib) { s.maghribMode = "angle"; s.maghribAngle = m.maghrib; }
  else if (s.maghribMode === "angle") s.maghribMode = "sunset";
  s.night = m.night || "fajr";
  return s;
}

// The method whose numbers the settings match, or "custom".
export function matchMethod(s) {
  for (const [k, m] of Object.entries(METHODS)) {
    if (m.fajr !== s.fajrAngle) continue;
    if (m.ishaMinutes ? s.ishaMode !== "minutes" || s.ishaMinutes !== m.ishaMinutes || (m.ishaRamadan || 0) !== s.ishaRamadan : s.ishaMode !== "angle" || s.ishaAngle !== m.isha) continue;
    if (m.maghrib ? s.maghribMode !== "angle" || s.maghribAngle !== m.maghrib : s.maghribMode === "angle") continue;
    if (s.method === k || s.method === "custom" || !METHODS[s.method]) return k;
  }
  return METHODS[s.method] && sameAsMethod(s, s.method) ? s.method : "custom";
}
function sameAsMethod(s, k) {
  const m = METHODS[k];
  return m.fajr === s.fajrAngle && (m.ishaMinutes ? s.ishaMode === "minutes" && s.ishaMinutes === m.ishaMinutes : s.ishaMode === "angle" && s.ishaAngle === m.isha);
}

// ── dates ────────────────────────────────────────────────────────────────────
// Dates are "YYYY-MM-DD" strings for a calendar day at the place.
export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return isoDate(t) === s ? t : null;
}
export const isoDate = (t) => new Date(t).toISOString().slice(0, 10);
export const addDays = (s, n) => isoDate(parseDate(s) + n * DAY);
export function addYears(s, n) {
  const [y, m, d] = s.split("-").map(Number);
  const t = Date.UTC(y + n, m - 1, d);
  // 29 February plus a year is 28 February, not 1 March
  return new Date(t).getUTCDate() === d ? isoDate(t) : isoDate(Date.UTC(y + n, m, 0));
}
export const weekday = (s) => new Date(parseDate(s)).getUTCDay();

// Today's date at a time zone.
export function todayAt(tz, now = Date.now()) {
  try {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const g = (t) => p.find((x) => x.type === t).value;
    return `${g("year")}-${g("month")}-${g("day")}`;
  } catch (e) {
    return isoDate(now);
  }
}

// The Umm al-Qura Hijri date of a day, or null where the browser lacks the calendar.
let hijriFmt;
export function hijri(s) {
  if (hijriFmt === undefined) {
    try {
      hijriFmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { timeZone: "UTC", day: "numeric", month: "numeric", year: "numeric" });
      if (hijriFmt.resolvedOptions().calendar !== "islamic-umalqura") hijriFmt = null;
    } catch (e) { hijriFmt = null; }
  }
  if (!hijriFmt) return null;
  const p = hijriFmt.formatToParts(parseDate(s) + 12 * HOUR);
  const g = (t) => +(p.find((x) => x.type === t) || {}).value;
  return { day: g("day"), month: g("month"), year: parseInt((p.find((x) => x.type === "relatedYear" || x.type === "year") || {}).value, 10) };
}
export const HIJRI_MONTHS = ["Muharram", "Safar", "Rabi al-Awwal", "Rabi al-Thani", "Jumada al-Ula", "Jumada al-Akhirah", "Rajab", "Shaban", "Ramadan", "Shawwal", "Dhu al-Qadah", "Dhu al-Hijjah"];

// The first and last day of the next Ramadan from a date (today's, if it's Ramadan now).
export function nextRamadan(from) {
  if (!hijri(from)) return null;
  let d = from;
  for (let i = 0; i < 400 && hijri(d).month !== 9; i++) d = addDays(d, 1);
  if (hijri(d).month !== 9) return null;
  let start = d;
  while (hijri(addDays(start, -1)).month === 9) start = addDays(start, -1);
  let end = d;
  while (hijri(addDays(end, 1)).month === 9) end = addDays(end, 1);
  return { start: start < from ? from : start, end };
}

// ── the sun ──────────────────────────────────────────────────────────────────
function julian(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
}
// Declination (degrees) and the equation of time (hours) at a Julian date.
export function sun(jd) {
  const n = jd - 2451545;
  const g = wrap(357.529 + 0.98560028 * n, 360);
  const q = wrap(280.459 + 0.98564736 * n, 360);
  const l = wrap(q + 1.915 * sin(g) + 0.02 * sin(2 * g), 360);
  const e = 23.439 - 0.00000036 * n;
  const ra = wrap(atan2(cos(e) * sin(l), cos(l)) / 15, 24);
  let eqt = q / 15 - ra;
  eqt -= 24 * Math.round(eqt / 24);
  return { decl: asin(sin(e) * sin(l)), eqt };
}

// The raw times of one day at a place, as UTC milliseconds (NaN where the sun never
// reaches the angle), before any minute adjustments.
export function sunTimes(date, lat, lon, elevation, s) {
  const [y, mo, d] = date.split("-").map(Number);
  const jd0 = julian(y, mo, d) - lon / 360; // local mean midnight
  const at = (h) => sun(jd0 + h / 24);
  const noon = (h) => 12 - at(h).eqt;
  // hours from local mean midnight at which the sun is `angle` degrees below the horizon
  const angle = (deg, h, morning) => {
    const { decl } = at(h);
    const x = (-sin(deg) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat));
    if (x < -1 || x > 1) return NaN;
    const t = acos(x) / 15;
    return noon(h) + (morning ? -t : t);
  };
  const asr = (factor, h) => angle(-acot(factor + tan(Math.abs(lat - at(h).decl))), h, false);
  const horizon = 0.833 + 0.0347 * Math.sqrt(Math.max(0, elevation || 0));

  const t = { fajr: 5, sunrise: 6, zawal: 12, asr1: 13, asr2: 14, sunset: 18, maghrib: 18, isha: 19 };
  const calc = {
    fajr: (h) => angle(s.fajrAngle, h, true),
    sunrise: (h) => angle(horizon, h, true),
    zawal: (h) => noon(h),
    asr1: (h) => asr(1, h),
    asr2: (h) => asr(2, h),
    sunset: (h) => angle(horizon, h, false),
    maghrib: (h) => (s.maghribMode === "angle" ? angle(s.maghribAngle, h, false) : NaN),
    isha: (h) => (s.ishaMode === "angle" ? angle(s.ishaAngle, h, false) : NaN),
  };
  let out = {};
  // Each pass evaluates the sun at the previous pass's times; three settle to the second.
  for (let i = 0; i < 3; i++) {
    out = {};
    for (const k in calc) {
      out[k] = calc[k](t[k]);
      if (!isNaN(out[k])) t[k] = out[k];
    }
  }
  const utc = Date.UTC(y, mo - 1, d) - (lon / 15) * HOUR;
  const ms = {};
  for (const k in out) ms[k] = isNaN(out[k]) ? NaN : utc + out[k] * HOUR;
  return ms;
}

// The day's times with the method's rules, high-latitude fallback and adjustments.
// Returns UTC milliseconds and which times came from the high-latitude rule.
export function dayTimes(date, s) {
  const { lat, lon, elevation } = s.place;
  const r = sunTimes(date, lat, lon, elevation, s);
  const adjusted = { fajr: false, isha: false };
  if (isNaN(r.sunrise) || isNaN(r.sunset)) return { date, polar: true, adjusted };

  if (s.maghribMode === "sunset") r.maghrib = r.sunset;
  else if (s.maghribMode === "minutes") r.maghrib = r.sunset + s.maghribMinutes * MIN;
  else if (isNaN(r.maghrib)) r.maghrib = r.sunset;
  if (s.ishaMode === "minutes") {
    const ramadan = s.ishaRamadan > 0 && (hijri(date) || {}).month === 9;
    r.isha = r.maghrib + (ramadan ? s.ishaRamadan : s.ishaMinutes) * MIN;
  }

  // Where twilight is long or never ends, Fajr and Isha come from a share of the night.
  const night = r.sunrise + DAY - r.sunset;
  const share = (deg) => (s.highLat === "middle" ? night / 2 : s.highLat === "seventh" ? night / 7 : (deg / 60) * night);
  if (s.highLat !== "none") {
    const pf = share(s.fajrAngle);
    if (isNaN(r.fajr) || r.sunrise - r.fajr > pf) { r.fajr = r.sunrise - pf; adjusted.fajr = true; }
    if (s.ishaMode === "angle") {
      const pi = share(s.ishaAngle);
      if (isNaN(r.isha) || r.isha - r.sunset > pi) { r.isha = r.sunset + pi; adjusted.isha = true; }
    }
  }

  const a = s.adjust;
  const t = {
    date,
    fajr: r.fajr + a.fajr * MIN,
    sunrise: r.sunrise + a.sunrise * MIN,
    zawal: r.zawal,
    dhuhr: r.zawal + (s.dhuhrMinutes + a.dhuhr) * MIN,
    asr1: r.asr1 + a.asr * MIN,
    asr2: r.asr2 + a.asr * MIN,
    sunset: r.sunset,
    maghrib: r.maghrib + a.maghrib * MIN,
    isha: r.isha + a.isha * MIN,
    adjusted,
  };
  return t;
}

// ── the day's windows ────────────────────────────────────────────────────────
const roundTo = (t, how) => (isNaN(t) ? NaN : Math[how](t / MIN) * MIN);

// Every window of every day in the range, before the include switches.
// Each: { key, date, start, end, info } with start/end in UTC ms, rounded to the minute.
export function windows(s) {
  const out = [];
  const notes = { adjustedFajr: [], adjustedIsha: [], polar: [], missing: [], empty: [] };
  const start = s.range.start, end = s.range.end;
  if (!parseDate(start) || !parseDate(end) || end < start) return { windows: out, days: [], notes };
  const days = [];
  let next = dayTimes(start, s);
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const t = next;
    next = dayTimes(addDays(d, 1), s);
    if (t.polar) { notes.polar.push(d); days.push(t); continue; }
    if (t.adjusted.fajr) notes.adjustedFajr.push(d);
    if (t.adjusted.isha) notes.adjustedIsha.push(d);
    // the night after this day: sunset to the next Fajr or sunrise
    const nightEnd = s.night === "sunrise" ? next.sunrise : next.fajr;
    const nightLen = nightEnd - t.sunset;
    t.midnight = t.sunset + nightLen / 2;
    t.third = t.sunset + (nightLen * 2) / 3;
    t.nextFajr = next.fajr;
    days.push(t);

    const safe = s.rounding === "safe";
    const put = (key, a, b, info) => {
      const kind = EVENT[key].kind;
      // safe rounding: prayer windows shrink to whole minutes, makrooh windows grow
      const st = roundTo(a, !safe ? "round" : kind === "makrooh" ? "floor" : "ceil");
      const en = roundTo(b, !safe ? "round" : kind === "makrooh" ? "ceil" : "floor");
      if (isNaN(st) || isNaN(en)) { notes.missing.push(d + " " + key); return; }
      // a window that closes before it opens (Isha past midnight far north, say) is noted, not drawn
      if (en <= st) { if (kind === "prayer") notes.empty.push(d + " " + key); return; }
      out.push({ key, date: d, start: st, end: en, info: info || null });
    };

    const mkRise = t.sunrise + s.mkSunrise * MIN;
    const mkZawal = s.mkZawalMode === "dahwa" ? (t.fajr + t.sunset) / 2 : t.zawal - s.mkZawal * MIN;
    const zawalEnd = Math.max(t.zawal, t.dhuhr);
    const mkSet = t.sunset - s.mkSunset * MIN;
    const on = (k) => s.events[k] && s.events[k].on;

    put("fajr", t.fajr, t.sunrise);
    if (s.mkSunrise > 0) put("sunrise", t.sunrise, mkRise);
    // The gap starts where the sunrise window ends and stops where istiwa begins, when
    // those windows are in the file; otherwise it runs from sunrise to Dhuhr.
    put("gap", on("sunrise") && s.mkSunrise > 0 ? mkRise : t.sunrise, on("zawal") ? Math.min(mkZawal, t.dhuhr) : t.dhuhr);
    put("zawal", mkZawal, zawalEnd);

    const asrEnd = s.asrEnd === "makrooh" ? mkSet : t.sunset;
    const friday = s.jumuah && weekday(d) === 5;
    if (s.asr === "both") {
      put("dhuhr", t.dhuhr, s.dhuhrEnd === "mithlain" ? t.asr2 : t.asr1, friday ? "jumuah" : null);
      put("asr1", t.asr1, s.asrSplit ? t.asr2 : asrEnd);
      put("asr2", t.asr2, asrEnd);
    } else {
      const asr = s.asr === "hanafi" ? t.asr2 : t.asr1;
      put("dhuhr", t.dhuhr, asr, friday ? "jumuah" : null);
      put("asr", asr, asrEnd);
    }
    if (s.mkSunset > 0) put("sunset", mkSet, t.sunset);
    put("maghrib", t.maghrib, t.isha);
    put("isha", t.isha, s.ishaEnd === "fajr" ? t.nextFajr : s.ishaEnd === "third" ? t.third : t.midnight);
    put("third", t.third, t.nextFajr);
  }
  return { windows: out, days, notes };
}

// The events that go in the file: the windows switched on, with titles and lengths.
export function events(s, w = windows(s)) {
  const list = [];
  const asrKeys = s.asr === "both" ? ["asr1", "asr2"] : ["asr"];
  for (const x of w.windows) {
    if ((x.key === "asr" || x.key === "asr1" || x.key === "asr2") && !asrKeys.includes(x.key)) continue;
    const cfg = s.events[x.key];
    if (!cfg || !cfg.on) continue;
    let title = (cfg.title || EVENT[x.key].title).trim() || EVENT[x.key].title;
    if (x.info === "jumuah") title = title.replace(/^Dhuhr\b/, "Jumu'ah");
    const short = s.length === "start" && EVENT[x.key].kind === "prayer";
    const end = short ? x.start + Math.max(1, s.startMinutes) * MIN : x.end;
    list.push({ ...x, title, end, windowEnd: x.end, alarm: cfg.alarm });
  }
  return list;
}

// ── the .ics file ────────────────────────────────────────────────────────────
export function escapeText(v) {
  return String(v).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}
// Lines longer than 75 bytes continue on the next line after a space (RFC 5545 3.1),
// never splitting a UTF-8 character.
export function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let cur = "", size = 0, limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > limit) { parts.push(cur); cur = ""; size = 0; limit = 74; }
    cur += ch;
    size += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}
const icsUtc = (t) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

// Formats a UTC instant as a wall-clock time at the place.
export function clock(t, tz, h12 = true) {
  if (isNaN(t)) return "–";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz || undefined, hour: "numeric", minute: "2-digit", hour12: h12 }).format(t);
}

// A short id for the place, so files for two places don't overwrite each other's events.
function placeId(p) {
  return `${(+p.lat).toFixed(3)}_${(+p.lon).toFixed(3)}`.replace(/-/g, "m");
}

export function makeIcs(s, list = events(s), now = Date.now()) {
  const stamp = icsUtc(now);
  const tz = s.place.tz;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//areeb//Prayer Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(s.calName || "Prayer times")}`];
  if (tz) lines.push(`X-WR-TIMEZONE:${tz}`);
  const pid = placeId(s.place);
  const byDay = {};
  for (const e of list) (byDay[e.date] = byDay[e.date] || []).push(e);
  for (const e of list) {
    lines.push("BEGIN:VEVENT", `UID:${e.date}-${e.key}-${pid}@areeb-ece.github.io`, `DTSTAMP:${stamp}`,
      `DTSTART:${icsUtc(e.start)}`, `DTEND:${icsUtc(e.end)}`, `SUMMARY:${escapeText(e.title)}`);
    const desc = [];
    if (e.end !== e.windowEnd) desc.push(`Until ${clock(e.windowEnd, tz, s.clock !== "24")}`);
    if (s.withTimes) desc.push(byDay[e.date].map((x) => `${x.title}: ${clock(x.start, tz, s.clock !== "24")}`).join("\n"));
    if (desc.length) lines.push(`DESCRIPTION:${escapeText(desc.join("\n\n"))}`);
    if (s.withLocation && s.place.name) lines.push(`LOCATION:${escapeText(s.place.name)}`);
    lines.push(`TRANSP:${s.busy ? "OPAQUE" : "TRANSPARENT"}`);
    if (e.alarm !== "" && e.alarm != null && isFinite(+e.alarm)) {
      const m = +e.alarm;
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(e.title)}`, m > 0 ? `TRIGGER:-PT${m}M` : "TRIGGER:PT0S", "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

// ── checking the settings ────────────────────────────────────────────────────
// Plain-English problems that stop a file being made, keyed by the field to fix.
export function problems(s) {
  const p = {};
  const { lat, lon, tz } = s.place;
  if (lat === null || lon === null || !isFinite(lat) || !isFinite(lon)) p.place = "Choose a city, use your location, or enter coordinates.";
  else if (Math.abs(lat) > 90 || Math.abs(lon) > 180) p.place = "Latitude runs from −90 to 90 and longitude from −180 to 180.";
  if (tz && !validZone(tz)) p.tz = `"${tz}" isn't a time zone this browser knows.`;
  const a = parseDate(s.range.start), b = parseDate(s.range.end);
  if (!a || !b) p.range = "Pick a first and last day.";
  else if (b < a) p.range = "The last day is before the first.";
  else if (s.range.end >= addYears(s.range.start, 1)) p.range = `A file can cover up to a year: the last day can be ${addDays(addYears(s.range.start, 1), -1)} at the latest.`;
  for (const [k, lo, hi] of [["fajrAngle", 1, 30], ["ishaAngle", 1, 30], ["maghribAngle", 0, 20]]) {
    if (!(s[k] >= lo && s[k] <= hi)) p[k] = `Use an angle from ${lo}° to ${hi}°.`;
  }
  return p;
}
function validZone(tz) {
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch (e) { return false; }
}
