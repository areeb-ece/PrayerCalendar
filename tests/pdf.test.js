// Unit tests for js/pdf.js: `npm test`.
import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../js/core.js";
import { timetablePdf, textWidth, PAPER } from "../js/pdf.js";

const latin1 = (bytes) => String.fromCharCode(...bytes);
function settings(patch = {}) {
  const s = C.defaultSettings();
  s.place = { name: "Oshawa, Canada", lat: 43.9, lon: -78.86, tz: "America/Toronto", elevation: 0 };
  s.range = { start: "2026-11-01", end: "2027-01-31" };
  return Object.assign(s, patch);
}
// Every text the PDF draws, with its position and size: [x, y, size, text].
function texts(pdf) {
  const out = [];
  for (const m of pdf.matchAll(/BT \/F\d ([\d.]+) Tf [\d.]+ g ([\d.-]+) ([\d.-]+) Td \(((?:\\.|[^\\)])*)\) Tj ET/g)) {
    out.push([+m[2], +m[3], +m[1], m[4].replace(/\\(.)/g, "$1")]);
  }
  return out;
}

test("a valid PDF: header, objects where the cross-reference table says, trailer", () => {
  const pdf = latin1(timetablePdf(settings()));
  assert.ok(pdf.startsWith("%PDF-1.4\n"));
  assert.ok(pdf.endsWith("%%EOF\n"));
  const xref = +/startxref\n(\d+)/.exec(pdf)[1];
  assert.ok(pdf.slice(xref).startsWith("xref\n"));
  const entries = pdf.slice(xref).split("\n").slice(3).filter((l) => / 00000 n $/.test(l));
  entries.forEach((e, i) => assert.ok(pdf.slice(+e.slice(0, 10)).startsWith(`${i + 1} 0 obj`), `object ${i + 1} is where xref says`));
  for (const m of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = m.index + m[0].length;
    assert.equal(pdf.slice(start + +m[1], start + +m[1] + 10), "\nendstream", "stream lengths are exact");
  }
});

test("one page a month by default, or months running on", () => {
  const count = (s, o) => +/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(latin1(timetablePdf(s, C.windows(s), o)))[1];
  const three = settings();
  assert.equal(count(three, { monthPages: true }), 3);
  const straddle = settings({ range: { start: "2026-11-25", end: "2026-12-05" } });
  assert.equal(count(straddle, { monthPages: true }), 2);
  assert.equal(count(straddle, { monthPages: false }), 1);
});

test("the times are the timetable's, in its columns and order", () => {
  const s = settings({ range: { start: "2026-11-06", end: "2026-11-06" }, asr: "both" });
  const w = C.windows(s);
  const t = texts(latin1(timetablePdf(s, w, { extras: { ishraq: true, third: true } })));
  const labels = t.filter(([, , size]) => size < 9).map((x) => x[3]);
  for (const l of ["Date", "Fajr", "Sunrise", "Ishraq", "Dhuhr", "Asr (Mithl)", "Asr (Mithlain)", "Maghrib", "Isha", "Last third"]) assert.ok(labels.includes(l), `has the ${l} column`);
  const cols = C.tableColumns(s, { ishraq: true, third: true });
  const row = t.filter(([, , size, s2]) => size === 9 && /\d:\d\d/.test(s2)).map((x) => x[3]);
  assert.deepEqual(row, cols.map((c) => C.clock(C.columnTime(w.days[0], c, s), s.place.tz).replace(/\u202f/g, " ")));
  assert.ok(t.some((x) => x[3] === "Fri 6"), "date label");
  assert.ok(t.some((x) => x[3].startsWith("ISNA (North America) · Fajr 15°".replace("·", "\xb7").replace("°", "\xb0"))), "how the times were worked out");
});

test("everything fits the page, even with every column on A4", () => {
  const s = settings({ asr: "both" });
  const extras = Object.fromEntries(C.EXTRA_COLUMNS.map((x) => [x.key, true]));
  const pdf = latin1(timetablePdf(s, C.windows(s), { paper: "a4", hijri: true, extras }));
  for (const [x, y, size, str] of texts(pdf)) {
    const w = textWidth(str, size, false);
    assert.ok(x >= 39 && x + w <= PAPER.a4.width - 39 + 8, `"${str}" at ${x} runs off the page`);
    assert.ok(y > 0 && y < PAPER.a4.height);
  }
});

test("Hijri dates and the months they fall in", () => {
  const s = settings({ range: { start: "2027-02-01", end: "2027-02-28" } });
  const t = texts(latin1(timetablePdf(s, C.windows(s), { hijri: true })));
  assert.ok(t.some((x) => x[3] === "1 Ram."), "1 Ramadan 1448 is 8 February 2027");
  assert.ok(t.some((x) => x[3] === "Shaban \x96 Ramadan 1448"), "the month's heading names both Hijri months");
});

test("text is WinAnsi: accents kept, narrow spaces and unknown characters replaced", () => {
  const s = settings({ place: { name: "Malé (Maldives) \u4eac", lat: 4.18, lon: 73.51, tz: "Indian/Maldives", elevation: 0 }, range: { start: "2026-11-01", end: "2026-11-01" } });
  const pdf = latin1(timetablePdf(s));
  assert.ok(pdf.includes("(Mal\xe9 \\(Maldives\\) ?) Tj"));
  assert.ok(!/[^\x00-\xff]/.test(pdf));
  assert.ok(!pdf.includes("\u202f"));
  assert.equal(textWidth("0", 10), 5.56);
  assert.equal(textWidth("Date", 10, true), 21.67); // D 722 + a 556 + t 333 + e 556
});

test("high-latitude days are marked and explained", () => {
  const s = settings({ place: { name: "Oslo", lat: 59.91, lon: 10.75, tz: "Europe/Oslo", elevation: 0 }, range: { start: "2027-06-01", end: "2027-06-03" } });
  C.applyMethod(s, "mwl");
  const t = texts(latin1(timetablePdf(s)));
  assert.ok(t.filter((x) => x[3] === "*").length >= 6);
  assert.ok(t.some((x) => x[3].startsWith("* From a high-latitude rule")));
});
