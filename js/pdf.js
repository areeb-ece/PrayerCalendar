/* The timetable as a PDF: a small PDF writer (no dependencies, no DOM, so the unit tests
   run it in Node) and the page layout. Text is set in the PDF's built-in Helvetica, which
   every reader has, so nothing is embedded; widths below are Helvetica's own metrics,
   which right-aligned times and fitted columns need. Black on white, for printing. */
import * as C from "./core.js";

// Helvetica and Helvetica-Bold advance widths (1/1000 em) for " " (32) to "~" (126).
const W_REG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const W_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
// The few characters past ASCII that the layout itself uses, as WinAnsi codes and widths.
const SPECIAL = { "–": [0x96, 556], "—": [0x97, 1000], "·": [0xb7, 278], "°": [0xb0, 400], "‘": [0x91, 222], "’": [0x92, 222], "“": [0x93, 333], "”": [0x94, 333], "•": [0x95, 350], "…": [0x85, 1000] };

// One character as [WinAnsi byte, width in regular, width in bold]. Accented Latin letters
// keep their own byte and take their base letter's width; anything WinAnsi can't hold
// becomes its base letter, or "?".
function glyph(ch) {
  const code = ch.codePointAt(0);
  if (ch === " " || ch === " " || ch === " ") return [32, 278, 278]; // the thin spaces Intl puts before AM/PM
  if (code >= 32 && code <= 126) return [code, W_REG[code - 32], W_BOLD[code - 32]];
  if (SPECIAL[ch]) return [SPECIAL[ch][0], SPECIAL[ch][1], SPECIAL[ch][1]];
  const base = ch.normalize("NFD")[0];
  const b = base.codePointAt(0);
  const wr = b >= 32 && b <= 126 ? W_REG[b - 32] : 556, wb = b >= 32 && b <= 126 ? W_BOLD[b - 32] : 611;
  if (code >= 0xa0 && code <= 0xff) return [code, wr, wb];
  if (b >= 32 && b <= 126) return [b, wr, wb];
  return [63, 556, 611];
}
export function textWidth(str, size, bold = false) {
  let w = 0;
  for (const ch of String(str)) w += glyph(ch)[bold ? 2 : 1];
  return (w * size) / 1000;
}
// A PDF string literal in WinAnsi.
function pdfString(str) {
  let out = "(";
  for (const ch of String(str)) {
    const c = glyph(ch)[0];
    out += c === 40 || c === 41 || c === 92 ? "\\" + String.fromCharCode(c) : String.fromCharCode(c);
  }
  return out + ")";
}
const n = (v) => (Math.round(v * 100) / 100).toString();

// A page's drawing operations.
class Page {
  constructor() { this.ops = []; }
  text(x, y, str, size, { bold = false, grey = 0.12, align = "left" } = {}) {
    if (align === "right") x -= textWidth(str, size, bold);
    this.ops.push(`BT /${bold ? "F2" : "F1"} ${n(size)} Tf ${n(grey)} g ${n(x)} ${n(y)} Td ${pdfString(str)} Tj ET`);
  }
  line(x1, y1, x2, y2, width, grey) { this.ops.push(`${n(width)} w ${n(grey)} G ${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`); }
  rect(x, y, w, h, grey) { this.ops.push(`${n(grey)} g ${n(x)} ${n(y)} ${n(w)} ${n(h)} re f`); }
}

// Assembles pages into a PDF file (bytes).
export function writePdf(pages, { width, height, title = "" }) {
  const objs = [];
  const add = (body) => objs.push(body) && objs.length;
  const catalog = add(null), tree = add(null);
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const info = add(`<< /Title ${pdfString(title)} /Creator (Prayer Calendar) >>`);
  const kids = [];
  for (const p of pages) {
    const stream = p.ops.join("\n");
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${n(width)} ${n(height)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R >>`;
  objs[tree - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + " 0 R").join(" ")}] /Count ${kids.length} >>`;
  // Every character is one byte (WinAnsi), so string offsets are byte offsets.
  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets = [];
  objs.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i);
  return bytes;
}

export const PAPER = { letter: { label: "Letter", width: 612, height: 792 }, a4: { label: "A4", width: 595.28, height: 841.89 } };

// The timetable for the settings' place and dates as a PDF.
// opts: { paper: "letter" | "a4", monthPages: start each month on a new page,
//         extras: { [EXTRA_COLUMNS key]: true }, hijri: a Hijri date column }
export function timetablePdf(s, w = C.windows(s), opts = {}) {
  const { width: PW, height: PH } = PAPER[opts.paper] || PAPER.letter;
  const M = 40;
  const tz = s.place.tz;
  const h12 = s.clock !== "24";
  const cols = C.tableColumns(s, opts.extras || {});
  const days = w.days;
  const showH = !!opts.hijri && !!C.hijri(s.range.start);
  const months = new Set(days.map((d) => d.date.slice(0, 7)));
  const fmt = (d, o) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...o }).format(C.parseDate(d));
  const dateLabel = (d) => fmt(d, { weekday: "short", day: "numeric" });
  const hijriLabel = (d) => { const h = C.hijri(d); return h ? `${h.day} ${C.HIJRI_SHORT[h.month - 1]}` : ""; };
  const timeLabel = (t, c) => C.clock(C.columnTime(t, c, s), tz, h12);

  // Fit the columns: measure at 9 pt, shrink the type if they don't fit the page.
  let fs = 9;
  const measure = (size) => {
    const date = Math.max(textWidth("Date", size * 0.9, true), ...days.map((d) => textWidth(dateLabel(d.date), size, true)));
    const hij = showH ? Math.max(textWidth("Hijri", size * 0.9, true), ...days.map((d) => textWidth(hijriLabel(d.date), size))) : 0;
    const times = cols.map((c) => Math.max(textWidth(c.label, size * 0.9, true), textWidth(h12 ? "12:59 PM" : "23:59", size)));
    return { date, hij, times, total: date + hij + times.reduce((a, b) => a + b, 0) };
  };
  let m = measure(fs);
  const avail = PW - 2 * M;
  const minGap = 10 * (cols.length + (showH ? 1 : 0));
  if (m.total + minGap > avail) { fs = Math.max(5.5, (fs * (avail - minGap)) / m.total); m = measure(fs); }
  const gap = (avail - m.total) / (cols.length + (showH ? 1 : 0));
  // right edges of the time columns, left edge of the Hijri column
  const xHijri = M + m.date + gap;
  let x = M + m.date + (showH ? gap + m.hij : 0);
  const rights = m.times.map((tw) => (x += gap + tw));

  const rowH = fs * 1.9, headFs = fs * 0.9;
  const footY = M - 14;
  const pages = [];
  let page = null, y = 0, marked = false;
  const summary = `${C.methodSummary(s)} · times in ${String(tz).replace(/_/g, " ")}`;

  const finish = () => {
    if (!page) return;
    if (marked) page.text(M, footY + 12, "* From a high-latitude rule: the sun doesn't reach the twilight angle that day, or not for long.", 7, { grey: 0.35 });
    page.text(M, footY, "areeb-ece.github.io/PrayerCalendar", 7, { grey: 0.45 });
    pages.push(page);
    page = null;
  };
  const header = () => {
    page.text(M, y - headFs, "Date", headFs, { bold: true, grey: 0.3 });
    if (showH) page.text(xHijri, y - headFs, "Hijri", headFs, { bold: true, grey: 0.3 });
    cols.forEach((c, i) => page.text(rights[i], y - headFs, c.label, headFs, { bold: true, grey: 0.3, align: "right" }));
    y -= headFs + 5;
    page.line(M, y, PW - M, y, 1.2, 0.12);
  };
  const newPage = () => {
    finish();
    page = new Page();
    marked = false;
    y = PH - M;
    // the title block, on every page so each one stands alone, closed by a heavy rule
    const title = s.place.name || "Prayer times";
    let ts = 17;
    while (ts > 10 && textWidth(title, ts, true) > avail) ts -= 0.5;
    page.text(M, y - ts, title, ts, { bold: true });
    y -= ts + 6;
    let ss = 8.5;
    while (ss > 6 && textWidth(summary, ss) > avail) ss -= 0.25;
    page.text(M, y - ss, summary, ss, { grey: 0.35 });
    y -= ss + 8;
    page.line(M, y, PW - M, y, 2.2, 0.12);
    y -= 16;
  };
  const room = () => y - rowH > footY + 26;
  const monthHead = (mo) => {
    const label = fmt(mo + "-01", { month: "long", year: "numeric" });
    page.text(M, y - 12, label, 12, { bold: true });
    if (showH) {
      // the Hijri months this month's days fall in, from its first and last day in the range
      const inMonth = days.filter((d) => d.date.startsWith(mo));
      const a = C.hijri(inMonth[0].date), b = C.hijri(inMonth[inMonth.length - 1].date);
      const name = (h) => C.HIJRI_MONTHS[h.month - 1];
      const hl = a.month === b.month ? `${name(a)} ${a.year}` : `${name(a)}${a.year !== b.year ? " " + a.year : ""} – ${name(b)} ${b.year}`;
      page.text(M + textWidth(label, 12, true) + 10, y - 12, hl, 9, { grey: 0.4 });
    }
    y -= 12 + 8;
    header();
  };

  let month = "";
  for (const t of days) {
    const mo = t.date.slice(0, 7);
    const newMonth = mo !== month;
    month = mo;
    if (!page || (newMonth && opts.monthPages)) { newPage(); monthHead(mo); }
    else if (newMonth) {
      if (y - 40 - rowH < footY + 26) newPage(); else y -= 10;
      monthHead(mo);
    } else if (!room()) { newPage(); monthHead(mo); }

    const fri = C.weekday(t.date) === 5;
    const base = y - rowH;
    if (fri) page.rect(M - 4, base, avail + 8, rowH, 0.93);
    const ty = base + (rowH - fs) / 2 + fs * 0.22;
    page.text(M, ty, dateLabel(t.date), fs, { bold: fri, grey: fri ? 0.08 : 0.2 });
    if (showH) page.text(xHijri, ty, hijriLabel(t.date), fs, { grey: 0.4 });
    if (t.polar) page.text(rights[0] - m.times[0], ty, "No sunrise or sunset", fs, { grey: 0.4 });
    else cols.forEach((c, i) => {
      page.text(rights[i], ty, timeLabel(t, c), fs, { grey: 0.12, align: "right" });
      // the mark sits just past the column's edge, so the digits stay in line
      if (C.fromRule(t, c)) { marked = true; page.text(rights[i] + 1, ty, "*", fs, { grey: 0.12 }); }
    });
    page.line(M, base, PW - M, base, 0.4, 0.82);
    y = base;
  }
  if (!page) { newPage(); page.text(M, y - 12, "No days in this range.", 10); }
  finish();
  return writePdf(pages, { width: PW, height: PH, title: `Prayer times · ${s.place.name || ""}`.replace(/ · $/, "") });
}
