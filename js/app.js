/* PRAYER/CALENDAR page: the settings column, the day's timeline, the timetable and the
   download. The times and the file come from js/core.js. */
import * as C from "./core.js";
import { CITIES, cityLabel } from "./cities.js";

const $ = (id) => document.getElementById(id);
const KEY = "prayercalendar.settings";
const BROWSER_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; } })();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let S = load();
let view = "table";
let selected = null; // the date shown in the day view
let last = null; // the latest { w, list }
let placeMsg = ""; // why the last city or location didn't work

function load() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  const s = C.mergeSettings(saved);
  if (!s.place.tz) s.place.tz = BROWSER_TZ;
  if (!C.parseDate(s.range.start) || !C.parseDate(s.range.end) || s.range.end < C.todayAt(s.place.tz)) {
    const today = C.todayAt(s.place.tz);
    s.range = { start: today, end: C.addDays(today, 29) };
  }
  return s;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage blocked: this visit only */ }
}

// ── the controls ─────────────────────────────────────────────────────────────
function segs() { return document.querySelectorAll(".sd-seg[id]:not(#viewSeg)"); }
function setSeg(el, v) { el.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.v === String(v)))); }

const ADJUST = [["fajr", "Fajr"], ["sunrise", "Sunrise"], ["dhuhr", "Dhuhr"], ["asr", "Asr"], ["maghrib", "Maghrib"], ["isha", "Isha"]];
const ALARMS = [["", "No reminder"], ["0", "At start"], ["5", "5 min before"], ["10", "10 min before"], ["15", "15 min before"], ["30", "30 min before"], ["60", "1 hour before"]];

function build() {
  $("method").innerHTML = Object.entries(C.METHODS).map(([k, m]) => `<option value="${k}">${esc(m.label)}</option>`).join("") + '<option value="custom">Custom</option>';
  let zones = [];
  try { zones = Intl.supportedValuesOf("timeZone"); } catch (e) {}
  for (const z of [BROWSER_TZ, "UTC", ...CITIES.map((c) => c[4])]) if (!zones.includes(z)) zones.push(z);
  zones.sort();
  $("tz").innerHTML = zones.map((z) => `<option value="${esc(z)}">${esc(z.replace(/_/g, " "))}${z === BROWSER_TZ ? " (this device)" : ""}</option>`).join("");
  $("cityList").innerHTML = CITIES.map((c) => `<option value="${esc(cityLabel(c))}"></option>`).join("");
  $("adjust").innerHTML = ADJUST.map(([k, l]) => `<label class="sd-field"><span class="sd-label">${l}</span><span class="unit"><input class="sd-input sd-small sd-mono" type="number" step="1" min="-60" max="60" data-adjust="${k}"><i>min</i></span></label>`).join("");
  if (!C.hijri("2026-01-01")) { $("hijriF").hidden = true; $("presetRamadan").hidden = true; }
}

function eventRows() {
  const asrKeys = S.asr === "both" ? ["asr1", "asr2"] : ["asr"];
  const groups = {};
  for (const e of C.EVENTS) {
    if (e.key.startsWith("asr") && !asrKeys.includes(e.key)) continue;
    (groups[e.group] = groups[e.group] || []).push(e);
  }
  $("evList").innerHTML = Object.entries(groups).map(([g, list]) => `<div class="evgroup" role="group" aria-label="${esc(g)}"><h3>${esc(g)}</h3>` + list.map((e) => {
    const c = S.events[e.key];
    return `<div class="evrow k-${e.key}${e.kind === "makrooh" ? " mk" : ""}${c.on ? "" : " off"}" data-ev="${e.key}">` +
      `<input type="checkbox" data-ev-on aria-label="Include ${esc(e.title)}"${c.on ? " checked" : ""}><span class="sw" aria-hidden="true"></span>` +
      `<input class="sd-input sd-small" data-ev-title value="${esc(c.title)}" placeholder="${esc(e.title)}" aria-label="Title for ${esc(e.title)}" autocomplete="off" spellcheck="false">` +
      `<span class="sd-select sd-small"><select data-ev-alarm aria-label="Reminder for ${esc(e.title)}">${ALARMS.map(([v, l]) => `<option value="${v}"${c.alarm === v ? " selected" : ""}>${l}</option>`).join("")}</select></span></div>`;
  }).join("") + "</div>").join("");
}

const NUM = ["fajrAngle", "ishaAngle", "ishaMinutes", "maghribMinutes", "maghribAngle", "dhuhrMinutes", "mkSunrise", "mkZawal", "mkSunset", "startMinutes"];
const CHECK = ["asrSplit", "jumuah", "busy", "withLocation", "withTimes", "hijri"];
const SEL = ["highLat", "ishaEnd"];

// Puts the settings into the controls, except the one being typed in.
function fill(typing = null) {
  const p = S.place;
  const city = CITIES.find((c) => cityLabel(c) === p.name);
  if (typing !== $("city")) $("city").value = city ? cityLabel(city) : "";
  if (typing !== $("lat")) $("lat").value = p.lat === null ? "" : p.lat;
  if (typing !== $("lon")) $("lon").value = p.lon === null ? "" : p.lon;
  $("tz").value = p.tz;
  $("elev").value = p.elevation || 0;
  $("dStart").value = S.range.start;
  $("dEnd").value = S.range.end;
  $("method").value = C.matchMethod(S);
  for (const k of NUM) if (typing !== $(k)) $(k).value = S[k];
  $("ishaRamadan").value = S.ishaRamadan || "";
  for (const k of CHECK) $(k).checked = S[k];
  for (const k of SEL) $(k).value = S[k];
  $("calName").value = S.calName;
  segs().forEach((el) => setSeg(el, S[el.id]));
  document.querySelectorAll("[data-adjust]").forEach((i) => { if (typing !== i) i.value = S.adjust[i.dataset.adjust]; });

  $("ishaAngleF").hidden = S.ishaMode !== "angle";
  $("ishaMinF").hidden = $("ishaRamF").hidden = S.ishaMode !== "minutes";
  $("maghribMinF").hidden = S.maghribMode !== "minutes";
  $("maghribAngleF").hidden = S.maghribMode !== "angle";
  $("bothOpts").hidden = S.asr !== "both";
  $("mkZawalF").hidden = S.mkZawalMode !== "minutes";
  $("startMinF").hidden = S.length !== "start";
  $("asrHint").textContent = {
    shafii: "Mithl: when a thing's shadow equals its length, plus its shadow at noon (Shafi'i, Maliki and Hanbali).",
    hanafi: "Mithlain: when a thing's shadow is twice its length, plus its shadow at noon (Hanafi).",
    both: "Asr (Mithl) and Asr (Mithlain) become two events, each with its own switch below.",
  }[S.asr];
  $("mkZawalHint").textContent = S.mkZawalMode === "dahwa"
    ? "From Dahwa Kubra, halfway between Fajr and sunset, until zawal, as some Hanafi timetables give it."
    : "A short margin before the sun crosses the meridian, until Dhuhr begins.";
}

// Reads one control back into the settings.
function read(t) {
  const id = t.id, v = t.value;
  const num = (x, d) => (x === "" || !isFinite(+x) ? d : +x);
  if (NUM.includes(id)) { S[id] = num(v, S[id]); if (/Angle|ishaMinutes/.test(id)) S.method = C.matchMethod(S); }
  else if (CHECK.includes(id)) S[id] = t.checked;
  else if (SEL.includes(id)) S[id] = v;
  else if (id === "ishaRamadan") { S.ishaRamadan = num(v, 0); S.method = C.matchMethod(S); }
  else if (id === "method") { if (v !== "custom") C.applyMethod(S, v); else S.method = "custom"; }
  else if (id === "calName") S.calName = v;
  else if (id === "dStart") S.range.start = v;
  else if (id === "dEnd") S.range.end = v;
  else if (id === "elev") S.place.elevation = Math.max(0, num(v, 0));
  else if (id === "tz") S.place.tz = v;
  else if (id === "lat" || id === "lon") readCoords(t);
  else if (t.dataset.adjust) S.adjust[t.dataset.adjust] = Math.round(num(v, 0));
  else if (t.closest("[data-ev]")) {
    const c = S.events[t.closest("[data-ev]").dataset.ev];
    if (t.hasAttribute("data-ev-on")) { c.on = t.checked; t.closest(".evrow").classList.toggle("off", !c.on); }
    else if (t.hasAttribute("data-ev-title")) c.title = v;
    else if (t.hasAttribute("data-ev-alarm")) c.alarm = v;
  } else return false;
  return true;
}

// Coordinates typed or pasted ("43.94, -78.89" into either field fills both).
function readCoords(t) {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(t.value);
  if (m) { $("lat").value = m[1]; $("lon").value = m[2]; }
  const lat = parseFloat($("lat").value), lon = parseFloat($("lon").value);
  S.place.lat = isFinite(lat) ? lat : null;
  S.place.lon = isFinite(lon) ? lon : null;
  placeMsg = "";
  S.place.name = S.place.lat !== null && S.place.lon !== null ? coordName(S.place.lat, S.place.lon) : "";
  $("city").value = "";
}
const coordName = (lat, lon) => `${Math.abs(lat).toFixed(2)}° ${lat < 0 ? "S" : "N"}, ${Math.abs(lon).toFixed(2)}° ${lon < 0 ? "W" : "E"}`;

function pickCity(text, final) {
  const q = text.trim().toLowerCase();
  if (!q) return;
  const c = CITIES.find((x) => cityLabel(x).toLowerCase() === q) || (final && CITIES.find((x) => x[0].toLowerCase() === q || cityLabel(x).toLowerCase().startsWith(q)));
  if (!c) {
    if (final) {
      placeMsg = "That city isn't in the list. Enter its coordinates under Coordinates and time zone, or use your location.";
      $("placeErr").textContent = placeMsg;
      $("coordDisc").open = true;
    }
    return;
  }
  placeMsg = "";
  S.place = { name: cityLabel(c), lat: c[2], lon: c[3], tz: c[4], elevation: S.place.elevation || 0 };
  $("city").value = cityLabel(c);
  changed();
}

function locate() {
  if (!navigator.geolocation) { placeMsg = "This browser can't share your location. Pick a city or enter coordinates."; render(); return; }
  $("btnLocate").disabled = true;
  placeMsg = "";
  navigator.geolocation.getCurrentPosition((pos) => {
    $("btnLocate").disabled = false;
    const lat = +pos.coords.latitude.toFixed(4), lon = +pos.coords.longitude.toFixed(4);
    const near = nearest(lat, lon);
    S.place = { name: near ? `Near ${near[0]}, ${near[1]}` : coordName(lat, lon), lat, lon, tz: BROWSER_TZ, elevation: S.place.elevation || 0 };
    $("city").value = "";
    changed();
    toast("Location set. It stays in this tab.");
  }, (err) => {
    $("btnLocate").disabled = false;
    placeMsg = err.code === 1 ? "Location was blocked. Allow it for this site, or pick a city or enter coordinates." : "Your location couldn't be found. Pick a city or enter coordinates.";
    render();
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
}
// The list's city within 25 km, for naming a located place.
function nearest(lat, lon) {
  let best = null, bd = 25;
  for (const c of CITIES) {
    const d = 6371 * Math.acos(Math.min(1, Math.sin(lat * Math.PI / 180) * Math.sin(c[2] * Math.PI / 180) + Math.cos(lat * Math.PI / 180) * Math.cos(c[2] * Math.PI / 180) * Math.cos((lon - c[3]) * Math.PI / 180)));
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function preset(kind) {
  const today = C.todayAt(S.place.tz);
  if (kind === "30") S.range = { start: today, end: C.addDays(today, 29) };
  else if (kind === "90") S.range = { start: today, end: C.addDays(C.addYears(today, 0), 89) };
  else if (kind === "year") S.range = { start: today, end: today.slice(0, 4) + "-12-31" };
  else if (kind === "12") S.range = { start: today, end: C.addDays(C.addYears(today, 1), -1) };
  else if (kind === "ramadan") { const r = C.nextRamadan(today); if (r) S.range = r; }
  changed();
}

// ── time at the place ────────────────────────────────────────────────────────
const offsetFmt = {};
function zoneOffset(t, tz) {
  const f = offsetFmt[tz] || (offsetFmt[tz] = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }));
  const p = Object.fromEntries(f.formatToParts(t).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}
function localMidnight(date, tz) {
  const g = C.parseDate(date);
  let t = g - zoneOffset(g, tz);
  t = g - zoneOffset(t, tz);
  return t;
}
const h12 = () => S.clock !== "24";
const clock = (t) => C.clock(t, S.place.tz, h12());
const dayName = (d, opts) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(C.parseDate(d));

// ── drawing ──────────────────────────────────────────────────────────────────
function changed() {
  save();
  fill();
  render();
}

function render() {
  const probs = C.problems(S);
  // a problem with typed coordinates, or the last message from the city box or location
  $("placeErr").textContent = probs.place && S.place.lat !== null && S.place.lon !== null ? probs.place : placeMsg;
  $("tzErr").textContent = probs.tz || "";
  $("rangeErr").textContent = probs.range || "";
  $("fajrErr").textContent = probs.fajrAngle || "";
  $("ishaErr").textContent = S.ishaMode === "angle" ? probs.ishaAngle || "" : "";
  $("maghribErr").textContent = S.maghribMode === "angle" ? probs.maghribAngle || "" : "";
  for (const k of ["fajrAngle", "ishaAngle", "maghribAngle"]) $(k).setAttribute("aria-invalid", String(!!probs[k]));
  $("dStart").setAttribute("aria-invalid", String(!!probs.range));
  $("dEnd").setAttribute("aria-invalid", String(!!probs.range));
  markPresets();

  const hasPlace = !probs.place && S.place.lat !== null;
  $("empty").hidden = hasPlace;
  $("sheet").hidden = !hasPlace;
  const ok = Object.keys(probs).length === 0;
  if (!hasPlace || !ok) { $("btnDownload").disabled = true; last = null; notes(null); if (hasPlace) drawEmptySheet(probs); return; }

  const w = C.windows(S);
  const list = C.events(S, w);
  last = { w, list };
  $("btnDownload").disabled = list.length === 0;
  if (!selected || selected < S.range.start || selected > S.range.end) {
    const today = C.todayAt(S.place.tz);
    selected = today >= S.range.start && today <= S.range.end ? today : S.range.start;
  }
  $("tbPlace").textContent = S.place.name || coordName(S.place.lat, S.place.lon);
  const span = S.range.start === S.range.end ? dayName(S.range.start, { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : `${dayName(S.range.start, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} to ${dayName(S.range.end, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}`;
  $("tbSub").textContent = span + (S.place.tz !== BROWSER_TZ ? ` · times in ${S.place.tz.replace(/_/g, " ")} time` : "");
  notes(w.notes);
  drawDay();
  drawTable();
  if (view === "ics") drawIcs();
}

function drawEmptySheet(probs) {
  $("tbPlace").textContent = S.place.name || coordName(S.place.lat, S.place.lon);
  $("tbSub").textContent = Object.values(probs)[0];
  $("timeline").innerHTML = "";
  $("dayList").innerHTML = "";
  $("dayLabel").textContent = "";
  $("times").innerHTML = "";
  $("tableKey").hidden = true;
  $("viewIcs").textContent = "";
}

function markPresets() {
  const today = C.todayAt(S.place.tz);
  const r = S.range;
  const ram = C.nextRamadan(today);
  if (ram) $("presetRamadan").textContent = `Ramadan ${C.hijri(ram.end).year}`;
  const is = {
    30: r.start === today && r.end === C.addDays(today, 29),
    90: r.start === today && r.end === C.addDays(today, 89),
    year: r.start === today && r.end === today.slice(0, 4) + "-12-31",
    12: r.start === today && r.end === C.addDays(C.addYears(today, 1), -1),
    ramadan: !!ram && r.start === ram.start && r.end === ram.end,
  };
  document.querySelectorAll("[data-preset]").forEach((b) => b.setAttribute("aria-pressed", String(!!is[b.dataset.preset])));
}

function notes(n) {
  const items = [];
  if (n) {
    const days = (a) => (a.length === 1 ? dayName(a[0], { day: "numeric", month: "short" }) : `${a.length} days, ${dayName(a[0], { day: "numeric", month: "short" })} to ${dayName(a[a.length - 1], { day: "numeric", month: "short" })}`);
    const rule = { middle: "the middle of the night", seventh: "one-seventh of the night", angle: "the twilight angle rule" }[S.highLat];
    if (n.adjustedFajr.length) items.push(`Fajr comes from ${rule} on ${days(n.adjustedFajr)}: the sun doesn't get ${S.fajrAngle}° below the horizon, or not for long. Marked * in the timetable.`);
    if (n.adjustedIsha.length) items.push(`Isha comes from ${rule} on ${days(n.adjustedIsha)}, for the same reason. Marked * in the timetable.`);
    const miss = [...new Set(n.missing.map((x) => x.split(" ")[1]))];
    if (miss.length) items.push(`Some days have no ${miss.map((k) => C.EVENT[k].title).join(", ")}: twilight never ends there. Choose a rule under Night and high latitudes to include them.`);
    const empty = {};
    for (const x of n.empty) { const [d, k] = x.split(" "); (empty[k] = empty[k] || []).push(d); }
    for (const [k, ds] of Object.entries(empty)) items.push(`${C.EVENT[k].title} has no time left on ${days(ds)}: with these settings it would end before it begins, so it's left out. ${k === "isha" ? "Try Isha ending at Fajr, or another rule under Night and high latitudes." : "Check the settings above."}`);
    if (n.polar.length) items.push(`The sun doesn't rise or set on ${days(n.polar)}. Those days are left out.`);
  }
  $("notes").innerHTML = items.map((t) => `<li>${esc(t)}</li>`).join("");
  $("pNotes").hidden = !items.length;
}

// The selected day on a 24-hour axis: every event of the file that touches it, packed
// into as few rows as don't overlap.
function drawDay() {
  const tz = S.place.tz;
  const d = selected;
  const h = C.hijri(d);
  $("dayLabel").innerHTML = esc(dayName(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" })) + (h && S.hijri ? `<small>${h.day} ${C.HIJRI_MONTHS[h.month - 1]} ${h.year}</small>` : "");
  $("dPrev").disabled = d <= S.range.start;
  $("dNext").disabled = d >= S.range.end;
  const m0 = localMidnight(d, tz), m1 = localMidnight(C.addDays(d, 1), tz);
  const span = m1 - m0;
  const evs = last.list.filter((e) => e.end > m0 && e.start < m1).sort((a, b) => a.start - b.start);
  const lanes = [];
  for (const e of evs) {
    let i = lanes.findIndex((end) => end <= e.start);
    if (i < 0) { i = lanes.length; lanes.push(0); }
    lanes[i] = e.end;
    e._lane = i;
  }
  // drawn at the box's own width, so the labels stay 12px on a phone
  const W = Math.max(280, Math.round($("timeline").clientWidth || 1000)), LH = 30, GAP = 6, AX = 22;
  const every = W < 560 ? 6 : 3;
  const nl = Math.max(1, lanes.length);
  const H = nl * (LH + GAP) + AX;
  const x = (t) => Math.max(0, Math.min(W, ((t - m0) / span) * W));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(evs.map((e) => `${e.title} ${clock(e.start)} to ${clock(e.end)}`).join("; ") || "No events this day")}">` +
    `<defs><pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><line class="hatch-line" x1="0" y1="0" x2="0" y2="6"/></pattern></defs>`;
  for (let i = 0; i < nl; i++) s += `<rect class="lane" x="0" y="${i * (LH + GAP)}" width="${W}" height="${LH}" rx="4"/>`;
  const hours = Math.round(span / 3600000);
  for (let k = 0; k <= hours; k++) {
    const tx = (k / hours) * W;
    s += `<line class="tick${k % 6 === 0 ? " major" : ""}" x1="${tx.toFixed(1)}" x2="${tx.toFixed(1)}" y1="${nl * (LH + GAP) - GAP + 2}" y2="${nl * (LH + GAP) - GAP + (k % every === 0 ? 8 : 5)}"/>`;
    if (k % every === 0 && k < hours) s += `<text x="${(tx + 2).toFixed(1)}" y="${H - 2}">${esc(clock(m0 + k * 3600000).replace(":00", ""))}</text>`;
  }
  for (const e of evs) {
    const a = x(e.start), b = x(e.end), y = e._lane * (LH + GAP);
    const mk = C.EVENT[e.key].kind === "makrooh";
    s += `<g class="k-${e.key}"><rect class="bar-ev${mk ? " mk" : ""}" x="${a.toFixed(1)}" y="${y}" width="${Math.max(1.5, b - a).toFixed(1)}" height="${LH}" rx="3"/>`;
    const lbl = e.title;
    if (b - a > lbl.length * 6.2 + 10) s += `<text class="lbl" x="${(a + 6).toFixed(1)}" y="${y + LH / 2 + 4}">${esc(lbl)}</text>`;
    s += "</g>";
  }
  const now = Date.now();
  if (now >= m0 && now < m1) s += `<line class="now" x1="${x(now).toFixed(1)}" x2="${x(now).toFixed(1)}" y1="-4" y2="${nl * (LH + GAP) - GAP + 4}"/>`;
  $("timeline").innerHTML = s + "</svg>";

  // the list is the prayer day: from Fajr through the night that follows it
  const today = last.list.filter((e) => e.date === d);
  $("dayList").innerHTML = today.map((e) => `<li class="k-${e.key}${C.EVENT[e.key].kind === "makrooh" ? " mk" : ""}"><span class="sw" aria-hidden="true"></span><span class="n">${esc(e.title)}</span><span class="t">${esc(clock(e.start))} – ${esc(clock(e.end))}</span></li>`).join("") ||
    '<li><span></span><span class="n">Nothing switched on for this day.</span><span></span></li>';
}

// One row a day: when each prayer begins, rounded as the file rounds it.
function drawTable() {
  const safe = S.rounding === "safe";
  const r = (t, how) => (isNaN(t) ? NaN : Math[safe ? how : "round"](t / 60000) * 60000);
  const asrCols = S.asr === "both" ? [["asr1", "Asr (Mithl)"], ["asr2", "Asr (Mithlain)"]] : [[S.asr === "hanafi" ? "asr2" : "asr1", "Asr"]];
  const cols = [["fajr", "Fajr", "ceil"], ["sunrise", "Sunrise", "floor"], ["dhuhr", "Dhuhr", "ceil"], ...asrCols.map((c) => [...c, "ceil"]), ["maghrib", "Maghrib", "ceil"], ["isha", "Isha", "ceil"]];
  const showH = S.hijri && C.hijri(S.range.start);
  let marked = false;
  let html = `<thead><tr><th scope="col">Date</th>${cols.map((c) => `<th scope="col" class="sd-num">${c[1]}</th>`).join("")}</tr></thead><tbody>`;
  let month = "";
  for (const t of last.w.days) {
    const m = t.date.slice(0, 7);
    if (m !== month && last.w.days.length > 31) {
      month = m;
      html += `<tr class="month"><td colspan="${cols.length + 1}">${esc(dayName(t.date, { month: "long", year: "numeric" }))}</td></tr>`;
    }
    const h = showH ? C.hijri(t.date) : null;
    const date = `${esc(dayName(t.date, { weekday: "short", day: "numeric", month: "short" }))}${h ? `<small>${h.day} ${C.HIJRI_MONTHS[h.month - 1]}</small>` : ""}`;
    const fri = C.weekday(t.date) === 5 ? " fri" : "";
    const sel = t.date === selected ? ' aria-selected="true"' : "";
    if (t.polar) { html += `<tr data-date="${t.date}"${sel}><td>${date}</td><td colspan="${cols.length}">No sunrise or sunset</td></tr>`; continue; }
    html += `<tr class="${fri.trim()}" data-date="${t.date}"${sel}><td>${date}</td>` + cols.map(([k, , how]) => {
      const mark = (k === "fajr" && t.adjusted.fajr) || (k === "isha" && t.adjusted.isha);
      if (mark) marked = true;
      return `<td class="sd-num">${esc(clock(r(t[k], how)))}${mark ? '<span class="mark" aria-label="from the high-latitude rule">*</span>' : ""}</td>`;
    }).join("") + "</tr>";
  }
  $("times").innerHTML = html + "</tbody>";
  $("tableKey").hidden = !marked;
  $("tableKey").textContent = "* From the high-latitude rule (see Needs a look).";
}

function drawIcs() {
  if (!last) return;
  $("viewIcs").textContent = C.makeIcs(S, last.list);
}

function fileName() {
  const slug = (S.place.name || "prayer-times").toLowerCase().normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "");
  return `prayer-times-${slug}-${S.range.start}-to-${S.range.end}.ics`;
}
function download() {
  if (!last || !last.list.length) return;
  const blob = new Blob([C.makeIcs(S, last.list)], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast("Saved " + a.download);
}

let toastTimer = 0;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  requestAnimationFrame(() => t.setAttribute("data-open", ""));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.removeAttribute("data-open"); setTimeout(() => { t.hidden = true; }, 300); }, 2600);
}

function moveDay(n) {
  if (!last) return;
  const d = C.addDays(selected, n);
  if (d < S.range.start || d > S.range.end) return;
  selected = d;
  drawDay();
  document.querySelectorAll("#times tr[data-date]").forEach((tr) => tr.toggleAttribute("aria-selected", tr.dataset.date === d));
}

// ── wiring ───────────────────────────────────────────────────────────────────
function wire() {
  let timer = 0;
  const side = $("side");
  side.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "city") { pickCity(t.value, false); return; }
    if (!read(t)) return;
    save();
    // typing in a field: redraw shortly after, without rewriting the field under the cursor
    clearTimeout(timer);
    timer = setTimeout(() => { fill(t); render(); }, t.type === "checkbox" || t.tagName === "SELECT" ? 0 : 150);
  });
  side.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "city") pickCity(t.value, true);
  });
  $("city").addEventListener("keydown", (e) => { if (e.key === "Enter") pickCity(e.target.value, true); });
  side.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const seg = b.closest(".sd-seg[id]");
    if (seg && b.dataset.v !== undefined) {
      S[seg.id] = b.dataset.v;
      if (seg.id === "asr") eventRows();
      changed();
    } else if (b.dataset.preset) preset(b.dataset.preset);
    else if (b.id === "btnLocate") locate();
    else if (b.id === "btnReset") {
      try { localStorage.removeItem(KEY); } catch (err) {}
      S = load();
      eventRows();
      changed();
      toast("Settings reset.");
    } else if (b.id === "btnPrivacy") $("privacyDlg").showModal();
  });
  // radio groups move with the arrow keys
  document.addEventListener("keydown", (e) => {
    const seg = e.target.closest && e.target.closest(".sd-seg");
    if (seg && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      const bs = [...seg.querySelectorAll("button:not([hidden])")];
      const i = bs.indexOf(e.target) + (e.key === "ArrowRight" ? 1 : -1);
      if (bs[i]) { bs[i].focus(); bs[i].click(); }
      e.preventDefault();
      return;
    }
    if (e.target.closest && e.target.closest("input, select, textarea, dialog")) return;
    if (e.key === "ArrowLeft") moveDay(-1);
    else if (e.key === "ArrowRight") moveDay(1);
  });

  $("stage").addEventListener("click", (e) => {
    const a = e.target.closest("[data-action]");
    if (a && a.dataset.action === "locate") locate();
    else if (a && a.dataset.action === "city") { $("city").focus(); $("city").scrollIntoView({ block: "center" }); }
    const tr = e.target.closest("#times tr[data-date]");
    if (tr) { selected = tr.dataset.date; moveDay(0); $("dayLabel").scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  });
  $("dPrev").addEventListener("click", () => moveDay(-1));
  $("dNext").addEventListener("click", () => moveDay(1));
  $("viewSeg").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    view = b.dataset.view;
    $("viewSeg").querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    $("viewTable").hidden = view !== "table";
    $("viewIcs").hidden = $("btnCopy").hidden = view !== "ics";
    if (view === "ics") drawIcs();
  });
  $("btnCopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("viewIcs").textContent); toast("Copied the .ics text."); }
    catch (e) { toast("Copying was blocked. Select the text and copy it instead."); }
  });
  $("btnDownload").addEventListener("click", download);
  $("privacyDlg").addEventListener("click", (e) => { if (e.target.closest("[data-close]") || e.target === $("privacyDlg")) $("privacyDlg").close(); });

  // Offline, without the shared settings panel: the page's own light/dark switch.
  if (!window.SiteDesign) {
    const btn = $("btnTheme");
    const label = () => { btn.textContent = document.documentElement.dataset.theme === "light" ? "Dark" : "Light"; };
    btn.hidden = false;
    label();
    btn.addEventListener("click", () => {
      const t = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = t;
      try { localStorage.setItem("prayercalendar.theme", t); } catch (e) {}
      label();
    });
  } else if (window.SiteDesign.onChange) window.SiteDesign.onChange(() => { if (last) drawDay(); });
}

build();
eventRows();
wire();
fill();
render();
// The clock line on today's timeline moves once a minute.
let resized = 0;
addEventListener("resize", () => { clearTimeout(resized); resized = setTimeout(() => { if (last) drawDay(); }, 150); });
setInterval(() => { if (last && selected === C.todayAt(S.place.tz)) drawDay(); }, 60000);
